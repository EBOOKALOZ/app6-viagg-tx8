-- ============================================================
-- M50 · Enforcement de Impulsionamentos por Plano do Anunciante
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-03
-- EXECUTAR: SQL Editor do Supabase — nunca via supabase db push
-- ============================================================
-- Componentes:
--   1. advertiser_daily_usage      — consumo diário por anunciante
--   2. check_advertiser_daily_limit()   — verifica e bloqueia ao atingir limite
--   3. increment_advertiser_daily_usage() — registra consumo atômico
--   4. get_advertiser_daily_stats()  — painel com dados reais
--   5. generate_posting_lots()       — reescrita com verificação de limite
-- ============================================================
-- Compatibilidade:
--   • Não altera nenhuma tabela existente
--   • promoted_listing_slots, posting_lots, posting_lot_items intactos
--   • promotion_packages, promotion_purchases lidos somente via SELECT
--   • Livre plano gratuito = 1 impulsionamento/dia (fallback automático)
-- ============================================================
-- Preparação M51 (IA de seleção automática):
--   • m51_enabled, m51_criteria, m51_last_run_at, m51_selection
--   • selection_score por critério (nunca impulsionado, views baixas, etc.)
--   • usage_by_origin, usage_by_listing_type, cities_used, groups_used
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- TABELA: advertiser_daily_usage
-- Uma linha por (user_id, usage_date).
-- UNIQUE (user_id, usage_date) garante upsert atômico.
-- daily_remaining é GENERATED: sem risco de dessincronização.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.advertiser_daily_usage (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),

  -- ── Identidade ────────────────────────────────────────────
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Default no fuso Brasil (RPCs sempre passam a data explicitamente; o default
  -- é apenas rede de segurança para inserções diretas via service_role)
  usage_date          DATE        NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::DATE),

  -- ── Plano ativo (snapshot no momento do check) ────────────
  -- Permite auditoria histórica mesmo se o plano mudar depois.
  plan_name           TEXT,                          -- 'gratuito' | nome do pacote
  package_id          UUID,                          -- promotion_packages.id (NULL = gratuito)
  purchase_id         UUID,                          -- promotion_purchases.id (NULL = gratuito)

  -- ── Quota diária ──────────────────────────────────────────
  daily_limit         INT         NOT NULL DEFAULT 1, -- vem de promotion_packages.daily_boosts
  daily_used          INT         NOT NULL DEFAULT 0,
  daily_remaining     INT GENERATED ALWAYS AS (GREATEST(0, daily_limit - daily_used)) STORED,

  -- ── Timestamps de uso ─────────────────────────────────────
  first_used_at       TIMESTAMPTZ,                   -- primeira publicação do dia
  last_used_at        TIMESTAMPTZ,                   -- publicação mais recente
  reset_at            TIMESTAMPTZ,                   -- próxima meia-noite (quando zera)

  -- ── Bloqueio ──────────────────────────────────────────────
  is_blocked          BOOLEAN     NOT NULL DEFAULT false,
  blocked_at          TIMESTAMPTZ,
  block_reason        TEXT,  -- 'daily_limit_reached' | 'plan_expired' | 'no_slots'

  -- ── Rastreabilidade do último evento ──────────────────────
  last_lot_id         UUID,           -- posting_lots.id
  last_campaign_id    UUID,           -- posting_campaigns.id (Tier 2)
  last_listing_id     TEXT,           -- promoted_listing_slots.listing_id
  last_listing_type   TEXT,           -- 'produtos' | 'imoveis' | etc.
  last_origin         TEXT            -- 'manual' | 'ai_auto' | 'scheduled' | 'operator'
    CHECK (last_origin IN ('manual', 'ai_auto', 'scheduled', 'operator')),

  -- ── Breakdown analítico (alimenta o painel) ───────────────
  usage_by_origin     JSONB       NOT NULL DEFAULT
    '{"manual":0,"ai_auto":0,"scheduled":0,"operator":0}'::JSONB,
  usage_by_listing_type JSONB     NOT NULL DEFAULT '{}'::JSONB,
  cities_used         TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
  groups_used         INT         NOT NULL DEFAULT 0,

  -- ── M51: Seleção automática por IA (preparação) ───────────
  -- Ativado por migration futura sem alterar esta tabela.
  m51_enabled         BOOLEAN     NOT NULL DEFAULT false,
  m51_criteria        JSONB,
  -- Estrutura esperada de m51_criteria (documentação):
  -- {
  --   "never_boosted":    1.5,   -- produto nunca impulsionado
  --   "low_views":        1.3,   -- < 10 visualizações
  --   "new_product":      1.4,   -- criado há < 7 dias
  --   "on_promotion":     1.6,   -- listing_price reduzido / badge promoção
  --   "high_stock":       1.2,   -- estoque > threshold
  --   "low_sales":        1.3,   -- sem vendas nos últimos 30 dias
  --   "high_conversion":  0.8,   -- já converte bem (não precisa de boost urgente)
  --   "city_demand":      1.4,   -- cidade com alta demanda na categoria
  --   "category_demand":  1.3,   -- categoria trending
  --   "peak_hours":       1.5    -- horário de maior conversão histórica
  -- }
  m51_last_run_at     TIMESTAMPTZ,
  m51_selection       JSONB,
  -- Estrutura esperada de m51_selection:
  -- [
  --   {"listing_id": "...", "listing_type": "...", "score": 4.2,
  --    "reasons": ["never_boosted", "new_product"], "rank": 1},
  --   ...
  -- ]

  -- ── Metadados técnicos ────────────────────────────────────
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_advertiser_daily_usage
    PRIMARY KEY (id),

  CONSTRAINT uq_advertiser_daily_usage
    UNIQUE (user_id, usage_date),

  CONSTRAINT chk_daily_used_non_negative
    CHECK (daily_used >= 0),

  CONSTRAINT chk_daily_limit_positive
    CHECK (daily_limit >= 1)

  -- Constraint chk_daily_used_le_limit removida: downgrade de plano causaria
  -- violação (daily_used > new_limit). A proteção contra excesso está nas
  -- RPCs (FOR UPDATE + double-check + reserva atômica no generate).
);

-- ── Índices ────────────────────────────────────────────────

-- Acesso principal: usuário + data (RPC check + painel)
CREATE INDEX IF NOT EXISTS idx_adu_user_date
  ON public.advertiser_daily_usage (user_id, usage_date DESC);

-- Painel admin: todas as linhas de hoje (monitoramento)
CREATE INDEX IF NOT EXISTS idx_adu_date_blocked
  ON public.advertiser_daily_usage (usage_date, is_blocked)
  WHERE is_blocked = true;

-- Analytics: leituras por plano
CREATE INDEX IF NOT EXISTS idx_adu_package_date
  ON public.advertiser_daily_usage (package_id, usage_date DESC)
  WHERE package_id IS NOT NULL;

ALTER TABLE public.advertiser_daily_usage ENABLE ROW LEVEL SECURITY;

-- Anunciante vê apenas seus próprios registros
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'advertiser_daily_usage'
      AND policyname = 'adu_select_own'
  ) THEN
    CREATE POLICY "adu_select_own"
      ON public.advertiser_daily_usage
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Admin vê todos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'advertiser_daily_usage'
      AND policyname = 'adu_select_admin'
  ) THEN
    CREATE POLICY "adu_select_admin"
      ON public.advertiser_daily_usage
      FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- RPC 1: check_advertiser_daily_limit()
--
-- Resolve o plano ativo do anunciante e verifica se ele pode
-- publicar mais um lote hoje. Cria/garante o registro diário.
--
-- Retorna:
--   {ok, reason, daily_limit, daily_used, daily_remaining,
--    plan_name, package_id, purchase_id, reset_at}
--
-- Padrão: sem estado compartilhado — pode ser chamado em paralelo.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_advertiser_daily_limit(
  p_user_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now           TIMESTAMPTZ     := now();
  -- BUG-3 fix: fuso Brasil (UTC-3) — CURRENT_DATE usaria UTC, dia viraria às 21h local
  v_today         DATE            := (v_now AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_reset_at      TIMESTAMPTZ     := (date_trunc('day', v_now AT TIME ZONE 'America/Sao_Paulo')
                                      + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo';

  -- Plano ativo
  v_daily_limit   INT             := 1;   -- fallback gratuito
  v_plan_name     TEXT            := 'gratuito';
  v_package_id    UUID            := NULL;
  v_purchase_id   UUID            := NULL;

  -- Estado do dia
  v_daily_used    INT             := 0;
  v_is_blocked    BOOLEAN         := false;
BEGIN
  -- ── 0. Autorização (C3) ───────────────────────────────────
  -- Permitido: o próprio anunciante, admin, ou contexto de serviço
  -- (pg_cron / Edge Function com service_role → auth.uid() IS NULL).
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- ── 1. Resolve plano ativo ────────────────────────────────
  -- Lê promotion_purchases + promotion_packages sem migração.
  -- Se não encontrar plano pago ativo, usa gratuito (1/dia).
  BEGIN
    SELECT
      pp.daily_boosts,
      pp.name,
      pp.id,
      pur.id
    INTO
      v_daily_limit,
      v_plan_name,
      v_package_id,
      v_purchase_id
    FROM public.promotion_purchases pur
    JOIN public.promotion_packages  pp  ON pp.id = pur.package_id
    WHERE pur.advertiser_user_id = p_user_id
      AND pur.status             = 'paid'
      AND pur.expires_at         > v_now
      AND pp.daily_boosts        IS NOT NULL
      AND pp.daily_boosts        > 0
    ORDER BY pp.daily_boosts DESC   -- melhor plano, caso haja múltiplos
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- H6: degradação para gratuito é registrada — nunca silenciosa.
    -- Se isto aparecer nos logs em produção, há problema estrutural
    -- em promotion_purchases/promotion_packages.
    RAISE WARNING 'check_advertiser_daily_limit: falha ao resolver plano de % — fallback gratuito. Erro: %',
      p_user_id, SQLERRM;
    v_daily_limit := 1;
    v_plan_name   := 'gratuito';
  END;

  -- Garante que never null
  v_daily_limit := COALESCE(v_daily_limit, 1);
  v_plan_name   := COALESCE(v_plan_name,   'gratuito');

  -- ── 2. Garante linha do dia (upsert seguro) ───────────────
  INSERT INTO public.advertiser_daily_usage (
    user_id, usage_date,
    plan_name, package_id, purchase_id,
    daily_limit, daily_used,
    reset_at, is_blocked
  ) VALUES (
    p_user_id, v_today,
    v_plan_name, v_package_id, v_purchase_id,
    v_daily_limit, 0,
    v_reset_at, false
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE
    -- Atualiza plano se mudou (upgrade/downgrade no dia)
    SET plan_name    = EXCLUDED.plan_name,
        package_id   = EXCLUDED.package_id,
        purchase_id  = EXCLUDED.purchase_id,
        daily_limit  = EXCLUDED.daily_limit,
        reset_at     = EXCLUDED.reset_at,
        -- H1: recalcula o bloqueio com o NOVO limite.
        -- Upgrade no meio do dia desbloqueia imediatamente;
        -- downgrade abaixo do já usado bloqueia imediatamente.
        is_blocked   = (advertiser_daily_usage.daily_used >= EXCLUDED.daily_limit),
        blocked_at   = CASE
                         WHEN advertiser_daily_usage.daily_used >= EXCLUDED.daily_limit
                         THEN COALESCE(advertiser_daily_usage.blocked_at, now())
                         ELSE NULL
                       END,
        block_reason = CASE
                         WHEN advertiser_daily_usage.daily_used >= EXCLUDED.daily_limit
                         THEN 'daily_limit_reached'
                         ELSE NULL
                       END,
        updated_at   = now()
  RETURNING daily_used, is_blocked
  INTO v_daily_used, v_is_blocked;

  -- Se o upsert não retornou (não deveria acontecer), lê novamente
  IF v_daily_used IS NULL THEN
    SELECT daily_used, is_blocked
    INTO v_daily_used, v_is_blocked
    FROM public.advertiser_daily_usage
    WHERE user_id = p_user_id AND usage_date = v_today;
  END IF;

  -- ── 3. Verifica limite ────────────────────────────────────
  IF COALESCE(v_is_blocked, false) OR COALESCE(v_daily_used, 0) >= v_daily_limit THEN
    -- Garante is_blocked = true no banco
    UPDATE public.advertiser_daily_usage
    SET is_blocked  = true,
        blocked_at  = COALESCE(blocked_at, v_now),
        block_reason= 'daily_limit_reached',
        updated_at  = v_now
    WHERE user_id = p_user_id AND usage_date = v_today AND NOT is_blocked;

    RETURN jsonb_build_object(
      'ok',             false,
      'reason',         'daily_limit_reached',
      'daily_limit',    v_daily_limit,
      'daily_used',     COALESCE(v_daily_used, 0),
      'daily_remaining',0,
      'plan_name',      v_plan_name,
      'package_id',     v_package_id,
      'purchase_id',    v_purchase_id,
      'reset_at',       v_reset_at
    );
  END IF;

  -- ── 4. Ok para publicar ───────────────────────────────────
  RETURN jsonb_build_object(
    'ok',             true,
    'daily_limit',    v_daily_limit,
    'daily_used',     COALESCE(v_daily_used, 0),
    'daily_remaining',v_daily_limit - COALESCE(v_daily_used, 0),
    'plan_name',      v_plan_name,
    'package_id',     v_package_id,
    'purchase_id',    v_purchase_id,
    'reset_at',       v_reset_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_advertiser_daily_limit(UUID)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- RPC 2: increment_advertiser_daily_usage()
--
-- Chamada APÓS a criação bem-sucedida do lote de publicação.
-- Incremento atômico com FOR UPDATE (previne race condition).
-- Registra metadados completos para auditoria e M51.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_advertiser_daily_usage(
  p_user_id       UUID,
  p_origin        TEXT    DEFAULT 'manual',   -- 'manual'|'ai_auto'|'scheduled'|'operator'
  p_listing_id    TEXT    DEFAULT NULL,
  p_listing_type  TEXT    DEFAULT NULL,
  p_lot_id        UUID    DEFAULT NULL,
  p_campaign_id   UUID    DEFAULT NULL,
  p_city          TEXT    DEFAULT NULL,
  p_groups_count  INT     DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now       TIMESTAMPTZ := now();
  v_today     DATE        := (v_now AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_row       RECORD;
  v_origin    TEXT        := COALESCE(p_origin, 'manual');
  -- H5: variáveis escalares para o branch defensivo (RECORD não atribuído
  -- não aceita atribuição de campo — v_row.x falharia em runtime)
  v_used      INT;
  v_limit     INT;
BEGIN
  -- ── Autorização (C3) ──────────────────────────────────────
  -- Sem este guard, qualquer usuário autenticado (ou anônimo, via EXECUTE
  -- default de PUBLIC) poderia esgotar a cota de um concorrente.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- Valida origin
  IF v_origin NOT IN ('manual', 'ai_auto', 'scheduled', 'operator') THEN
    v_origin := 'manual';
  END IF;

  -- Lock atômico para evitar double-increment concorrente
  SELECT * INTO v_row
  FROM public.advertiser_daily_usage
  WHERE user_id    = p_user_id
    AND usage_date = v_today
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Linha não existe: cria com daily_used=1 (check_advertiser_daily_limit deveria
    -- ter sido chamado antes, mas defensivamente garantimos existência).
    -- H5: RETURNING em escalares (v_used/v_limit), nunca em campos de RECORD
    -- não atribuído. O WHERE do DO UPDATE impede overshoot se a linha surgir
    -- entre o FOR UPDATE e este INSERT (corrida rara, mas coberta).
    INSERT INTO public.advertiser_daily_usage (
      user_id, usage_date, daily_used, first_used_at, last_used_at,
      last_lot_id, last_campaign_id, last_listing_id, last_listing_type,
      last_origin, groups_used, updated_at
    ) VALUES (
      p_user_id, v_today, 1, v_now, v_now,
      p_lot_id, p_campaign_id, p_listing_id, p_listing_type,
      v_origin, COALESCE(p_groups_count, 0), v_now
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET daily_used     = advertiser_daily_usage.daily_used + 1,
          last_used_at   = v_now,
          last_lot_id    = COALESCE(p_lot_id,        advertiser_daily_usage.last_lot_id),
          last_campaign_id = COALESCE(p_campaign_id, advertiser_daily_usage.last_campaign_id),
          last_listing_id = COALESCE(p_listing_id,   advertiser_daily_usage.last_listing_id),
          last_listing_type = COALESCE(p_listing_type, advertiser_daily_usage.last_listing_type),
          last_origin    = v_origin,
          groups_used    = advertiser_daily_usage.groups_used + COALESCE(p_groups_count, 0),
          is_blocked     = (advertiser_daily_usage.daily_used + 1) >= advertiser_daily_usage.daily_limit,
          updated_at     = v_now
      WHERE advertiser_daily_usage.daily_used < advertiser_daily_usage.daily_limit
    RETURNING daily_used, daily_limit INTO v_used, v_limit;

    IF v_used IS NULL THEN
      -- O DO UPDATE não executou: linha existia e já estava no limite
      RETURN jsonb_build_object(
        'ok',     false,
        'reason', 'daily_limit_reached'
      );
    END IF;

    RETURN jsonb_build_object(
      'ok',             true,
      'daily_used',     v_used,
      'daily_limit',    v_limit,
      'daily_remaining',GREATEST(0, v_limit - v_used)
    );
  END IF;

  -- Verifica novamente antes de incrementar (double-check after lock)
  IF v_row.daily_used >= v_row.daily_limit THEN
    RETURN jsonb_build_object(
      'ok',             false,
      'reason',         'daily_limit_reached',
      'daily_used',     v_row.daily_used,
      'daily_limit',    v_row.daily_limit,
      'daily_remaining',0
    );
  END IF;

  -- Incremento atômico + atualização dos campos de rastreamento
  UPDATE public.advertiser_daily_usage
  SET
    daily_used          = daily_used + 1,
    first_used_at       = COALESCE(first_used_at, v_now),
    last_used_at        = v_now,
    last_lot_id         = COALESCE(p_lot_id,      last_lot_id),
    last_campaign_id    = COALESCE(p_campaign_id, last_campaign_id),
    last_listing_id     = COALESCE(p_listing_id,  last_listing_id),
    last_listing_type   = COALESCE(p_listing_type,last_listing_type),
    last_origin         = v_origin,
    groups_used         = groups_used + COALESCE(p_groups_count, 0),
    -- Breakdown por origem
    usage_by_origin     = jsonb_set(
                            usage_by_origin,
                            ARRAY[v_origin],
                            to_jsonb(COALESCE((usage_by_origin->>v_origin)::INT, 0) + 1)
                          ),
    -- Breakdown por tipo de anúncio
    usage_by_listing_type = CASE
      WHEN p_listing_type IS NOT NULL
      THEN jsonb_set(
             usage_by_listing_type,
             ARRAY[p_listing_type],
             to_jsonb(COALESCE((usage_by_listing_type->>p_listing_type)::INT, 0) + 1)
           )
      ELSE usage_by_listing_type
    END,
    -- Cidades: adiciona se nova
    cities_used         = CASE
      WHEN p_city IS NOT NULL AND NOT (p_city = ANY(cities_used))
      THEN array_append(cities_used, p_city)
      ELSE cities_used
    END,
    -- Bloqueia se atingiu o limite após este incremento
    is_blocked          = CASE
      WHEN (daily_used + 1) >= daily_limit THEN true
      ELSE false
    END,
    blocked_at          = CASE
      WHEN (daily_used + 1) >= daily_limit AND blocked_at IS NULL THEN v_now
      ELSE blocked_at
    END,
    block_reason        = CASE
      WHEN (daily_used + 1) >= daily_limit THEN 'daily_limit_reached'
      ELSE NULL
    END,
    updated_at          = v_now
  WHERE user_id    = p_user_id
    AND usage_date = v_today;

  -- Retorna estado atualizado
  SELECT daily_used, daily_limit, daily_remaining, is_blocked
  INTO v_row
  FROM public.advertiser_daily_usage
  WHERE user_id = p_user_id AND usage_date = v_today;

  RETURN jsonb_build_object(
    'ok',             true,
    'daily_used',     v_row.daily_used,
    'daily_limit',    v_row.daily_limit,
    'daily_remaining',v_row.daily_remaining,
    'is_blocked',     v_row.is_blocked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_advertiser_daily_usage(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, INT)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- RPC 3: get_advertiser_daily_stats()
--
-- Painel do anunciante: dados REAIS do banco (substitui estimativas).
-- Retorna histórico dos últimos p_days dias + estado atual.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_advertiser_daily_stats(
  p_user_id   UUID    DEFAULT NULL,
  p_days      INT     DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID        := COALESCE(p_user_id, auth.uid());
  v_today     DATE        := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_result    JSONB;
  v_today_row JSONB;
  v_history   JSONB;
BEGIN
  -- Autorização
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;
  IF v_user_id != auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- Linha de hoje (pode não existir se ainda não publicou)
  SELECT jsonb_build_object(
    'date',            usage_date,
    'daily_limit',     daily_limit,
    'daily_used',      daily_used,
    'daily_remaining', daily_remaining,
    'plan_name',       plan_name,
    'package_id',      package_id,
    'purchase_id',     purchase_id,
    'is_blocked',      is_blocked,
    'block_reason',    block_reason,
    'first_used_at',   first_used_at,
    'last_used_at',    last_used_at,
    'reset_at',        reset_at,
    'usage_by_origin', usage_by_origin,
    'usage_by_listing_type', usage_by_listing_type,
    'cities_used',     cities_used,
    'groups_used',     groups_used,
    'm51_enabled',     m51_enabled,
    'm51_last_run_at', m51_last_run_at
  )
  INTO v_today_row
  FROM public.advertiser_daily_usage
  WHERE user_id = v_user_id AND usage_date = v_today;

  -- Se não há linha de hoje, resolve o plano e retorna estado inicial
  IF v_today_row IS NULL THEN
    DECLARE
      v_check JSONB;
    BEGIN
      v_check := public.check_advertiser_daily_limit(v_user_id);
      v_today_row := jsonb_build_object(
        'date',             v_today,
        'daily_limit',      (v_check->>'daily_limit')::INT,
        'daily_used',       0,
        'daily_remaining',  (v_check->>'daily_limit')::INT,
        'plan_name',        v_check->>'plan_name',
        'package_id',       v_check->>'package_id',
        'is_blocked',       false,
        'reset_at',         v_check->>'reset_at',
        'usage_by_origin',  '{"manual":0,"ai_auto":0,"scheduled":0,"operator":0}'::JSONB,
        'usage_by_listing_type', '{}'::JSONB,
        'cities_used',      '[]'::JSONB,
        'groups_used',      0,
        'm51_enabled',      false
      );
    END;
  END IF;

  -- Histórico dos últimos N dias
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date',            usage_date,
      'daily_limit',     daily_limit,
      'daily_used',      daily_used,
      'daily_remaining', daily_remaining,
      'plan_name',       plan_name,
      'is_blocked',      is_blocked,
      'cities_used',     cities_used,
      'groups_used',     groups_used,
      'usage_by_origin', usage_by_origin,
      'first_used_at',   first_used_at,
      'last_used_at',    last_used_at
    ) ORDER BY usage_date DESC
  ), '[]'::JSONB)
  INTO v_history
  FROM public.advertiser_daily_usage
  WHERE user_id    = v_user_id
    AND usage_date >= v_today - p_days
    -- H4: hoje já vem no campo "today" — incluir aqui causaria dupla
    -- contagem no frontend (history + dailyUsed)
    AND usage_date <  v_today;
  -- C2: ORDER BY externo removido — em query agregada sem GROUP BY é erro
  -- 42803; a ordenação já é feita DENTRO do jsonb_agg (ORDER BY usage_date DESC)

  RETURN jsonb_build_object(
    'today',   v_today_row,
    'history', v_history,
    'user_id', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_advertiser_daily_stats(UUID, INT)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 5: generate_posting_lots() — reescrita com enforcement
--
-- ÚNICA diferença em relação à versão M4:
--   Antes de criar o lote, chama check_advertiser_daily_limit().
--   Se limite atingido: pula o lojista e registra no array errors.
--   Depois de criar o lote: chama increment_advertiser_daily_usage().
--
-- Todas as demais lógicas (slots, items, cooldown) permanecem iguais.
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
  v_store_row     RECORD;
  v_slot_row      RECORD;
  v_lot_id        UUID;
  v_position      INT;
  v_lots_created  INT       := 0;
  v_items_added   INT       := 0;
  v_blocked_users INT       := 0;
  v_errors        TEXT[]    := ARRAY[]::TEXT[];
  v_now           TIMESTAMPTZ := now();

  -- M50: enforcement de limite diário
  v_limit_check   JSONB;
  v_increment     JSONB;   -- H3: resultado da reserva atômica
BEGIN
  -- C3: apenas admin ou contexto de serviço (scheduler/Edge Function)
  -- podem disparar a geração global de lotes
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  FOR v_store_row IN
    SELECT
      pls.user_id                                                         AS store_user_id,
      COALESCE(ms.store_name, ms.nome_loja, p.name, 'Loja')             AS store_name,
      p.logo_url                                                          AS store_logo_url,
      COALESCE(ms.city, ms.cidade, MIN(pls.listing_city))               AS target_city,
      ms.bairro                                                           AS target_bairro,
      ms.region                                                           AS target_region,
      COUNT(pls.id)                                                       AS slot_count
    FROM public.promoted_listing_slots pls
    LEFT JOIN public.merchant_stores ms ON ms.user_id = pls.user_id
    LEFT JOIN public.profiles p         ON p.id       = pls.user_id
    WHERE pls.status = 'active'
      AND (p_profile IS NULL OR pls.listing_type = p_profile)
    GROUP BY
      pls.user_id, ms.store_name, ms.nome_loja, p.name,
      p.logo_url, ms.city, ms.cidade, ms.bairro, ms.region
  LOOP
    -- ── M50: verificar limite diário ANTES de criar lote ──────
    BEGIN
      v_limit_check := public.check_advertiser_daily_limit(v_store_row.store_user_id);
    EXCEPTION WHEN OTHERS THEN
      -- H6: FAIL-CLOSED — se não conseguimos verificar o limite,
      -- NÃO publicamos. Erro registrado para investigação.
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
      CONTINUE; -- pula para o próximo lojista
    END IF;
    -- ── fim M50 check ──────────────────────────────────────────

    -- Já tem lote ativo? Pula (lógica original intacta)
    IF EXISTS (
      SELECT 1 FROM public.posting_lots
      WHERE store_user_id = v_store_row.store_user_id
        AND status IN ('available', 'claimed', 'cooldown')
        AND (p_profile IS NULL OR source_profile = p_profile OR source_profile IS NULL)
    ) THEN
      CONTINUE;
    END IF;

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

      -- H3: lote sem itens não deve existir nem consumir cota — desfaz
      IF v_position = 0 THEN
        RAISE EXCEPTION 'lot_empty';
      END IF;

      UPDATE public.posting_lots
      SET items_count = v_position
      WHERE id = v_lot_id;

      INSERT INTO public.posting_lot_events (lot_id, event_type, metadata)
      VALUES (v_lot_id, 'created', jsonb_build_object(
        'items_count',  v_position,
        'store_name',   v_store_row.store_name,
        'source',       'promoted_listing_slots',
        'profile',      p_profile,
        -- M50: registra snapshot do plano no evento
        'plan_name',    v_limit_check->>'plan_name',
        'daily_limit',  v_limit_check->>'daily_limit',
        'daily_used',   v_limit_check->>'daily_used'
      ));

      -- ── H3: RESERVA ATÔMICA no mesmo subtransaction do lote ──
      -- Este bloco BEGIN/EXCEPTION é uma subtransação: se o increment
      -- falhar OU retornar ok=false (corrida com outra execução), a
      -- exceção abaixo desfaz o lote, os itens e o evento juntos.
      -- Invariante garantido: lote existe ⟺ consumo registrado.
      v_increment := public.increment_advertiser_daily_usage(
        p_user_id      := v_store_row.store_user_id,
        p_origin       := 'scheduled',
        p_listing_id   := v_slot_row.listing_id,
        p_listing_type := v_slot_row.listing_type,
        p_lot_id       := v_lot_id,
        p_campaign_id  := NULL,
        p_city         := v_store_row.target_city,
        p_groups_count := 0
      );
      IF NOT (v_increment->>'ok')::BOOLEAN THEN
        -- Outra execução consumiu a última vaga entre o check e agora.
        -- O FOR UPDATE dentro do increment é a barreira final.
        RAISE EXCEPTION 'daily_limit_reached_concurrent';
      END IF;
      -- ── fim reserva atômica ────────────────────────────────────

      v_lots_created := v_lots_created + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Subtransação revertida: nem lote, nem itens, nem consumo persistem
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

  -- Expirar lotes com cooldown vencido (lógica original intacta)
  UPDATE public.posting_lots
  SET status = 'expired', updated_at = v_now
  WHERE status = 'cooldown'
    AND cooldown_until IS NOT NULL
    AND cooldown_until < v_now;

  RETURN jsonb_build_object(
    'ok',            true,
    'lots_created',  v_lots_created,
    'items_added',   v_items_added,
    'blocked_users', v_blocked_users,   -- M50: novo campo
    'errors',        v_errors,
    'generated_at',  v_now::text
  );
END;
$$;

COMMENT ON FUNCTION public.generate_posting_lots IS
'M50 (enforcement): Gera lotes verificando limite diário por plano antes de publicar. Registra consumo em advertiser_daily_usage.';

GRANT EXECUTE ON FUNCTION public.generate_posting_lots(TEXT, INT)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- VIEW: advertiser_usage_today (conveniência para painel admin)
-- ──────────────────────────────────────────────────────────────

-- C4: security_invoker=true faz a view respeitar o RLS da tabela base
-- (sem isso, a view executa com privilégios do dono e vaza dados de todos).
-- Acesso via API revogado de anon/authenticated: view é ferramenta de
-- backoffice, lida exclusivamente via service_role.
CREATE OR REPLACE VIEW public.advertiser_usage_today
WITH (security_invoker = true) AS
  SELECT
    adu.*,
    p.name            AS user_name,
    p.email           AS user_email
  FROM public.advertiser_daily_usage adu
  LEFT JOIN public.profiles p ON p.id = adu.user_id
  -- M4: fuso Brasil também na view (CURRENT_DATE seria UTC)
  WHERE adu.usage_date = (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;

REVOKE ALL ON public.advertiser_usage_today FROM PUBLIC;
REVOKE ALL ON public.advertiser_usage_today FROM anon, authenticated;
GRANT SELECT ON public.advertiser_usage_today TO service_role;

COMMENT ON VIEW public.advertiser_usage_today IS
'M50: Estado de todos os anunciantes hoje. Admin-only (lido via service_role ou RPC).';


-- ──────────────────────────────────────────────────────────────
-- M7: Índice para a consulta mais quente do enforcement
-- (check_advertiser_daily_limit resolve o plano 1x por anunciante por ciclo)
-- ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pp_advertiser_status_expires
  ON public.promotion_purchases (advertiser_user_id, status, expires_at);


-- ──────────────────────────────────────────────────────────────
-- C3: Endurecimento de permissões das funções
-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão — revogamos
-- explicitamente. anon nunca deve chamar RPCs de enforcement.
-- ──────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.check_advertiser_daily_limit(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_advertiser_daily_limit(UUID) FROM anon;

REVOKE EXECUTE ON FUNCTION public.increment_advertiser_daily_usage(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_advertiser_daily_usage(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, INT) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_advertiser_daily_stats(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_advertiser_daily_stats(UUID, INT) FROM anon;

REVOKE EXECUTE ON FUNCTION public.generate_posting_lots(TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_posting_lots(TEXT, INT) FROM anon;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
BEGIN
  -- Tabela acessível
  SELECT COUNT(*) INTO v_count FROM public.advertiser_daily_usage;
  ASSERT v_count IS NOT NULL, 'ERRO: advertiser_daily_usage não acessível';

  -- Funções criadas
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_advertiser_daily_limit'
  ) THEN
    RAISE EXCEPTION 'ERRO: função check_advertiser_daily_limit não criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_advertiser_daily_usage'
  ) THEN
    RAISE EXCEPTION 'ERRO: função increment_advertiser_daily_usage não criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_advertiser_daily_stats'
  ) THEN
    RAISE EXCEPTION 'ERRO: função get_advertiser_daily_stats não criada';
  END IF;

  -- generate_posting_lots reescrita
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'generate_posting_lots'
  ) THEN
    RAISE EXCEPTION 'ERRO: generate_posting_lots não recriada';
  END IF;

  -- Políticas RLS
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'advertiser_daily_usage'
      AND policyname = 'adu_select_own'
  ) THEN
    RAISE EXCEPTION 'ERRO: policy adu_select_own não criada';
  END IF;

  RAISE NOTICE 'M50 ✓ advertiser_daily_usage + check_advertiser_daily_limit + increment_advertiser_daily_usage + get_advertiser_daily_stats + generate_posting_lots (com enforcement) — OK';
  RAISE NOTICE 'M50 ✓ Plano gratuito: 1 impulsionamento/dia | Plano pago: lê promotion_packages.daily_boosts';
  RAISE NOTICE 'M50 ✓ Arquitetura pronta para M51 (colunas m51_*) e painel com dados reais (get_advertiser_daily_stats)';
END $$;
