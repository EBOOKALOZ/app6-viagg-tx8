-- ============================================================
-- REGRAS NOVAS DE GRUPOS WHATSAPP (2026-08-01)
--
-- Unifica o piso mínimo de membros em 60 para os 3 perfis (Motoboy,
-- Moto-Táxi — ambos em whatsapp_groups via profile_kind — e
-- Motorista em driver_whatsapp_groups), reduzindo o piso do Motoboy
-- de 91 (20260712_radar_minimo_91_membros.sql) para 60, e introduz a
-- exclusividade CROSS-TABLE via public.active_group_links (criada em
-- 20260801_group_links_registry.sql), substituindo a exclusividade
-- que hoje só existia dentro de whatsapp_groups.
--
-- Toda validação (aprovação, reprovação, "aguardando qualificação")
-- passa a gravar uma linha em group_validation_audit_log
-- (triggered_by='trigger') — auditoria formal pedida pela regra 5.
--
-- Mantém: normalização de texto (tg_normalize_group_text), raio de
-- 100km da base do motoboy, detecção de duplicidade por nome+cidade
-- no motor do Radar IA (radar_score_groups, inalterado aqui).
--
-- Idempotente.
-- ============================================================

-- ── 1. Piso único de membros (constante centralizada) ──────────────
CREATE OR REPLACE FUNCTION public.min_group_members()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 60 $$;

-- ── 2. Exclusividade cross-table via registry ───────────────────────
-- Chamada pelos triggers de cada tabela ANTES de aplicar as demais
-- regras. Quando o grupo fica ativo, faz UPSERT no registry; se o
-- link já pertence a outro (source_table, source_id), o
-- UNIQUE(link_normalized) dispara unique_violation, que é convertida
-- na mensagem de negócio já usada hoje (preserva o contrato de texto
-- que o frontend faz parsing via regex). Quando o grupo é desativado,
-- libera a linha do registry (link volta a ficar disponível).
CREATE OR REPLACE FUNCTION public.registry_check_and_lock_link(
  p_link         text,
  p_source_table text,
  p_source_id    uuid,
  p_owner_user_id uuid,
  p_is_active    boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_link_norm text;
BEGIN
  IF p_link IS NULL OR trim(p_link) = '' THEN
    RETURN;
  END IF;
  v_link_norm := lower(trim(p_link));

  IF NOT COALESCE(p_is_active, false) THEN
    DELETE FROM public.active_group_links
     WHERE source_table = p_source_table AND source_id = p_source_id;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.active_group_links (link_normalized, source_table, source_id, owner_user_id)
    VALUES (v_link_norm, p_source_table, p_source_id, p_owner_user_id)
    ON CONFLICT (source_table, source_id) DO UPDATE
      SET link_normalized = EXCLUDED.link_normalized,
          owner_user_id = EXCLUDED.owner_user_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este grupo já está ativo com outro profissional. Ele só fica disponível se o profissional atual sair (desativar o grupo).';
  END;
END;
$$;

-- ── 3. Trigger central: whatsapp_groups (Motoboy + Moto-Táxi) ──────
CREATE OR REPLACE FUNCTION public.enforce_group_validity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_approved     boolean;
  v_is_active       boolean;
  v_has_members     boolean;
  v_posted_recently boolean;
  v_has_coords      boolean;
  v_base_lat        double precision;
  v_base_lng        double precision;
  v_dist            numeric;
  v_result          text;
BEGIN
  -- EXCLUSIVIDADE CROSS-TABLE via registry central (substitui a
  -- checagem local que só olhava para whatsapp_groups).
  PERFORM public.registry_check_and_lock_link(
    NEW.group_link, 'whatsapp_groups', NEW.id, NEW.owner_user_id, COALESCE(NEW.is_active, false)
  );

  -- RAIO DE 100 KM da base do profissional (só faz sentido para
  -- motoboy, que tem motoboy_profiles com residência cadastrada; para
  -- mototaxi sem coords base, a checagem simplesmente não se aplica).
  SELECT mp.latitude_residencia, mp.longitude_residencia
    INTO v_base_lat, v_base_lng
    FROM public.motoboy_profiles mp
   WHERE mp.user_id = NEW.owner_user_id
   LIMIT 1;

  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
     AND v_base_lat IS NOT NULL AND v_base_lng IS NOT NULL THEN
    v_dist := 6371 * acos(LEAST(1.0,
        cos(radians(v_base_lat)) * cos(radians(NEW.latitude))
        * cos(radians(NEW.longitude) - radians(v_base_lng))
        + sin(radians(v_base_lat)) * sin(radians(NEW.latitude))));
    IF v_dist > 100 THEN
      RAISE EXCEPTION 'Grupo fora da sua área de atuação: ~% km da sua base (limite: 100 km).', round(v_dist);
    END IF;
  END IF;

  -- ★ REGRA CENTRAL: piso único de 60 membros. Abaixo disso, nunca
  --   aprova (formulário, admin, IA, RPC, edge — tudo passa por aqui).
  IF COALESCE(NEW.members_count, 0) < public.min_group_members()
     AND NEW.validation_status = 'approved'
     AND COALESCE(NEW.is_active, false) THEN
    RAISE EXCEPTION 'Grupo reprovado. Quantidade mínima exigida: % membros (informado: %).',
      public.min_group_members(), COALESCE(NEW.members_count, 0);
  END IF;

  -- VETO/LIBERAÇÃO DA IA (radar_apply_ia_verdict escreve com 'IA:'):
  -- veredito da IA manda no flag — mas nunca acima do piso de 60.
  IF TG_OP = 'UPDATE' AND NEW.invalid_reason LIKE 'IA:%' THEN
    INSERT INTO public.group_validation_audit_log
      (source_table, source_id, owner_user_id, members_count_at_check, validation_result, reason, triggered_by)
    VALUES ('whatsapp_groups', NEW.id, NEW.owner_user_id, NEW.members_count,
            CASE WHEN NEW.valid_for_commission THEN 'aprovado' ELSE 'reprovado' END,
            NEW.invalid_reason, 'ia');
    RETURN NEW;
  END IF;

  v_is_approved     := (NEW.validation_status = 'approved');
  v_is_active       := COALESCE(NEW.is_active, false);
  v_has_members     := COALESCE(NEW.members_count, 0) >= public.min_group_members();
  v_posted_recently := (
    NEW.last_posted_at IS NOT NULL
    AND (now() - NEW.last_posted_at) <= INTERVAL '30 days'
  );
  v_has_coords      := (NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL);

  IF NOT v_is_approved THEN
    NEW.is_active := false;
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    v_result := 'reprovado';
  ELSIF NOT v_is_active THEN
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    v_result := 'reprovado';
  ELSIF NOT v_has_members THEN
    NEW.is_valid := true;
    NEW.valid_for_commission := false;
    NEW.validation_status := 'aguardando_qualificacao';
    NEW.invalid_reason := format('Aguardando qualificação: mínimo %s membros (atual: %s)',
      public.min_group_members(), COALESCE(NEW.members_count, 0));
    v_result := 'aguardando_qualificacao';
  ELSE
    NEW.is_valid := true;
    NEW.valid_for_commission := (v_has_members AND v_posted_recently AND v_has_coords);
    IF NOT NEW.valid_for_commission THEN
      NEW.invalid_reason := CASE
        WHEN NOT v_posted_recently THEN 'Sem postagem nos últimos 30 dias'
        WHEN NOT v_has_coords      THEN 'Localização do grupo não confirmada'
        ELSE NEW.invalid_reason
      END;
      v_result := 'aguardando_qualificacao';
    ELSE
      NEW.invalid_reason := NULL;
      v_result := 'aprovado';
    END IF;
  END IF;

  INSERT INTO public.group_validation_audit_log
    (source_table, source_id, owner_user_id, members_count_at_check, validation_result, reason, triggered_by)
  VALUES ('whatsapp_groups', NEW.id, NEW.owner_user_id, NEW.members_count,
          v_result, NEW.invalid_reason, 'trigger');

  RETURN NEW;
END;
$function$;

-- ── 4. Trigger novo: driver_whatsapp_groups (Motorista) ────────────
CREATE OR REPLACE FUNCTION public.enforce_group_validity_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_approved boolean;
  v_is_active   boolean;
  v_has_members boolean;
  v_result      text;
BEGIN
  -- Normalização de texto (mesmo padrão de tg_normalize_group_text em whatsapp_groups)
  NEW.cidade := NULLIF(regexp_replace(trim(COALESCE(NEW.cidade, '')), '\s+', ' ', 'g'), '');

  -- EXCLUSIVIDADE CROSS-TABLE via registry central.
  PERFORM public.registry_check_and_lock_link(
    NEW.link, 'driver_whatsapp_groups', NEW.id, NEW.user_id, COALESCE(NEW.is_active, false)
  );

  v_is_approved := (NEW.validation_status = 'approved');
  v_is_active   := COALESCE(NEW.is_active, false);
  v_has_members := COALESCE(NEW.members_count, 0) >= public.min_group_members();

  IF NOT v_is_approved THEN
    NEW.is_active := false;
    NEW.valid_for_commission := false;
    NEW.status := 'em_analise';
    v_result := 'reprovado';
  ELSIF NEW.members_count IS NULL THEN
    -- Legado ou cadastro sem quantidade informada: nunca aprova sem o dado.
    NEW.valid_for_commission := false;
    NEW.validation_status := 'aguardando_qualificacao';
    NEW.invalid_reason := 'Aguardando qualificação: informe a quantidade de membros (mínimo ' || public.min_group_members() || ')';
    NEW.status := 'em_analise';
    v_result := 'aguardando_qualificacao';
  ELSIF NOT v_has_members THEN
    NEW.valid_for_commission := false;
    NEW.validation_status := 'aguardando_qualificacao';
    NEW.invalid_reason := format('Aguardando qualificação: mínimo %s membros (atual: %s)',
      public.min_group_members(), NEW.members_count);
    NEW.status := 'em_analise';
    v_result := 'aguardando_qualificacao';
  ELSIF NOT v_is_active THEN
    NEW.valid_for_commission := false;
    NEW.status := 'inativo';
    v_result := 'reprovado';
  ELSE
    NEW.valid_for_commission := true;
    NEW.invalid_reason := NULL;
    NEW.status := 'ativo';
    v_result := 'aprovado';
  END IF;

  IF NEW.validation_status = 'rejected' THEN
    NEW.status := 'rejeitado';
  END IF;

  INSERT INTO public.group_validation_audit_log
    (source_table, source_id, owner_user_id, members_count_at_check, validation_result, reason, triggered_by)
  VALUES ('driver_whatsapp_groups', NEW.id, NEW.user_id, NEW.members_count,
          v_result, NEW.invalid_reason, 'trigger');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_group_validity_driver ON public.driver_whatsapp_groups;
CREATE TRIGGER trg_enforce_group_validity_driver
  BEFORE INSERT OR UPDATE ON public.driver_whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_group_validity_driver();

-- RPC v2 de criação: grava members_count e deixa o trigger decidir
-- validation_status/is_active (a v1, try_create_driver_whatsapp_group,
-- só fazia EXISTS WHERE link = p_link e não sabia de membros — fica
-- intacta para não quebrar cache de schema, mas o frontend passa a
-- chamar esta).
CREATE OR REPLACE FUNCTION public.try_create_driver_whatsapp_group_v2(
  p_link TEXT,
  p_cidade TEXT,
  p_estado TEXT,
  p_tipo TEXT,
  p_members_count INTEGER,
  p_user_id UUID
) RETURNS TABLE(created BOOLEAN, group_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.active_group_links
     WHERE link_normalized = lower(trim(p_link))
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.driver_whatsapp_groups
    (user_id, link, cidade, estado, tipo, status, members_count, validation_status, is_active)
  VALUES
    (p_user_id, p_link, p_cidade, p_estado, p_tipo, 'em_analise', p_members_count, 'approved', true)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT TRUE, v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.try_create_driver_whatsapp_group_v2(text, text, text, text, integer, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.try_create_driver_whatsapp_group_v2(text, text, text, text, integer, uuid) TO authenticated;

-- ── 5. radar_apply_ia_verdict: liberação da IA também usa o piso 60 ─
-- (a versão anterior tinha "g.members_count > 90" hardcoded no WHERE)
CREATE OR REPLACE FUNCTION public.radar_apply_ia_verdict(p_group_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_tmp integer;
BEGIN
  UPDATE public.whatsapp_groups g
     SET valid_for_commission = false,
         invalid_reason = 'IA: ' ||
           CASE s.recommendation
             WHEN 'link_invalido'    THEN 'link inválido ou quebrado'
             WHEN 'grupo_duplicado'  THEN 'grupo duplicado na plataforma'
             WHEN 'grupo_suspeito'   THEN 'dados suspeitos (auditar)'
             WHEN 'grupo_abandonado' THEN 'sem postagem há 60+ dias'
             WHEN 'baixa_qualidade'  THEN 'qualidade baixa averiguada'
             ELSE 'classificado como suspeito'
           END
    FROM public.radar_group_scores s
   WHERE s.group_id = g.id
     AND (p_group_id IS NULL OR g.id = p_group_id)
     AND g.is_active = true
     AND (s.classification = 'Suspeito'
          OR s.recommendation IN ('link_invalido','grupo_duplicado',
                                  'grupo_suspeito','grupo_abandonado','baixa_qualidade'))
     AND g.valid_for_commission = true;
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  UPDATE public.whatsapp_groups g
     SET valid_for_commission = (g.latitude IS NOT NULL AND g.longitude IS NOT NULL),
         invalid_reason = CASE WHEN g.latitude IS NULL THEN 'Localização do grupo não confirmada' END
    FROM public.radar_group_scores s
   WHERE s.group_id = g.id
     AND (p_group_id IS NULL OR g.id = p_group_id)
     AND g.is_active = true
     AND g.validation_status = 'approved'
     AND g.members_count >= public.min_group_members()   -- ★ piso 60: IA não libera abaixo
     AND s.classification <> 'Suspeito'
     AND s.recommendation NOT IN ('link_invalido','grupo_duplicado',
                                  'grupo_suspeito','grupo_abandonado','baixa_qualidade')
     AND g.valid_for_commission = false
     AND g.invalid_reason LIKE 'IA:%';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  RETURN v_count;
END $$;

-- ── 6. Recálculo de legado: whatsapp_groups aprovado+ativo com <60 ──
UPDATE public.whatsapp_groups
   SET validation_status = 'aguardando_qualificacao',
       valid_for_commission = false,
       invalid_reason = format('Aguardando qualificação: mínimo %s membros (atual: %s)',
         public.min_group_members(), COALESCE(members_count, 0))
 WHERE validation_status = 'approved'
   AND is_active = true
   AND COALESCE(members_count, 0) < public.min_group_members();

-- Recalcula comissões de todos os donos afetados (motoboy + mototaxi)
DO $$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN SELECT DISTINCT owner_user_id FROM public.whatsapp_groups LOOP
    PERFORM public.recalc_user_commission(v_user);
  END LOOP;
END $$;
