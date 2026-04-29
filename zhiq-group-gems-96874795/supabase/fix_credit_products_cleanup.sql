-- ================================================
-- FIX: Remove duplicate merchant_credit_products and add RLS policies
-- Problem: Multiple seed runs created 3 sets of the same packages.
-- The merchant sees only is_active=true rows (7 packages with slugs like 'pacote-20').
-- The admin was editing inactive duplicates by mistake.
-- ================================================

-- 1. Remove all INACTIVE duplicates (rows without slug that are inactive)
DELETE FROM public.merchant_credit_products
WHERE is_active = false
  AND slug IS NULL;

-- 2. Also remove any additional duplicate sets (inactive rows with slugs)
-- Keep only the rows that are currently active
DELETE FROM public.merchant_credit_products
WHERE is_active = false
  AND slug IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (slug) id
    FROM public.merchant_credit_products
    WHERE is_active = true
    ORDER BY slug, sort_order
  );

-- 3. Add UPDATE policy for admin edits
DO $$ BEGIN
  CREATE POLICY "mcp_update_admin" ON public.merchant_credit_products
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add INSERT policy for future admin product creation
DO $$ BEGIN
  CREATE POLICY "mcp_insert_admin" ON public.merchant_credit_products
    FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Verify results
SELECT id, name, slug, product_type, is_active, sort_order, price_brl, badge_text
FROM public.merchant_credit_products
ORDER BY is_active DESC, sort_order ASC;
