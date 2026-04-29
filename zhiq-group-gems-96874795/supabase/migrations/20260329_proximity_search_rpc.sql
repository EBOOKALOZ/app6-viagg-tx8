-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260329_proximity_search_rpc.sql
-- Concurrent Dispatch: Proximity Search & Timed Rounds Support
-- ═══════════════════════════════════════════════════════════════

-- 1. Auditar service_orders: Colunas para rastreamento de rounds
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS dispatch_round INT DEFAULT 0;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS dispatch_radius_km NUMERIC DEFAULT 3;

-- 2. RPC: find_nearby_motoboys
-- Busca motoboys online/aprovados em um raio específico via PostGIS
CREATE OR REPLACE FUNCTION public.find_nearby_motoboys(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
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
    ) / 1000.0 as distance_km
  FROM public.motoboy_presence pres
  JOIN public.motoboy_profiles prof ON (
    pres.professional_id = prof.user_id OR 
    pres.motoboy_id = prof.user_id
  )
  WHERE prof.is_online = true 
    AND prof.is_approved = true
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(pres.lng, pres.lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000.0
    )
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$$;

-- 3. Refatorar run_dispatch_cycle (Entry Point)
-- Transforma o ciclo em uma chamada para o Edge Function de Dispatch Engine
CREATE OR REPLACE FUNCTION public.run_dispatch_cycle(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Marcar ordem como 'searching' se estiver awaiting_professional
  UPDATE public.service_orders 
  SET status = 'searching', 
      dispatch_round = 1,
      dispatch_radius_km = 3.0,
      updated_at = now()
  WHERE id = p_order_id 
    AND (status = 'awaiting_professional' OR status = 'pending');

  -- 2. Emitir Notificação (Webhook Trigger ou Worker)
  -- Aqui usamos pg_notify para que o worker (Edge Function) escute
  -- Em Supabase Real, você configuraria um Webhook de INSERT/UPDATE na UI.
  PERFORM pg_notify('dispatch_engine_start', jsonb_build_object('order_id', p_order_id)::text);
  
  -- Para fins de execução local/teste imediato, o RPC pode também retornar sucesso
  RAISE LOG 'Dispatch engine cycle started for order %', p_order_id;
END;
$$;
