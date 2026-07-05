-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M14: posting_metrics_daily
-- Seção 10 — Métricas Completas (diárias/semanais/mensais)
--
-- Snapshot agregado diário por perfil.
-- Atualizado por upsert_daily_metrics() chamada via trigger ou pg_cron (Tier 2.2).
-- Append-only por data: nenhuma row é deletada, apenas atualizada (upsert).
--
-- Indicadores:
--   - total_postings, success_count, failure_count, retry_count, dlq_count
--   - avg/max/min elapsed_ms
--   - campaigns_executed, campaigns_completed
--   - unique_groups, unique_users
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.posting_metrics_daily (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date                 DATE        NOT NULL,
  profile_type         TEXT        NOT NULL,

  -- ── Volume ──
  total_postings       INT         NOT NULL DEFAULT 0,
  success_count        INT         NOT NULL DEFAULT 0,
  failure_count        INT         NOT NULL DEFAULT 0,
  retry_count          INT         NOT NULL DEFAULT 0,
  dlq_count            INT         NOT NULL DEFAULT 0,

  -- ── Latência ──
  avg_elapsed_ms       NUMERIC(10,2),
  max_elapsed_ms       INT,
  min_elapsed_ms       INT,

  -- ── Campanhas ──
  campaigns_executed   INT         NOT NULL DEFAULT 0,
  campaigns_completed  INT         NOT NULL DEFAULT 0,
  campaigns_errored    INT         NOT NULL DEFAULT 0,

  -- ── Diversidade ──
  unique_groups        INT         NOT NULL DEFAULT 0,
  unique_users         INT         NOT NULL DEFAULT 0,
  unique_cities        INT         NOT NULL DEFAULT 0,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (date, profile_type)
);

COMMENT ON TABLE public.posting_metrics_daily IS
'Tier 2 §10: Snapshot diário de métricas por perfil. Atualizado por upsert_daily_metrics() via pg_cron (Tier 2.2). Append-only — rows nunca deletadas. Serve dashboard operacional e relatórios semanais/mensais.';

ALTER TABLE public.posting_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metrics_select_all" ON public.posting_metrics_daily;

CREATE POLICY "metrics_select_all" ON public.posting_metrics_daily
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_metrics_date
  ON public.posting_metrics_daily (date DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_profile_date
  ON public.posting_metrics_daily (profile_type, date DESC);

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M14 — posting_metrics_daily criada.'; END $$;
