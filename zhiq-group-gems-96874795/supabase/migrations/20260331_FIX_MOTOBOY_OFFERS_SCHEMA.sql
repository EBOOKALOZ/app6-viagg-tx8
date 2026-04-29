-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_FIX_MOTOBOY_OFFERS_SCHEMA.sql
-- V6: Sincronização de colunas para o Painel do Motoboy
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG '=== INICIANDO SYNC DE COLUNAS MOTOBOY (V6) ==='; END $$;

-- 1. ADICIONAR COLUNAS FALTANTES NA DELIVERY_OFFERS (Requisitadas pelo Frontend)
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS gross_value numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS net_value numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS pickup_distance_km numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS pickup_duration_min integer;

-- 2. RE-CRIAR create_delivery_offers_for_order (Versão Final Estável)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
    v_commission numeric;
BEGIN
    -- Obter detalhes da ordem original
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found'); 
    END IF;

    -- Localizar motoboys ativos (Online e Aprovados)
    FOR v_motoboy IN
        SELECT user_id FROM public.motoboy_profiles 
        WHERE is_approved = true AND is_online = true
    LOOP
        -- Obter comissão do motoboy do perfil dele (se existir)
        SELECT COALESCE(percentual_comissao_atual, 20) INTO v_commission 
        FROM public.profiles WHERE id = v_motoboy.user_id;

        -- Evitar duplicidade
        IF NOT EXISTS (
            SELECT 1 FROM public.delivery_offers
            WHERE delivery_order_id = v_order.id AND motoboy_id = v_motoboy.user_id
        ) THEN
            INSERT INTO public.delivery_offers (
                delivery_order_id, 
                motoboy_id, 
                professional_uid, 
                store_id,
                status, 
                expires_at, 
                pickup_address_snapshot, 
                dropoff_address_snapshot,
                total_price, 
                distance_km_snapshot,
                commission_percent,
                gross_value,
                net_value,
                pickup_distance_km,
                pickup_duration_min
            ) VALUES (
                v_order.id, 
                v_motoboy.user_id, 
                v_motoboy.user_id, 
                v_order.merchant_id,
                'open', -- CRÍTICO: Sempre 'open' para o motoboy visualizar
                now() + interval '10 minutes',
                COALESCE(v_order.pickup_location, 'Retirada na Loja'), 
                COALESCE(v_order.destination, 'Entrega no Cliente'),
                v_order.total_price, 
                v_order.distance_km,
                v_commission,
                v_order.total_price,
                v_order.total_price * (1 - v_commission / 100),
                COALESCE(v_order.pickup_distance_km, 0),
                COALESCE(v_order.pickup_estimated_minutes, 0)
            );
            v_offer_count := v_offer_count + 1;
        END IF;
    END LOOP;

    -- Log de evento
    INSERT INTO public.system_events_log (event_type, payload)
    VALUES ('dispatch_v6_final', jsonb_build_object(
        'order_id', p_delivery_order_id, 
        'offers_created', v_offer_count
    ));

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;

DO $$ BEGIN RAISE LOG '=== SYNC DE COLUNAS MOTOBOY (V6) COMPLETO ==='; END $$;
