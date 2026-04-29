-- Adicionar coluna motivo_cancelamento na tabela delivery_orders
ALTER TABLE public.delivery_orders 
ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- Atualizar constraint de status para incluir os novos status de cancelamento
ALTER TABLE public.delivery_orders DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE public.delivery_orders ADD CONSTRAINT valid_status CHECK (
  status IN (
    'pending', 'a_caminho', 'em_andamento', 'accepted', 'in_progress', 
    'completed', 'cancelled', 'aguardando_entregador', 'buscando', 
    'entregando', 'finalizado', 'delivered', 'reserva',
    'cancelada_por_sistema', 'cancelada_por_lojista'
  )
);

-- Criar função para auto-cancelamento de entregas antigas sem motoboy (3 horas)
CREATE OR REPLACE FUNCTION public.auto_cancel_stale_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cancelled_count INTEGER;
BEGIN
  -- Cancelar entregas pendentes sem motoboy por mais de 3 horas
  UPDATE delivery_orders
  SET 
    status = 'cancelada_por_sistema',
    motivo_cancelamento = 'sem_entregador_disponivel',
    completed_at = now()
  WHERE status = 'pending'
    AND current_motoboy_id IS NULL
    AND created_at < now() - interval '3 hours';
    
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  
  RAISE NOTICE '[auto_cancel_stale_deliveries] Canceladas % entregas por timeout', cancelled_count;
  
  RETURN cancelled_count;
END;
$$;

-- Criar função para cancelamento manual pelo lojista
CREATE OR REPLACE FUNCTION public.cancel_delivery_by_merchant(_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_merchant_id UUID;
  v_status TEXT;
BEGIN
  -- Verificar se a entrega pertence ao lojista autenticado
  SELECT merchant_id, status INTO v_merchant_id, v_status
  FROM delivery_orders
  WHERE id = _delivery_id;
  
  IF v_merchant_id IS NULL OR v_merchant_id != auth.uid() THEN
    RAISE EXCEPTION 'Entrega não encontrada ou não autorizada';
  END IF;
  
  -- Só permite cancelar entregas pendentes
  IF v_status NOT IN ('pending', 'reserva') THEN
    RAISE EXCEPTION 'Só é possível cancelar entregas pendentes';
  END IF;
  
  -- Atualizar status para cancelada pelo lojista
  UPDATE delivery_orders
  SET 
    status = 'cancelada_por_lojista',
    motivo_cancelamento = 'cancelamento_manual',
    completed_at = now(),
    current_motoboy_id = NULL
  WHERE id = _delivery_id;
  
  RETURN TRUE;
END;
$$;