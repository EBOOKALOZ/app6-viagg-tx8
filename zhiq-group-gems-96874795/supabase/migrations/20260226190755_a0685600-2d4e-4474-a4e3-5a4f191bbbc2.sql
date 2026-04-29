
-- Add accepted_at column if missing
ALTER TABLE public.delivery_orders
ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Drop existing function with old signature
DROP FUNCTION IF EXISTS public.accept_delivery_order(uuid, uuid);

-- Recreate with one-at-a-time guard
CREATE OR REPLACE FUNCTION public.accept_delivery_order(
  p_order_id uuid,
  p_motoboy_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active int;
BEGIN
  -- Check if motoboy already has an active delivery
  SELECT COUNT(*)
  INTO v_active
  FROM delivery_orders
  WHERE motoboy_id = p_motoboy_id
    AND status = 'in_progress';

  IF v_active > 0 THEN
    RAISE EXCEPTION 'Finalize a entrega atual antes de aceitar outra';
  END IF;

  -- Accept the chosen order only if still open
  UPDATE delivery_orders
  SET
    motoboy_id = p_motoboy_id,
    status = 'in_progress',
    accepted_at = now()
  WHERE id = p_order_id
    AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega não disponível';
  END IF;
END;
$$;
