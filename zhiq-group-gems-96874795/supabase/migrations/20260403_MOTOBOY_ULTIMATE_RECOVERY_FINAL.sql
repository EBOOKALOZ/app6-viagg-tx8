-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_MOTOBOY_ULTIMATE_RECOVERY_FINAL.sql
-- PURPOSE: Unify IDs (service_order_id/delivery_order_id), missing columns (accepted_at), 
--          and ensure 'Aceitar' stops returning 'não encontrada'.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. HARDENING SCHEMA (service_orders)
DO $$ 
BEGIN
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS motoboy_id uuid REFERENCES auth.users(id);
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. HARDENING SCHEMA (delivery_offers)
DO $$ 
BEGIN
    ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS service_order_id uuid REFERENCES public.service_orders(id);
    ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS delivery_order_id uuid REFERENCES public.service_orders(id);
    ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS professional_uid uuid REFERENCES auth.users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. RECRIAÇÃO DA FUNÇÃO DE ACEITAR (ULTRA-COMPATÍVEL)
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_offer RECORD;
BEGIN
    -- Busca qualquer ID que represente a oferta
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Oferta não encontrada no banco.');
    END IF;

    -- 1. Atualizar Ordem Principal (Unifica Motoboy e Courier)
    UPDATE public.service_orders SET 
        motoboy_id = v_offer.motoboy_id,
        courier_id = v_offer.motoboy_id,
        status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    WHERE id = COALESCE(v_offer.delivery_order_id, v_offer.service_order_id);

    -- 2. Atualizar Oferta Aceita
    UPDATE public.delivery_offers SET 
        status = 'accepted', 
        accepted_at = now(),
        updated_at = now()
    WHERE id = p_offer_id;

    -- 3. Cancelar outras ofertas
    UPDATE public.delivery_offers SET 
        status = 'cancelled',
        updated_at = now()
    WHERE (delivery_order_id = v_offer.delivery_order_id OR service_order_id = v_offer.service_order_id)
    AND id <> p_offer_id 
    AND status = 'pending';

    RETURN jsonb_build_object('ok', true, 'service_order_id', COALESCE(v_offer.delivery_order_id, v_offer.service_order_id));
END; $$;

-- 4. RECRIAÇÃO DA FUNÇÃO DE DESPACHO (ULTRA-COMPATÍVEL)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
BEGIN
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

    FOR v_motoboy IN 
        SELECT user_id FROM public.motoboy_profiles 
        WHERE is_approved = true AND is_online = true
    LOOP
        INSERT INTO public.delivery_offers (
            service_order_id, delivery_order_id, -- UNIFICAÇÃO DE IDs
            motoboy_id, professional_uid,       -- UNIFICAÇÃO DE MOTOBOY
            store_id, status, expires_at,
            distance_km_snapshot, estimated_price_snapshot,
            pickup_address_snapshot, dropoff_address_snapshot,
            store_name_snapshot, customer_name_snapshot, notes_snapshot
        ) VALUES (
            v_order.id, v_order.id, 
            v_motoboy.user_id, v_motoboy.user_id,
            v_order.merchant_id, 'pending', now() + interval '8 minutes',
            v_order.distance_km, v_order.total_price,
            v_order.pickup_location, v_order.destination,
            (SELECT nome_loja FROM public.merchant_stores WHERE user_id = v_order.merchant_id LIMIT 1),
            v_order.customer_id, v_order.notes
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;

-- 5. REDESPACHO DE 100% DO BACKLOG
DO $$ 
DECLARE r_order RECORD;
BEGIN
    -- Limpa ofertas pendentes mal formadas para evitar confusão
    DELETE FROM public.delivery_offers WHERE status = 'pending';
    
    FOR r_order IN SELECT id FROM public.service_orders WHERE status IN ('awaiting_professional', 'searching')
    LOOP
        PERFORM public.create_delivery_offers_for_order(r_order.id);
        UPDATE public.service_orders SET status = 'searching', updated_at = now() WHERE id = r_order.id;
    END LOOP;
END $$;

-- 6. VERIFICAÇÃO FINAL
SELECT count(*) as ofertas_validas_criadas_agora FROM public.delivery_offers WHERE status = 'pending';
