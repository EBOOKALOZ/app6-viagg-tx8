-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M08: posting_campaigns + campaign_state_log
-- Seções 1 (Motor de Execução — 11 estados) + 6 (Prioridade)
--
-- posting_campaigns:  Entidade central do Tier 2. Conecta promoted_listing_slots
--   (Fila do Lojista) aos posting_lots (Postador) com ciclo de vida controlado,
--   prioridade, retry, idempotência e rastreabilidade total.
--
-- Máquina de estados (11 estados):
--   draft → ready → generating → queued → posting → waiting
--       ↓                                      ↓
--     cancelled ← paused          error → (ready | cancelled)
--             completed
--             expired
--
-- campaign_state_log: Auditoria imutável de todas as transições de estado.
--
-- Depende de: M07 (posting_workers)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── posting_campaigns ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.posting_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_id          UUID        REFERENCES public.promoted_listing_slots(id) ON DELETE SET NULL,
  name             TEXT        NOT NULL DEFAULT 'Campanha',

  -- ── Máquina de estados (Seção 1) ──
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN (
                                 'draft','ready','generating','queued','posting',
                                 'waiting','paused','completed','cancelled','expired','error'
                               )),

  -- ── Prioridade + Fairness (Seção 6) ──
  priority         TEXT        NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('urgent','high','medium','normal','low')),
  priority_score   INT         NOT NULL DEFAULT 40,
  -- Score base: urgent=100, high=80, medium=60, normal=40, low=20
  -- Bonus: starvation_ticks * 2 (cap 40) → garante fairness sem starvation
  starvation_ticks INT         NOT NULL DEFAULT 0,

  -- ── Timestamps de ciclo de vida ──
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,

  -- ── Vinculação ao Worker (Seção 14) ──
  worker_id        UUID        REFERENCES public.posting_workers(id) ON DELETE SET NULL,
  lot_id           UUID        REFERENCES public.posting_lots(id) ON DELETE SET NULL,

  -- ── Retry Inteligente (Seção 2) ──
  retry_count      INT         NOT NULL DEFAULT 0,
  max_retries      INT         NOT NULL DEFAULT 3,
  last_retry_at    TIMESTAMPTZ,
  next_retry_at    TIMESTAMPTZ,
  retry_reason     TEXT,
  final_error      TEXT,

  -- ── Idempotência (Seção 5) ──
  idempotency_key  TEXT        UNIQUE,

  -- ── Personalização ──
  message_override TEXT,
  metadata         JSONB       DEFAULT '{}'::jsonb,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.posting_campaigns IS
'Tier 2 §1,6: Campanha de postagem com 11 estados, prioridade com fairness, retry inteligente e idempotência. Hub central entre Fila do Lojista e Lotes do Postador.';

COMMENT ON COLUMN public.posting_campaigns.priority_score IS
'Score efetivo usado na ordenação da fila. Base: urgent=100, high=80, medium=60, normal=40, low=20. Bonus starvation: min(ticks*2, 40). Recalculado a cada tick pelo scheduler.';

ALTER TABLE public.posting_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select_own"  ON public.posting_campaigns;
DROP POLICY IF EXISTS "campaigns_insert_own"  ON public.posting_campaigns;

CREATE POLICY "campaigns_select_own" ON public.posting_campaigns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "campaigns_insert_own" ON public.posting_campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE deliberadamente sem policy pública:
-- toda mudança de estado vai via transition_campaign_state() (SECURITY DEFINER)

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id    ON public.posting_campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status     ON public.posting_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_slot_id    ON public.posting_campaigns (slot_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_worker_id  ON public.posting_campaigns (worker_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_lot_id     ON public.posting_campaigns (lot_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled  ON public.posting_campaigns (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_idempotent ON public.posting_campaigns (idempotency_key);
-- Hot path: ordenação da fila por prioridade
CREATE INDEX IF NOT EXISTS idx_campaigns_queue_order
  ON public.posting_campaigns (priority_score DESC, created_at ASC)
  WHERE status IN ('ready','queued');
-- Retry: campanhas aguardando re-execução
CREATE INDEX IF NOT EXISTS idx_campaigns_retry_due
  ON public.posting_campaigns (next_retry_at ASC)
  WHERE status = 'error' AND retry_count < max_retries;


-- ── campaign_state_log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campaign_state_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES public.posting_campaigns(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT        NOT NULL,
  changed_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       TEXT,
  duration_ms  INT,        -- tempo no estado anterior (ms)
  metadata     JSONB       DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campaign_state_log IS
'Tier 2 §1,12: Log imutável de transições de estado. Toda mudança via transition_campaign_state() gera uma entrada. Nunca atualizado ou deletado.';

ALTER TABLE public.campaign_state_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_log_select_own" ON public.campaign_state_log;

CREATE POLICY "state_log_select_own" ON public.campaign_state_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.posting_campaigns pc
      WHERE pc.id = campaign_state_log.campaign_id
        AND pc.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_state_log_campaign ON public.campaign_state_log (campaign_id);
CREATE INDEX IF NOT EXISTS idx_state_log_created  ON public.campaign_state_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_state_log_status   ON public.campaign_state_log (to_status);

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M08 — posting_campaigns + campaign_state_log criadas.'; END $$;
