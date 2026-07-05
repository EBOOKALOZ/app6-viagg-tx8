-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M17: ALTER tabelas existentes do Tier 1
-- Seções 2 (Retry), 4 (Lock), 5 (Idempotência), 6 (Prioridade), 19 (Compat.)
--
-- Altera posting_lots para suportar campos do Tier 2:
--   - campaign_id / worker_id: rastreabilidade bidirecional
--   - priority / priority_score: fila por prioridade
--   - retry_count / max_retries / last_retry_at / next_retry_at / retry_reason / final_error
--   - idempotency_key: deduplicação
--
-- IMPORTANTE:
--   - Todos os campos são NULLABLE ou têm DEFAULT → zero impacto em T1
--   - Nenhuma coluna existente é alterada ou removida
--   - Nenhum contrato público do Tier 1 é quebrado
--   - Constraints adicionadas via DO block (idempotente)
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── posting_lots: campos T2 ────────────────────────────────────────────────

ALTER TABLE public.posting_lots
  ADD COLUMN IF NOT EXISTS campaign_id     UUID REFERENCES public.posting_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worker_id       UUID REFERENCES public.posting_workers(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority        TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS priority_score  INT  NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS retry_count     INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries     INT  NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_retry_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_reason    TEXT,
  ADD COLUMN IF NOT EXISTS final_error     TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Constraint de priority (idempotente via DO)
DO $$ BEGIN
  ALTER TABLE public.posting_lots
    ADD CONSTRAINT posting_lots_priority_check
    CHECK (priority IN ('urgent','high','medium','normal','low'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unique parcial em idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_lots_idempotency
  ON public.posting_lots (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Índices de suporte ao T2
CREATE INDEX IF NOT EXISTS idx_lots_campaign_id   ON public.posting_lots (campaign_id);
CREATE INDEX IF NOT EXISTS idx_lots_worker_id     ON public.posting_lots (worker_id);
CREATE INDEX IF NOT EXISTS idx_lots_next_retry
  ON public.posting_lots (next_retry_at ASC)
  WHERE retry_count > 0 AND status NOT IN ('cooldown','expired','cancelled','posted');

-- Hot path: worker busca lote disponível com maior prioridade
CREATE INDEX IF NOT EXISTS idx_lots_available_priority
  ON public.posting_lots (priority_score DESC, created_at ASC)
  WHERE status = 'available';


-- ── promoted_listing_slots: campo campaign_id (opcional, só T2) ──────────

ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS latest_campaign_id UUID
    REFERENCES public.posting_campaigns(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.promoted_listing_slots.latest_campaign_id IS
'Tier 2: ID da campanha mais recente gerada a partir deste slot. NULL para slots sem campanhas T2. Atualizado por create_posting_campaign().';

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M17 — posting_lots e promoted_listing_slots alteradas para T2 (campos adicionais, sem breaking changes).';
END $$;
