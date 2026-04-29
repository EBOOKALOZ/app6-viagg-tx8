-- Adicionar colunas de distância, tempo e timestamps na tabela delivery_history

-- Distância percorrida em km
ALTER TABLE public.delivery_history 
ADD COLUMN IF NOT EXISTS distance_km numeric(10,2) DEFAULT 0;

-- Duração total em minutos
ALTER TABLE public.delivery_history 
ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 0;

-- Timestamp de aceite da entrega
ALTER TABLE public.delivery_history 
ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Nome do motoboy para exibição
ALTER TABLE public.delivery_history 
ADD COLUMN IF NOT EXISTS motoboy_nome text;

-- Comentários da entrega
COMMENT ON COLUMN public.delivery_history.distance_km IS 'Distância total percorrida em km';
COMMENT ON COLUMN public.delivery_history.duration_minutes IS 'Tempo total da entrega em minutos';
COMMENT ON COLUMN public.delivery_history.accepted_at IS 'Timestamp de quando a entrega foi aceita';
COMMENT ON COLUMN public.delivery_history.motoboy_nome IS 'Nome do motoboy que realizou a entrega';

-- Atualizar política RLS para permitir que o merchant veja as entregas dele
CREATE POLICY "Merchants can view delivery history of their orders"
ON public.delivery_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM delivery_orders d_orders 
    WHERE d_orders.id = delivery_history.delivery_order_id 
    AND d_orders.merchant_id = auth.uid()
  )
);