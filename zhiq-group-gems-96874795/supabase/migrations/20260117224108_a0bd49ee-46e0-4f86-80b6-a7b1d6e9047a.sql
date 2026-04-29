-- Dropar versão antiga com assinatura incorreta (order_id, code)
DROP FUNCTION IF EXISTS public.validate_pickup_code(uuid, varchar);

-- Garantir que a versão correta exista (_code, _order_id)
CREATE OR REPLACE FUNCTION public.validate_pickup_code(_code VARCHAR, _order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stored_code VARCHAR;
    current_status TEXT;
BEGIN
    -- Buscar código armazenado e status atual
    SELECT pickup_code, status INTO stored_code, current_status
    FROM delivery_orders
    WHERE id = _order_id;
    
    -- Verificar se pedido existe
    IF stored_code IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Comparar código diretamente (normalizado como string)
    IF TRIM(stored_code)::TEXT != TRIM(_code)::TEXT THEN
        RETURN FALSE;
    END IF;
    
    -- Verificar status válido para confirmação de retirada
    IF current_status NOT IN ('a_caminho', 'accepted', 'buscando') THEN
        RETURN FALSE;
    END IF;
    
    -- Atualizar status para 'entregando' (A caminho do destino)
    UPDATE delivery_orders 
    SET status = 'entregando'
    WHERE id = _order_id;
    
    RETURN TRUE;
END;
$$;