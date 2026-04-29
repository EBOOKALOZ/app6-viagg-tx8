-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_FIX_SERVICE_ORDERS_FINAL_V2.sql
-- FIX: Missing columns and status alignment for motoboy offers
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG '=== STARTING SCHEMA ALIGNMENT FIX ==='; END $$;

-- 1. ADICIONAR COLUNAS FALTANTES NA SERVICE_ORDERS
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS pickup_location text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS destination text;

-- 2. RE-CRIAR RPC create_delivery_order (Garantindo sincronia com o Frontend)
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_store_id uuid,
  pickup_lat double precision,
  pickup_lng double precision,
  drop_lat double precision,
  drop_lng double precision,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_estimated_value numeric DEFAULT 0,
  p_distance_km numeric DEFAULT NULL,
  p_pickup_address text DEFAULT NULL,
  p_destination_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id uuid;
  merchant_uid uuid;
BEGIN
  -- Identificar usuário logado
  merchant_uid := auth.uid();
  
  IF merchant_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- Gerar UUID único para a ordem
  new_id := gen_random_uuid();

  -- Inserir na service_orders (Tabela unificada)
  INSERT INTO public.service_orders (
    id,
    merchant_id,
    customer_id,
    customer_name,
    customer_phone,
    notes,
    product_id,
    estimated_value,
    total_price,
    distance_km,
    status,
    service_type,
    pickup_lat,
    pickup_lng,
    destination_lat,
    destination_lng,
    pickup_location,
    destination,
    created_at
  )
  VALUES (
    new_id,
    merchant_uid,
    p_customer_name, -- customer_id link (legacy)
    p_customer_name, -- nome real
    p_customer_phone,
    p_notes,
    p_product_id,
    p_estimated_value,
    p_estimated_value,
    p_distance_km,
    'awaiting_professional', 
    'delivery',
    pickup_lat,
    pickup_lng,
    drop_lat,
    drop_lng,
    p_pickup_address,
    p_destination_address,
    now()
  );

  RETURN new_id;
END;
$$;

-- 3. CORREÇÃO DA FUNÇÃO DE DESPACHO (Status 'open' é obrigatório para motoboy ver)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
BEGIN
    -- Obter detalhes da ordem
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found'); 
    END IF;

    -- Localizar motoboys (Simulação de radar ou lista global para testes)
    FOR v_motoboy IN
        SELECT user_id FROM public.motoboy_profiles 
        WHERE is_approved = true AND is_online = true
    LOOP
        -- Evitar duplicidade de oferta
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
                distance_km_snapshot
            ) VALUES (
                v_order.id, 
                v_motoboy.user_id, 
                v_motoboy.user_id, 
                v_order.merchant_id,
                'open', -- CRÍTICO: Status 'open' para o motoboy visualizar
                now() + interval '10 minutes',
                COALESCE(v_order.pickup_location, 'Retirada na Loja'), 
                COALESCE(v_order.destination, 'Entrega no Cliente'),
                v_order.total_price, 
                v_order.distance_km
            );
            v_offer_count := v_offer_count + 1;
        END IF;
    END LOOP;

    -- Logging do despacho
    INSERT INTO public.system_events_log (event_type, payload)
    VALUES ('dispatch_v5_final', jsonb_build_object(
        'order_id', p_delivery_order_id, 
        'offers_created', v_offer_count,
        'timestamp', now()
    ));

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;

DO $$ BEGIN RAISE LOG '=== SCHEMA ALIGNMENT FIX COMPLETE ==='; END $$;
