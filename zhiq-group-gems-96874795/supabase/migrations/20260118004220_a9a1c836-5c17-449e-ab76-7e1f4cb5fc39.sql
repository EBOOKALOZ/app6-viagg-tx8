-- Drop e recriar função com assinatura correta e logs detalhados
DROP FUNCTION IF EXISTS public.validate_delivery_code(uuid, character varying);
DROP FUNCTION IF EXISTS public.validate_delivery_code(character varying, uuid);

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
    current_user_id UUID;
BEGIN
    -- Obter user atual
    current_user_id := auth.uid();
    
    -- Normalizar código de entrada como string (preservar zeros à esquerda)
    input_code := TRIM(_code::TEXT);
    
    -- LOG temporário para debug
    RAISE NOTICE '[validate_delivery_code] ====== INICIANDO VALIDAÇÃO ======';
    RAISE NOTICE '[validate_delivery_code] order_id recebido: %', _order_id;
    RAISE NOTICE '[validate_delivery_code] codigo_digitado: %', input_code;
    RAISE NOTICE '[validate_delivery_code] motoboy autenticado: %', current_user_id;
    
    -- Buscar a entrega pelo ID exato
    SELECT * INTO order_record
    FROM public.delivery_orders
    WHERE id = _order_id;
    
    -- Verificar se order existe
    IF order_record IS NULL THEN
        RAISE NOTICE '[validate_delivery_code] ERRO: Entrega não encontrada com id=%', _order_id;
        RETURN false;
    END IF;
    
    -- Verificar se pertence ao motoboy
    IF order_record.current_motoboy_id IS NULL OR order_record.current_motoboy_id != current_user_id THEN
        RAISE NOTICE '[validate_delivery_code] ERRO: Motoboy não autorizado. current_motoboy_id=%, auth.uid=%', 
                     order_record.current_motoboy_id, current_user_id;
        RETURN false;
    END IF;
    
    -- Normalizar código armazenado como string
    stored_code := TRIM(order_record.delivery_code::TEXT);
    
    RAISE NOTICE '[validate_delivery_code] delivery_code armazenado: "%"', stored_code;
    RAISE NOTICE '[validate_delivery_code] status atual: %', order_record.status;
    
    -- Comparar como strings (determinístico, preserva zeros à esquerda)
    IF stored_code != input_code THEN
        RAISE NOTICE '[validate_delivery_code] FALHA: códigos não conferem ("%s" != "%s")', stored_code, input_code;
        RETURN false;
    END IF;
    
    -- Verificar status válido para finalização
    IF order_record.status NOT IN ('accepted', 'a_caminho', 'in_progress', 'entregando', 'em_andamento') THEN
        RAISE NOTICE '[validate_delivery_code] FALHA: status inválido para finalização: %', order_record.status;
        RETURN false;
    END IF;
    
    -- Atualizar para delivered
    UPDATE public.delivery_orders
    SET status = 'delivered',
        validated_at = now(),
        completed_at = now()
    WHERE id = _order_id;
    
    RAISE NOTICE '[validate_delivery_code] SUCESSO: entrega % finalizada', _order_id;
    RETURN true;
END;
$function$;