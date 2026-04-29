-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_dispatch_v3_resiliency.sql
-- FIX: Resiliency for GPS failures, Proximity fallback & Blind Search.
-- ═══════════════════════════════════════════════════════════════

-- 1. RPC: ensure_motoboy_profile (V2)
-- Adiciona logs de sucesso e garante que o perfil esteja completo para o dispatcher.
CREATE OR REPLACE FUNCTION public.ensure_motoboy_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.motoboy_profiles WHERE user_id = v_user_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.motoboy_profiles (
            user_id,
            full_name,
            is_approved,
            is_online,
            updated_at
        ) VALUES (
            v_user_id,
            (SELECT COALESCE(name, 'Motoboy Teste') FROM public.profiles WHERE id = v_user_id LIMIT 1),
            true, 
            true,
            now()
        );
        RAISE LOG 'Profile created for user %', v_user_id;
    ELSE
        UPDATE public.motoboy_profiles 
        SET is_online = true, is_approved = true, updated_at = now() 
        WHERE user_id = v_user_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'status', 'synced');
END;
$$;

-- 2. RPC: find_nearby_motoboys (V2)
-- Agora aceita lat/lng 0 como sinal de 'localização desconhecida' e retorna o motoboy se ele estiver online.
CREATE OR REPLACE FUNCTION public.find_nearby_motoboys(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  found_user_id uuid,
  distance_km double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Se p_lat ou p_lng for 0, assumimos modo 'global/teste' para esse ponto
  IF p_lat = 0 OR p_lng = 0 THEN
      RETURN QUERY
      SELECT 
        prof.user_id,
        0.0 as d_km
      FROM public.motoboy_profiles prof
      WHERE prof.is_approved = true 
        AND prof.is_online = true
      LIMIT p_limit;
  ELSE
      RETURN QUERY
      SELECT 
        prof.user_id,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(pres.lng, pres.lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        ) / 1000.0 as d_km
      FROM public.motoboy_presence pres
      JOIN public.motoboy_profiles prof ON (pres.professional_id = prof.user_id)
      WHERE prof.is_approved = true 
        AND prof.is_online = true
        AND (
          ST_DWithin(
            ST_SetSRID(ST_MakePoint(pres.lng, pres.lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            p_radius_km * 1000.0
          )
          OR pres.lat = 0 -- Fallback para motoboy sem coordenadas válidas (teste)
        )
      ORDER BY d_km ASC
      LIMIT p_limit;
  END IF;
END;
$$;

-- 3. RPC: create_delivery_offers_for_order (V4)
-- Tenta proximidade, mas faz um 'Blind Dispatch' (todos online) se ninguém for encontrado.
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
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

    -- 1. Primeira Tentativa: Proximidade Real
    FOR v_motoboy IN 
        SELECT found_user_id as user_id FROM public.find_nearby_motoboys(
            COALESCE(v_order.pickup_lat, 0), 
            COALESCE(v_order.pickup_lng, 0), 
            15
        )
    LOOP
        -- Evita duplicidade se for chamado múltiplas vezes
        IF NOT EXISTS (SELECT 1 FROM public.delivery_offers WHERE delivery_order_id = v_order.id AND professional_uid = v_motoboy.user_id) THEN
            INSERT INTO public.delivery_offers (
                delivery_order_id, motoboy_id, professional_uid, store_id, status, expires_at,
                pickup_address_snapshot, dropoff_address_snapshot, total_price, distance_km_snapshot
            ) VALUES (
                v_order.id, v_motoboy.user_id, v_motoboy.user_id, v_order.merchant_id, 'pending', now() + interval '5 minutes',
                v_order.pickup_location, v_order.destination, v_order.total_price, v_order.distance_km
            );
            v_offer_count := v_offer_count + 1;
        END IF;
    END LOOP;

    -- 2. Fallback: Blind Dispatch (Se ninguém foi encontrado por proximidade, tenta QUALQUER UM online)
    IF v_offer_count = 0 THEN
        FOR v_motoboy IN 
            SELECT user_id FROM public.motoboy_profiles WHERE is_approved = true AND is_online = true LIMIT 5
        LOOP
            IF NOT EXISTS (SELECT 1 FROM public.delivery_offers WHERE delivery_order_id = v_order.id AND professional_uid = v_motoboy.user_id) THEN
                INSERT INTO public.delivery_offers (
                    delivery_order_id, motoboy_id, professional_uid, store_id, status, expires_at,
                    pickup_address_snapshot, dropoff_address_snapshot, total_price, distance_km_snapshot
                ) VALUES (
                    v_order.id, v_motoboy.user_id, v_motoboy.user_id, v_order.merchant_id, 'pending', now() + interval '5 minutes',
                    v_order.pickup_location, v_order.destination, v_order.total_price, v_order.distance_km
                );
                v_offer_count := v_offer_count + 1;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END;
$$;
