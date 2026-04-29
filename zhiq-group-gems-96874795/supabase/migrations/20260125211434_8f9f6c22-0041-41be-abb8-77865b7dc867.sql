-- Drop and recreate the wallet balance function to sum ALL transactions
DROP FUNCTION IF EXISTS public.get_motoboy_wallet_balance(_user_id uuid);

-- Create simplified function: sum ALL values regardless of type
CREATE OR REPLACE FUNCTION public.get_motoboy_wallet_balance(_user_id uuid)
RETURNS TABLE(saldo_total numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(valor), 0)::NUMERIC as saldo_total
  FROM public.motoboy_wallet_transactions
  WHERE user_id = _user_id;
END;
$$;