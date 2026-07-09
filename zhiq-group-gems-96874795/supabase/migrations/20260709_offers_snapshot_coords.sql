-- ============================================================
-- OFERTAS COM COORDENADAS REAIS + NOME CERTO NA CHAMADA DE CLIENTE
-- 2026-07-09
--
-- Problemas vistos no card "Avaliar Corrida":
--  1. O criador de ofertas vivo não gravava lat/lng → o mapa de avaliação
--     não tinha os pontos reais de coleta/entrega.
--  2. Chamada de CLIENTE que também tem loja cadastrada aparecia como
--     "retirada na loja" (nome/endereço da loja) — mas a corrida não é da
--     loja; é do ponto marcado no mapa.
--
-- Fix: recria create_delivery_offers_for_order(uuid) — MESMA lógica viva
-- (loop aprovados+online, snapshots, 8 min) — adicionando:
--  • snapshots de coordenadas (pickup/dropoff) vindos da service_orders;
--  • detecção de chamada de cliente (payer_uid = merchant_id) → NÃO usa
--    nome da loja; usa o store_name da corrida (= nome do cliente).
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- Garante as colunas de snapshot (existem na maioria das cópias; IF NOT EXISTS
-- cobre drift)
ALTER TABLE public.delivery_offers
  ADD COLUMN IF NOT EXISTS pickup_lat_snapshot  double precision,
  ADD COLUMN IF NOT EXISTS pickup_lng_snapshot  double precision,
  ADD COLUMN IF NOT EXISTS dropoff_lat_snapshot double precision,
  ADD COLUMN IF NOT EXISTS dropoff_lng_snapshot double precision;

CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
    v_is_customer boolean;
    v_store_name text;
BEGIN
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

    -- Chamada de CLIENTE (fluxo "chamar motoboy"): payer_uid = merchant_id.
    v_is_customer := (v_order.payer_uid IS NOT NULL AND v_order.payer_uid = v_order.merchant_id);

    -- Nome exibido: o da corrida (cliente) tem prioridade; só cai na loja
    -- quando NÃO é chamada de cliente.
    v_store_name := COALESCE(
        NULLIF(TRIM(v_order.store_name), ''),
        CASE WHEN v_is_customer THEN NULL
             ELSE (SELECT nome_loja FROM public.merchant_stores
                    WHERE user_id = v_order.merchant_id LIMIT 1) END);

    FOR v_motoboy IN
        SELECT user_id FROM public.motoboy_profiles
        WHERE is_approved = true AND is_online = true
    LOOP
        INSERT INTO public.delivery_offers (
            service_order_id, delivery_order_id,
            motoboy_id, professional_uid,
            store_id, status, expires_at,
            distance_km_snapshot, estimated_price_snapshot,
            pickup_address_snapshot, dropoff_address_snapshot,
            store_name_snapshot, customer_name_snapshot, notes_snapshot,
            pickup_lat_snapshot, pickup_lng_snapshot,
            dropoff_lat_snapshot, dropoff_lng_snapshot
        ) VALUES (
            v_order.id, v_order.id,
            v_motoboy.user_id, v_motoboy.user_id,
            v_order.merchant_id, 'pending', now() + interval '8 minutes',
            v_order.distance_km, v_order.total_price,
            v_order.pickup_location, v_order.destination,
            v_store_name, v_order.customer_id, v_order.notes,
            v_order.pickup_lat, v_order.pickup_lng,
            v_order.destination_lat, v_order.destination_lng
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;
