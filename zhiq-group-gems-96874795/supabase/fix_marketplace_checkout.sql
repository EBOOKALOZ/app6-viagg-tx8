-- ═══════════════════════════════════════════════════════
-- FIX MARKETPLACE CHECKOUT — Versão FINAL corrigida
-- Rodar tudo de uma vez no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Recriar tabelas limpas (sem constraints problemáticas)
DROP TABLE IF EXISTS public.purchase_intention_items CASCADE;
DROP TABLE IF EXISTS public.purchase_intentions CASCADE;

CREATE TABLE public.purchase_intentions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cart_id UUID,
    store_id UUID NOT NULL,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_whatsapp TEXT NOT NULL DEFAULT '',
    customer_email TEXT,
    customer_note TEXT,
    subtotal NUMERIC DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    source TEXT DEFAULT 'marketplace',
    checkout_mode TEXT DEFAULT 'in_store',
    payment_status TEXT DEFAULT 'not_applicable',
    credits_charged INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.purchase_intention_items (
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

-- 2. RLS aberta (sem referência a profiles.role)
ALTER TABLE public.purchase_intentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_all" ON public.purchase_intentions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.purchase_intention_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pii_all" ON public.purchase_intention_items FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.purchase_intentions TO authenticated;
GRANT ALL ON public.purchase_intention_items TO authenticated;

-- 3. RPC — cria purchase_intention + notificação no sininho
-- NOTA: reference_id é UUID (sem ::text)
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
    -- Buscar carrinho aberto
    SELECT * INTO v_cart FROM public.store_carts WHERE id = p_cart_id AND status = 'open';
    IF v_cart.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart not found or already submitted');
    END IF;

    v_store_id := v_cart.store_id;

    -- Buscar dono da loja (para notificação)
    SELECT user_id INTO v_owner_id FROM public.merchant_stores WHERE id = v_store_id;

    -- Calcular totais
    SELECT COALESCE(SUM(unit_price * quantity), 0), COALESCE(SUM(quantity), 0)
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

    -- Copiar itens do carrinho para a intenção
    INSERT INTO public.purchase_intention_items (
        intention_id, product_id, product_title, product_image_url,
        unit_price, quantity, subtotal, customer_note
    )
    SELECT
        v_intention_id,
        product_id,
        COALESCE((product_snapshot->>'title')::text, 'Produto'),
        (product_snapshot->>'image_url')::text,
        unit_price,
        quantity,
        unit_price * quantity,
        customer_note
    FROM public.store_cart_items
    WHERE cart_id = p_cart_id AND quantity > 0;

    -- Marcar carrinho como submetido
    UPDATE public.store_carts SET status = 'submitted', updated_at = now() WHERE id = p_cart_id;

    -- Notificação no sininho do lojista (reference_id é UUID, sem cast para text)
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

-- ═══════════════════════════════════════════════════════
-- TESTE: Após rodar tudo acima, teste com:
--
-- SELECT public.submit_marketplace_order(
--   'COLE_UM_CART_ID_AQUI'::uuid,
--   'Teste Cliente',
--   '11999999999'
-- );
--
-- Depois verifique:
-- SELECT * FROM purchase_intentions;
-- SELECT * FROM purchase_intention_items;
-- ═══════════════════════════════════════════════════════
