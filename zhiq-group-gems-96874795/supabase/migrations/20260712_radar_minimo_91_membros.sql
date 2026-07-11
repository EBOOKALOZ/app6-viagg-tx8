-- ============================================================
-- RADAR IA — REGRA CENTRAL: MÍNIMO 91 MEMBROS PARA APROVAR (2026-07-12)
--
-- Auditoria constatou: a regra não existia em nenhuma camada (havia
-- sido removida na iteração anterior do produto). Esta migration a
-- implementa no PONTO CENTRAL: o trigger BEFORE INSERT/UPDATE de
-- whatsapp_groups — por onde passa TODA aprovação, venha do formulário,
-- do admin (radar_admin_decide), da IA (radar_apply_ia_verdict), de
-- RPC, Edge Function ou qualquer escrita futura. Não há como aprovar
-- por fora sem desligar o trigger.
--
--   0–90 membros  → REPROVADO (exceção com a mensagem oficial)
--   91+  membros  → elegível (segue o fluxo normal + veto da IA)
--
-- Inclui: guarda na liberação da IA, limpeza de legado aprovado com
-- ≤90 (não havia nenhum no momento da auditoria) e recálculo geral.
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_group_validity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_approved boolean;
  v_is_active   boolean;
  v_has_coords  boolean;
  v_base_lat    double precision;
  v_base_lng    double precision;
  v_dist        numeric;
BEGIN
  -- EXCLUSIVIDADE: um link ativo por vez na plataforma
  IF COALESCE(NEW.is_active, false)
     AND NEW.group_link IS NOT NULL AND trim(NEW.group_link) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.whatsapp_groups g
       WHERE g.id IS DISTINCT FROM NEW.id
         AND g.is_active = true
         AND lower(trim(g.group_link)) = lower(trim(NEW.group_link))
    ) THEN
      RAISE EXCEPTION 'Este grupo já está ativo com outro profissional. Ele só fica disponível se o profissional atual sair (desativar o grupo).';
    END IF;
  END IF;

  -- RAIO DE 100 KM da base do profissional
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

  -- ★ REGRA CENTRAL DO RADAR IA: NENHUMA origem aprova grupo com ≤90
  --   membros (formulário, admin, IA, RPC, edge — tudo passa por aqui).
  --   Fica ANTES do marcador 'IA:' de propósito: nem a liberação da IA
  --   contorna esta regra.
  IF COALESCE(NEW.members_count, 0) <= 90
     AND NEW.validation_status = 'approved'
     AND COALESCE(NEW.is_active, false) THEN
    RAISE EXCEPTION 'Grupo reprovado pelo RADAR IA. Quantidade mínima exigida: 91 membros (informado: %).',
      COALESCE(NEW.members_count, 0);
  END IF;

  -- VETO/LIBERAÇÃO DA IA (radar_apply_ia_verdict escreve com 'IA:'):
  -- veredito da IA manda no flag — mas nunca acima da regra dos 91.
  IF TG_OP = 'UPDATE' AND NEW.invalid_reason LIKE 'IA:%' THEN
    RETURN NEW;
  END IF;

  v_is_approved := (NEW.validation_status = 'approved');
  v_is_active   := COALESCE(NEW.is_active, false);
  v_has_coords  := (NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL);

  IF NOT v_is_approved THEN
    NEW.is_active := false;
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    RETURN NEW;
  END IF;

  IF NOT v_is_active THEN
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    RETURN NEW;
  END IF;

  NEW.is_valid := true;
  NEW.valid_for_commission := v_has_coords;
  NEW.invalid_reason := CASE
    WHEN NOT v_has_coords THEN 'Localização do grupo não confirmada'
    ELSE NULL
  END;

  RETURN NEW;
END;
$function$;

-- Liberação da IA nunca reativa grupo com ≤90 membros
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
     AND g.members_count > 90          -- ★ regra dos 91: IA não libera abaixo
     AND s.classification <> 'Suspeito'
     AND s.recommendation NOT IN ('link_invalido','grupo_duplicado',
                                  'grupo_suspeito','grupo_abandonado','baixa_qualidade')
     AND g.valid_for_commission = false
     AND g.invalid_reason LIKE 'IA:%';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  RETURN v_count;
END $$;

-- Limpeza de legado: qualquer aprovado+ativo com ≤90 vira reprovado
UPDATE public.whatsapp_groups
   SET validation_status = 'rejected',
       is_active = false,
       valid_for_commission = false,
       invalid_reason = 'Grupo reprovado pelo RADAR IA. Quantidade mínima exigida: 91 membros.'
 WHERE validation_status = 'approved'
   AND COALESCE(members_count, 0) <= 90;

-- Recalcula comissões de todos os donos
DO $$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN SELECT DISTINCT owner_user_id FROM public.whatsapp_groups LOOP
    PERFORM public.recalc_user_commission(v_user);
  END LOOP;
END $$;
