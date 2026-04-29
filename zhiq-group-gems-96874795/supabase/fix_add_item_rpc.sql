-- FIX: Recria a RPC add_item_to_store_cart com suporte a produtos de lojas (merchant_marketing_products) e anúncios gerais (advertiser_listings)
-- Execute este arquivo no Supabase SQL Editor

DROP FUNCTION IF EXISTS public.add_item_to_store_cart(UUID, UUID, INTEGER, TEXT, TEXT);

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
    v_title TEXT;
    v_image TEXT;
    v_price_raw TEXT;
    v_price NUMERIC := 0;
    v_qty INTEGER;
BEGIN
    -- Get or create cart
    v_cart_id := public.get_or_create_store_cart(p_store_id, p_session_token);

    -- 1. Tentar achar o produto em merchant_marketing_products
    SELECT mmp.title, mmp.image_url, mmp.price_label
    INTO v_title, v_image, v_price_raw
    FROM public.merchant_marketing_products mmp
    WHERE mmp.id = p_product_id;

    -- 2. Se não achar, tentar em advertiser_listings
    IF v_title IS NULL THEN
        SELECT al.title, al.cover_image_url, al.price::TEXT
        INTO v_title, v_image, v_price_raw
        FROM public.advertiser_listings al
        WHERE al.id = p_product_id;
    END IF;

    IF v_title IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found in store or listings');
    END IF;

    -- Parse price
    v_price := COALESCE(
        NULLIF(
            regexp_replace(
                replace(COALESCE(v_price_raw, '0'), ',', '.'),
                '[^0-9.]', '', 'g'
            ), ''
        )::numeric,
        0
    );

    -- Check if item already in cart
    SELECT sci.id, sci.quantity INTO v_item_id, v_qty
    FROM public.store_cart_items sci
    WHERE sci.cart_id = v_cart_id AND sci.product_id = p_product_id;

    IF v_item_id IS NOT NULL THEN
        -- Update quantity
        UPDATE public.store_cart_items
        SET quantity = v_qty + p_quantity,
            customer_note = COALESCE(p_customer_note, customer_note),
            updated_at = now()
        WHERE id = v_item_id;
    ELSE
        -- Insert new item
        INSERT INTO public.store_cart_items (cart_id, product_id, product_title, product_image_url, product_price, quantity, customer_note, store_id)
        VALUES (v_cart_id, p_product_id, v_title, v_image, v_price, p_quantity, p_customer_note, p_store_id)
        RETURNING id INTO v_item_id;
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
