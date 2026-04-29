-- Adicionar colunas de localização na tabela merchant_stores
ALTER TABLE public.merchant_stores
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision,
ADD COLUMN IF NOT EXISTS endereco_formatado text;