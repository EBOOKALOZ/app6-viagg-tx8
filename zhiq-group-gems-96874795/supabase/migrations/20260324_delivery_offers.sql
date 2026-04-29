-- ═══════════════════════════════════════
-- MIGRATION: 20260324_delivery_offers.sql
-- Sistema de Chamadas em Tempo Real (Ofertas)
-- ═══════════════════════════════════════

-- 1. Criar a tabela de ofertas
CREATE TABLE IF NOT EXISTS public.delivery_offers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
    motoboy_id uuid NOT NULL REFERENCES auth.users(id),
    store_id uuid NOT NULL REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
    
    sent_at timestamptz DEFAULT now(),
    viewed_at timestamptz,
    accepted_at timestamptz,
    rejected_at timestamptz,
    expires_at timestamptz,

    -- Snapshots operacionais para evitar joins pesados em realtime
    distance_km_snapshot numeric(10,2),
    estimated_price_snapshot numeric(10,2),
    pickup_address_snapshot text,
    dropoff_address_snapshot text,
    store_name_snapshot text,
    customer_name_snapshot text,
    notes_snapshot text,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Índices de performance
CREATE INDEX IF NOT EXISTS idx_delivery_offers_delivery_order ON public.delivery_offers(delivery_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_motoboy_status ON public.delivery_offers(motoboy_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_store ON public.delivery_offers(store_id);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_sent_at ON public.delivery_offers(sent_at);

-- 3. RLS
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;

-- Motoboy pode ver suas próprias ofertas
CREATE POLICY "Motoboys can view their own offers" ON public.delivery_offers
    FOR SELECT USING (auth.uid() = motoboy_id);

-- Lojista pode ver ofertas de suas ordens
CREATE POLICY "Merchants can view offers for their orders" ON public.delivery_offers
    FOR SELECT USING (auth.uid() = store_id);

-- 4. RPC: create_delivery_offers_for_order
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
BEGIN
    -- 1. Buscar a ordem
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Ordem não encontrada.');
    END IF;

    -- 2. Selecionar motoboys elegíveis (Aprovados e Online)
    -- Em produção, aqui entraria a lógica de raio KM via PostGIS.
    FOR v_motoboy IN 
        SELECT mp.user_id
        FROM public.motoboy_profiles mp
        WHERE mp.is_approved = true 
        AND mp.is_online = true
        -- LIMIT 10 -- Aumentado para garantir que o testador receba
    LOOP
        INSERT INTO public.delivery_offers (
            delivery_order_id,
            motoboy_id,
            store_id,
            distance_km_snapshot,
            estimated_price_snapshot,
            pickup_address_snapshot,
            dropoff_address_snapshot,
            store_name_snapshot,
            customer_name_snapshot,
            notes_snapshot,
            expires_at
        ) VALUES (
            v_order.id,
            v_motoboy.user_id,
            v_order.merchant_id,
            v_order.distance_km,
            v_order.total_price,
            v_order.pickup_location,
            v_order.destination,
            (SELECT nome_loja FROM public.merchant_stores WHERE user_id = v_order.merchant_id LIMIT 1),
            v_order.customer_name,
            v_order.order_description,
            now() + interval '5 minutes'
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END;
$$;

-- 5. RPC: accept_delivery_offer
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offer RECORD;
    v_order_status text;
BEGIN
    -- 1. Buscar e bloquear a oferta para escrita (FOR UPDATE)
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Oferta não encontrada.');
    END IF;

    IF v_offer.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Esta oferta não está mais disponível.');
    END IF;

    -- 2. Verificar se a ordem já foi aceita por outro
    SELECT status INTO v_order_status FROM public.service_orders WHERE id = v_offer.delivery_order_id FOR UPDATE;
    
    IF v_order_status <> 'searching' AND v_order_status <> 'pending' AND v_order_status <> 'calculating' AND v_order_status <> 'awaiting_professional' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Esta entrega já foi assumida por outro motoboy.');
    END IF;

    -- 3. Transação: Atualizar Ordem Principal
    UPDATE public.service_orders
    SET 
        courier_id = v_offer.motoboy_id,
        status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    WHERE id = v_offer.delivery_order_id;

    -- 4. Transação: Atualizar Oferta Aceita
    UPDATE public.delivery_offers
    SET 
        status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    WHERE id = p_offer_id;

    -- 5. Transação: Cancelar outras ofertas da mesma ordem
    UPDATE public.delivery_offers
    SET 
        status = 'cancelled',
        updated_at = now()
    WHERE delivery_order_id = v_offer.delivery_order_id
    AND id <> p_offer_id
    AND status = 'pending';

    RETURN jsonb_build_object('ok', true, 'delivery_order_id', v_offer.delivery_order_id);
END;
$$;

-- 6. RPC: reject_delivery_offer
CREATE OR REPLACE FUNCTION public.reject_delivery_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.delivery_offers
    SET 
        status = 'rejected',
        rejected_at = now(),
        updated_at = now()
    WHERE id = p_offer_id 
    AND motoboy_id = auth.uid();
    
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7. RPC: mark_delivery_offer_viewed
CREATE OR REPLACE FUNCTION public.mark_delivery_offer_viewed(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.delivery_offers
    SET 
        viewed_at = now(),
        updated_at = now()
    WHERE id = p_offer_id 
    AND motoboy_id = auth.uid()
    AND viewed_at IS NULL;
    
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Habilitar Realtime para a tabela de ofertas
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
