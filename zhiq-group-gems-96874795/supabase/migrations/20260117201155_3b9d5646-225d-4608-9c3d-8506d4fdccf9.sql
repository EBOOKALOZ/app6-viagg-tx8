-- Atualizar função para definir status 'entregando' (A caminho do destino) após validar código de retirada
CREATE OR REPLACE FUNCTION public.validate_pickup_code(_code VARCHAR, _order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se o código corresponde
  IF EXISTS (
    SELECT 1 FROM delivery_orders 
    WHERE id = _order_id 
    AND pickup_code = _code
    AND status IN ('a_caminho', 'accepted', 'buscando')
  ) THEN
    -- Atualizar status para 'entregando' (A caminho do destino)
    UPDATE delivery_orders 
    SET status = 'entregando'
    WHERE id = _order_id;
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;