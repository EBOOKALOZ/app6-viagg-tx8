-- CORREÇÃO: Usar current_motoboy_id em vez de user_id para validação do motoboy
CREATE OR REPLACE FUNCTION public.validate_delivery_code(_order_id uuid, _code character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    order_record RECORD;
BEGIN
    -- Get the order - usar current_motoboy_id para identificar o motoboy
    SELECT * INTO order_record
    FROM public.delivery_orders
    WHERE id = _order_id
    AND current_motoboy_id = auth.uid();
    
    -- Check if order exists and belongs to the motoboy
    IF order_record IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if code matches (comparação exata)
    IF order_record.delivery_code != _code THEN
        RETURN false;
    END IF;
    
    -- Check if order is in valid state
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