-- Tabela simples para rastrear recusas de entregas por motoboy
CREATE TABLE public.delivery_rejections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_id UUID NOT NULL,
  motoboy_id UUID NOT NULL,
  rejected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(delivery_id, motoboy_id)
);

-- Índice para busca rápida
CREATE INDEX idx_delivery_rejections_motoboy ON public.delivery_rejections(motoboy_id);
CREATE INDEX idx_delivery_rejections_delivery ON public.delivery_rejections(delivery_id);

-- Habilitar RLS
ALTER TABLE public.delivery_rejections ENABLE ROW LEVEL SECURITY;

-- Política: motoboy só pode inserir recusas próprias
CREATE POLICY "Motoboy can insert own rejections" 
ON public.delivery_rejections 
FOR INSERT 
WITH CHECK (auth.uid() = motoboy_id);

-- Política: motoboy pode ver suas próprias recusas
CREATE POLICY "Motoboy can view own rejections" 
ON public.delivery_rejections 
FOR SELECT 
USING (auth.uid() = motoboy_id);