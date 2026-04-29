-- Adicionar campo para controlar dispatch sequencial
ALTER TABLE public.delivery_orders 
ADD COLUMN IF NOT EXISTS current_motoboy_id UUID,
ADD COLUMN IF NOT EXISTS dispatch_sent_at TIMESTAMP WITH TIME ZONE;

-- Índice para busca de entregas pendentes por motoboy
CREATE INDEX IF NOT EXISTS idx_delivery_orders_current_motoboy 
ON public.delivery_orders(current_motoboy_id) 
WHERE status = 'aguardando_entregador';

-- Função para selecionar próximo motoboy elegível
CREATE OR REPLACE FUNCTION public.dispatch_to_next_motoboy(_delivery_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _next_motoboy_id UUID;
  _delivery_record RECORD;
BEGIN
  -- Buscar dados da entrega
  SELECT * INTO _delivery_record
  FROM delivery_orders
  WHERE id = _delivery_id AND status = 'aguardando_entregador';
  
  IF _delivery_record IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Limpar motoboy atual (recusa encerrada)
  UPDATE delivery_orders
  SET current_motoboy_id = NULL, dispatch_sent_at = NULL
  WHERE id = _delivery_id;
  
  -- Selecionar próximo motoboy online que não recusou
  SELECT mp.user_id INTO _next_motoboy_id
  FROM motoboy_profiles mp
  WHERE mp.is_online = true
    AND mp.is_approved = true
    AND NOT EXISTS (
      SELECT 1 FROM delivery_rejections dr
      WHERE dr.delivery_id = _delivery_id
      AND dr.motoboy_id = mp.user_id
    )
  ORDER BY RANDOM()
  LIMIT 1;
  
  -- Atualizar entrega com novo motoboy
  IF _next_motoboy_id IS NOT NULL THEN
    UPDATE delivery_orders
    SET current_motoboy_id = _next_motoboy_id,
        dispatch_sent_at = now()
    WHERE id = _delivery_id;
  END IF;
  
  RETURN _next_motoboy_id;
END;
$$;