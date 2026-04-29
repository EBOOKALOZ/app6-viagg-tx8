-- CORREÇÃO: Atualizar has_active_delivery para incluir status 'a_caminho'
CREATE OR REPLACE FUNCTION public.has_active_delivery(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.delivery_orders
        WHERE user_id = _user_id
        AND status IN ('accepted', 'a_caminho', 'in_progress')
    )
$function$;

-- CORREÇÃO: Atualizar validate_delivery_code para aceitar status 'a_caminho'
CREATE OR REPLACE FUNCTION public.validate_delivery_code(_order_id uuid, _code character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    order_record RECORD;
BEGIN
    -- Get the order
    SELECT * INTO order_record
    FROM public.delivery_orders
    WHERE id = _order_id
    AND user_id = auth.uid();
    
    -- Check if order exists and belongs to user
    IF order_record IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if code matches
    IF order_record.delivery_code != _code THEN
        RETURN false;
    END IF;
    
    -- CORREÇÃO: Incluir 'a_caminho' nos status válidos
    IF order_record.status NOT IN ('accepted', 'a_caminho', 'in_progress') THEN
        RETURN false;
    END IF;
    
    -- Update order status to delivered
    UPDATE public.delivery_orders
    SET status = 'delivered',
        validated_at = now(),
        completed_at = now()
    WHERE id = _order_id;
    
    RETURN true;
END;
$function$;

-- CORREÇÃO: Atualizar motoboy_has_active_activity para incluir 'a_caminho'
CREATE OR REPLACE FUNCTION public.motoboy_has_active_activity(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Check for active delivery (incluindo a_caminho)
    SELECT 1 FROM public.delivery_orders
    WHERE user_id = _user_id 
    AND status IN ('pending', 'accepted', 'a_caminho', 'in_progress')
  ) OR EXISTS (
    -- Check for active passenger ride
    SELECT 1 FROM public.motoboy_passenger_rides
    WHERE motoboy_id = _user_id
    AND status IN ('accepted', 'in_progress')
  )
$function$;