-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_dispatch_flow_ultimate_fix.sql
-- COMPLETE AUDIT: Standardize Identities, Proximity Search & Instant Dispatch
-- ═══════════════════════════════════════════════════════════════

-- 1. Auditar Identidades: Garantir professional_uid em delivery_offers
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS professional_uid uuid;

-- 2. RPC: update_motoboy_presence
-- Garante que o motoboy seja marcado como online e suas coordenadas atualizadas
CREATE OR REPLACE FUNCTION public.update_motoboy_presence(
    p_lat double precision,
    p_lng double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    -- 1. Marcar como online no perfil (necessário para o dispatcher legado/v2)
    UPDATE public.motoboy_profiles 
    SET is_online = true, updated_at = now() 
    WHERE user_id = v_user_id;

    -- 2. Atualizar ou inserir na tabela de presença (necessário para find_nearby_motoboys)
    INSERT INTO public.motoboy_presence (professional_id, lat, lng, updated_at)
    VALUES (v_user_id, p_lat, p_lng, now())
    ON CONFLICT (professional_id) DO UPDATE 
    SET lat = p_lat, lng = p_lng, updated_at = now();

    RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'timestamp', now());
END;
$$;

-- 3. Refatorar find_nearby_motoboys para ser mais flexível
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
    AND pres.updated_at > now() - interval '30 minutes' -- Apenas motoboys ativos recentemente
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(pres.lng, pres.lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000.0
    )
  ORDER BY d_km ASC
  LIMIT p_limit;
END;
$$;

-- 4. Refatorar create_delivery_offers_for_order para usar busca por proximidade
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
    v_radius_km numeric := 10; -- Raio inicial generoso para garantir que chamadas em teste funcionem
BEGIN
    -- 1. Buscar a ordem
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Ordem não encontrada.');
    END IF;

    -- 2. Registrar LOG (Audit)
    INSERT INTO public.system_events_log (event_type, payload)
    VALUES ('dispatch_attempt', jsonb_build_object('order_id', p_delivery_order_id, 'status', v_order.status));

    -- 3. Buscar motoboys próximos (Proximity Search)
    FOR v_motoboy IN 
        SELECT found_user_id as user_id, distance_km
        FROM public.find_nearby_motoboys(
            v_order.pickup_lat, 
            v_order.pickup_lng, 
            v_radius_km
        )
    LOOP
        INSERT INTO public.delivery_offers (
            delivery_order_id,
            motoboy_id,
            professional_uid, -- Garantir que ambos sejam preenchidos
            store_id,
            distance_km_snapshot,
            estimated_price_snapshot,
            pickup_address_snapshot,
            dropoff_address_snapshot,
            store_name_snapshot,
            customer_name_snapshot,
            notes_snapshot,
            expires_at,
            status
        ) VALUES (
            v_order.id,
            v_motoboy.user_id,
            v_motoboy.user_id,
            v_order.merchant_id,
            v_order.distance_km,
            v_order.total_price,
            v_order.pickup_location,
            v_order.destination,
            (SELECT nome_loja FROM public.merchant_stores WHERE user_id = v_order.merchant_id LIMIT 1),
            v_order.customer_name,
            v_order.notes,
            now() + interval '120 seconds',
            'pending'
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    -- 4. Notificar se ninguém foi encontrado
    IF v_offer_count = 0 THEN
        RAISE LOG 'Dispatch failed: No nearby motoboys for order %', p_delivery_order_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count, 'radius', v_radius_km);
END;
$$;

-- 5. Vincular Synchronous Dispatch no Trigger para teste real imediato
CREATE OR REPLACE FUNCTION public.fn_trigger_service_order_dispatch()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status for alterado para 'awaiting_professional'
  IF (TG_OP = 'UPDATE' AND NEW.status = 'awaiting_professional' AND OLD.status <> 'awaiting_professional') 
     OR (TG_OP = 'INSERT' AND NEW.status = 'awaiting_professional') THEN
    
    -- 1. Marcar como searching para evitar disparos múltiplos
    UPDATE public.service_orders SET status = 'searching' WHERE id = NEW.id;

    -- 2. Chamar o Dispatcher Síncrono (Primeira Rodada Imediata)
    PERFORM public.create_delivery_offers_for_order(NEW.id);

    -- 3. Iniciar o Dispatch Engine Assíncrono (Processamentos Futuros/Rounds)
    PERFORM public.run_dispatch_cycle(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
