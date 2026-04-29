-- ═══ PARTE 2/3: RPC get_global_cart_data ═══
-- Cole e rode esta parte depois da PARTE 1

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
