-- ================================================
-- FIX RLS: Allow UPDATE on merchant_credit_products
-- Without this, admin toggle/edit mutations fail silently
-- ================================================

-- Allow authenticated users to UPDATE credit products (admin panel)
DO $$ BEGIN
  CREATE POLICY "mcp_update_admin" ON public.merchant_credit_products
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow INSERT for future product creation from admin
DO $$ BEGIN
  CREATE POLICY "mcp_insert_admin" ON public.merchant_credit_products
    FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'merchant_credit_products';
