-- Adicionar colunas para rota e comprovante
ALTER TABLE public.delivery_history 
ADD COLUMN IF NOT EXISTS route_points jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS receipt_hash text;

-- Índice para busca por hash do comprovante
CREATE INDEX IF NOT EXISTS idx_delivery_history_receipt_hash ON public.delivery_history(receipt_hash) WHERE receipt_hash IS NOT NULL;