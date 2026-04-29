
-- Enable RLS for merchant_credit_products if not already enabled
ALTER TABLE public.merchant_credit_products ENABLE ROW LEVEL SECURITY;

-- Allow SELECT for all authenticated users
-- This ensures that both Merchants and Advertisers can see the available product packages
DROP POLICY IF EXISTS "Allow authenticated users to select active merchant products" ON public.merchant_credit_products;
CREATE POLICY "Allow authenticated users to select active merchant products"
ON public.merchant_credit_products
FOR SELECT
TO authenticated
USING (is_active = true);

-- Also ensure merchants can see their own balances and ledger
-- Assuming these might also be restricted
ALTER TABLE public.merchant_credit_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own store balance" ON public.merchant_credit_balances;
CREATE POLICY "Users can view their own store balance"
ON public.merchant_credit_balances
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()
  )
);

-- Ensure usage rules are visible
ALTER TABLE public.merchant_credit_usage_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public usage rules visibility" ON public.merchant_credit_usage_rules;
CREATE POLICY "Public usage rules visibility"
ON public.merchant_credit_usage_rules
FOR SELECT
TO authenticated
USING (is_active = true);
