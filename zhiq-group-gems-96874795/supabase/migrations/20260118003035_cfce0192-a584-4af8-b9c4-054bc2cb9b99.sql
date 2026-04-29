-- CORREÇÃO: Validar delivery_code como STRING com logs temporários
-- Comparação determinística: TRIM(codigo_digitado::text) = TRIM(codigo_entrega::text)

CREATE OR REPLACE FUNCTION public.validate_delivery_code(_order_id uuid, _code character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    order_record RECORD;
    stored_code TEXT;
    input_code TEXT;
BEGIN
    -- Normalizar código de entrada como string
    input_code := TRIM(_code::TEXT);
    
    -- RAISE NOTICE para logs temporários (visíveis no Supabase logs)
    RAISE NOTICE '[validate_delivery_code] order_id: %, codigo_digitado: %', _order_id, input_code;
    
    -- Buscar a entrega usando o ID exato
    SELECT * INTO order_record
    FROM public.delivery_orders
    WHERE id = _order_id
    AND current_motoboy_id = auth.uid();
    
    -- Verificar se order existe e pertence ao motoboy
    IF order_record IS NULL THEN
        RAISE NOTICE '[validate_delivery_code] Entrega não encontrada ou não pertence ao motoboy';
        RETURN false;
    END IF;
    
    -- Normalizar código armazenado como string
    stored_code := TRIM(order_record.delivery_code::TEXT);
    
    RAISE NOTICE '[validate_delivery_code] codigo_entrega_armazenado: %, status: %', stored_code, order_record.status;
    
    -- Comparar como strings (determinístico)
    IF stored_code != input_code THEN
        RAISE NOTICE '[validate_delivery_code] FALHA: códigos não conferem (% != %)', stored_code, input_code;
        RETURN false;
    END IF;
    
    -- Verificar status válido
    IF order_record.status NOT IN ('accepted', 'a_caminho', 'in_progress', 'entregando', 'em_andamento') THEN
        RAISE NOTICE '[validate_delivery_code] FALHA: status inválido: %', order_record.status;
        RETURN false;
    END IF;
    
    -- Atualizar para delivered
    UPDATE public.delivery_orders
    SET status = 'delivered',
        validated_at = now(),
        completed_at = now()
    WHERE id = _order_id;
    
    RAISE NOTICE '[validate_delivery_code] SUCESSO: entrega finalizada';
    RETURN true;
END;
$function$;