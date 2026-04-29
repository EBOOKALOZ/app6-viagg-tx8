-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260415_ADD_COMPLETED_AT_SERVICE_ORDERS.sql
-- ADD: completed_at column to service_orders
-- ═══════════════════════════════════════════════════════════════

-- 1. Adicionar coluna completed_at (nullable)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Preencher retroativamente: ordens já finalizadas usam updated_at como proxy
UPDATE public.service_orders
SET completed_at = updated_at
WHERE status IN ('completed', 'finalizada', 'cancelled', 'cancelada')
  AND completed_at IS NULL
  AND updated_at IS NOT NULL;

-- 3. Índice para queries de histórico por data de conclusão
CREATE INDEX IF NOT EXISTS idx_service_orders_completed_at
  ON public.service_orders (completed_at DESC NULLS LAST)
  WHERE completed_at IS NOT NULL;

-- 4. Atualizar RPC complete_delivery_order para setar completed_at
CREATE OR REPLACE FUNCTION public.complete_delivery_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.service_orders
  SET
    status       = 'completed',
    completed_at = now(),
    updated_at   = now()
  WHERE id = p_order_id;
END;
$$;

DO $$ BEGIN RAISE LOG '=== completed_at added to service_orders ==='; END $$;
