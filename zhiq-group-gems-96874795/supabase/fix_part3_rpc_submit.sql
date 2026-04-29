-- ═══ PARTE 3/3: RPC submit_purchase_intention ═══
-- Cole e rode esta parte depois da PARTE 2

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

    SELECT id INTO v_existing_intention FROM public.purchase_intentions WHERE cart_id = p_cart_id LIMIT 1;
    IF v_existing_intention IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'intention_id', v_existing_intention, 'already_submitted', true);
    END IF;

    v_store_id := v_cart.store_id;

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
