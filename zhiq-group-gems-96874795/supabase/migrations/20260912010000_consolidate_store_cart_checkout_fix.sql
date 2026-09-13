-- ============================================================================
-- CONSOLIDAÇÃO: correção do fluxo de compra / Cesta do vendedor
-- Substitui as 7 migrations 20260912000000..06 (untracked) por uma única,
-- idempotente, sem bloco DEBUG e alinhada ao schema REAL do banco.
--
-- CAUSA RAIZ (bug "a Cesta não recebe pedidos / não notifica"):
--   A migration 20260719_fase2_menor_privilegio revogou EXECUTE ... FROM PUBLIC
--   das 4 RPCs do fluxo de compra (add_item_to_store_cart, update_store_cart_item,
--   submit_purchase_intention, submit_multi_store_intention). Como as funções
--   nunca tiveram GRANT explícito a `authenticated`, TODOS os compradores
--   (logados e anônimos) perderam acesso → nenhuma purchase_intention é criada
--   → a Cesta fica vazia e nenhuma notificação é disparada.
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Recria as funções do fluxo na versão correta (schema available_credits /
--      merchant_credit_ledger novo), status de carrinho: 'open' (único valor de carrinho vivo aceito pelo CHECK store_carts_status_check); antes tentava
--      ('active','open') para eliminar a inconsistência do get_or_create ('open')
--      vs. get_global_cart_data ('active').
--   2. Re-concede EXECUTE a authenticated e anon para todo o fluxo de compra.
--
-- Schema real confirmado via src/integrations/supabase/types.ts:
--   merchant_credit_balances: available_credits, reserved_credits, consumed_credits
--   merchant_credit_ledger:   store_id, entry_type, amount, balance_before,
--                             balance_after, reason_code, description, metadata
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. get_or_create_store_cart — race-safe + adoção do carrinho anônimo.
--    Cria carrinhos como 'open' (único status de carrinho vivo aceito pelo
--    CHECK store_carts_status_check). Correção: antes gravava 'active' (inválido).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_store_cart(
    p_store_id UUID,
    p_session_token TEXT
) RETURNS UUID AS $$
DECLARE
    v_cart_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT id INTO v_cart_id
    FROM public.store_carts
    WHERE store_id = p_store_id
      AND (
          (p_session_token IS NOT NULL AND session_token = p_session_token)
          OR (v_user_id IS NOT NULL AND user_id = v_user_id)
      )
      AND status = 'open'
    ORDER BY (user_id IS NOT NULL) DESC, created_at DESC
    LIMIT 1;

    -- Adoção: atrela o usuário logado a um carrinho anônimo existente.
    IF v_cart_id IS NOT NULL AND v_user_id IS NOT NULL THEN
        UPDATE public.store_carts SET user_id = v_user_id
        WHERE id = v_cart_id AND user_id IS NULL;
    END IF;

    IF v_cart_id IS NULL THEN
        BEGIN
            INSERT INTO public.store_carts (store_id, user_id, session_token, status)
            VALUES (p_store_id, v_user_id, p_session_token, 'open')
            RETURNING id INTO v_cart_id;
        EXCEPTION WHEN unique_violation THEN
            SELECT id INTO v_cart_id
            FROM public.store_carts
            WHERE store_id = p_store_id AND session_token = p_session_token
              AND status = 'open'
            LIMIT 1;
        END;
    END IF;

    RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. add_item_to_store_cart — inclui store_id (NOT NULL), busca o produto em
--    merchant_marketing_products e depois advertiser_listings. Versão
--    SELECT-then-UPSERT segura (não depende de constraint UNIQUE existir).
-- ─────────────────────────────────────────────────────────────────────────
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
    v_qty INTEGER;
    v_title TEXT;
    v_image TEXT;
    v_price_raw TEXT;
    v_price NUMERIC := 0;
BEGIN
    v_cart_id := public.get_or_create_store_cart(p_store_id, p_session_token);

    SELECT mmp.title, mmp.image_url, mmp.price_label
    INTO v_title, v_image, v_price_raw
    FROM public.merchant_marketing_products mmp
    WHERE mmp.id = p_product_id;

    IF v_title IS NULL THEN
        SELECT al.title, al.cover_image_url, al.price::TEXT
        INTO v_title, v_image, v_price_raw
        FROM public.advertiser_listings al
        WHERE al.id = p_product_id;
    END IF;

    IF v_title IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found in store or listings');
    END IF;

    v_price := COALESCE(
        NULLIF(regexp_replace(replace(COALESCE(v_price_raw, '0'), ',', '.'), '[^0-9.]', '', 'g'), '')::numeric,
        0
    );

    SELECT sci.id, sci.quantity INTO v_item_id, v_qty
    FROM public.store_cart_items sci
    WHERE sci.cart_id = v_cart_id AND sci.product_id = p_product_id;

    IF v_item_id IS NOT NULL THEN
        UPDATE public.store_cart_items
        SET quantity = v_qty + p_quantity,
            customer_note = COALESCE(p_customer_note, customer_note),
            updated_at = now()
        WHERE id = v_item_id;
    ELSE
        INSERT INTO public.store_cart_items
            (cart_id, product_id, product_title, product_image_url, product_price, quantity, customer_note, store_id)
        VALUES
            (v_cart_id, p_product_id, v_title, v_image, v_price, p_quantity, p_customer_note, p_store_id)
        RETURNING id INTO v_item_id;
    END IF;

    UPDATE public.store_carts SET updated_at = now() WHERE id = v_cart_id;

    RETURN jsonb_build_object('success', true, 'cart_id', v_cart_id, 'item_id', v_item_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. get_global_cart_data — leitura do carrinho global (drawer).
--    Lê carrinhos 'open' e também os do próprio usuário logado.
-- ─────────────────────────────────────────────────────────────────────────
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
    v_user_id UUID := auth.uid();
BEGIN
    FOR v_cart IN
        SELECT sc.id AS cart_id, sc.store_id, ms.user_id
        FROM public.store_carts sc
        LEFT JOIN public.merchant_stores ms ON ms.id = sc.store_id
        WHERE (sc.session_token = p_session_token OR (v_user_id IS NOT NULL AND sc.user_id = v_user_id))
              AND sc.status = 'open'
              AND EXISTS (SELECT 1 FROM public.store_cart_items sci WHERE sci.cart_id = sc.id AND sci.quantity > 0)
    LOOP
        v_store_name := 'Loja'; v_store_logo := NULL;
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

        SELECT jsonb_agg(jsonb_build_object(
            'item_id', sci.id, 'product_id', sci.product_id,
            'product_title', COALESCE(sci.product_title, 'Produto'),
            'product_image_url', sci.product_image_url,
            'product_price', COALESCE(sci.product_price, 0),
            'quantity', sci.quantity, 'customer_note', sci.customer_note,
            'item_subtotal', COALESCE(sci.product_price, 0) * sci.quantity
        ) ORDER BY sci.created_at)
        INTO v_items
        FROM public.store_cart_items sci
        WHERE sci.cart_id = v_cart.cart_id AND sci.quantity > 0;

        SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(product_price * quantity), 0)
        INTO v_total_items, v_subtotal
        FROM public.store_cart_items sci
        WHERE sci.cart_id = v_cart.cart_id AND sci.quantity > 0;

        v_groups := v_groups || jsonb_build_object(
            'cart_id', v_cart.cart_id, 'store_id', v_cart.store_id,
            'store_name', v_store_name, 'store_logo', v_store_logo,
            'total_items', v_total_items, 'subtotal', v_subtotal,
            'items', COALESCE(v_items, '[]'::jsonb)
        );
    END LOOP;

    RETURN v_groups;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. submit_multi_store_intention — checkout do carrinho global (marketplace).
--    Schema Wallet Core (available_credits) + ledger novo. SEM bloco DEBUG.
-- ─────────────────────────────────────────────────────────────────────────
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
    v_balance_before INTEGER;
    v_balance_after INTEGER;
    v_results JSONB := '[]'::jsonb;
    v_store_count INTEGER := 0;
    v_grand_total NUMERIC := 0;
    v_grand_items INTEGER := 0;
    v_user_id UUID := auth.uid();
BEGIN
    v_payment_status := CASE WHEN p_checkout_mode = 'online_payment' THEN 'pending' ELSE 'not_applicable' END;

    FOR v_cart IN
        SELECT sc.id AS cart_id, sc.store_id
        FROM public.store_carts sc
        WHERE (sc.session_token = p_session_token OR (v_user_id IS NOT NULL AND sc.user_id = v_user_id))
              AND sc.status = 'open'
              AND EXISTS (SELECT 1 FROM public.store_cart_items sci WHERE sci.cart_id = sc.id AND sci.quantity > 0)
    LOOP
        SELECT COALESCE(SUM(product_price * quantity), 0), COALESCE(SUM(quantity), 0)
        INTO v_subtotal, v_total_items
        FROM public.store_cart_items WHERE cart_id = v_cart.cart_id AND quantity > 0;

        IF v_total_items = 0 THEN CONTINUE; END IF;

        -- Idempotência: se já existe intenção para este carrinho, reaproveita.
        SELECT id INTO v_intention_id FROM public.purchase_intentions WHERE cart_id = v_cart.cart_id LIMIT 1;
        IF v_intention_id IS NOT NULL THEN
            v_results := v_results || jsonb_build_object('store_id', v_cart.store_id, 'intention_id', v_intention_id,
                'already_submitted', true, 'subtotal', v_subtotal, 'total_items', v_total_items);
            v_store_count := v_store_count + 1; v_grand_total := v_grand_total + v_subtotal; v_grand_items := v_grand_items + v_total_items;
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
            intention_id, product_id, product_title, product_image_url, unit_price, quantity, subtotal, customer_note
        )
        SELECT v_intention_id, product_id, COALESCE(product_title, 'Produto'), product_image_url,
               product_price, quantity, product_price * quantity, customer_note
        FROM public.store_cart_items WHERE cart_id = v_cart.cart_id AND quantity > 0;

        UPDATE public.store_carts SET status = 'submitted', updated_at = now() WHERE id = v_cart.cart_id;

        -- Débito de crédito (Wallet Core: available_credits / consumed_credits)
        SELECT available_credits INTO v_balance_before
        FROM public.merchant_credit_balances WHERE store_id = v_cart.store_id;
        IF NOT FOUND THEN
            v_balance_before := 20;
            INSERT INTO public.merchant_credit_balances (store_id, available_credits, reserved_credits, consumed_credits)
            VALUES (v_cart.store_id, 20, 0, 0);
        END IF;
        v_balance_after := GREATEST(v_balance_before - v_credits_cost, 0);
        UPDATE public.merchant_credit_balances
        SET available_credits = v_balance_after,
            consumed_credits = COALESCE(consumed_credits, 0) + v_credits_cost, updated_at = now()
        WHERE store_id = v_cart.store_id;

        INSERT INTO public.merchant_credit_ledger (
            store_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata
        ) VALUES (
            v_cart.store_id, 'debit', v_credits_cost, v_balance_before, v_balance_after,
            'purchase_intention_fee', 'Taxa de intenção de compra: 3% sobre R$ ' || ROUND(v_subtotal, 2),
            jsonb_build_object('intention_id', v_intention_id)
        );

        IF v_owner_id IS NOT NULL THEN
            INSERT INTO public.user_notifications (
                user_id, title, message, type, is_read, source_module, severity, reference_type, reference_id, profile_type
            ) VALUES (
                v_owner_id, '🛒 Nova Intenção de Compra de ' || p_customer_name,
                v_total_items || ' item(s) - R$ ' || ROUND(v_subtotal, 2) || ' via Mercado Viagg-TX8',
                'purchase_intention', false, 'cesta1', 'success', 'purchase_intention', v_intention_id, 'lojista'
            );
        END IF;

        v_results := v_results || jsonb_build_object('store_id', v_cart.store_id, 'intention_id', v_intention_id,
            'subtotal', v_subtotal, 'total_items', v_total_items, 'credits_charged', v_credits_cost);
        v_store_count := v_store_count + 1; v_grand_total := v_grand_total + v_subtotal; v_grand_items := v_grand_items + v_total_items;
    END LOOP;

    IF v_store_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum carrinho ativo encontrado para esta sessão');
    END IF;

    RETURN jsonb_build_object('success', true, 'total_stores', v_store_count,
        'total_items', v_grand_items, 'grand_total', v_grand_total, 'purchase_intentions', v_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. submit_purchase_intention — checkout de loja individual (StoreCart).
--    Schema Wallet Core (available_credits) + ledger novo.
-- ─────────────────────────────────────────────────────────────────────────
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
    v_balance_before INTEGER;
    v_balance_after INTEGER;
    v_payment_status TEXT;
    v_owner_id UUID;
BEGIN
    SELECT * INTO v_cart FROM public.store_carts WHERE id = p_cart_id AND status = 'open';
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

    v_fee_amount := ROUND(v_subtotal * 0.03, 2);
    v_credits_cost := GREATEST(CEIL(v_fee_amount), 1);
    v_payment_status := CASE WHEN p_checkout_mode = 'online_payment' THEN 'pending' ELSE 'not_applicable' END;

    -- Idempotência
    SELECT id INTO v_intention_id FROM public.purchase_intentions WHERE cart_id = p_cart_id LIMIT 1;
    IF v_intention_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'intention_id', v_intention_id, 'already_submitted', true,
            'subtotal', v_subtotal, 'total_items', v_total_items);
    END IF;

    INSERT INTO public.purchase_intentions (
        cart_id, store_id, customer_name, customer_whatsapp, customer_email,
        customer_note, subtotal, total_items, status, checkout_mode, payment_status,
        source, credits_charged, visitor_id, platform_fee_percent, platform_fee_amount
    ) VALUES (
        p_cart_id, v_store_id, p_customer_name, p_customer_whatsapp, p_customer_email,
        p_customer_note, v_subtotal, v_total_items, 'new', p_checkout_mode, v_payment_status,
        'store', v_credits_cost, p_visitor_id, 3, v_fee_amount
    ) RETURNING id INTO v_intention_id;

    INSERT INTO public.purchase_intention_items (
        intention_id, product_id, product_title, product_image_url, unit_price, quantity, subtotal, customer_note
    )
    SELECT v_intention_id, product_id, product_title, product_image_url,
           product_price, quantity, product_price * quantity, customer_note
    FROM public.store_cart_items WHERE cart_id = p_cart_id AND quantity > 0;

    UPDATE public.store_carts SET status = 'submitted', updated_at = now() WHERE id = p_cart_id;

    SELECT available_credits INTO v_balance_before
    FROM public.merchant_credit_balances WHERE store_id = v_store_id;
    IF NOT FOUND THEN
        v_balance_before := 20;
        INSERT INTO public.merchant_credit_balances (store_id, available_credits, reserved_credits, consumed_credits)
        VALUES (v_store_id, 20, 0, 0);
    END IF;
    v_balance_after := GREATEST(v_balance_before - v_credits_cost, 0);
    UPDATE public.merchant_credit_balances
    SET available_credits = v_balance_after,
        consumed_credits = COALESCE(consumed_credits, 0) + v_credits_cost, updated_at = now()
    WHERE store_id = v_store_id;

    INSERT INTO public.merchant_credit_ledger (
        store_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata
    ) VALUES (
        v_store_id, 'debit', v_credits_cost, v_balance_before, v_balance_after,
        'purchase_intention_fee', 'Taxa de intenção de compra: 3% sobre R$ ' || ROUND(v_subtotal, 2),
        jsonb_build_object('intention_id', v_intention_id)
    );

    IF v_owner_id IS NOT NULL THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, is_read, source_module, severity, reference_type, reference_id, profile_type
        ) VALUES (
            v_owner_id, '🛒 Nova Intenção de Compra de ' || p_customer_name,
            v_total_items || ' item(s) - R$ ' || ROUND(v_subtotal, 2) || ' via Loja Viagg-TX8',
            'purchase_intention', false, 'cesta1', 'success', 'purchase_intention', v_intention_id, 'lojista'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'intention_id', v_intention_id,
        'subtotal', v_subtotal, 'total_items', v_total_items, 'credits_charged', v_credits_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. GRANTS — re-concede EXECUTE de TODO o fluxo de compra a authenticated e anon.
--    (Corrige o REVOKE ... FROM PUBLIC de 20260719_fase2_menor_privilegio.)
-- ─────────────────────────────────────────────────────────────────────────
DO $grants$
DECLARE fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.get_or_create_store_cart(uuid, text)',
        'public.add_item_to_store_cart(uuid, uuid, integer, text, text)',
        'public.update_store_cart_item(uuid, integer, text)',
        'public.remove_item_from_store_cart(uuid, text)',
        'public.clear_store_cart(uuid)',
        'public.get_global_cart_data(text)',
        'public.submit_multi_store_intention(text, text, text, text, text, text, uuid)',
        'public.submit_purchase_intention(uuid, text, text, text, text, text, uuid)'
    ]
    LOOP
        BEGIN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', fn);
        EXCEPTION WHEN undefined_function OR undefined_object THEN
            RAISE WARNING 'grant ignorado (função ausente): %', fn;
        END;
    END LOOP;
END $grants$;
