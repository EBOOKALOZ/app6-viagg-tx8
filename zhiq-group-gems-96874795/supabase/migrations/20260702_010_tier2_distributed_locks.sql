-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M10: distributed_locks
-- Seção 4 — Lock Distribuído
--
-- Garante exclusividade de processamento: dois workers nunca processam o
-- mesmo recurso (campaign / lot / item / slot) simultaneamente.
--
-- Mecanismo:
--   1. acquire_lock() → INSERT (viola UNIQUE se já existir lock ativo)
--   2. release_lock() → UPDATE released_at = now()
--   3. cleanup_expired_locks() → libera locks cujo expires_at < now()
--
-- O índice parcial UNIQUE em (resource_type, resource_id) WHERE released_at IS NULL
-- garante atomicidade: INSERT falha com unique_violation se lock ativo existe.
-- Usa FOR UPDATE SKIP LOCKED nas queries de seleção de campanhas/lotes (RPCs M19).
--
-- Depende de: M07 (posting_workers)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.distributed_locks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT        NOT NULL CHECK (resource_type IN ('campaign','lot','item','slot')),
  resource_id   TEXT        NOT NULL,
  locked_by     UUID        REFERENCES public.posting_workers(id) ON DELETE CASCADE,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  released_at   TIMESTAMPTZ,
  metadata      JSONB       DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.distributed_locks IS
'Tier 2 §4: Lock distribuído por recurso. acquire_lock() usa INSERT com UNIQUE parcial para atomicidade. Locks com expires_at vencido são liberados por cleanup_expired_locks(). Workers usam FOR UPDATE SKIP LOCKED nas queries de seleção.';

-- Lock ativo é único por resource_type+resource_id
-- O índice parcial WHERE released_at IS NULL garante atomicidade sem transação longa
CREATE UNIQUE INDEX IF NOT EXISTS idx_locks_active_unique
  ON public.distributed_locks (resource_type, resource_id)
  WHERE released_at IS NULL;

ALTER TABLE public.distributed_locks ENABLE ROW LEVEL SECURITY;

-- Visível para authenticated (debugging / monitor)
DROP POLICY IF EXISTS "locks_select_authenticated" ON public.distributed_locks;
CREATE POLICY "locks_select_authenticated" ON public.distributed_locks
  FOR SELECT TO authenticated USING (true);

-- Escrita somente via acquire_lock() / release_lock() (SECURITY DEFINER)

CREATE INDEX IF NOT EXISTS idx_locks_resource  ON public.distributed_locks (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_locks_worker    ON public.distributed_locks (locked_by);
-- Cleanup: locks expirados ainda ativos
CREATE INDEX IF NOT EXISTS idx_locks_expired
  ON public.distributed_locks (expires_at ASC)
  WHERE released_at IS NULL;

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M10 — distributed_locks criada com UNIQUE parcial.'; END $$;
