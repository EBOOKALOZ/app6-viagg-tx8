-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_cleanup_old_offers_and_fix_dispatch.sql
-- PRIORIDADE: Cancelar offers antigas que interferem no áudio
-- ═══════════════════════════════════════════════════════════════

-- ── 1. LIMPEZA IMEDIATA: cancelar TODAS as offers pendentes antigas ──
UPDATE public.delivery_offers
SET status = 'cancelled', expires_at = now()
WHERE status IN ('pending', 'open')
  AND created_at < now() - interval '5 minutes';

-- ── 2. Atualizar create_delivery_offers_for_order ──
-- Adiciona cancelamento de offers de outros pedidos ANTES de criar nova
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_order        RECORD;
    v_motoboy      RECORD;
    v_offer_count  integer := 0;
    v_commission   numeric := 20;
    v_store_name   text;
    v_net_value    numeric;
    v_dest_address text;
BEGIN
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found'); END IF;

    -- Nome da loja
    v_store_name := v_order.store_name;
    IF v_store_name IS NULL OR v_store_name = '' THEN
        SELECT nome_loja INTO v_store_name FROM public.merchant_stores
        WHERE user_id = v_order.merchant_id LIMIT 1;
    END IF;
    v_store_name := COALESCE(v_store_name, 'Loja Parceira');

    -- Endereço de entrega: evitar coordenadas brutas
    -- Se destination começa com '-' e tem vírgula, provavelmente são coordenadas
    v_dest_address := v_order.destination;
    IF v_dest_address IS NOT NULL AND v_dest_address ~ '^-?[0-9]+\.[0-9]+,\s*-?[0-9]+\.[0-9]+$' THEN
        v_dest_address := NULL; -- Não usar coordenadas brutas como endereço
    END IF;
    v_dest_address := COALESCE(NULLIF(TRIM(v_dest_address), ''), 'Entrega no Cliente');

    FOR v_motoboy IN
        SELECT user_id FROM public.motoboy_profiles WHERE is_approved = true AND is_online = true
    LOOP
        -- ► CANCELAR OFFERS ANTIGAS de OUTROS pedidos para este motoboy
        -- Garante que o motoboy só veja 1 chamada por vez (a mais recente)
        UPDATE public.delivery_offers
        SET status = 'cancelled', expires_at = now()
        WHERE motoboy_id = v_motoboy.user_id
          AND delivery_order_id != v_order.id
          AND status IN ('pending', 'open');

        -- Comissão
        BEGIN
            SELECT COALESCE(percentual_comissao_atual, 20) INTO v_commission
            FROM public.profiles WHERE id = v_motoboy.user_id;
        EXCEPTION WHEN OTHERS THEN v_commission := 20; END;

        v_net_value := COALESCE(v_order.total_price, 0) * (1.0 - v_commission / 100.0);

        -- Evitar duplicata
        IF NOT EXISTS (
            SELECT 1 FROM public.delivery_offers
            WHERE delivery_order_id = v_order.id
              AND motoboy_id = v_motoboy.user_id
              AND status IN ('pending', 'open')
        ) THEN
            INSERT INTO public.delivery_offers (
                service_order_id, delivery_order_id, motoboy_id, professional_uid, store_id,
                status, expires_at,
                pickup_address_snapshot, dropoff_address_snapshot, store_name_snapshot,
                pickup_lat_snapshot, pickup_lng_snapshot, dropoff_lat_snapshot, dropoff_lng_snapshot,
                total_price, estimated_price_snapshot, distance_km_snapshot,
                commission_percent, gross_value, net_value
            ) VALUES (
                v_order.id, v_order.id, v_motoboy.user_id, v_motoboy.user_id, v_order.merchant_id,
                'pending', now() + interval '10 minutes',
                COALESCE(NULLIF(TRIM(v_order.pickup_location), ''), v_order.store_address, 'Coleta na Loja'),
                v_dest_address,
                v_store_name,
                v_order.pickup_lat, v_order.pickup_lng,
                v_order.destination_lat, v_order.destination_lng,
                v_order.total_price, v_order.total_price, v_order.distance_km,
                v_commission, v_order.total_price, v_net_value
            );
            v_offer_count := v_offer_count + 1;
        END IF;
    END LOOP;

    BEGIN
        INSERT INTO public.system_events_log (event_type, payload)
        VALUES ('dispatch_v11', jsonb_build_object(
            'order_id', p_delivery_order_id,
            'offers_sent', v_offer_count,
            'store', v_store_name,
            'dest_addr', v_dest_address
        ));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count, 'store', v_store_name);
END;
$$;

-- ── 3. Confirmar quantas offers ativas restam ──
SELECT motoboy_id, COUNT(*) as qtd_ativas
FROM public.delivery_offers
WHERE status IN ('pending', 'open') AND expires_at > now()
GROUP BY motoboy_id;
