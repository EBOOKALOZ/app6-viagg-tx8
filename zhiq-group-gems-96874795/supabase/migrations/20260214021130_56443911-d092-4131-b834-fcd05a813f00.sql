
ALTER TABLE public.merchant_wallets 
ADD COLUMN IF NOT EXISTS saldo_pendente numeric DEFAULT 0.00 NOT NULL;

CREATE OR REPLACE FUNCTION public.get_merchant_confirmed_balance(_merchant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(saldo_atual, 0)
  FROM merchant_wallets
  WHERE merchant_id = _merchant_id;
$$;
