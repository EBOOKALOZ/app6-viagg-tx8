-- ═══════════════════════════════════════════════════════
-- FIX CART ALIGNMENT — Alinha submit_marketplace_order
-- com o schema real das tabelas store_carts/store_cart_items
-- ═══════════════════════════════════════════════════════

-- Dropar versão anterior (aceita qualquer assinatura)
DROP FUNCTION IF EXISTS public.submit_marketplace_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_marketplace_order(
    p_cart_id UUID,
    p_customer_name TEXT DEFAULT 'Cliente',
    p_customer_whatsapp TEXT DEFAULT '',
    p_customer_email TEXT DEFAULT NULL,
    p_customer_note TEXT DEFAULT NULL,
    p_checkout_mode TEXT DEFAULT 'in_store'
) RETURNS JSONB AS $$
DECLARE
    v_cart RECORD;
    v_intention_id UUID;
    v_subtotal NUMERIC := 0;
    v_total_items INTEGER := 0;
    v_store_id UUID;
    v_owner_id UUID;
BEGIN
    -- Buscar carrinho ativo (alinhado com get_or_create_store_cart que usa 'active')
    SELECT * INTO v_cart FROM public.store_carts WHERE id = p_cart_id AND status = 'active';
    IF v_cart.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart not found or already submitted');
    END IF;

    v_store_id := v_cart.store_id;

    -- Buscar dono da loja (para notificação)
    SELECT user_id INTO v_owner_id FROM public.merchant_stores WHERE id = v_store_id;

    -- Calcular totais usando os nomes reais das colunas
    SELECT COALESCE(SUM(product_price * quantity), 0), COALESCE(SUM(quantity), 0)
    INTO v_subtotal, v_total_items
    FROM public.store_cart_items WHERE cart_id = p_cart_id AND quantity > 0;

    IF v_total_items = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- Criar intenção de compra
    INSERT INTO public.purchase_intentions (
        cart_id, store_id, customer_name, customer_whatsapp, customer_email,
        customer_note, subtotal, total_items, status, checkout_mode, payment_status, source
    ) VALUES (
        p_cart_id, v_store_id, p_customer_name, p_customer_whatsapp, p_customer_email,
        p_customer_note, v_subtotal, v_total_items, 'new', p_checkout_mode, 'not_applicable', 'marketplace'
    ) RETURNING id INTO v_intention_id;

    -- Copiar itens do carrinho para a intenção (colunas reais)
    INSERT INTO public.purchase_intention_items (
        intention_id, product_id, product_title, product_image_url,
        unit_price, quantity, subtotal, customer_note
    )
    SELECT
        v_intention_id,
        product_id,
        COALESCE(product_title, 'Produto'),
        product_image_url,
        product_price,
        quantity,
        product_price * quantity,
        customer_note
    FROM public.store_cart_items
    WHERE cart_id = p_cart_id AND quantity > 0;

    -- Marcar carrinho como submetido
    UPDATE public.store_carts SET status = 'submitted', updated_at = now() WHERE id = p_cart_id;

    -- Notificação no sininho do lojista
    IF v_owner_id IS NOT NULL THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, is_read,
            source_module, severity, reference_type, reference_id, profile_type
        ) VALUES (
            v_owner_id,
            '🛒 Novo Pedido de ' || p_customer_name,
            v_total_items || ' item(s) - R$ ' || ROUND(v_subtotal, 2) || ' via Mercado Viagg-TX8',
            'purchase_intention', false,
            'marketplace', 'success', 'purchase_intention', v_intention_id, 'lojista'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'intention_id', v_intention_id,
        'store_id', v_store_id,
        'subtotal', v_subtotal,
        'total_items', v_total_items
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
