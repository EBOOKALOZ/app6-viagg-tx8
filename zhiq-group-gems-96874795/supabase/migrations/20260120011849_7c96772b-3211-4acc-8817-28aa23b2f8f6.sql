-- Dropar função antiga e recriar com coordenadas
DROP FUNCTION IF EXISTS public.get_active_motoboy_ride(uuid);

CREATE OR REPLACE FUNCTION public.get_active_motoboy_ride(_user_id uuid)
RETURNS TABLE(
  id uuid, 
  passenger_id uuid, 
  status text, 
  pickup_location text, 
  destination text, 
  estimated_value numeric, 
  created_at timestamp with time zone, 
  accepted_at timestamp with time zone, 
  started_at timestamp with time zone,
  pickup_lat double precision,
  pickup_lng double precision,
  destination_lat double precision,
  destination_lng double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    r.id,
    r.passenger_id,
    r.status,
    r.pickup_location,
    r.destination,
    r.estimated_value,
    r.created_at,
    r.accepted_at,
    r.started_at,
    r.pickup_lat,
    r.pickup_lng,
    r.destination_lat,
    r.destination_lng
  FROM public.motoboy_passenger_rides r
  WHERE r.motoboy_id = _user_id
  AND r.status IN ('accepted', 'in_progress')
  LIMIT 1
$$;