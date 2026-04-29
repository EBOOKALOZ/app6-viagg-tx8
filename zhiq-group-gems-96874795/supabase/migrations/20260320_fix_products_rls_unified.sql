-- Clean up potential duplicates and legacy policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "products_select_policy" ON public.products;
    DROP POLICY IF EXISTS "products_insert_policy" ON public.products;
    DROP POLICY IF EXISTS "products_update_policy" ON public.products;
    DROP POLICY IF EXISTS "products_delete_policy" ON public.products;
    DROP POLICY IF EXISTS "products_select_own_store" ON public.products;
    DROP POLICY IF EXISTS "products_insert_own_store" ON public.products;
    DROP POLICY IF EXISTS "products_update_own_store" ON public.products;
    DROP POLICY IF EXISTS "products_delete_own_store" ON public.products;
    DROP POLICY IF EXISTS "Users can view their own products" ON public.products;
    DROP POLICY IF EXISTS "Users can insert their own products" ON public.products;
    DROP POLICY IF EXISTS "Users can update their own products" ON public.products;
    DROP POLICY IF EXISTS "Users can delete their own products" ON public.products;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 1. Everyone can view active products (for Marketplace/Landing)
CREATE POLICY "products_select_all" ON public.products
FOR SELECT USING (true);

-- 2. Merchants can insert products ONLY for stores they own
CREATE POLICY "products_insert_own_store" ON public.products
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.merchant_stores
        WHERE id = public.products.store_id
        AND user_id = auth.uid()
    )
);

-- 3. Merchants can update products ONLY for stores they own
CREATE POLICY "products_update_own_store" ON public.products
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.merchant_stores
        WHERE id = public.products.store_id
        AND user_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.merchant_stores
        WHERE id = public.products.store_id
        AND user_id = auth.uid()
    )
);

-- 4. Merchants can delete products ONLY for stores they own
CREATE POLICY "products_delete_own_store" ON public.products
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.merchant_stores
        WHERE id = public.products.store_id
        AND user_id = auth.uid()
    )
);

-- 5. Admins can manage everything
DO $$ 
BEGIN
    CREATE POLICY "products_admin_all" ON public.products
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
