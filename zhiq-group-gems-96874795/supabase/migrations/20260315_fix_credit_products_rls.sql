-- Add UPDATE and INSERT RLS policies for merchant_credit_products
-- This allows admin panel to actually persist edits

DO $$ BEGIN
  CREATE POLICY "mcp_update_admin" ON public.merchant_credit_products
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mcp_insert_admin" ON public.merchant_credit_products
    FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Clean up duplicate inactive rows from old seeds
DELETE FROM public.merchant_credit_products
WHERE is_active = false AND slug IS NULL;
