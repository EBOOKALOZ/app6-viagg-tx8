
CREATE OR REPLACE FUNCTION public.can_merchant_create_delivery(_merchant_id uuid, _valor_final numeric)
RETURNS boolean AS $$
  SELECT COALESCE(saldo_atual, 0) >= _valor_final
  FROM merchant_wallets
  WHERE merchant_id = _merchant_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
