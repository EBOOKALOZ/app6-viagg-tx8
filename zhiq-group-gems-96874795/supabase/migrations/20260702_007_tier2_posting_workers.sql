-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M07: posting_workers
-- Seção 14 — Suporte a múltiplos workers simultâneos
--
-- Registra cada worker com ID, heartbeat, status, métricas e auto-cleanup.
-- Workers mortos (heartbeat > threshold) são marcados como 'dead' pelo RPC
-- deactivate_dead_workers() chamado periodicamente.
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.posting_workers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name      TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'idle'
                               CHECK (status IN ('starting','idle','busy','paused','stopping','dead')),
  last_heartbeat   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lots_processed   INT         NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at       TIMESTAMPTZ,
  cpu_percent      NUMERIC(5,2),
  memory_mb        INT,
  current_lot_id   UUID        REFERENCES public.posting_lots(id) ON DELETE SET NULL,
  version          TEXT        DEFAULT '2.0',
  metadata         JSONB       DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.posting_workers IS
'Tier 2 §14: Registro de workers de postagem. Suporta múltiplos workers simultâneos com heartbeat e auto-cleanup via deactivate_dead_workers().';

ALTER TABLE public.posting_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_read_all"  ON public.posting_workers;
CREATE POLICY "workers_read_all" ON public.posting_workers
  FOR SELECT TO authenticated USING (true);

-- Escrita somente via RPCs SECURITY DEFINER (register_worker, worker_heartbeat)

CREATE INDEX IF NOT EXISTS idx_workers_status      ON public.posting_workers (status);
CREATE INDEX IF NOT EXISTS idx_workers_heartbeat   ON public.posting_workers (last_heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_workers_current_lot ON public.posting_workers (current_lot_id);
CREATE INDEX IF NOT EXISTS idx_workers_alive
  ON public.posting_workers (last_heartbeat DESC)
  WHERE status NOT IN ('dead','stopping','stopped');

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M07 — posting_workers criada.'; END $$;
