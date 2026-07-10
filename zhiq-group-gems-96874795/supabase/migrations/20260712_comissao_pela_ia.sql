-- ============================================================
-- COMISSÃO GOVERNADA PELA IA (2026-07-12)
--
-- Decisão de produto: a QUANTIDADE DE MEMBROS deixa de ser critério
-- de entrada/validade. Quem decide se um grupo CONTA para baixar a
-- comissão é o RADAR IA: o grupo entra valendo e a IA VETA apenas o
-- que averiguar como problema (Suspeito, link inválido, duplicado,
-- abandonado, baixa qualidade). Admin mantém a palavra final
-- (radar_admin_decide → approved/rejected).
--
-- Mecânica (uma régua só, sem divergência painel×motor):
--  • valid_for_commission = aprovado + ativo + localização confirmada;
--  • o motor do RADAR (radar_score_groups) aplica/retira o VETO da IA
--    escrevendo no próprio flag, com invalid_reason prefixado 'IA:';
--  • enforce_group_validity respeita o marcador 'IA:' (não clobbera);
--  • recalc_user_commission já conta o flag → perfis/ofertas seguem.
--
-- Recursão controlada: updates só quando o valor MUDA (no-op na 2ª
-- passada) + guarda de profundidade no trigger de rescore. Idempotente.
-- ============================================================

-- ── 1. Fim da trava de 90 membros ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_group_min_members ON public.whatsapp_groups;
DROP FUNCTION IF EXISTS public.enforce_group_min_members();

-- ── 2. Validade base SEM membros (e respeitando veto da IA) ────────
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

  -- RAIO DE 100 KM da base do profissional (regra territorial mantida)
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

  -- VETO/LIBERAÇÃO DA IA (radar_score_groups escreve com marcador 'IA:'):
  -- quando o update vem do motor do RADAR, o veredito dele MANDA — não
  -- recalcular o flag aqui.
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

  -- SEM critério de membros: conta se aprovado + ativo + localizado.
  -- A IA veta depois, se averiguar problema (marcador 'IA:').
  NEW.valid_for_commission := v_has_coords;
  NEW.invalid_reason := CASE
    WHEN NOT v_has_coords THEN 'Localização do grupo não confirmada'
    ELSE NULL
  END;

  RETURN NEW;
END;
$function$;

-- ── 3. Motor do RADAR aplica o veto da IA no flag ──────────────────
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
  -- VETO: IA averiguou problema → grupo deixa de contar (motivo claro)
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

  -- LIBERAÇÃO: IA reavaliou e o problema sumiu → volta a contar
  UPDATE public.whatsapp_groups g
     SET valid_for_commission = (g.latitude IS NOT NULL AND g.longitude IS NOT NULL),
         invalid_reason = CASE WHEN g.latitude IS NULL THEN 'Localização do grupo não confirmada' END
    FROM public.radar_group_scores s
   WHERE s.group_id = g.id
     AND (p_group_id IS NULL OR g.id = p_group_id)
     AND g.is_active = true
     AND g.validation_status = 'approved'
     AND s.classification <> 'Suspeito'
     AND s.recommendation NOT IN ('link_invalido','grupo_duplicado',
                                  'grupo_suspeito','grupo_abandonado','baixa_qualidade')
     AND g.valid_for_commission = false
     AND g.invalid_reason LIKE 'IA:%';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  RETURN v_count;
END $$;

-- ── 4. Rescore chama o veredito (com guarda de profundidade) ───────
CREATE OR REPLACE FUNCTION public.tg_radar_rescore()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 2 THEN RETURN NEW; END IF;
  PERFORM public.radar_score_groups(NEW.id);
  PERFORM public.radar_apply_ia_verdict(NEW.id);
  RETURN NEW;
END $$;

-- ── 5. Reprocesso geral: pontua tudo + aplica vereditos + recalcula ─
SELECT public.radar_score_groups(NULL);
SELECT public.radar_apply_ia_verdict(NULL);
DO $$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN SELECT DISTINCT owner_user_id FROM public.whatsapp_groups LOOP
    PERFORM public.recalc_user_commission(v_user);
  END LOOP;
END $$;
