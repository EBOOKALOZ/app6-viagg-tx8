-- ============================================================
-- M54.3 · Sprint 2 — Infraestrutura do Matching Engine
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_055 (fila de deploy)
-- ============================================================
-- REGRA DESTE SPRINT (congelada):
--   • Pipeline oficial M54.1 §4 implementado por completo
--   • NENHUM peso calibrado: dispatch_weights v1 permanece INATIVO.
--     Sem versão ativa, o engine roda em MODO NEUTRO documentado:
--     fatores calculados e REPORTADOS, score efetivo = base (M51),
--     ordenação por dados REAIS (health DESC, LRU) — decisões
--     estruturais do M54.1 §5, não calibração.
--   • Ativação futura = ativar uma versão de pesos (1 UPDATE);
--     o engine muda de modo sozinho.
--   • O TICK NÃO É ALTERADO neste sprint (zero regressão por
--     construção); wiring ao dispatch = M54.7.
-- ============================================================

-- Pré-check
DO $$
BEGIN
  IF to_regclass('public.channel_targets') IS NULL
     OR to_regclass('public.dispatch_weights') IS NULL THEN
    RAISE EXCEPTION 'M54.3 BLOQUEADA — aplicar 20260704_055 antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. Estrutura: colunas/índices/keys que o pipeline exige
-- ──────────────────────────────────────────────────────────────

-- Geo região (M54.1 §3: cidade→região→adjacente; adjacência aguarda dados)
ALTER TABLE public.channel_targets
  ADD COLUMN IF NOT EXISTS region TEXT;

-- Índice p/ cap diário e cooldown grupo×anúncio (contagens do filtro duro)
CREATE INDEX IF NOT EXISTS idx_pd_target_created
  ON public.publication_deliveries (target_id, created_at DESC)
  WHERE target_id IS NOT NULL;

-- Chaves estruturais que faltavam no v1 (valores LITERAIS do doc congelado
-- M54.1 §4.1 — continuam INATIVOS como todo o v1; NÃO é calibração)
INSERT INTO public.dispatch_weights (version, signal_key, weight, active, notes) VALUES
  (1,'candidate_cap',50,false,'máx candidatos por matching [calibrar-com-OBSERVE]'),
  (1,'min_health',0.30,false,'health mínimo p/ elegibilidade [calibrar-com-OBSERVE]'),
  (1,'demand_neutral',1.0,false,'demand quando cache não cobre a dimensão')
ON CONFLICT DO NOTHING;

-- Flag do engine (nasce OFF — infra dormente, padrão da plataforma)
INSERT INTO public.motor_flags (key, value, description) VALUES
  ('matching.enabled','off','Matching Engine: off|on (wiring ao tick = M54.7)')
ON CONFLICT (key) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 2. Helper: pesos da versão ATIVA (NULL = modo neutro)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_weights_active()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.dispatch_weights WHERE active)
    THEN (SELECT jsonb_object_agg(signal_key, weight)
          FROM public.dispatch_weights
          WHERE active
            AND version = (SELECT MAX(version) FROM public.dispatch_weights WHERE active))
    ELSE NULL END;
$$;
REVOKE EXECUTE ON FUNCTION public.motor_weights_active() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.motor_weights_active() TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- 3. motor_match_targets — o Matching Engine
--
-- Pipeline oficial (M54.1 §4): Filtros → Elegibilidade → GeoFit →
-- CategoryFit → Demand → Health → Priority → Anti-Starvation →
-- Ranking → Resultado (lista ordenada + descartados com motivo)
--
-- Retorno (JSONB):
-- { request_id, channel, city, calibrated, weights_version, weights,
--   duration_ms, ranking: [ {rank, target_id, external_id, name, city,
--     bairro, score, factors:{...}, justificativa} ],
--   discarded: [ {target_id, external_id, reason} ],
--   winner: <ranking[0] ou null>, reason?: motivo global }
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_match_targets(
  p_request_id UUID,
  p_channel    TEXT DEFAULT 'whatsapp-zapi',
  p_limit      INT  DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t0        TIMESTAMPTZ := clock_timestamp();
  v_req       RECORD;
  v_city      TEXT;
  v_region    TEXT;
  v_cats      TEXT[];
  v_base      NUMERIC;
  v_age_h     NUMERIC;
  v_w         JSONB := public.motor_weights_active();
  v_calibrated BOOLEAN := v_w IS NOT NULL;
  -- Estruturais (M54.1 §4.1 — sobrescritos pela versão ativa quando houver)
  v_cap       INT     := COALESCE((v_w->>'candidate_cap')::numeric::int, 50);
  v_min_h     NUMERIC := COALESCE((v_w->>'min_health')::numeric, 0.30);
  v_cd_h      NUMERIC := COALESCE((v_w->>'group_ad_cooldown_h')::numeric, 72);
  v_now       TIMESTAMPTZ := now();
  v_hour      INT := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo')::int;
  v_dow       INT := EXTRACT(DOW  FROM v_now AT TIME ZONE 'America/Sao_Paulo')::int;
  v_ranking   JSONB;
  v_discarded JSONB;
  v_result    JSONB;
  v_channel_on BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_req FROM public.publication_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'ranking', '[]'::jsonb,
      'discarded', '[]'::jsonb, 'winner', NULL, 'reason', 'request_inexistente');
  END IF;

  SELECT enabled INTO v_channel_on FROM public.publication_channels WHERE id = p_channel;
  IF v_channel_on IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'channel', p_channel,
      'ranking', '[]'::jsonb, 'discarded', '[]'::jsonb, 'winner', NULL,
      'reason', 'canal_desabilitado', 'calibrated', v_calibrated,
      'duration_ms', (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int);
  END IF;

  -- Contexto do request: cidade/região do anunciante, categorias e base M51
  SELECT COALESCE(ms.city, ms.cidade), ms.region
  INTO v_city, v_region
  FROM public.merchant_stores ms WHERE ms.user_id = v_req.advertiser_user_id;

  SELECT array_agg(DISTINCT s.listing_type),
         COALESCE(AVG(NULLIF(sig.score_total,0)), 0.1)
  INTO v_cats, v_base
  FROM public.promoted_listing_slots s
  LEFT JOIN public.m51_listing_signals sig
    ON sig.listing_id = s.listing_id AND sig.listing_type = s.listing_type
  WHERE s.id = ANY(v_req.slot_ids);
  v_base  := COALESCE(v_base, 0.1);
  v_age_h := EXTRACT(EPOCH FROM v_now - v_req.created_at) / 3600.0;

  -- ── Pipeline set-based ─────────────────────────────────────
  WITH cand AS (
    SELECT t.*,
      -- posts do alvo hoje (fuso Brasil) p/ cap diário
      (SELECT COUNT(*) FROM public.publication_deliveries d
        WHERE d.target_id = t.id
          AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date
              = (v_now AT TIME ZONE 'America/Sao_Paulo')::date) AS posts_hoje,
      -- último post deste ANÚNCIO neste alvo (cooldown grupo×anúncio)
      (SELECT MAX(d.created_at) FROM public.publication_deliveries d
        JOIN public.publication_requests r2 ON r2.id = d.request_id
        WHERE d.target_id = t.id AND r2.slot_ids && v_req.slot_ids) AS ultimo_do_anuncio,
      CASE
        WHEN v_city IS NOT NULL AND lower(t.city) = lower(v_city) THEN 'city'
        WHEN v_region IS NOT NULL AND t.region IS NOT NULL
             AND lower(t.region) = lower(v_region) THEN 'region'
        ELSE 'none'
      END AS geo_class,
      CASE
        WHEN COALESCE(array_length(t.category_tags,1),0) = 0 THEN 'geral'
        WHEN t.category_tags && v_cats THEN 'tematico'
        ELSE 'incompativel'
      END AS cat_class
    FROM public.channel_targets t
    WHERE t.channel_id = p_channel
  ),
  judged AS (
    SELECT c.*,
      CASE
        WHEN NOT c.enabled                          THEN 'alvo_desabilitado'
        WHEN c.geo_class = 'none'                   THEN 'geo_fora_de_alcance'
        WHEN c.cat_class = 'incompativel'           THEN 'categoria_incompativel'
        WHEN c.health < v_min_h                     THEN 'health_abaixo_minimo'
        WHEN c.posts_hoje >= c.daily_cap            THEN 'cap_diario_atingido'
        WHEN c.ultimo_do_anuncio IS NOT NULL
             AND c.ultimo_do_anuncio > v_now - make_interval(hours => v_cd_h::int)
                                                    THEN 'cooldown_grupo_anuncio'
        ELSE NULL
      END AS discard_reason,
      COALESCE((
        SELECT dc.demand_score FROM public.m51_demand_cache dc
        WHERE dc.hour_of_day = v_hour AND dc.day_of_week IS NULL
          AND dc.city IS NULL AND dc.category IS NULL
        ORDER BY dc.confidence DESC LIMIT 1
      ), COALESCE((v_w->>'demand_neutral')::numeric, 1.0)) AS demand
    FROM cand c
  ),
  scored AS (
    SELECT j.*,
      CASE WHEN v_calibrated THEN
        ROUND(
          v_base
          * CASE j.geo_class WHEN 'city'   THEN COALESCE((v_w->>'geo_city')::numeric,1)
                             WHEN 'region' THEN COALESCE((v_w->>'geo_region')::numeric,1)
                             ELSE 0 END
          * CASE j.cat_class WHEN 'tematico' THEN COALESCE((v_w->>'category_thematic')::numeric,1)
                             ELSE 1 END
          * j.health * j.demand
          + COALESCE(v_req.priority_score, 0)
          + LEAST(v_age_h * COALESCE((v_w->>'starvation_per_hour')::numeric,0),
                  COALESCE((v_w->>'starvation_cap')::numeric,0))
        , 4)
      ELSE
        -- MODO NEUTRO (sem versão ativa): score = base M51; fatores só reportados
        ROUND(v_base, 4)
      END AS score
    FROM judged j
  )
  SELECT
    COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'rank')::int) FROM (
      SELECT jsonb_build_object(
        'rank', ROW_NUMBER() OVER (
           ORDER BY s.score DESC, s.health DESC,
                    s.last_dispatched_at ASC NULLS FIRST, s.created_at ASC),
        'target_id', s.id, 'external_id', s.external_id, 'name', s.name,
        'city', s.city, 'bairro', s.bairro,
        'score', s.score,
        'factors', jsonb_build_object(
          'base_m51', v_base, 'geo', s.geo_class, 'categoria', s.cat_class,
          'health', s.health, 'demand', s.demand,
          'posts_hoje', s.posts_hoje, 'cap', s.daily_cap,
          'idade_fila_h', ROUND(v_age_h,2),
          'priority', COALESCE(v_req.priority_score,0)),
        'justificativa', format(
          'geo=%s categoria=%s health=%s demand=%s%s',
          s.geo_class, s.cat_class, s.health, s.demand,
          CASE WHEN v_calibrated THEN '' ELSE ' [MODO NEUTRO: score=base M51; desempate=health+LRU]' END)
      ) AS item
      FROM scored s WHERE s.discard_reason IS NULL
      ORDER BY s.score DESC, s.health DESC, s.last_dispatched_at ASC NULLS FIRST, s.created_at ASC
      LIMIT LEAST(p_limit, v_cap)
    ) rk), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'target_id', s.id, 'external_id', s.external_id, 'reason', s.discard_reason))
      FROM scored s WHERE s.discard_reason IS NOT NULL), '[]'::jsonb)
  INTO v_ranking, v_discarded;

  v_result := jsonb_build_object(
    'request_id', p_request_id, 'channel', p_channel,
    'city', v_city, 'calibrated', v_calibrated,
    'weights_version', CASE WHEN v_calibrated
       THEN (SELECT MAX(version) FROM public.dispatch_weights WHERE active) END,
    'weights', v_w,
    'ranking', v_ranking,
    'discarded', v_discarded,
    'winner', CASE WHEN jsonb_array_length(v_ranking) > 0 THEN v_ranking->0 END,
    'reason', CASE WHEN jsonb_array_length(v_ranking) = 0 THEN
       CASE WHEN jsonb_array_length(v_discarded) = 0
            THEN 'sem_candidatos_na_cidade' ELSE 'todos_descartados' END END,
    'duration_ms', (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int);

  -- ── Auditoria da decisão (§4/§7 do sprint) ─────────────────
  -- Evento do catálogo congelado A1 (não é evento novo inventado):
  PERFORM public.motor_log_event(p_request_id, 'DECISAO_DISPATCH',
    v_req.advertiser_user_id, 'dispatch', v_req.lot_id, NULL,
    jsonb_build_object(
      'channel', p_channel, 'calibrated', v_calibrated,
      'weights_version', v_result->>'weights_version',
      'winner', v_result->'winner'->>'external_id',
      'top', (SELECT jsonb_agg(e) FROM (
                SELECT jsonb_array_elements(v_ranking) e LIMIT 3) t),
      'descartados', jsonb_array_length(v_discarded),
      'duration_ms', v_result->>'duration_ms'));

  -- Reuso M49 (decisão congelada): grava no decision-log se existir
  IF to_regclass('public.ai_campaign_decision_log') IS NOT NULL THEN
    BEGIN
      EXECUTE 'INSERT INTO public.ai_campaign_decision_log
                 (campaign_id, decision_payload, created_at)
               VALUES ($1, $2, now())'
      USING p_request_id, v_result;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- schema do M49 pode variar; evento acima é a trilha garantida
    END;
  END IF;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.motor_match_targets(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.motor_match_targets(UUID, TEXT, INT) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.motor_match_targets(uuid, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'M54.3 ERRO: motor_match_targets não criada'; END IF;
  IF EXISTS (SELECT 1 FROM public.dispatch_weights WHERE active) THEN
    RAISE EXCEPTION 'M54.3 ERRO: NENHUM peso pode nascer ativo (calibrar-com-OBSERVE)'; END IF;
  IF (SELECT value FROM public.motor_flags WHERE key='matching.enabled') <> 'off' THEN
    RAISE EXCEPTION 'M54.3 ERRO: matching.enabled deveria nascer OFF'; END IF;

  RAISE NOTICE 'M54.3 ✓ Matching Engine: pipeline oficial completo, ranking+descartados auditáveis — OK';
  RAISE NOTICE 'M54.3 ✓ MODO NEUTRO ativo (0 pesos calibrados); ativação futura = ativar versão de pesos — OK';
  RAISE NOTICE 'M54.3 ✓ Tick INTOCADO (zero regressão por construção); wiring = M54.7 — OK';
END $$;
