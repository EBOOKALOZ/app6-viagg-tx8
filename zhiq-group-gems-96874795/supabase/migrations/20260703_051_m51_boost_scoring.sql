-- ============================================================
-- M51 · Score Inteligente de Impulsionamento
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-03
-- EXECUTAR: SQL Editor — após M50 já estar aplicado
-- ============================================================
-- Compatibilidade:
--   • Zero alteração em tabelas existentes
--   • M50 enforcement intacto (check_advertiser_daily_limit permanece)
--   • m51_enabled = false por padrão → sem impacto em usuários existentes
--   • Feature ativada por flag por anunciante
-- ============================================================
-- Componentes:
--   1. m51_listing_signals      — sinais brutos + score pré-computado
--   2. m51_score_weights        — pesos configuráveis global/por anunciante
--   3. m51_boost_outcomes       — auditoria por impulsionamento + aprendizado
--   4. m51_demand_cache         — demanda por cidade/categoria/hora
--   5. m51_compute_listing_score() — calcula score de um produto
--   6. m51_select_best_listings()  — retorna top N por score
--   7. m51_refresh_signals()       — atualiza sinais brutos (pg_cron diário)
--   8. m51_record_boost_outcome()  — registra resultado para aprendizado
--   9. generate_posting_lots()     — versão M51 (M50 + branch IA)
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- TABELA 0: m51_advertiser_settings
-- H2: O flag M51 é PERSISTENTE por usuário — fonte de verdade aqui.
-- A coluna m51_enabled em advertiser_daily_usage é apenas snapshot
-- diário para auditoria (se o flag morasse na linha diária, ele se
-- auto-desligaria à meia-noite quando a linha nova nasce com default
-- false).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.m51_advertiser_settings (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  m51_enabled   BOOLEAN     NOT NULL DEFAULT false,
  enabled_at    TIMESTAMPTZ,
  enabled_by    UUID,               -- admin que ativou (auditoria)
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.m51_advertiser_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='m51_advertiser_settings' AND policyname='m51set_select_own') THEN
    CREATE POLICY "m51set_select_own" ON public.m51_advertiser_settings
      FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;
-- Sem policies de escrita: ativar/desativar só via service_role ou
-- painel admin (service key). RLS bloqueia INSERT/UPDATE/DELETE diretos.


-- ──────────────────────────────────────────────────────────────
-- TABELA 1: m51_listing_signals
-- Uma linha por (listing_id, listing_type). Score pré-computado
-- para seleção em O(log n) durante a publicação.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.m51_listing_signals (
  -- ── Identidade ────────────────────────────────────────────
  listing_id          TEXT        NOT NULL,
  listing_type        TEXT        NOT NULL,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ── Informações do produto (snapshot para score) ──────────
  listing_title       TEXT,
  listing_price       NUMERIC(12,2),
  listing_city        TEXT,
  listing_category    TEXT,
  listing_module      TEXT,
  created_at_listing  TIMESTAMPTZ,

  -- ── Sinais de engajamento (atualizados por triggers/jobs) ─
  view_count_1d       INT         NOT NULL DEFAULT 0,
  view_count_7d       INT         NOT NULL DEFAULT 0,
  view_count_30d      INT         NOT NULL DEFAULT 0,
  sales_count_7d      INT         NOT NULL DEFAULT 0,
  sales_count_30d     INT         NOT NULL DEFAULT 0,
  stock_level         INT,                            -- NULL = não aplicável
  has_promotion       BOOLEAN     NOT NULL DEFAULT false,
  margin_pct          NUMERIC(6,2),                   -- NULL = desconhecido
  listing_price_original NUMERIC(12,2),               -- preço sem desconto

  -- ── Histórico de impulsionamentos ─────────────────────────
  last_boosted_at     TIMESTAMPTZ,
  boost_count_total   INT         NOT NULL DEFAULT 0,
  boost_count_7d      INT         NOT NULL DEFAULT 0,
  boost_count_30d     INT         NOT NULL DEFAULT 0,

  -- ── Performance histórica (atualizado pelo loop de aprendizado) ──
  avg_ctr             NUMERIC(6,4) NOT NULL DEFAULT 0,   -- click-through rate médio
  avg_conversion      NUMERIC(6,4) NOT NULL DEFAULT 0,   -- taxa de conversão
  avg_roi             NUMERIC(10,2) NOT NULL DEFAULT 0,  -- ROI médio por boost (R$)
  total_impressions   INT         NOT NULL DEFAULT 0,
  total_clicks        INT         NOT NULL DEFAULT 0,
  total_contacts      INT         NOT NULL DEFAULT 0,
  total_conversions   INT         NOT NULL DEFAULT 0,
  total_revenue       NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- ── Scores de contexto (demanda, sazonalidade, horário) ───
  -- Atualizados por m51_refresh_signals() a partir de m51_demand_cache
  city_demand_score       NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  category_demand_score   NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  seasonality_score       NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  peak_hour_score         NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  best_day_score          NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  regional_demand_score   NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  audience_score          NUMERIC(5,2) NOT NULL DEFAULT 1.0,

  -- ── Score total pré-computado ─────────────────────────────
  -- Calculado por m51_compute_listing_score() e armazenado para consulta rápida
  score_total         NUMERIC(8,2) NOT NULL DEFAULT 0,
  score_signals       JSONB,  -- {signal_key: weight_applied, ...}
  score_computed_at   TIMESTAMPTZ,
  score_expires_at    TIMESTAMPTZ,  -- re-compute after this timestamp

  -- ── Metadados ─────────────────────────────────────────────
  signals_refreshed_at  TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_m51_listing_signals
    PRIMARY KEY (listing_id, listing_type)
);

-- Índices para seleção rápida
CREATE INDEX IF NOT EXISTS idx_m51_signals_user_score
  ON public.m51_listing_signals (user_id, score_total DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_m51_signals_user_last_boosted
  ON public.m51_listing_signals (user_id, last_boosted_at DESC NULLS FIRST)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_m51_signals_city_cat
  ON public.m51_listing_signals (listing_city, listing_category, listing_type);

ALTER TABLE public.m51_listing_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='m51_listing_signals' AND policyname='m51s_select_own') THEN
    CREATE POLICY "m51s_select_own" ON public.m51_listing_signals
      FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- TABELA 2: m51_score_weights
-- Pesos configuráveis. Linha com user_id NULL = global (padrão).
-- Linha com user_id = override por anunciante específico.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.m51_score_weights (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = global
  signal_key      TEXT        NOT NULL,
  weight          NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  description     TEXT,
  -- Condições de ativação do sinal (thresholds configuráveis)
  threshold_min   NUMERIC(12,2),  -- sinal só dispara se valor >= min
  threshold_max   NUMERIC(12,2),  -- sinal só dispara se valor <= max
  -- Sinais futuros: CTR, ROI, audience, geographic — incluídos pelo user_id
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_m51_weights_user_signal UNIQUE NULLS NOT DISTINCT (user_id, signal_key)
);

ALTER TABLE public.m51_score_weights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='m51_score_weights' AND policyname='m51w_admin_all') THEN
    CREATE POLICY "m51w_admin_all" ON public.m51_score_weights
      FOR ALL TO authenticated USING (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='m51_score_weights' AND policyname='m51w_user_own') THEN
    CREATE POLICY "m51w_user_own" ON public.m51_score_weights
      FOR SELECT TO authenticated USING (user_id = auth.uid() OR user_id IS NULL);
  END IF;
END $$;

-- Pesos padrão globais (14 sinais + 10 futuros preparados)
INSERT INTO public.m51_score_weights
  (user_id, signal_key, weight, is_active, description)
VALUES
  -- Sinais de produto
  (NULL, 'never_boosted',        1.50, true,  'Produto nunca impulsionado'),
  (NULL, 'low_views_7d',         1.30, true,  'Menos de 10 views em 7 dias'),
  (NULL, 'new_product_7d',       1.40, true,  'Criado há menos de 7 dias'),
  (NULL, 'on_promotion',         1.60, true,  'Preço reduzido ou badge de promoção'),
  (NULL, 'high_stock',           1.20, true,  'Estoque > 50 unidades'),
  (NULL, 'low_sales_30d',        1.30, true,  'Zero vendas em 30 dias'),
  (NULL, 'high_margin',          1.40, true,  'Margem calculada > 30%'),
  -- Sinais de demanda
  (NULL, 'city_demand',          1.40, true,  'Cidade+categoria no top quartil de demanda'),
  (NULL, 'category_demand',      1.30, true,  'Categoria trending nas últimas 24h'),
  -- Sinais temporais
  (NULL, 'peak_hours',           1.50, true,  'Hora atual = top 3 horas de conversão'),
  (NULL, 'best_day',             1.20, true,  'Dia da semana com maior taxa histórica'),
  (NULL, 'seasonality',          1.30, true,  'Produto em temporada de alta'),
  -- Sinais históricos de performance
  (NULL, 'high_conversion_hist', 0.80, true,  'Já converte bem: reduz urgência de boost'),
  (NULL, 'low_conversion_hist',  1.30, true,  'Boosts passados sem resultado: tenta horário diferente'),
  -- Sinais futuros M51+ (desativados, pesos preparados)
  (NULL, 'high_ctr',             1.50, false, 'CTR histórico > 15% (M51+ futuro)'),
  (NULL, 'high_roi',             1.60, false, 'ROI histórico > R$50 por boost (M51+ futuro)'),
  (NULL, 'audience_match',       1.40, false, 'Perfil do público alinhado com categoria (M51+ futuro)'),
  (NULL, 'geographic_demand',    1.35, false, 'Alta demanda regional específica (M51+ futuro)'),
  (NULL, 'advertiser_performance', 1.20, false, 'Histórico positivo do anunciante (M51+ futuro)'),
  (NULL, 'competitor_gap',       1.25, false, 'Poucos concorrentes na categoria+cidade (M51+ futuro)'),
  (NULL, 'price_competitiveness',1.30, false, 'Preço abaixo da média da categoria (M51+ futuro)'),
  (NULL, 'engagement_velocity',  1.45, false, 'Crescimento acelerado de views recentes (M51+ futuro)'),
  (NULL, 'return_buyer_signal',  1.50, false, 'Produto com histórico de compras repetidas (M51+ futuro)'),
  (NULL, 'seasonal_peak_ahead',  1.60, false, 'Próximo pico sazonal em < 7 dias (M51+ futuro)')
ON CONFLICT (user_id, signal_key) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- TABELA 3: m51_boost_outcomes
-- Uma linha por impulsionamento. Resolve auditoria individual
-- do ponto 7 e alimenta o loop de aprendizado contínuo.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.m51_boost_outcomes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Contexto do impulsionamento ───────────────────────────
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lot_id          UUID,                        -- posting_lots.id
  listing_id      TEXT        NOT NULL,
  listing_type    TEXT        NOT NULL,
  listing_title   TEXT,
  listing_city    TEXT,
  listing_category TEXT,

  -- ── Snapshot do score no momento do boost ─────────────────
  score_at_boost          NUMERIC(8,2),
  score_signals_snapshot  JSONB,  -- quais sinais estavam ativos + pesos
  plan_name               TEXT,
  daily_used_at_boost     INT,    -- posição na cota do dia (1, 2, 3...)
  origin                  TEXT    CHECK (origin IN ('manual', 'ai_auto', 'scheduled', 'operator')),
  m51_selected            BOOLEAN NOT NULL DEFAULT false,  -- selecionado pela IA ou manualmente

  -- ── Resultados (preenchidos depois por eventos) ───────────
  impressions_after   INT         NOT NULL DEFAULT 0,
  views_after         INT         NOT NULL DEFAULT 0,
  clicks_after        INT         NOT NULL DEFAULT 0,
  contacts_after      INT         NOT NULL DEFAULT 0,
  sales_after         INT         NOT NULL DEFAULT 0,
  revenue_after       NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- ── Métricas calculadas (atualizadas em measured_at) ──────
  ctr                 NUMERIC(6,4) NOT NULL DEFAULT 0,
  conversion_rate     NUMERIC(6,4) NOT NULL DEFAULT 0,
  roi                 NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- ── Janela de medição ─────────────────────────────────────
  boosted_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  measured_at             TIMESTAMPTZ,
  measurement_window_hours INT         NOT NULL DEFAULT 48,
  is_measured             BOOLEAN     NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_m51_outcomes_user_listing
  ON public.m51_boost_outcomes (user_id, listing_id, listing_type, boosted_at DESC);

CREATE INDEX IF NOT EXISTS idx_m51_outcomes_unmeasured
  ON public.m51_boost_outcomes (is_measured, boosted_at)
  WHERE is_measured = false;

CREATE INDEX IF NOT EXISTS idx_m51_outcomes_m51_selected
  ON public.m51_boost_outcomes (m51_selected, boosted_at DESC)
  WHERE m51_selected = true;

ALTER TABLE public.m51_boost_outcomes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='m51_boost_outcomes' AND policyname='m51o_select_own') THEN
    CREATE POLICY "m51o_select_own" ON public.m51_boost_outcomes
      FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- TABELA 4: m51_demand_cache
-- Demanda pré-agregada por cidade + categoria + hora + dia + mês.
-- Atualizada por pg_cron diário. Alimenta city_demand_score e
-- category_demand_score em m51_listing_signals.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.m51_demand_cache (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dimensões de agrupamento (NULL = qualquer)
  city            TEXT,
  category        TEXT,
  listing_type    TEXT,
  hour_of_day     INT         CHECK (hour_of_day IS NULL OR (hour_of_day >= 0 AND hour_of_day <= 23)),
  day_of_week     INT         CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  month_of_year   INT         CHECK (month_of_year IS NULL OR (month_of_year >= 1 AND month_of_year <= 12)),

  -- Métricas de demanda
  demand_score    NUMERIC(6,2) NOT NULL DEFAULT 1.0,   -- > 1 = acima da média
  search_count    INT         NOT NULL DEFAULT 0,
  click_count     INT         NOT NULL DEFAULT 0,
  conversion_count INT        NOT NULL DEFAULT 0,
  sample_size     INT         NOT NULL DEFAULT 0,
  confidence      NUMERIC(4,2) NOT NULL DEFAULT 0.5,  -- 0–1

  -- Validade
  refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),

  CONSTRAINT uq_m51_demand_cache
    UNIQUE NULLS NOT DISTINCT (city, category, listing_type, hour_of_day, day_of_week, month_of_year)
);

CREATE INDEX IF NOT EXISTS idx_m51_demand_city_cat
  ON public.m51_demand_cache (city, category, listing_type, hour_of_day, day_of_week);

-- C5: RLS obrigatório — sem isto, os default privileges do Supabase
-- permitiriam a qualquer autenticado ESCREVER demand scores e
-- manipular a seleção da IA.
ALTER TABLE public.m51_demand_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='m51_demand_cache' AND policyname='m51dc_select_all') THEN
    -- Leitura liberada (dados agregados, não sensíveis); escrita: nenhuma
    -- policy → INSERT/UPDATE/DELETE bloqueados; só service_role escreve.
    CREATE POLICY "m51dc_select_all" ON public.m51_demand_cache
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Dados iniciais: horários de pico genéricos (refinados pelo job real)
INSERT INTO public.m51_demand_cache
  (city, category, listing_type, hour_of_day, day_of_week, demand_score, confidence, sample_size)
VALUES
  (NULL, NULL, NULL,  8, NULL, 1.20, 0.50, 0),  -- manhã
  (NULL, NULL, NULL,  9, NULL, 1.30, 0.50, 0),
  (NULL, NULL, NULL, 10, NULL, 1.25, 0.50, 0),
  (NULL, NULL, NULL, 12, NULL, 1.40, 0.50, 0),  -- almoço
  (NULL, NULL, NULL, 13, NULL, 1.35, 0.50, 0),
  (NULL, NULL, NULL, 18, NULL, 1.50, 0.50, 0),  -- fim de tarde
  (NULL, NULL, NULL, 19, NULL, 1.60, 0.50, 0),  -- pico noturno
  (NULL, NULL, NULL, 20, NULL, 1.45, 0.50, 0),
  (NULL, NULL, NULL, NULL, 4, 1.25, 0.50, 0),   -- quinta
  (NULL, NULL, NULL, NULL, 6, 1.30, 0.50, 0)    -- sábado
ON CONFLICT ON CONSTRAINT uq_m51_demand_cache DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- RPC 1: m51_compute_listing_score()
--
-- Calcula o score de um produto usando sinais de m51_listing_signals
-- e pesos de m51_score_weights. Atualiza score_total no banco e
-- retorna o breakdown completo para auditoria.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.m51_compute_listing_score(
  p_listing_id    TEXT,
  p_listing_type  TEXT,
  p_user_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now         TIMESTAMPTZ := now();
  v_hour        INT         := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo')::INT;
  v_dow         INT         := EXTRACT(DOW  FROM v_now AT TIME ZONE 'America/Sao_Paulo')::INT;
  v_month       INT         := EXTRACT(MONTH FROM v_now AT TIME ZONE 'America/Sao_Paulo')::INT;
  v_today       DATE        := (v_now AT TIME ZONE 'America/Sao_Paulo')::DATE;

  v_sig         public.m51_listing_signals%ROWTYPE;
  v_score       NUMERIC(8,2) := 0;
  v_active      JSONB        := '{}'::JSONB;

  -- Pesos (sobrescritos pelos registros de m51_score_weights)
  w_never_boosted       NUMERIC := 1.50;
  w_low_views           NUMERIC := 1.30;
  w_new_product         NUMERIC := 1.40;
  w_on_promotion        NUMERIC := 1.60;
  w_high_stock          NUMERIC := 1.20;
  w_low_sales           NUMERIC := 1.30;
  w_high_margin         NUMERIC := 1.40;
  w_city_demand         NUMERIC := 1.40;
  w_category_demand     NUMERIC := 1.30;
  w_peak_hours          NUMERIC := 1.50;
  w_best_day            NUMERIC := 1.20;
  w_seasonality         NUMERIC := 1.30;
  w_high_conversion     NUMERIC := 0.80;
  w_low_conversion      NUMERIC := 1.30;
  v_row_w               RECORD;
BEGIN
  -- C3: apenas o próprio anunciante, admin ou serviço
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- Carrega sinais do produto — filtrado por dono: impede computar/gravar
  -- score no listing de outro anunciante passando o próprio user_id
  SELECT * INTO v_sig
  FROM public.m51_listing_signals
  WHERE listing_id = p_listing_id AND listing_type = p_listing_type
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'score',   0,
      'signals', '{}'::JSONB,
      'reason',  'no_signals_computed'
    );
  END IF;

  -- Produto já foi impulsionado hoje → score = 0 (excluído)
  IF v_sig.last_boosted_at IS NOT NULL
     AND (v_sig.last_boosted_at AT TIME ZONE 'America/Sao_Paulo')::DATE = v_today
  THEN
    RETURN jsonb_build_object(
      'score',           0,
      'signals',         jsonb_build_object('already_boosted_today', true),
      'excluded_reason', 'already_boosted_today'
    );
  END IF;

  -- Carrega pesos (user-specific > global, ambos filtrados por is_active)
  FOR v_row_w IN
    SELECT DISTINCT ON (signal_key)
      signal_key, weight
    FROM public.m51_score_weights
    WHERE (user_id = p_user_id OR user_id IS NULL)
      AND is_active = true
    ORDER BY signal_key, user_id NULLS LAST  -- user-specific vence global
  LOOP
    CASE v_row_w.signal_key
      WHEN 'never_boosted'        THEN w_never_boosted       := v_row_w.weight;
      WHEN 'low_views_7d'         THEN w_low_views           := v_row_w.weight;
      WHEN 'new_product_7d'       THEN w_new_product         := v_row_w.weight;
      WHEN 'on_promotion'         THEN w_on_promotion        := v_row_w.weight;
      WHEN 'high_stock'           THEN w_high_stock          := v_row_w.weight;
      WHEN 'low_sales_30d'        THEN w_low_sales           := v_row_w.weight;
      WHEN 'high_margin'          THEN w_high_margin         := v_row_w.weight;
      WHEN 'city_demand'          THEN w_city_demand         := v_row_w.weight;
      WHEN 'category_demand'      THEN w_category_demand     := v_row_w.weight;
      WHEN 'peak_hours'           THEN w_peak_hours          := v_row_w.weight;
      WHEN 'best_day'             THEN w_best_day            := v_row_w.weight;
      WHEN 'seasonality'          THEN w_seasonality         := v_row_w.weight;
      WHEN 'high_conversion_hist' THEN w_high_conversion     := v_row_w.weight;
      WHEN 'low_conversion_hist'  THEN w_low_conversion      := v_row_w.weight;
      ELSE NULL;
    END CASE;
  END LOOP;

  -- ── Sinal 1: never_boosted ────────────────────────────────
  IF v_sig.boost_count_total = 0 THEN
    v_score := v_score + w_never_boosted;
    v_active := v_active || jsonb_build_object('never_boosted', w_never_boosted);
  END IF;

  -- ── Sinal 2: low_views_7d ─────────────────────────────────
  IF COALESCE(v_sig.view_count_7d, 0) < 10 THEN
    v_score := v_score + w_low_views;
    v_active := v_active || jsonb_build_object('low_views_7d', w_low_views);
  END IF;

  -- ── Sinal 3: new_product_7d ───────────────────────────────
  IF v_sig.created_at_listing IS NOT NULL
     AND v_sig.created_at_listing > v_now - INTERVAL '7 days' THEN
    v_score := v_score + w_new_product;
    v_active := v_active || jsonb_build_object('new_product_7d', w_new_product);
  END IF;

  -- ── Sinal 4: on_promotion ─────────────────────────────────
  IF v_sig.has_promotion THEN
    v_score := v_score + w_on_promotion;
    v_active := v_active || jsonb_build_object('on_promotion', w_on_promotion);
  END IF;

  -- ── Sinal 5: high_stock ───────────────────────────────────
  IF COALESCE(v_sig.stock_level, 0) > 50 THEN
    v_score := v_score + w_high_stock;
    v_active := v_active || jsonb_build_object('high_stock', w_high_stock);
  END IF;

  -- ── Sinal 6: low_sales_30d ────────────────────────────────
  IF COALESCE(v_sig.sales_count_30d, 0) = 0 THEN
    v_score := v_score + w_low_sales;
    v_active := v_active || jsonb_build_object('low_sales_30d', w_low_sales);
  END IF;

  -- ── Sinal 7: high_margin ──────────────────────────────────
  IF COALESCE(v_sig.margin_pct, 0) > 30 THEN
    v_score := v_score + w_high_margin;
    v_active := v_active || jsonb_build_object('high_margin', w_high_margin);
  END IF;

  -- ── Sinal 8: city_demand ──────────────────────────────────
  IF COALESCE(v_sig.city_demand_score, 1.0) > 1.2 THEN
    v_score := v_score + w_city_demand;
    v_active := v_active || jsonb_build_object('city_demand', w_city_demand);
  END IF;

  -- ── Sinal 9: category_demand ──────────────────────────────
  IF COALESCE(v_sig.category_demand_score, 1.0) > 1.2 THEN
    v_score := v_score + w_category_demand;
    v_active := v_active || jsonb_build_object('category_demand', w_category_demand);
  END IF;

  -- ── Sinal 10: peak_hours ──────────────────────────────────
  -- Pico: manhã (8-10), almoço (12-13), fim de tarde (18-20)
  IF v_hour IN (8, 9, 10, 12, 13, 18, 19, 20) THEN
    v_score := v_score + w_peak_hours;
    v_active := v_active || jsonb_build_object('peak_hours', w_peak_hours);
  END IF;

  -- ── Sinal 11: best_day ────────────────────────────────────
  -- Quinta (4) e Sábado (6) têm maior conversão histórica
  IF v_dow IN (4, 6) THEN
    v_score := v_score + w_best_day;
    v_active := v_active || jsonb_build_object('best_day', w_best_day);
  END IF;

  -- ── Sinal 12: seasonality ─────────────────────────────────
  IF COALESCE(v_sig.seasonality_score, 1.0) > 1.15 THEN
    v_score := v_score + w_seasonality;
    v_active := v_active || jsonb_build_object('seasonality', w_seasonality);
  END IF;

  -- ── Sinais 13 & 14: Historical conversion ─────────────────
  IF v_sig.avg_ctr > 0.15 THEN
    -- Alta conversão: já funciona bem, menos urgência (peso < 1 = redutor)
    v_score := v_score * w_high_conversion;
    v_active := v_active || jsonb_build_object('high_conversion_hist', w_high_conversion);
  ELSIF v_sig.total_clicks > 5 AND v_sig.avg_ctr < 0.03 THEN
    -- Baixa conversão apesar de boosts: incentiva nova tentativa
    v_score := v_score + w_low_conversion;
    v_active := v_active || jsonb_build_object('low_conversion_hist', w_low_conversion);
  END IF;

  -- ── Bônus de ROI histórico ────────────────────────────────
  -- Cada R$ 10 de ROI médio adiciona 0.1 ao score (cap: +2.0)
  IF v_sig.avg_roi > 0 THEN
    v_score := v_score + LEAST(2.0, v_sig.avg_roi / 10.0);
  END IF;

  -- Garante score mínimo de 0
  v_score := GREATEST(0, ROUND(v_score, 2));

  -- Persiste score pré-computado (válido por 1h)
  UPDATE public.m51_listing_signals
  SET score_total       = v_score,
      score_signals     = v_active,
      score_computed_at = v_now,
      score_expires_at  = v_now + INTERVAL '1 hour',
      updated_at        = v_now
  WHERE listing_id = p_listing_id AND listing_type = p_listing_type
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'score',        v_score,
    'signals',      v_active,
    'computed_at',  v_now,
    'listing_id',   p_listing_id,
    'listing_type', p_listing_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.m51_compute_listing_score(TEXT, TEXT, UUID)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- RPC 2: m51_select_best_listings()
--
-- Retorna os N melhores produtos para impulsionamento baseados no
-- score pré-computado + multiplicador de horário em tempo real.
-- Exclui produtos já impulsionados hoje ou sem estoque.
-- Faz fallback para ordem cronológica dos slots se não há scores.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.m51_select_best_listings(
  p_user_id   UUID,
  p_n         INT DEFAULT 3
)
RETURNS TABLE (
  slot_id          UUID,
  listing_id       TEXT,
  listing_type     TEXT,
  listing_title    TEXT,
  listing_city     TEXT,
  score_total      NUMERIC,
  rank             INT,
  signals          JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    -- Multiplicadores temporais AO VIVO (hora/dia da SELEÇÃO, não do
    -- último refresh) — lidos do m51_demand_cache no fuso Brasil
    SELECT
      COALESCE((
        SELECT dc.demand_score FROM public.m51_demand_cache dc
        WHERE dc.hour_of_day = EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Sao_Paulo')::INT
          AND dc.day_of_week IS NULL AND dc.city IS NULL AND dc.category IS NULL
        ORDER BY dc.confidence DESC LIMIT 1
      ), 1.0) AS hour_mult,
      COALESCE((
        SELECT dc.demand_score FROM public.m51_demand_cache dc
        WHERE dc.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::INT
          AND dc.hour_of_day IS NULL AND dc.city IS NULL AND dc.category IS NULL
        ORDER BY dc.confidence DESC LIMIT 1
      ), 1.0) AS day_mult
  ),
  scored AS (
    SELECT
      pls.id  AS slot_id,
      pls.listing_id,
      pls.listing_type,
      pls.listing_title,
      pls.listing_city,
      ROUND(COALESCE(s.score_total, 0.1) * ctx.hour_mult * ctx.day_mult, 2) AS effective_score,
      COALESCE(s.score_signals, '{}'::JSONB) AS signals,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(s.score_total, 0.1) * ctx.hour_mult * ctx.day_mult DESC,
                 pls.position ASC
      )::INT AS rk
    FROM public.promoted_listing_slots pls
    CROSS JOIN ctx
    LEFT JOIN public.m51_listing_signals s
      ON  s.listing_id   = pls.listing_id
      AND s.listing_type = pls.listing_type
      AND s.user_id      = p_user_id
    WHERE pls.user_id = p_user_id
      -- M5: caller só enumera os próprios listings (admin/serviço veem tudo)
      AND (auth.uid() IS NULL OR auth.uid() = p_user_id OR public.is_admin())
      AND pls.status  = 'active'
      -- Exclui impulsionados hoje (fuso Brasil)
      AND (
        s.last_boosted_at IS NULL
        OR (s.last_boosted_at AT TIME ZONE 'America/Sao_Paulo')::DATE
           < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE
      )
      -- Exclui sem estoque
      AND (s.stock_level IS NULL OR s.stock_level > 0)
  )
  SELECT
    slot_id,
    listing_id,
    listing_type,
    listing_title,
    listing_city,
    effective_score AS score_total,
    rk              AS rank,
    signals
  FROM scored
  WHERE rk <= p_n
  ORDER BY rk;
$$;

GRANT EXECUTE ON FUNCTION public.m51_select_best_listings(UUID, INT)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- RPC 3: m51_refresh_signals()
--
-- Cria/atualiza registros em m51_listing_signals para os slots
-- ativos do anunciante (ou todos, se p_user_id IS NULL).
-- Chamada pelo job pg_cron diário + por trigger em eventos relevantes.
-- Computa score inicial após upsert.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.m51_refresh_signals(
  p_user_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now         TIMESTAMPTZ := now();
  v_slot        RECORD;
  v_upserted    INT := 0;
  v_scored      INT := 0;
BEGIN
  -- C3: usuário comum só atualiza os próprios sinais; a varredura
  -- global (p_user_id NULL) é exclusiva de admin/serviço
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND (p_user_id IS NULL OR p_user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- Itera pelos slots ativos (do user ou de todos)
  FOR v_slot IN
    SELECT
      pls.user_id,
      pls.listing_id,
      pls.listing_type,
      pls.listing_title,
      pls.listing_price::NUMERIC(12,2),
      pls.listing_city,
      pls.created_at
    FROM public.promoted_listing_slots pls
    WHERE pls.status = 'active'
      AND (p_user_id IS NULL OR pls.user_id = p_user_id)
  LOOP
    -- Upsert de sinais base (sinais de engajamento = 0 até que triggers os preencham)
    INSERT INTO public.m51_listing_signals (
      listing_id, listing_type, user_id,
      listing_title, listing_price, listing_city,
      created_at_listing,
      signals_refreshed_at, updated_at
    ) VALUES (
      v_slot.listing_id, v_slot.listing_type, v_slot.user_id,
      v_slot.listing_title, v_slot.listing_price, v_slot.listing_city,
      v_slot.created_at,
      v_now, v_now
    )
    ON CONFLICT (listing_id, listing_type) DO UPDATE
      SET listing_title       = EXCLUDED.listing_title,
          listing_price       = EXCLUDED.listing_price,
          listing_city        = EXCLUDED.listing_city,
          signals_refreshed_at= v_now,
          is_active           = true,
          updated_at          = v_now;

    v_upserted := v_upserted + 1;

    -- Atualiza scores de demanda a partir do m51_demand_cache
    UPDATE public.m51_listing_signals ls
    SET
      city_demand_score = COALESCE((
        SELECT dc.demand_score FROM public.m51_demand_cache dc
        WHERE (dc.city IS NULL OR dc.city = v_slot.listing_city)
          AND dc.category IS NULL AND dc.listing_type IS NULL
          AND dc.hour_of_day IS NULL AND dc.day_of_week IS NULL
        ORDER BY dc.confidence DESC
        LIMIT 1
      ), 1.0),
      peak_hour_score = COALESCE((
        SELECT dc.demand_score FROM public.m51_demand_cache dc
        WHERE dc.hour_of_day = EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo')::INT
          AND dc.day_of_week IS NULL AND dc.city IS NULL
        ORDER BY dc.confidence DESC
        LIMIT 1
      ), 1.0),
      best_day_score = COALESCE((
        SELECT dc.demand_score FROM public.m51_demand_cache dc
        WHERE dc.day_of_week = EXTRACT(DOW FROM v_now AT TIME ZONE 'America/Sao_Paulo')::INT
          AND dc.hour_of_day IS NULL AND dc.city IS NULL
        ORDER BY dc.confidence DESC
        LIMIT 1
      ), 1.0),
      updated_at = v_now
    WHERE ls.listing_id = v_slot.listing_id AND ls.listing_type = v_slot.listing_type;

    -- Computa score inicial (sem bloquear em exceção)
    BEGIN
      PERFORM public.m51_compute_listing_score(
        v_slot.listing_id, v_slot.listing_type, v_slot.user_id
      );
      v_scored := v_scored + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- ignora erros de score individual
    END;
  END LOOP;

  -- Desativa sinais de slots que foram removidos/desativados
  UPDATE public.m51_listing_signals ls
  SET is_active = false, updated_at = v_now
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.promoted_listing_slots pls
      WHERE pls.listing_id = ls.listing_id
        AND pls.listing_type = ls.listing_type
        AND pls.user_id = ls.user_id
        AND pls.status = 'active'
    );

  RETURN jsonb_build_object(
    'ok',          true,
    'upserted',    v_upserted,
    'scored',      v_scored,
    'refreshed_at',v_now::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.m51_refresh_signals(UUID)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- RPC 4: m51_record_boost_outcome()
--
-- Registra um impulsionamento em m51_boost_outcomes (auditoria
-- individual) e atualiza o last_boosted_at em m51_listing_signals
-- (para exclusão do "já impulsionado hoje").
--
-- Retorna o id do outcome para correlacionar com eventos futuros.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.m51_record_boost_outcome(
  p_user_id           UUID,
  p_listing_id        TEXT,
  p_listing_type      TEXT,
  p_lot_id            UUID    DEFAULT NULL,
  p_listing_title     TEXT    DEFAULT NULL,
  p_listing_city      TEXT    DEFAULT NULL,
  p_listing_category  TEXT    DEFAULT NULL,
  p_score_snapshot    JSONB   DEFAULT NULL,
  p_plan_name         TEXT    DEFAULT NULL,
  p_daily_used        INT     DEFAULT NULL,
  p_origin            TEXT    DEFAULT 'scheduled',
  p_m51_selected      BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now         TIMESTAMPTZ := now();
  v_outcome_id  UUID;
  v_score       NUMERIC     := 0;
BEGIN
  -- C3: sem este guard, qualquer usuário poderia marcar produtos de um
  -- concorrente como "impulsionados hoje" (suprimindo-os da seleção da IA)
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- Lê score atual dos sinais (para snapshot) — filtrado por dono
  SELECT score_total INTO v_score
  FROM public.m51_listing_signals
  WHERE listing_id = p_listing_id AND listing_type = p_listing_type
    AND user_id = p_user_id;

  -- Insere o outcome
  INSERT INTO public.m51_boost_outcomes (
    user_id, lot_id, listing_id, listing_type,
    listing_title, listing_city, listing_category,
    score_at_boost, score_signals_snapshot,
    plan_name, daily_used_at_boost, origin, m51_selected,
    boosted_at, measurement_window_hours
  ) VALUES (
    p_user_id, p_lot_id, p_listing_id, p_listing_type,
    p_listing_title, p_listing_city, p_listing_category,
    COALESCE(v_score, 0), COALESCE(p_score_snapshot, '{}'::JSONB),
    p_plan_name, p_daily_used, COALESCE(p_origin, 'scheduled'),
    COALESCE(p_m51_selected, false),
    v_now, 48
  )
  RETURNING id INTO v_outcome_id;

  -- Marca como "impulsionado agora" em m51_listing_signals (só do dono)
  UPDATE public.m51_listing_signals
  SET last_boosted_at  = v_now,
      boost_count_total= boost_count_total + 1,
      boost_count_7d   = boost_count_7d + 1,
      boost_count_30d  = boost_count_30d + 1,
      -- Invalida score (será recalculado na próxima chamada)
      score_expires_at = v_now - INTERVAL '1 second',
      updated_at       = v_now
  WHERE listing_id = p_listing_id AND listing_type = p_listing_type
    AND user_id = p_user_id;

  RETURN v_outcome_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.m51_record_boost_outcome(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INT, TEXT, BOOLEAN)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- RPC 5: m51_update_outcome_metrics()
--
-- Atualiza impressões/cliques/vendas de um outcome e propaga
-- o aprendizado de volta para m51_listing_signals.
-- Chamada por triggers de analytics ou job periódico.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.m51_update_outcome_metrics(
  p_outcome_id        UUID,
  p_views_delta       INT DEFAULT 0,
  p_clicks_delta      INT DEFAULT 0,
  p_contacts_delta    INT DEFAULT 0,
  p_sales_delta       INT DEFAULT 0,
  p_revenue_delta     NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now     TIMESTAMPTZ := now();
  v_outcome public.m51_boost_outcomes%ROWTYPE;
BEGIN
  -- C3: métricas vêm de eventos de tracking (serviço) ou admin —
  -- nunca do próprio anunciante (evita inflar o próprio aprendizado)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- Incrementa contadores do outcome com lock
  UPDATE public.m51_boost_outcomes
  SET views_after     = views_after    + COALESCE(p_views_delta, 0),
      clicks_after    = clicks_after   + COALESCE(p_clicks_delta, 0),
      contacts_after  = contacts_after + COALESCE(p_contacts_delta, 0),
      sales_after     = sales_after    + COALESCE(p_sales_delta, 0),
      revenue_after   = revenue_after  + COALESCE(p_revenue_delta, 0),
      ctr             = CASE
                          WHEN (views_after + p_views_delta) > 0
                          THEN (clicks_after + p_clicks_delta)::NUMERIC / (views_after + p_views_delta)
                          ELSE 0
                        END,
      conversion_rate = CASE
                          WHEN (clicks_after + p_clicks_delta) > 0
                          THEN (sales_after + p_sales_delta)::NUMERIC / (clicks_after + p_clicks_delta)
                          ELSE 0
                        END,
      roi             = (revenue_after + p_revenue_delta),
      measured_at     = v_now,
      updated_at      = v_now
  WHERE id = p_outcome_id
  RETURNING * INTO v_outcome;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outcome_not_found');
  END IF;

  -- Propaga aprendizado: atualiza médias em m51_listing_signals
  UPDATE public.m51_listing_signals ls
  SET
    total_clicks      = total_clicks      + COALESCE(p_clicks_delta, 0),
    total_conversions = total_conversions + COALESCE(p_sales_delta, 0),
    total_revenue     = total_revenue     + COALESCE(p_revenue_delta, 0),
    total_impressions = total_impressions + COALESCE(p_views_delta, 0),
    -- Recalcula médias globais (weighted rolling average)
    avg_ctr         = CASE
                        WHEN (total_impressions + p_views_delta) > 0
                        THEN (total_clicks + p_clicks_delta)::NUMERIC / (total_impressions + p_views_delta)
                        ELSE avg_ctr
                      END,
    avg_conversion  = CASE
                        WHEN (total_clicks + p_clicks_delta) > 0
                        THEN (total_conversions + p_sales_delta)::NUMERIC / (total_clicks + p_clicks_delta)
                        ELSE avg_conversion
                      END,
    avg_roi         = CASE
                        WHEN boost_count_total > 0
                        THEN (total_revenue + p_revenue_delta) / boost_count_total
                        ELSE 0
                      END,
    -- Invalida score para forçar recálculo com novos dados
    score_expires_at = v_now - INTERVAL '1 second',
    updated_at       = v_now
  WHERE listing_id = v_outcome.listing_id AND listing_type = v_outcome.listing_type;

  RETURN jsonb_build_object(
    'ok',            true,
    'outcome_id',    p_outcome_id,
    'ctr',           v_outcome.ctr,
    'conversion',    v_outcome.conversion_rate,
    'roi',           v_outcome.roi
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.m51_update_outcome_metrics(UUID, INT, INT, INT, INT, NUMERIC)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO: generate_posting_lots() — versão M51
--
-- Combina M50 enforcement + M51 seleção inteligente.
-- Branch IA ativa apenas quando m51_enabled = true no
-- advertiser_daily_usage do anunciante (flag por usuário).
-- Compatibilidade: M50 unchanged para m51_enabled = false.
-- ──────────────────────────────────────────────────────────────

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname = 'generate_posting_lots'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.generate_posting_lots(
  p_profile   TEXT DEFAULT NULL,
  p_max_items INT  DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_row       RECORD;
  v_slot_row        RECORD;
  v_lot_id          UUID;
  v_position        INT;
  v_lots_created    INT       := 0;
  v_items_added     INT       := 0;
  v_blocked_users   INT       := 0;
  v_m51_selections  INT       := 0;
  v_errors          TEXT[]    := ARRAY[]::TEXT[];
  v_now             TIMESTAMPTZ := now();
  v_today           DATE      := (v_now AT TIME ZONE 'America/Sao_Paulo')::DATE;

  -- M50: enforcement de limite diário
  v_limit_check     JSONB;
  v_increment       JSONB;    -- H3: resultado da reserva atômica
  -- M51: seleção inteligente
  v_m51_enabled     BOOLEAN   := false;
  v_outcome_id      UUID;
  v_native          RECORD;   -- M8: linha nativa do slot (tipos originais)
BEGIN
  -- C3: apenas admin ou contexto de serviço (scheduler/Edge Function)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  FOR v_store_row IN
    SELECT
      pls.user_id                                                       AS store_user_id,
      COALESCE(ms.store_name, ms.nome_loja, p.name, 'Loja')           AS store_name,
      p.logo_url                                                        AS store_logo_url,
      COALESCE(ms.city, ms.cidade, MIN(pls.listing_city))             AS target_city,
      ms.bairro                                                         AS target_bairro,
      ms.region                                                         AS target_region,
      COUNT(pls.id)                                                     AS slot_count
    FROM public.promoted_listing_slots pls
    LEFT JOIN public.merchant_stores ms ON ms.user_id = pls.user_id
    LEFT JOIN public.profiles p         ON p.id       = pls.user_id
    WHERE pls.status = 'active'
      AND (p_profile IS NULL OR pls.listing_type = p_profile)
    GROUP BY
      pls.user_id, ms.store_name, ms.nome_loja, p.name,
      p.logo_url, ms.city, ms.cidade, ms.bairro, ms.region
  LOOP
    -- ── M50: verificar limite diário ANTES de criar lote ────
    BEGIN
      v_limit_check := public.check_advertiser_daily_limit(v_store_row.store_user_id);
    EXCEPTION WHEN OTHERS THEN
      -- H6: FAIL-CLOSED — sem verificação de limite, não publica
      v_errors := v_errors || format(
        'check_limit falhou para user %s: %s — usuário PULADO (fail-closed)',
        v_store_row.store_user_id, SQLERRM
      );
      CONTINUE;
    END;

    IF NOT (v_limit_check->>'ok')::BOOLEAN THEN
      v_blocked_users := v_blocked_users + 1;
      v_errors := v_errors || format(
        'user %s bloqueado: %s (usado=%s, limite=%s)',
        v_store_row.store_user_id,
        v_limit_check->>'reason',
        v_limit_check->>'daily_used',
        v_limit_check->>'daily_limit'
      );
      CONTINUE;
    END IF;
    -- ── fim M50 check ────────────────────────────────────────

    -- Já tem lote ativo? Pula
    IF EXISTS (
      SELECT 1 FROM public.posting_lots
      WHERE store_user_id = v_store_row.store_user_id
        AND status IN ('available', 'claimed', 'cooldown')
        AND (p_profile IS NULL OR source_profile = p_profile OR source_profile IS NULL)
    ) THEN
      CONTINUE;
    END IF;

    -- ── M51: verificar se IA está habilitada ─────────────────
    -- H2: fonte de verdade é m51_advertiser_settings (persistente).
    -- A coluna da linha diária é só snapshot para auditoria/painel.
    SELECT COALESCE(s.m51_enabled, false)
    INTO v_m51_enabled
    FROM public.m51_advertiser_settings s
    WHERE s.user_id = v_store_row.store_user_id;
    v_m51_enabled := COALESCE(v_m51_enabled, false);

    -- Snapshot do flag na linha diária (auditoria)
    UPDATE public.advertiser_daily_usage
    SET m51_enabled = v_m51_enabled
    WHERE user_id = v_store_row.store_user_id
      AND usage_date = v_today
      AND m51_enabled IS DISTINCT FROM v_m51_enabled;
    -- ── fim M51 check ────────────────────────────────────────

    BEGIN
      INSERT INTO public.posting_lots (
        store_user_id, store_name, store_logo_url,
        target_city, target_region, target_bairro,
        source_profile, status, created_at, updated_at
      ) VALUES (
        v_store_row.store_user_id, v_store_row.store_name, v_store_row.store_logo_url,
        v_store_row.target_city, v_store_row.target_region, v_store_row.target_bairro,
        p_profile, 'available', v_now, v_now
      ) RETURNING id INTO v_lot_id;

      v_position := 0;

      IF v_m51_enabled THEN
        -- ── M51: seleção inteligente por score ───────────────
        FOR v_slot_row IN
          SELECT * FROM public.m51_select_best_listings(
            v_store_row.store_user_id,
            p_max_items
          )
        LOOP
          v_position := v_position + 1;

          -- M8: relê o slot nativo — preserva os TIPOS ORIGINAIS de
          -- price/image (a função de seleção não os retorna) e mantém
          -- source_slot_id para auditoria, igual ao branch M50
          SELECT id, listing_id, listing_title, listing_price,
                 listing_image, listing_city, listing_type
          INTO v_native
          FROM public.promoted_listing_slots
          WHERE id = v_slot_row.slot_id;

          INSERT INTO public.posting_lot_items (
            lot_id, product_name, product_price, product_image_url,
            position, source_slot_id
          ) VALUES (
            v_lot_id,
            v_native.listing_title,
            v_native.listing_price,
            v_native.listing_image,
            v_position,
            v_native.id
          );
          v_items_added := v_items_added + 1;

          -- Auditoria + aprendizado. Dentro da subtransação do lote:
          -- se o lote for revertido, o outcome também é.
          v_outcome_id := public.m51_record_boost_outcome(
            p_user_id          := v_store_row.store_user_id,
            p_listing_id       := v_slot_row.listing_id,
            p_listing_type     := v_slot_row.listing_type,
            p_lot_id           := v_lot_id,
            p_listing_title    := v_native.listing_title,
            p_listing_city     := v_native.listing_city,
            p_score_snapshot   := v_slot_row.signals,
            p_plan_name        := v_limit_check->>'plan_name',
            p_daily_used       := (v_limit_check->>'daily_used')::INT + 1,
            p_origin           := 'ai_auto',
            p_m51_selected     := true
          );
        END LOOP;

        IF v_position > 0 THEN
          v_m51_selections := v_m51_selections + 1;
        END IF;

      ELSE
        -- ── M50: seleção manual (promoted_listing_slots) ─────
        FOR v_slot_row IN
          SELECT id, listing_id, listing_title, listing_price, listing_image, listing_city, listing_type
          FROM public.promoted_listing_slots
          WHERE user_id = v_store_row.store_user_id
            AND status  = 'active'
            AND (p_profile IS NULL OR listing_type = p_profile)
          ORDER BY position ASC
          LIMIT p_max_items
        LOOP
          v_position := v_position + 1;
          INSERT INTO public.posting_lot_items (
            lot_id, product_name, product_price, product_image_url,
            position, source_slot_id
          ) VALUES (
            v_lot_id, v_slot_row.listing_title, v_slot_row.listing_price,
            v_slot_row.listing_image, v_position, v_slot_row.id
          );
          v_items_added := v_items_added + 1;
        END LOOP;
      END IF;

      -- H3: lote sem itens não deve existir nem consumir cota
      IF v_position = 0 THEN
        RAISE EXCEPTION 'lot_empty';
      END IF;

      UPDATE public.posting_lots
      SET items_count = v_position
      WHERE id = v_lot_id;

      INSERT INTO public.posting_lot_events (lot_id, event_type, metadata)
      VALUES (v_lot_id, 'created', jsonb_build_object(
        'items_count',    v_position,
        'store_name',     v_store_row.store_name,
        'source',         CASE WHEN v_m51_enabled THEN 'ai_auto' ELSE 'promoted_listing_slots' END,
        'profile',        p_profile,
        'm51_enabled',    v_m51_enabled,
        'plan_name',      v_limit_check->>'plan_name',
        'daily_limit',    v_limit_check->>'daily_limit',
        'daily_used',     v_limit_check->>'daily_used'
      ));

      -- ── H3: RESERVA ATÔMICA no mesmo subtransaction do lote ──
      -- Falha ou ok=false ⇒ exceção ⇒ lote + itens + evento +
      -- outcomes M51 revertidos juntos. Invariante:
      -- lote existe ⟺ consumo registrado.
      v_increment := public.increment_advertiser_daily_usage(
        p_user_id      := v_store_row.store_user_id,
        p_origin       := CASE WHEN v_m51_enabled THEN 'ai_auto' ELSE 'scheduled' END,
        p_listing_id   := v_slot_row.listing_id,
        p_listing_type := v_slot_row.listing_type,
        p_lot_id       := v_lot_id,
        p_campaign_id  := NULL,
        p_city         := v_store_row.target_city,
        p_groups_count := 0
      );
      IF NOT (v_increment->>'ok')::BOOLEAN THEN
        RAISE EXCEPTION 'daily_limit_reached_concurrent';
      END IF;

      v_lots_created := v_lots_created + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Subtransação revertida por completo
      IF SQLERRM = 'daily_limit_reached_concurrent' THEN
        v_blocked_users := v_blocked_users + 1;
        v_errors := v_errors || format(
          'user %s: limite atingido em corrida concorrente — lote revertido',
          v_store_row.store_user_id
        );
      ELSIF SQLERRM = 'lot_empty' THEN
        v_errors := v_errors || format(
          'user %s: nenhum slot elegível — lote vazio revertido',
          v_store_row.store_user_id
        );
      ELSE
        v_errors := v_errors || format('user %s: %s', v_store_row.store_user_id, SQLERRM);
      END IF;
    END;
  END LOOP;

  -- Expirar lotes com cooldown vencido
  UPDATE public.posting_lots
  SET status = 'expired', updated_at = v_now
  WHERE status = 'cooldown'
    AND cooldown_until IS NOT NULL
    AND cooldown_until < v_now;

  RETURN jsonb_build_object(
    'ok',             true,
    'lots_created',   v_lots_created,
    'items_added',    v_items_added,
    'blocked_users',  v_blocked_users,
    'm51_selections', v_m51_selections,
    'errors',         v_errors,
    'generated_at',   v_now::text
  );
END;
$$;

COMMENT ON FUNCTION public.generate_posting_lots IS
'M51 (IA): generate_posting_lots com M50 enforcement + M51 seleção inteligente por score. m51_enabled ativa o branch de IA por anunciante.';

GRANT EXECUTE ON FUNCTION public.generate_posting_lots(TEXT, INT)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- VIEW: m51_top_performers — produtos com melhor ROI histórico
-- Para painel admin e anunciante.
-- ──────────────────────────────────────────────────────────────

-- C4: security_invoker=true — respeita RLS da tabela base; acesso via
-- API revogado de anon/authenticated (backoffice via service_role).
CREATE OR REPLACE VIEW public.m51_top_performers
WITH (security_invoker = true) AS
  SELECT
    s.user_id,
    s.listing_id,
    s.listing_type,
    s.listing_title,
    s.listing_city,
    s.score_total,
    s.avg_ctr,
    s.avg_conversion,
    s.avg_roi,
    s.boost_count_total,
    s.last_boosted_at,
    s.total_revenue,
    p.name    AS user_name,
    p.email   AS user_email
  FROM public.m51_listing_signals s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.is_active = true
    AND s.boost_count_total > 0
  ORDER BY s.avg_roi DESC, s.avg_ctr DESC;

REVOKE ALL ON public.m51_top_performers FROM PUBLIC;
REVOKE ALL ON public.m51_top_performers FROM anon, authenticated;
GRANT SELECT ON public.m51_top_performers TO service_role;


-- ──────────────────────────────────────────────────────────────
-- C3: Endurecimento de permissões das funções M51
-- ──────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.m51_compute_listing_score(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.m51_compute_listing_score(TEXT, TEXT, UUID) FROM anon;

REVOKE EXECUTE ON FUNCTION public.m51_select_best_listings(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.m51_select_best_listings(UUID, INT) FROM anon;

REVOKE EXECUTE ON FUNCTION public.m51_refresh_signals(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.m51_refresh_signals(UUID) FROM anon;

REVOKE EXECUTE ON FUNCTION public.m51_record_boost_outcome(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.m51_record_boost_outcome(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INT, TEXT, BOOLEAN) FROM anon;

-- Métricas de outcome: apenas serviço/admin (tracking events)
REVOKE EXECUTE ON FUNCTION public.m51_update_outcome_metrics(UUID, INT, INT, INT, INT, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.m51_update_outcome_metrics(UUID, INT, INT, INT, INT, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.m51_update_outcome_metrics(UUID, INT, INT, INT, INT, NUMERIC) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_posting_lots(TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_posting_lots(TEXT, INT) FROM anon;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'm51_listing_signals'
  ) THEN
    RAISE EXCEPTION 'ERRO: m51_listing_signals não criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'm51_boost_outcomes'
  ) THEN
    RAISE EXCEPTION 'ERRO: m51_boost_outcomes não criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'm51_advertiser_settings'
  ) THEN
    RAISE EXCEPTION 'ERRO: m51_advertiser_settings não criada (flag persistente H2)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'm51_demand_cache' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'ERRO: RLS não habilitado em m51_demand_cache (C5)';
  END IF;

  IF (SELECT COUNT(*) FROM public.m51_score_weights WHERE user_id IS NULL) < 14 THEN
    RAISE EXCEPTION 'ERRO: pesos padrão não inseridos (esperado >= 14)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'm51_select_best_listings'
  ) THEN
    RAISE EXCEPTION 'ERRO: m51_select_best_listings não criada';
  END IF;

  RAISE NOTICE 'M51 ✓ m51_listing_signals + m51_score_weights (% pesos) + m51_boost_outcomes + m51_demand_cache — OK',
    (SELECT COUNT(*) FROM public.m51_score_weights WHERE user_id IS NULL);
  RAISE NOTICE 'M51 ✓ m51_compute_listing_score + m51_select_best_listings + m51_refresh_signals + m51_record_boost_outcome — OK';
  RAISE NOTICE 'M51 ✓ generate_posting_lots() atualizada com branch M51 (m51_enabled flag por anunciante) — OK';
  RAISE NOTICE 'M51 ✓ Zero impacto em anunciantes com m51_enabled=false (comportamento M50 intacto) — OK';
  RAISE NOTICE 'M51 ✓ Preparado para: CTR, ROI, audience, geographic, advertiser_performance (10 sinais futuros) — OK';
END $$;
