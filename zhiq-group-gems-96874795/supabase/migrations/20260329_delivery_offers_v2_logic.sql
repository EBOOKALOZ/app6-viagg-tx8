-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260329_delivery_offers_v2_logic.sql
-- Motoboy Call Flow V2: Robust Diagnostics & Atomic Acceptance
-- ═══════════════════════════════════════════════════════════════

-- 1. Auditar tabela: Garantir coluna responded_at
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- 2. Refinar create_delivery_offers_for_order (TTL 120s para teste)
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
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Ordem não encontrada.');
    END IF;

    FOR v_motoboy IN 
        SELECT mp.user_id
        FROM public.motoboy_profiles mp
        WHERE mp.is_approved = true 
        AND mp.is_online = true
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
            now() + interval '120 seconds' -- TTL aumentado para 120s conforme solicitado para testes
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END;
$$;

-- 3. RPC: accept_delivery_offer_v2
CREATE OR REPLACE FUNCTION public.accept_delivery_offer_v2(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offer RECORD;
    v_order_status text;
BEGIN
    -- 1. Buscar a oferta com lock
    SELECT * INTO v_offer 
    FROM public.delivery_offers 
    WHERE id = p_offer_id 
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OFFER_NOT_FOUND', 'reason', 'Oferta não encontrada no banco.');
    END IF;

    -- 2. Registrar tentativa de resposta (imediato)
    UPDATE public.delivery_offers 
    SET responded_at = now() 
    WHERE id = p_offer_id;

    -- 3. Validar Expiração
    IF v_offer.expires_at < now() THEN
        UPDATE public.delivery_offers SET status = 'expired' WHERE id = p_offer_id;
        RETURN jsonb_build_object('ok', false, 'code', 'OFFER_EXPIRED', 'reason', 'Esta oferta expirou há pouco.');
    END IF;

    -- 4. Validar Status Interno
    IF v_offer.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'reason', 'Oferta inválida para aceite (Status: ' || v_offer.status || ').');
    END IF;

    -- 5. Verificar a Ordem Principal (Concorrência)
    SELECT status INTO v_order_status 
    FROM public.service_orders 
    WHERE id = v_offer.delivery_order_id 
    FOR UPDATE;
    
    IF v_order_status <> 'searching' AND v_order_status <> 'pending' AND v_order_status <> 'calculating' AND v_order_status <> 'awaiting_professional' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'LOST_RACE', 'reason', 'Esta entrega já foi assumida por outro motoboy.');
    END IF;

    -- 6. Transação Atômica: Aceite
    UPDATE public.service_orders
    SET 
        courier_id = v_offer.motoboy_id,
        status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    WHERE id = v_offer.delivery_order_id;

    UPDATE public.delivery_offers
    SET 
        status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    WHERE id = p_offer_id;

    -- 7. Invalidar competidores
    UPDATE public.delivery_offers
    SET 
        status = 'cancelled',
        updated_at = now()
    WHERE delivery_order_id = v_offer.delivery_order_id
    AND id <> p_offer_id
    AND status = 'pending';

    RETURN jsonb_build_object(
        'ok', true, 
        'code', 'ACCEPTED', 
        'delivery_order_id', v_offer.delivery_order_id,
        'reason', 'Entrega aceita com sucesso!'
    );
END;
$$;

-- 4. RPC: reject_delivery_offer_v2
CREATE OR REPLACE FUNCTION public.reject_delivery_offer_v2(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offer RECORD;
BEGIN
    -- Identificar a oferta
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OFFER_NOT_FOUND', 'reason', 'Oferta não encontrada.');
    END IF;

    IF v_offer.motoboy_id <> auth.uid() THEN
        RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'reason', 'Tentativa de rejeitar oferta de outro usuário.');
    END IF;

    -- Atualizar
    UPDATE public.delivery_offers
    SET 
        status = 'rejected',
        rejected_at = now(),
        responded_at = now(),
        updated_at = now()
    WHERE id = p_offer_id;
    
    RETURN jsonb_build_object('ok', true, 'code', 'REJECTED', 'reason', 'Oferta recusada com sucesso.');
END;
$$;
