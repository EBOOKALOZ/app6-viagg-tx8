-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M13: posting_event_log
-- Seção 11 — Logs Estruturados (19 tipos de evento)
--
-- Log imutável de todos os eventos do sistema de postagem.
-- Substituição estruturada do posting_timeline_events (Tier 1) para T2.
-- O posting_timeline_events é mantido — este é complementar.
--
-- 19 tipos de evento:
--   CampaignCreated, CampaignStatusChanged, CampaignCompleted, CampaignCancelled,
--   CampaignError, CampaignRetrying, CampaignExpired,
--   LotGenerated, LotClaimed, LotPosted, LotConfirmed, LotExpired, LotCancelled,
--   WorkerStarted, WorkerHeartbeat, WorkerStopped, WorkerCrash,
--   RateLimitHit, DeadLetterAdded
--
-- Imutável: nenhuma row é UPDATE ou DELETE.
-- Retenção: limpeza por pg_cron após 90 dias (Tier 2.2).
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.posting_event_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT        NOT NULL,
  event_version TEXT        NOT NULL DEFAULT '2.0',
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Contexto ──
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id   UUID        REFERENCES public.posting_campaigns(id) ON DELETE SET NULL,
  lot_id        UUID        REFERENCES public.posting_lots(id) ON DELETE SET NULL,
  item_id       UUID        REFERENCES public.posting_lot_items(id) ON DELETE SET NULL,
  worker_id     UUID        REFERENCES public.posting_workers(id) ON DELETE SET NULL,
  profile       TEXT,
  group_id      TEXT,

  -- ── Métricas do evento ──
  duration_ms   INT,
  success       BOOLEAN,

  -- ── Rastreabilidade ──
  ip_addr       TEXT,
  origin        TEXT        CHECK (origin IN ('bridge','rpc','trigger','cron','worker','admin','webhook')),

  metadata      JSONB       DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.posting_event_log IS
'Tier 2 §11: Log estruturado imutável de 19 tipos de evento. Complementa posting_timeline_events (T1). Retido por 90 dias (pg_cron T2.2). Toda escrita via log_posting_event() — nunca INSERT direto.';

ALTER TABLE public.posting_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_log_select_own"  ON public.posting_event_log;

CREATE POLICY "event_log_select_own" ON public.posting_event_log
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IS NULL  -- eventos de sistema sem user_id
  );

CREATE INDEX IF NOT EXISTS idx_event_log_type      ON public.posting_event_log (event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_timestamp ON public.posting_event_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_campaign  ON public.posting_event_log (campaign_id);
CREATE INDEX IF NOT EXISTS idx_event_log_user      ON public.posting_event_log (user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_worker    ON public.posting_event_log (worker_id);
CREATE INDEX IF NOT EXISTS idx_event_log_profile   ON public.posting_event_log (profile);
-- Dashboard: janela de 30 dias (mais consultada)
CREATE INDEX IF NOT EXISTS idx_event_log_recent
  ON public.posting_event_log (event_type, timestamp DESC)
  WHERE timestamp > (NOW() - INTERVAL '30 days');

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M13 — posting_event_log criada (19 tipos de evento, imutável).'; END $$;
