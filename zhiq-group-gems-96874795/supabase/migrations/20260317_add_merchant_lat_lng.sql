-- =====================================================================
-- Adicionar colunas latitude e longitude em merchant_stores
-- Executar no SQL Editor do Supabase
-- =====================================================================

ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Índice para queries geoespaciais futuras
CREATE INDEX IF NOT EXISTS idx_merchant_stores_geo
  ON public.merchant_stores (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
