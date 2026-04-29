-- Correção para que o checkout encontre carrinhos logados ou não logados.
-- O problema ocorria porque o carrinho ficava atrelado ao user_id (para usuários logados),
-- mas o submit_multi_store_intention buscava apenas pelo session_token, que poderia estar vazio.

-- ═══ 1. get_global_cart_data ═══
CREATE OR REPLACE FUNCTION public.get_global_cart_data(
    p_session_token TEXT
) RETURNS JSONB AS $$
DECLARE
    v_cart RECORD;
    v_items JSONB;
    v_total_items BIGINT;
    v_subtotal NUMERIC;
    v_store_name TEXT;
    v_store_logo TEXT;
    v_groups JSONB := '[]'::jsonb;
BEGIN
    FOR v_cart IN
        SELECT sc.id AS cart_id, sc.store_id, ms.user_id
        FROM public.store_carts sc
        LEFT JOIN public.merchant_stores ms ON ms.id = sc.store_id
        WHERE (sc.session_token = p_session_token OR (auth.uid() IS NOT NULL AND sc.user_id = auth.uid()))
              AND sc.status = 'active'
              AND EXISTS (
                  SELECT 1 FROM public.store_cart_items sci
                  WHERE sci.cart_id = sc.id AND sci.quantity > 0
              )
    LOOP
        -- Get store name safely
        v_store_name := 'Loja';
        v_store_logo := NULL;
        IF v_cart.user_id IS NOT NULL THEN
            BEGIN
                EXECUTE 'SELECT COALESCE(nome_loja, name) FROM public.profiles WHERE id = $1'
                INTO v_store_name USING v_cart.user_id;
            EXCEPTION WHEN undefined_column THEN
                SELECT name INTO v_store_name FROM public.profiles WHERE id = v_cart.user_id;
            END;
            BEGIN
                EXECUTE 'SELECT logo_url FROM public.profiles WHERE id = $1'
                INTO v_store_logo USING v_cart.user_id;
            EXCEPTION WHEN undefined_column THEN
                v_store_logo := NULL;
            END;
        END IF;
        v_store_name := COALESCE(v_store_name, 'Loja');

        -- Get items JSON
        SELECT jsonb_agg(jsonb_build_object(
            'item_id', sci.id,
            'product_id', sci.product_id,
            'product_title', COALESCE(sci.product_title, 'Produto'),
            'product_image_url', sci.product_image_url,
            'product_price', COALESCE(sci.product_price, 0),
            'quantity', sci.quantity,
            'customer_note', sci.customer_note,
            'item_subtotal', COALESCE(sci.product_price, 0) * sci.quantity
        ) ORDER BY sci.created_at)
        INTO v_items
        FROM public.store_cart_items sci
        WHERE sci.cart_id = v_cart.cart_id AND sci.quantity > 0;

        -- Totals
        SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(product_price * quantity), 0)
        INTO v_total_items, v_subtotal
        FROM public.store_cart_items
        WHERE cart_id = v_cart.cart_id AND quantity > 0;

        IF v_items IS NOT NULL AND v_total_items > 0 THEN
            v_groups := v_groups || jsonb_build_object(
                'store_id', v_cart.store_id,
                'cart_id', v_cart.cart_id,
                'store_name', v_store_name,
                'store_logo', v_store_logo,
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

-- ═══ 2. submit_multi_store_intention ═══
CREATE OR REPLACE FUNCTION public.submit_multi_store_intention(
    p_session_token TEXT,
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
    v_subtotal NUMERIC;
    v_total_items INTEGER;
    v_fee_amount NUMERIC;
    v_credits_cost INTEGER;
    v_payment_status TEXT;
    v_owner_id UUID;
    v_balance INTEGER;
    v_results JSONB := '[]'::jsonb;
    v_store_count INTEGER := 0;
    v_grand_total NUMERIC := 0;
    v_grand_items INTEGER := 0;
BEGIN
    v_payment_status := CASE
        WHEN p_checkout_mode = 'online_payment' THEN 'pending'
        ELSE 'not_applicable'
    END;

    FOR v_cart IN
        SELECT sc.id AS cart_id, sc.store_id
        FROM public.store_carts sc
        WHERE (sc.session_token = p_session_token OR (auth.uid() IS NOT NULL AND sc.user_id = auth.uid()))
              AND sc.status = 'active'
              AND EXISTS (
                  SELECT 1 FROM public.store_cart_items sci
                  WHERE sci.cart_id = sc.id AND sci.quantity > 0
              )
    LOOP
        SELECT COALESCE(SUM(product_price * quantity), 0), COALESCE(SUM(quantity), 0)
        INTO v_subtotal, v_total_items
        FROM public.store_cart_items
        WHERE cart_id = v_cart.cart_id AND quantity > 0;

        IF v_total_items = 0 THEN CONTINUE; END IF;

        -- Idempotency: check if already submitted
        SELECT id INTO v_intention_id
        FROM public.purchase_intentions
        WHERE cart_id = v_cart.cart_id LIMIT 1;

        IF v_intention_id IS NOT NULL THEN
            v_results := v_results || jsonb_build_object(
                'store_id', v_cart.store_id,
                'intention_id', v_intention_id,
                'already_submitted', true,
                'subtotal', v_subtotal,
                'total_items', v_total_items
            );
            v_store_count := v_store_count + 1;
            v_grand_total := v_grand_total + v_subtotal;
            v_grand_items := v_grand_items + v_total_items;
            CONTINUE;
        END IF;

        v_fee_amount := ROUND(v_subtotal * 0.03, 2);
        v_credits_cost := GREATEST(CEIL(v_fee_amount), 1);

        SELECT user_id INTO v_owner_id FROM public.merchant_stores WHERE id = v_cart.store_id;

        INSERT INTO public.purchase_intentions (
            cart_id, store_id, customer_name, customer_whatsapp, customer_email,
            customer_note, subtotal, total_items, status, checkout_mode, payment_status,
            source, credits_charged, visitor_id, platform_fee_percent, platform_fee_amount
        ) VALUES (
            v_cart.cart_id, v_cart.store_id, p_customer_name, p_customer_whatsapp, p_customer_email,
            p_customer_note, v_subtotal, v_total_items, 'new', p_checkout_mode, v_payment_status,
            'marketplace', v_credits_cost, p_visitor_id, 3, v_fee_amount
        ) RETURNING id INTO v_intention_id;

        INSERT INTO public.purchase_intention_items (
            intention_id, product_id, product_title, product_image_url,
            unit_price, quantity, subtotal, customer_note
        )
        SELECT
            v_intention_id, product_id, COALESCE(product_title, 'Produto'),
            product_image_url, product_price, quantity, product_price * quantity, customer_note
        FROM public.store_cart_items
        WHERE cart_id = v_cart.cart_id AND quantity > 0;

        UPDATE public.store_carts SET status = 'submitted', updated_at = now()
        WHERE id = v_cart.cart_id;

        -- Credit management
        INSERT INTO public.merchant_credit_balances (store_id, balance, total_earned, total_spent)
        VALUES (v_cart.store_id, 20, 20, 0)
        ON CONFLICT (store_id) DO NOTHING;

        UPDATE public.merchant_credit_balances
        SET balance = GREATEST(balance - v_credits_cost, 0),
            total_spent = total_spent + v_credits_cost, updated_at = now()
        WHERE store_id = v_cart.store_id RETURNING balance INTO v_balance;

        INSERT INTO public.merchant_credit_ledger (
            store_id, intention_id, credits, balance_after, reason, rule_applied
        ) VALUES (
            v_cart.store_id, v_intention_id, -v_credits_cost, COALESCE(v_balance, 0),
            'Taxa de intenção de compra qualificada (3%)',
            'Taxa: 3% sobre R$' || ROUND(v_subtotal, 2)
        );

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

        v_results := v_results || jsonb_build_object(
            'store_id', v_cart.store_id,
            'intention_id', v_intention_id,
            'subtotal', v_subtotal,
            'total_items', v_total_items,
            'credits_charged', v_credits_cost
        );
        v_store_count := v_store_count + 1;
        v_grand_total := v_grand_total + v_subtotal;
        v_grand_items := v_grand_items + v_total_items;
    END LOOP;

    IF v_store_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum carrinho ativo encontrado para esta sessão');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'total_stores', v_store_count,
        'total_items', v_grand_items,
        'grand_total', v_grand_total,
        'purchase_intentions', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
