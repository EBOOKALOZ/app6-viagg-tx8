-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M09: posting_dead_letter_queue
-- Seção 3 — Dead Letter Queue (DLQ)
--
-- Recebe itens após esgotamento de todas as tentativas de retry (max_retries).
-- Operações permitidas via RPC: reprocessar, descartar, exportar, ver histórico.
-- Garante rastreabilidade total: nenhum item é silenciosamente perdido.
--
-- Depende de: M07 (posting_workers), M08 (posting_campaigns)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.posting_dead_letter_queue (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Contexto da falha ──
  campaign_id     UUID        REFERENCES public.posting_campaigns(id) ON DELETE SET NULL,
  lot_id          UUID        REFERENCES public.posting_lots(id) ON DELETE SET NULL,
  item_id         UUID        REFERENCES public.posting_lot_items(id) ON DELETE SET NULL,
  slot_id         UUID        REFERENCES public.promoted_listing_slots(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  profile         TEXT,
  group_id        TEXT,

  -- ── Dados da postagem que falhou ──
  message_text    TEXT,
  failure_reason  TEXT        NOT NULL,
  error_stack     TEXT,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_count     INT         NOT NULL DEFAULT 0,

  -- ── Ciclo de vida no DLQ ──
  status          TEXT        NOT NULL DEFAULT 'failed'
                              CHECK (status IN ('failed','retrying','recovered','discarded')),
  can_retry       BOOLEAN     NOT NULL DEFAULT true,

  -- ── Reprocessamento ──
  retried_at      TIMESTAMPTZ,
  retried_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  retry_campaign_id UUID      REFERENCES public.posting_campaigns(id) ON DELETE SET NULL,

  -- ── Descarte ──
  discarded_at    TIMESTAMPTZ,
  discarded_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  discard_reason  TEXT,

  metadata        JSONB       DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.posting_dead_letter_queue IS
'Tier 2 §3: Dead Letter Queue. Recebe itens após exaustão de retries. Toda entrada é rastreável: origin, failure_reason, error_stack. Operações: reprocessar (retry_from_dlq), descartar (discard_dlq_entry), exportar (SELECT).';

ALTER TABLE public.posting_dead_letter_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dlq_select_own"  ON public.posting_dead_letter_queue;

CREATE POLICY "dlq_select_own" ON public.posting_dead_letter_queue
  FOR SELECT USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_dlq_campaign   ON public.posting_dead_letter_queue (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dlq_user_id    ON public.posting_dead_letter_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_dlq_status     ON public.posting_dead_letter_queue (status);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at  ON public.posting_dead_letter_queue (failed_at DESC);
-- Hot path para UI: itens recuperáveis listados por data
CREATE INDEX IF NOT EXISTS idx_dlq_retriable
  ON public.posting_dead_letter_queue (failed_at DESC)
  WHERE status = 'failed' AND can_retry = true;

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M09 — posting_dead_letter_queue criada.'; END $$;
