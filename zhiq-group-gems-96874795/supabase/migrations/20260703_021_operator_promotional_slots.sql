-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 · M21: operator_promotional_slots
-- Auto-promoção para Motorista, Moto Táxi e Motoboy
--
-- Cada operador (driver / mototaxi / motoboy) pode criar slots de serviço
-- que serão postados nos grupos WhatsApp usando o MESMO Motor Universal
-- (Workers · Campaigns · Queue · Retry · DLQ · Rate Limit · Metrics · Alerts)
--
-- Não duplica nenhuma lógica existente. Integra via:
--   get_next_operator_slots_for_posting() → posting_lots → posting_campaigns
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela principal
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operator_promotional_slots (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type        TEXT          NOT NULL,           -- 'driver' | 'motoboy' | 'mototaxi'
  service_type        TEXT          NOT NULL,           -- validado via operator_service_categories
  title               TEXT          NOT NULL,
  description         TEXT,
  coverage_city       TEXT,
  coverage_state      TEXT,
  coverage_bairros    TEXT[]        NOT NULL DEFAULT '{}',
  availability_days   TEXT[]        NOT NULL DEFAULT '{}',  -- ['seg','ter','qua','qui','sex','sab','dom']
  availability_hours  JSONB         NOT NULL DEFAULT '{}'::jsonb,  -- {start:"08:00",end:"18:00"}
  price_from          NUMERIC(10,2),
  price_to            NUMERIC(10,2),
  whatsapp            TEXT,
  image_url           TEXT,
  position            INT           NOT NULL DEFAULT 0,
  status              TEXT          NOT NULL DEFAULT 'active',
  post_count          INT           NOT NULL DEFAULT 0,
  last_posted_at      TIMESTAMPTZ,
  added_by            UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  paused_at           TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  removed_at          TIMESTAMPTZ,
  latest_campaign_id  UUID,  -- FK adicionada em M24 após posting_campaigns existir
  metadata            JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.operator_promotional_slots IS
'Tier 2.2: Slots de auto-promoção de operadores (driver/motoboy/mototaxi). Alimentam o Motor Universal de Postagens via generate_operator_posting_lots().';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraints (idempotentes via DO block)
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE public.operator_promotional_slots
    ADD CONSTRAINT ops_profile_type_check
    CHECK (profile_type IN ('driver','motoboy','mototaxi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.operator_promotional_slots
    ADD CONSTRAINT ops_status_check
    CHECK (status IN ('active','paused','finished','removed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.operator_promotional_slots
    ADD CONSTRAINT ops_price_range_check
    CHECK (price_from IS NULL OR price_to IS NULL OR price_from <= price_to);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Índices
-- ─────────────────────────────────────────────────────────────────────────

-- Hot path: get_next_operator_slots_for_posting()
CREATE INDEX IF NOT EXISTS idx_ops_active_posting_order
  ON public.operator_promotional_slots (profile_type, last_posted_at ASC NULLS FIRST)
  WHERE status = 'active';

-- Painel do operador: seus próprios slots
CREATE INDEX IF NOT EXISTS idx_ops_user_status
  ON public.operator_promotional_slots (user_id, status, position ASC);

-- Lookup por cidade para balanceamento regional
CREATE INDEX IF NOT EXISTS idx_ops_city_profile
  ON public.operator_promotional_slots (coverage_city, profile_type)
  WHERE status = 'active';

-- Rastreabilidade de campanhas
CREATE INDEX IF NOT EXISTS idx_ops_latest_campaign
  ON public.operator_promotional_slots (latest_campaign_id)
  WHERE latest_campaign_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.operator_promotional_slots ENABLE ROW LEVEL SECURITY;

-- Leitura: operador vê apenas seus próprios slots
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'operator_promotional_slots'
      AND policyname = 'ops_select_own'
  ) THEN
    CREATE POLICY "ops_select_own"
      ON public.operator_promotional_slots
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Inserção: operador insere para si mesmo
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'operator_promotional_slots'
      AND policyname = 'ops_insert_own'
  ) THEN
    CREATE POLICY "ops_insert_own"
      ON public.operator_promotional_slots
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Update: operador atualiza apenas slots ativos/pausados (não removed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'operator_promotional_slots'
      AND policyname = 'ops_update_own'
  ) THEN
    CREATE POLICY "ops_update_own"
      ON public.operator_promotional_slots
      FOR UPDATE
      USING (auth.uid() = user_id AND status != 'removed');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Trigger updated_at
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_ops_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_updated_at ON public.operator_promotional_slots;
CREATE TRIGGER trg_ops_updated_at
  BEFORE UPDATE ON public.operator_promotional_slots
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_ops_updated_at();

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M21 — operator_promotional_slots criada com RLS, 4 índices, trigger updated_at.';
END $$;
