-- ================================================
-- MÓDULO CESTA POR LOJA + INTENÇÕES DE COMPRA
-- Migration: 20260313_store_cart_module
-- ================================================

-- ═══════════════════════════════════════
-- 1. TABELAS
-- ═══════════════════════════════════════

-- 1.1 store_carts — Uma cesta por loja por sessão/usuário
CREATE TABLE IF NOT EXISTS public.store_carts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    session_token TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Safety: add columns if table already exists from earlier run
ALTER TABLE public.store_carts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.store_carts ADD COLUMN IF NOT EXISTS session_token TEXT;
ALTER TABLE public.store_carts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_sc_store_session ON public.store_carts(store_id, session_token) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sc_store_user ON public.store_carts(store_id, user_id) WHERE status = 'active';

ALTER TABLE public.store_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_carts_insert_all" ON public.store_carts;
CREATE POLICY "store_carts_insert_all" ON public.store_carts FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "store_carts_select_own" ON public.store_carts;
CREATE POLICY "store_carts_select_own" ON public.store_carts FOR SELECT USING (
    session_token IS NOT NULL OR user_id = auth.uid()
);
DROP POLICY IF EXISTS "store_carts_update_own" ON public.store_carts;
CREATE POLICY "store_carts_update_own" ON public.store_carts FOR UPDATE USING (
    session_token IS NOT NULL OR user_id = auth.uid()
);

-- 1.2 store_cart_items — Itens da cesta
CREATE TABLE IF NOT EXISTS public.store_cart_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cart_id UUID NOT NULL REFERENCES public.store_carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_title TEXT,
    product_image_url TEXT,
    product_price NUMERIC,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    customer_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sci_cart ON public.store_cart_items(cart_id);

ALTER TABLE public.store_cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_cart_items_insert_all" ON public.store_cart_items;
CREATE POLICY "store_cart_items_insert_all" ON public.store_cart_items FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "store_cart_items_select_all" ON public.store_cart_items;
CREATE POLICY "store_cart_items_select_all" ON public.store_cart_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "store_cart_items_update_all" ON public.store_cart_items;
CREATE POLICY "store_cart_items_update_all" ON public.store_cart_items FOR UPDATE USING (true);
DROP POLICY IF EXISTS "store_cart_items_delete_all" ON public.store_cart_items;
CREATE POLICY "store_cart_items_delete_all" ON public.store_cart_items FOR DELETE USING (true);

-- 1.3 purchase_intentions — Intenção de compra submetida
CREATE TABLE IF NOT EXISTS public.purchase_intentions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cart_id UUID REFERENCES public.store_carts(id),
    store_id UUID NOT NULL,
    customer_name TEXT NOT NULL,
    customer_whatsapp TEXT NOT NULL,
    customer_email TEXT,
    customer_note TEXT,
    subtotal NUMERIC DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'converted', 'cancelled')),
    source TEXT DEFAULT 'store_page',
    checkout_mode TEXT NOT NULL DEFAULT 'in_store' CHECK (checkout_mode IN ('online_payment', 'in_store')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded', 'not_applicable')),
    credits_charged INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pi_store ON public.purchase_intentions(store_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON public.purchase_intentions(status);
CREATE INDEX IF NOT EXISTS idx_pi_created ON public.purchase_intentions(created_at DESC);

ALTER TABLE public.purchase_intentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pi_insert_all" ON public.purchase_intentions;
CREATE POLICY "pi_insert_all" ON public.purchase_intentions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "pi_select_store_owner" ON public.purchase_intentions;
CREATE POLICY "pi_select_store_owner" ON public.purchase_intentions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.merchant_stores ms
        WHERE ms.id = purchase_intentions.store_id AND ms.user_id = auth.uid()
    )
    OR auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin'))
);
DROP POLICY IF EXISTS "pi_update_store_owner" ON public.purchase_intentions;
CREATE POLICY "pi_update_store_owner" ON public.purchase_intentions FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.merchant_stores ms
        WHERE ms.id = purchase_intentions.store_id AND ms.user_id = auth.uid()
    )
);

-- 1.4 purchase_intention_items — Itens da intenção
CREATE TABLE IF NOT EXISTS public.purchase_intention_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    intention_id UUID NOT NULL REFERENCES public.purchase_intentions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_title TEXT,
    product_image_url TEXT,
    unit_price NUMERIC DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal NUMERIC DEFAULT 0,
    customer_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pii_intention ON public.purchase_intention_items(intention_id);

ALTER TABLE public.purchase_intention_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pii_insert_all" ON public.purchase_intention_items;
CREATE POLICY "pii_insert_all" ON public.purchase_intention_items FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "pii_select_via_intention" ON public.purchase_intention_items;
CREATE POLICY "pii_select_via_intention" ON public.purchase_intention_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.purchase_intentions pi
        JOIN public.merchant_stores ms ON ms.id = pi.store_id
        WHERE pi.id = purchase_intention_items.intention_id AND ms.user_id = auth.uid()
    )
    OR auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin'))
);

-- 1.5 merchant_credit_balances — Saldo de créditos do lojista
CREATE TABLE IF NOT EXISTS public.merchant_credit_balances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL UNIQUE,
    balance INTEGER NOT NULL DEFAULT 20,
    total_earned INTEGER DEFAULT 20,
    total_spent INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.merchant_credit_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mcb_select_owner" ON public.merchant_credit_balances;
CREATE POLICY "mcb_select_owner" ON public.merchant_credit_balances FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.merchant_stores ms WHERE ms.id = merchant_credit_balances.store_id AND ms.user_id = auth.uid())
);
DROP POLICY IF EXISTS "mcb_insert_all" ON public.merchant_credit_balances;
CREATE POLICY "mcb_insert_all" ON public.merchant_credit_balances FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "mcb_update_all" ON public.merchant_credit_balances;
CREATE POLICY "mcb_update_all" ON public.merchant_credit_balances FOR UPDATE USING (true);

-- 1.6 merchant_credit_ledger — Histórico de movimentação de créditos
CREATE TABLE IF NOT EXISTS public.merchant_credit_ledger (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL,
    intention_id UUID REFERENCES public.purchase_intentions(id),
    credits INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    rule_applied TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcl_store ON public.merchant_credit_ledger(store_id);

ALTER TABLE public.merchant_credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mcl_select_owner" ON public.merchant_credit_ledger;
CREATE POLICY "mcl_select_owner" ON public.merchant_credit_ledger FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.merchant_stores ms WHERE ms.id = merchant_credit_ledger.store_id AND ms.user_id = auth.uid())
);
DROP POLICY IF EXISTS "mcl_insert_all" ON public.merchant_credit_ledger;
CREATE POLICY "mcl_insert_all" ON public.merchant_credit_ledger FOR INSERT WITH CHECK (true);

-- 1.7 purchase_intention_events — Log de eventos
CREATE TABLE IF NOT EXISTS public.purchase_intention_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    intention_id UUID REFERENCES public.purchase_intentions(id),
    store_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchase_intention_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pie_insert_all" ON public.purchase_intention_events;
CREATE POLICY "pie_insert_all" ON public.purchase_intention_events FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "pie_select_owner" ON public.purchase_intention_events;
CREATE POLICY "pie_select_owner" ON public.purchase_intention_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.merchant_stores ms WHERE ms.id = purchase_intention_events.store_id AND ms.user_id = auth.uid())
);


-- ═══════════════════════════════════════
-- 2. RPCs
-- ═══════════════════════════════════════

-- 2.1 get_or_create_store_cart
CREATE OR REPLACE FUNCTION public.get_or_create_store_cart(
    p_store_id UUID,
    p_session_token TEXT
) RETURNS UUID AS $$
DECLARE
    v_cart_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Try to find existing active cart
    IF v_user_id IS NOT NULL THEN
        SELECT id INTO v_cart_id
        FROM public.store_carts
        WHERE store_id = p_store_id AND user_id = v_user_id AND status = 'active'
        LIMIT 1;
    ELSE
        SELECT id INTO v_cart_id
        FROM public.store_carts
        WHERE store_id = p_store_id AND session_token = p_session_token AND status = 'active'
        LIMIT 1;
    END IF;

    -- Create if not found
    IF v_cart_id IS NULL THEN
        INSERT INTO public.store_carts (store_id, user_id, session_token, status)
        VALUES (p_store_id, v_user_id, p_session_token, 'active')
        RETURNING id INTO v_cart_id;
    END IF;

    RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 add_item_to_store_cart
CREATE OR REPLACE FUNCTION public.add_item_to_store_cart(
    p_store_id UUID,
    p_product_id UUID,
    p_quantity INTEGER DEFAULT 1,
    p_customer_note TEXT DEFAULT NULL,
    p_session_token TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_cart_id UUID;
    v_item_id UUID;
    v_product RECORD;
    v_qty INTEGER;
BEGIN
    -- Get or create cart
    v_cart_id := public.get_or_create_store_cart(p_store_id, p_session_token);

    -- Get product info
    SELECT id, title, image_url, price_label
    INTO v_product
    FROM public.merchant_marketing_products
    WHERE id = p_product_id AND merchant_store_id = p_store_id;

    IF v_product.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found');
    END IF;

    -- Check if item already in cart
    SELECT id, quantity INTO v_item_id, v_qty
    FROM public.store_cart_items
    WHERE cart_id = v_cart_id AND product_id = p_product_id;

    IF v_item_id IS NOT NULL THEN
        -- Update quantity
        UPDATE public.store_cart_items
        SET quantity = v_qty + p_quantity,
            customer_note = COALESCE(p_customer_note, customer_note),
            updated_at = now()
        WHERE id = v_item_id;
    ELSE
        -- Parse price from label
        DECLARE
            v_price NUMERIC := 0;
        BEGIN
            v_price := COALESCE(
                NULLIF(
                    regexp_replace(
                        replace(COALESCE(v_product.price_label, '0'), ',', '.'),
                        '[^0-9.]', '', 'g'
                    ), ''
                )::numeric,
                0
            );

            INSERT INTO public.store_cart_items (cart_id, product_id, product_title, product_image_url, product_price, quantity, customer_note)
            VALUES (v_cart_id, p_product_id, v_product.title, v_product.image_url, v_price, p_quantity, p_customer_note)
            RETURNING id INTO v_item_id;
        END;
    END IF;

    -- Update cart timestamp
    UPDATE public.store_carts SET updated_at = now() WHERE id = v_cart_id;

    RETURN jsonb_build_object(
        'success', true,
        'cart_id', v_cart_id,
        'item_id', v_item_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.3 update_store_cart_item
CREATE OR REPLACE FUNCTION public.update_store_cart_item(
    p_cart_item_id UUID,
    p_quantity INTEGER,
    p_customer_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    IF p_quantity <= 0 THEN
        DELETE FROM public.store_cart_items WHERE id = p_cart_item_id;
        RETURN jsonb_build_object('success', true, 'action', 'removed');
    ELSE
        UPDATE public.store_cart_items
        SET quantity = p_quantity,
            customer_note = COALESCE(p_customer_note, customer_note),
            updated_at = now()
        WHERE id = p_cart_item_id;
        RETURN jsonb_build_object('success', true, 'action', 'updated');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.4 submit_purchase_intention (with checkout_mode)
CREATE OR REPLACE FUNCTION public.submit_purchase_intention(
    p_cart_id UUID,
    p_checkout_mode TEXT DEFAULT 'in_store',
    p_customer_name TEXT DEFAULT '',
    p_customer_whatsapp TEXT DEFAULT '',
    p_customer_email TEXT DEFAULT NULL,
    p_customer_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_cart RECORD;
    v_intention_id UUID;
    v_subtotal NUMERIC := 0;
    v_total_items INTEGER := 0;
    v_credits_cost INTEGER := 1;
    v_store_id UUID;
    v_balance INTEGER;
    v_payment_status TEXT;
BEGIN
    -- Get cart
    SELECT * INTO v_cart FROM public.store_carts WHERE id = p_cart_id AND status = 'active';
    IF v_cart.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart not found or already submitted');
    END IF;

    v_store_id := v_cart.store_id;

    -- Calculate totals from cart items
    SELECT COALESCE(SUM(product_price * quantity), 0), COALESCE(SUM(quantity), 0)
    INTO v_subtotal, v_total_items
    FROM public.store_cart_items
    WHERE cart_id = p_cart_id AND quantity > 0;

    IF v_total_items = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- Determine credits cost based on subtotal
    v_credits_cost := CASE
        WHEN v_subtotal >= 500 THEN 5
        WHEN v_subtotal >= 200 THEN 3
        WHEN v_subtotal >= 50 THEN 2
        ELSE 1
    END;

    -- Set payment status based on checkout mode
    v_payment_status := CASE
        WHEN p_checkout_mode = 'online_payment' THEN 'pending'
        ELSE 'not_applicable'
    END;

    -- Create intention
    INSERT INTO public.purchase_intentions (
        cart_id, store_id, customer_name, customer_whatsapp, customer_email,
        customer_note, subtotal, total_items, status, checkout_mode, payment_status, credits_charged
    ) VALUES (
        p_cart_id, v_store_id, p_customer_name, p_customer_whatsapp, p_customer_email,
        p_customer_note, v_subtotal, v_total_items, 'new', p_checkout_mode, v_payment_status, v_credits_cost
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
        'Recebimento de intenção de compra qualificada',
        CASE
            WHEN v_subtotal >= 500 THEN 'Faixa premium (R$500+): 5 créditos'
            WHEN v_subtotal >= 200 THEN 'Faixa alta (R$200+): 3 créditos'
            WHEN v_subtotal >= 50 THEN 'Faixa média (R$50+): 2 créditos'
            ELSE 'Faixa básica: 1 crédito'
        END
    );

    -- Record event
    INSERT INTO public.purchase_intention_events (intention_id, store_id, event_type, metadata)
    VALUES (v_intention_id, v_store_id, 'intention_submitted', jsonb_build_object(
        'checkout_mode', p_checkout_mode,
        'subtotal', v_subtotal,
        'total_items', v_total_items,
        'credits_charged', v_credits_cost
    ));

    RETURN jsonb_build_object(
        'success', true,
        'intention_id', v_intention_id,
        'checkout_mode', p_checkout_mode,
        'subtotal', v_subtotal,
        'total_items', v_total_items,
        'credits_charged', v_credits_cost
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════
-- 3. VIEWS
-- ═══════════════════════════════════════

-- 3.1 merchant_purchase_intentions_view
CREATE OR REPLACE VIEW public.merchant_purchase_intentions_view AS
SELECT
    pi.id,
    pi.store_id,
    pi.customer_name,
    pi.customer_whatsapp,
    pi.customer_email,
    pi.customer_note,
    pi.subtotal,
    pi.total_items,
    pi.status,
    pi.source,
    pi.checkout_mode,
    pi.payment_status,
    pi.credits_charged,
    pi.created_at,
    pi.updated_at,
    (SELECT pii.product_image_url FROM public.purchase_intention_items pii WHERE pii.intention_id = pi.id LIMIT 1) AS first_product_image,
    (SELECT pii.product_title FROM public.purchase_intention_items pii WHERE pii.intention_id = pi.id LIMIT 1) AS first_product_title
FROM public.purchase_intentions pi
ORDER BY pi.created_at DESC;

-- 3.2 merchant_purchase_intention_items_view
CREATE OR REPLACE VIEW public.merchant_purchase_intention_items_view AS
SELECT
    pii.id,
    pii.intention_id,
    pii.product_id,
    pii.product_title,
    pii.product_image_url,
    pii.unit_price,
    pii.quantity,
    pii.subtotal,
    pii.customer_note,
    pii.created_at
FROM public.purchase_intention_items pii;

-- 3.3 merchant_purchase_intention_credit_view
CREATE OR REPLACE VIEW public.merchant_purchase_intention_credit_view AS
SELECT
    mcl.id,
    mcl.store_id,
    mcl.intention_id,
    mcl.credits,
    mcl.balance_after,
    mcl.reason,
    mcl.rule_applied,
    mcl.created_at,
    mcb.balance AS current_balance,
    mcb.total_earned,
    mcb.total_spent
FROM public.merchant_credit_ledger mcl
LEFT JOIN public.merchant_credit_balances mcb ON mcb.store_id = mcl.store_id;

-- 3.4 merchant_purchase_intention_detail_view
CREATE OR REPLACE VIEW public.merchant_purchase_intention_detail_view AS
SELECT
    pi.id,
    pi.store_id,
    pi.customer_name,
    pi.customer_whatsapp,
    pi.customer_email,
    pi.customer_note,
    pi.subtotal,
    pi.total_items,
    pi.status,
    pi.source,
    pi.checkout_mode,
    pi.payment_status,
    pi.credits_charged,
    pi.created_at,
    pi.updated_at,
    COALESCE(
        (SELECT json_agg(json_build_object(
            'id', pii.id,
            'product_id', pii.product_id,
            'product_title', pii.product_title,
            'product_image_url', pii.product_image_url,
            'unit_price', pii.unit_price,
            'quantity', pii.quantity,
            'subtotal', pii.subtotal,
            'customer_note', pii.customer_note
        ) ORDER BY pii.created_at)
        FROM public.purchase_intention_items pii WHERE pii.intention_id = pi.id),
        '[]'::json
    ) AS items,
    COALESCE(
        (SELECT json_build_object(
            'credits_charged', mcl.credits,
            'balance_after', mcl.balance_after,
            'reason', mcl.reason,
            'rule_applied', mcl.rule_applied,
            'current_balance', mcb.balance
        )
        FROM public.merchant_credit_ledger mcl
        LEFT JOIN public.merchant_credit_balances mcb ON mcb.store_id = mcl.store_id
        WHERE mcl.intention_id = pi.id
        LIMIT 1),
        '{}'::json
    ) AS credit_info
FROM public.purchase_intentions pi;

-- Grant SELECT on views
GRANT SELECT ON public.merchant_purchase_intentions_view TO authenticated;
GRANT SELECT ON public.merchant_purchase_intention_items_view TO authenticated;
GRANT SELECT ON public.merchant_purchase_intention_credit_view TO authenticated;
GRANT SELECT ON public.merchant_purchase_intention_detail_view TO authenticated;
