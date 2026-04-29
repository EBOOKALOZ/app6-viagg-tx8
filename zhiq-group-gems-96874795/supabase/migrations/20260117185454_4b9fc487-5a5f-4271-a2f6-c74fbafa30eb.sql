-- Adicionar 'delivered' ao constraint valid_status
ALTER TABLE public.delivery_orders DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE public.delivery_orders ADD CONSTRAINT valid_status CHECK (
  status IN ('pending', 'a_caminho', 'em_andamento', 'accepted', 'in_progress', 'completed', 'cancelled', 'aguardando_entregador', 'buscando', 'entregando', 'finalizado', 'delivered')
);