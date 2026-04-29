-- ═══════════════════════════════════════════════════════
-- CESTA1 MODULE — Mini-cadastro + Taxa 3% + visitor_id
-- Migration: 20260314_cesta1_module
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- 1. TABELA visitor_profiles
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.visitor_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_token TEXT,
    user_id UUID REFERENCES auth.users(id),
    full_name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    email TEXT,
    bairro TEXT,
    city TEXT,
    accepted_terms BOOLEAN DEFAULT false,
    accepted_privacy BOOLEAN DEFAULT false,
    accepted_direct_payment BOOLEAN DEFAULT false,
    accepted_store_contact BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vp_session ON public.visitor_profiles(session_token);
CREATE INDEX IF NOT EXISTS idx_vp_user ON public.visitor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vp_whatsapp ON public.visitor_profiles(whatsapp);

ALTER TABLE public.visitor_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vp_insert_all" ON public.visitor_profiles;
CREATE POLICY "vp_insert_all" ON public.visitor_profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "vp_select_all" ON public.visitor_profiles;
CREATE POLICY "vp_select_all" ON public.visitor_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "vp_update_all" ON public.visitor_profiles;
CREATE POLICY "vp_update_all" ON public.visitor_profiles FOR UPDATE USING (true);

GRANT ALL ON public.visitor_profiles TO authenticated, anon;

-- Add visitor_id column to purchase_intentions
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS visitor_id UUID REFERENCES public.visitor_profiles(id);
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC DEFAULT 3;
ALTER TABLE public.purchase_intentions ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC DEFAULT 0;

-- ═══════════════════════════════════════
-- 2. UPDATED submit_purchase_intention (3% fee)
-- ═══════════════════════════════════════
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
    v_fee_amount NUMERIC := 0;
    v_credits_cost INTEGER := 0;
    v_store_id UUID;
    v_balance INTEGER;
    v_payment_status TEXT;
    v_owner_id UUID;
BEGIN
    -- Get cart
    SELECT * INTO v_cart FROM public.store_carts WHERE id = p_cart_id AND status = 'active';
    IF v_cart.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart not found or already submitted');
    END IF;

    v_store_id := v_cart.store_id;

    -- Get store owner for notification
    SELECT user_id INTO v_owner_id FROM public.merchant_stores WHERE id = v_store_id;

    -- Calculate totals
    SELECT COALESCE(SUM(product_price * quantity), 0), COALESCE(SUM(quantity), 0)
    INTO v_subtotal, v_total_items
    FROM public.store_cart_items
    WHERE cart_id = p_cart_id AND quantity > 0;

    IF v_total_items = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- Calculate 3% platform fee
    v_fee_amount := ROUND(v_subtotal * 0.03, 2);

    -- Convert fee to credits (R$1 = 1 crédito, mínimo 1)
    v_credits_cost := GREATEST(CEIL(v_fee_amount), 1);

    -- Payment status
    v_payment_status := CASE
        WHEN p_checkout_mode = 'online_payment' THEN 'pending'
        ELSE 'not_applicable'
    END;

    -- Create intention
    INSERT INTO public.purchase_intentions (
        cart_id, store_id, customer_name, customer_whatsapp, customer_email,
        customer_note, subtotal, total_items, status, checkout_mode, payment_status,
        credits_charged, visitor_id, platform_fee_percent, platform_fee_amount
    ) VALUES (
        p_cart_id, v_store_id, p_customer_name, p_customer_whatsapp, p_customer_email,
        p_customer_note, v_subtotal, v_total_items, 'new', p_checkout_mode, v_payment_status,
        v_credits_cost, p_visitor_id, 3, v_fee_amount
    ) RETURNING id INTO v_intention_id;

    -- Copy cart items to intention items
    INSERT INTO public.purchase_intention_items (
        intention_id, product_id, product_title, product_image_url,
        unit_price, quantity, subtotal, customer_note
    )
    SELECT
        v_intention_id, product_id, product_title, product_image_url,
        product_price, quantity, product_price * quantity, customer_note
    FROM public.store_cart_items
    WHERE cart_id = p_cart_id AND quantity > 0;

    -- Mark cart as submitted
    UPDATE public.store_carts SET status = 'submitted', updated_at = now() WHERE id = p_cart_id;

    -- Ensure credit balance exists
    INSERT INTO public.merchant_credit_balances (store_id, balance, total_earned, total_spent)
    VALUES (v_store_id, 20, 20, 0)
    ON CONFLICT (store_id) DO NOTHING;

    -- Debit credits
    UPDATE public.merchant_credit_balances
    SET balance = GREATEST(balance - v_credits_cost, 0),
        total_spent = total_spent + v_credits_cost,
        updated_at = now()
    WHERE store_id = v_store_id
    RETURNING balance INTO v_balance;

    -- Record ledger entry
    INSERT INTO public.merchant_credit_ledger (
        store_id, intention_id, credits, balance_after, reason, rule_applied
    ) VALUES (
        v_store_id, v_intention_id, -v_credits_cost, COALESCE(v_balance, 0),
        'Taxa de intenção de compra qualificada (3%)',
        'Taxa de conversão: 3% sobre R$' || ROUND(v_subtotal, 2) || ' = R$' || v_fee_amount || ' (' || v_credits_cost || ' créditos)'
    );

    -- Record event
    INSERT INTO public.purchase_intention_events (intention_id, store_id, event_type, metadata)
    VALUES (v_intention_id, v_store_id, 'intention_submitted', jsonb_build_object(
        'checkout_mode', p_checkout_mode,
        'subtotal', v_subtotal,
        'total_items', v_total_items,
        'credits_charged', v_credits_cost,
        'platform_fee_percent', 3,
        'platform_fee_amount', v_fee_amount,
        'visitor_id', p_visitor_id
    ));

    -- Notification to merchant
    IF v_owner_id IS NOT NULL THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, is_read,
            source_module, severity, reference_type, reference_id, profile_type
        ) VALUES (
            v_owner_id,
            '🛒 Nova Intenção de Compra de ' || p_customer_name,
            v_total_items || ' item(s) - R$ ' || ROUND(v_subtotal, 2) || ' via Mercado Viagg-TX8',
            'purchase_intention', false,
            'cesta1', 'success', 'purchase_intention', v_intention_id, 'lojista'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'intention_id', v_intention_id,
        'checkout_mode', p_checkout_mode,
        'subtotal', v_subtotal,
        'total_items', v_total_items,
        'credits_charged', v_credits_cost,
        'platform_fee_percent', 3,
        'platform_fee_amount', v_fee_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- 3. UPDATED submit_marketplace_order (3% fee)
-- ═══════════════════════════════════════
DROP FUNCTION IF EXISTS public.submit_marketplace_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_marketplace_order(
    p_cart_id UUID,
    p_customer_name TEXT DEFAULT 'Cliente',
    p_customer_whatsapp TEXT DEFAULT '',
    p_customer_email TEXT DEFAULT NULL,
    p_customer_note TEXT DEFAULT NULL,
    p_checkout_mode TEXT DEFAULT 'in_store',
    p_visitor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_cart RECORD;
    v_intention_id UUID;
    v_subtotal NUMERIC := 0;
    v_total_items INTEGER := 0;
    v_fee_amount NUMERIC := 0;
    v_credits_cost INTEGER := 0;
    v_store_id UUID;
    v_owner_id UUID;
    v_balance INTEGER;
BEGIN
    SELECT * INTO v_cart FROM public.store_carts WHERE id = p_cart_id AND status = 'active';
    IF v_cart.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart not found or already submitted');
    END IF;

    v_store_id := v_cart.store_id;
    SELECT user_id INTO v_owner_id FROM public.merchant_stores WHERE id = v_store_id;

    SELECT COALESCE(SUM(product_price * quantity), 0), COALESCE(SUM(quantity), 0)
    INTO v_subtotal, v_total_items
    FROM public.store_cart_items WHERE cart_id = p_cart_id AND quantity > 0;

    IF v_total_items = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- 3% fee
    v_fee_amount := ROUND(v_subtotal * 0.03, 2);
    v_credits_cost := GREATEST(CEIL(v_fee_amount), 1);

    INSERT INTO public.purchase_intentions (
        cart_id, store_id, customer_name, customer_whatsapp, customer_email,
        customer_note, subtotal, total_items, status, checkout_mode, payment_status,
        source, credits_charged, visitor_id, platform_fee_percent, platform_fee_amount
    ) VALUES (
        p_cart_id, v_store_id, p_customer_name, p_customer_whatsapp, p_customer_email,
        p_customer_note, v_subtotal, v_total_items, 'new', p_checkout_mode, 'not_applicable',
        'marketplace', v_credits_cost, p_visitor_id, 3, v_fee_amount
    ) RETURNING id INTO v_intention_id;

    INSERT INTO public.purchase_intention_items (
        intention_id, product_id, product_title, product_image_url,
        unit_price, quantity, subtotal, customer_note
    )
    SELECT v_intention_id, product_id, COALESCE(product_title, 'Produto'),
        product_image_url, product_price, quantity, product_price * quantity, customer_note
    FROM public.store_cart_items WHERE cart_id = p_cart_id AND quantity > 0;

    UPDATE public.store_carts SET status = 'submitted', updated_at = now() WHERE id = p_cart_id;

    -- Credits
    INSERT INTO public.merchant_credit_balances (store_id, balance, total_earned, total_spent)
    VALUES (v_store_id, 20, 20, 0) ON CONFLICT (store_id) DO NOTHING;

    UPDATE public.merchant_credit_balances
    SET balance = GREATEST(balance - v_credits_cost, 0),
        total_spent = total_spent + v_credits_cost, updated_at = now()
    WHERE store_id = v_store_id RETURNING balance INTO v_balance;

    INSERT INTO public.merchant_credit_ledger (store_id, intention_id, credits, balance_after, reason, rule_applied)
    VALUES (v_store_id, v_intention_id, -v_credits_cost, COALESCE(v_balance, 0),
        'Taxa de intenção de compra qualificada (3%)',
        'Taxa de conversão: 3% sobre R$' || ROUND(v_subtotal, 2) || ' = R$' || v_fee_amount
    );

    IF v_owner_id IS NOT NULL THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, is_read,
            source_module, severity, reference_type, reference_id, profile_type
        ) VALUES (
            v_owner_id, '🛒 Nova Intenção de ' || p_customer_name,
            v_total_items || ' item(s) - R$ ' || ROUND(v_subtotal, 2) || ' via Mercado Viagg-TX8',
            'purchase_intention', false, 'cesta1', 'success', 'purchase_intention', v_intention_id, 'lojista'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'intention_id', v_intention_id, 'store_id', v_store_id,
        'subtotal', v_subtotal, 'total_items', v_total_items,
        'credits_charged', v_credits_cost, 'platform_fee_amount', v_fee_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
