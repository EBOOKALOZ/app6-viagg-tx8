-- Adicionar coluna tipo_envio na tabela merchant_products
ALTER TABLE public.merchant_products 
ADD COLUMN tipo_envio text DEFAULT 'motoboy' CHECK (tipo_envio IN ('motoboy', 'motorista', 'ambos'));