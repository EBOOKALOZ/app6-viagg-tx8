-- ═══════════════════════════════════════════════════════════
-- CESTA FIX COMPLETO — Cole TUDO no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. SCHEMA FIXES: ensure all required columns exist
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS product_title TEXT;
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS product_image_url TEXT;
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS product_price NUMERIC;
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS customer_note TEXT;

-- 2. Fix purchase_intentions columns
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS cart_id UUID;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_whatsapp TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS customer_note TEXT;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS checkout_mode TEXT DEFAULT 'in_store';
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_applicable';
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS credits_charged INTEGER DEFAULT 0;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS visitor_id UUID;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC DEFAULT 3;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC DEFAULT 0;

-- 3. Fix purchase_intention_items columns
CREATE TABLE IF NOT EXISTS public.purchase_intention_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    intention_id UUID NOT NULL,
    product_id UUID,
    product_title TEXT,
    product_image_url TEXT,
    unit_price NUMERIC DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    subtotal NUMERIC DEFAULT 0,
    customer_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Fix RLS: allow open SELECT on store_carts
DROP POLICY IF EXISTS "store_carts_select_by_session" ON public.store_carts;
CREATE POLICY "store_carts_select_by_session" ON public.store_carts
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "store_carts_select_own" ON public.store_carts;

-- 5. Minimal get_global_cart_data RPC
CREATE OR REPLACE FUNCTION public.get_global_cart_data(
    p_session_token TEXT
) RETURNS JSONB AS $$
DECLARE
    v_groups JSONB := '[]'::jsonb;
    v_cart RECORD;
    v_items JSONB;
    v_total_items BIGINT;
    v_subtotal NUMERIC;
BEGIN
    FOR v_cart IN
        SELECT id AS cart_id, store_id
        FROM public.store_carts
        WHERE (session_token = p_session_token OR user_id = auth.uid())
              AND status = 'active'
              AND EXISTS (
                  SELECT 1 FROM public.store_cart_items
                  WHERE cart_id = store_carts.id AND quantity > 0
              )
    LOOP
        SELECT jsonb_agg(jsonb_build_object(
            'item_id', id,
            'product_id', product_id,
            'product_title', COALESCE(product_title, 'Produto'),
            'product_image_url', product_image_url,
            'product_price', COALESCE(product_price, 0),
            'quantity', quantity,
            'customer_note', customer_note,
            'item_subtotal', COALESCE(product_price, 0) * quantity
        ) ORDER BY created_at)
        INTO v_items
        FROM public.store_cart_items
        WHERE cart_id = v_cart.cart_id AND quantity > 0;

        SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(COALESCE(product_price, 0) * quantity), 0)
        INTO v_total_items, v_subtotal
        FROM public.store_cart_items
        WHERE cart_id = v_cart.cart_id AND quantity > 0;

        IF v_items IS NOT NULL AND v_total_items > 0 THEN
            v_groups := v_groups || jsonb_build_object(
                'store_id', v_cart.store_id,
                'cart_id', v_cart.cart_id,
                'store_name', '',
                'store_logo', null,
                'store_address', '',
                'items', v_items,
                'total_items', v_total_items,
                'subtotal', v_subtotal
            );
        END IF;
    END LOOP;

    RETURN v_groups;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Fixed submit_purchase_intention (single-store, SAFE)
CREATE OR REPLACE FUNCTION public.submit_purchase_intention(
    p_cart_id UUID,
    p_checkout_mode TEXT DEFAULT 'in_store',
    p_customer_name TEXT DEFAULT '',
    p_customer_whatsapp TEXT DEFAULT '',
    p_customer_email TEXT DEFAULT NULL,
    p_customer_note TEXT DEFAULT NULL,
    p_visitor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_cart RECORD;
    v_intention_id UUID;
    v_subtotal NUMERIC := 0;
    v_total_items INTEGER := 0;
    v_store_id UUID;
    v_existing_intention UUID;
BEGIN
    SELECT * INTO v_cart FROM public.store_carts WHERE id = p_cart_id;
    IF v_cart.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart not found');
    END IF;

    -- Idempotency check
    SELECT id INTO v_existing_intention FROM public.purchase_intentions WHERE cart_id = p_cart_id LIMIT 1;
    IF v_existing_intention IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'intention_id', v_existing_intention, 'already_submitted', true);
    END IF;

    v_store_id := v_cart.store_id;

    -- Calculate totals safely (product_price may not exist on old items)
    SELECT COALESCE(SUM(COALESCE(product_price, 0) * quantity), 0), COALESCE(SUM(quantity), 0)
    INTO v_subtotal, v_total_items
    FROM public.store_cart_items WHERE cart_id = p_cart_id AND quantity > 0;

    IF v_total_items = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    INSERT INTO public.purchase_intentions (
        cart_id, store_id, customer_name, customer_whatsapp, customer_email,
        customer_note, subtotal, total_items, status, checkout_mode, payment_status,
        visitor_id, platform_fee_percent, platform_fee_amount
    ) VALUES (
        p_cart_id, v_store_id, p_customer_name, p_customer_whatsapp, p_customer_email,
        p_customer_note, v_subtotal, v_total_items, 'new', p_checkout_mode,
        CASE WHEN p_checkout_mode = 'online_payment' THEN 'pending' ELSE 'not_applicable' END,
        p_visitor_id, 3, ROUND(v_subtotal * 0.03, 2)
    ) RETURNING id INTO v_intention_id;

    -- Copy items to intention (safely handle missing columns)
    INSERT INTO public.purchase_intention_items (
        intention_id, product_id, product_title, product_image_url,
        unit_price, quantity, subtotal, customer_note
    )
    SELECT v_intention_id, product_id,
        COALESCE(product_title, 'Produto'),
        product_image_url,
        COALESCE(product_price, 0),
        quantity,
        COALESCE(product_price, 0) * quantity,
        customer_note
    FROM public.store_cart_items WHERE cart_id = p_cart_id AND quantity > 0;

    UPDATE public.store_carts SET status = 'submitted', updated_at = now() WHERE id = p_cart_id;

    RETURN jsonb_build_object(
        'success', true,
        'intention_id', v_intention_id,
        'checkout_mode', p_checkout_mode,
        'subtotal', v_subtotal,
        'total_items', v_total_items
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
