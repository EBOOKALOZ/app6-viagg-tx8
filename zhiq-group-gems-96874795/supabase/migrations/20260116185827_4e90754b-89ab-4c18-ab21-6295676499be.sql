-- Dropar função antiga e recriar com novos campos de coordenadas
DROP FUNCTION IF EXISTS public.get_active_delivery(uuid);

CREATE FUNCTION public.get_active_delivery(_user_id uuid)
 RETURNS TABLE(
   id uuid, 
   delivery_code character varying, 
   status text, 
   pickup_location text, 
   pickup_lat double precision,
   pickup_lng double precision,
   destination text, 
   destination_lat double precision,
   destination_lng double precision,
   motoboy_lat double precision,
   motoboy_lng double precision,
   customer_name text, 
   customer_phone text, 
   estimated_value numeric, 
   order_description text, 
   vehicle_type text, 
   created_at timestamp with time zone, 
   accepted_at timestamp with time zone
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        id, delivery_code, status, pickup_location, 
        pickup_lat, pickup_lng,
        destination, 
        destination_lat, destination_lng,
        motoboy_lat, motoboy_lng,
        customer_name, customer_phone, estimated_value, order_description,
        vehicle_type, created_at, accepted_at
    FROM public.delivery_orders
    WHERE user_id = _user_id
    AND status IN ('accepted', 'a_caminho', 'in_progress')
    ORDER BY accepted_at DESC
    LIMIT 1
$function$;