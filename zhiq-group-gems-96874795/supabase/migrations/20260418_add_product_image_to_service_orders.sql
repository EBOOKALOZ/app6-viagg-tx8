-- ══════════════════════════════════════════════════════════════════════
-- Adiciona coluna product_image_url em service_orders
-- Permite que a foto do produto enviada durante criação da entrega
-- seja persistida diretamente na order, sem depender da tabela products.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS product_image_url TEXT;

COMMENT ON COLUMN public.service_orders.product_image_url
  IS 'URL da imagem do produto associado à entrega (snapshot no momento da criação)';
