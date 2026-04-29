-- =============================================
-- MIGRATION: Tracking Slug + Click Tracking
-- Tabela: merchant_marketing_products + click_tracking
-- Data: 2026-03-11
-- =============================================

-- 1. Adicionar coluna tracking_slug em merchant_marketing_products
ALTER TABLE public.merchant_marketing_products
  ADD COLUMN IF NOT EXISTS tracking_slug TEXT UNIQUE;

-- 2. Funcao para gerar slug unico de 8 caracteres
CREATE OR REPLACE FUNCTION public.generate_tracking_slug()
RETURNS TRIGGER AS $$
DECLARE
  new_slug TEXT;
  slug_exists BOOLEAN;
BEGIN
  LOOP
    new_slug := substr(md5(random()::text || NEW.id::text || clock_timestamp()::text), 1, 8);
    SELECT EXISTS(
      SELECT 1 FROM public.merchant_marketing_products WHERE tracking_slug = new_slug
    ) INTO slug_exists;
    EXIT WHEN NOT slug_exists;
  END LOOP;
  NEW.tracking_slug := new_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger para auto-gerar slug no INSERT
DROP TRIGGER IF EXISTS trg_generate_tracking_slug ON public.merchant_marketing_products;
CREATE TRIGGER trg_generate_tracking_slug
  BEFORE INSERT ON public.merchant_marketing_products
  FOR EACH ROW
  WHEN (NEW.tracking_slug IS NULL)
  EXECUTE FUNCTION public.generate_tracking_slug();

-- 4. Backfill: Gerar slugs para produtos existentes que nao tem
DO $$
DECLARE
  rec RECORD;
  new_slug TEXT;
  slug_exists BOOLEAN;
BEGIN
  FOR rec IN SELECT id FROM public.merchant_marketing_products WHERE tracking_slug IS NULL
  LOOP
    LOOP
      new_slug := substr(md5(random()::text || rec.id::text || clock_timestamp()::text), 1, 8);
      SELECT EXISTS(
        SELECT 1 FROM public.merchant_marketing_products WHERE tracking_slug = new_slug
      ) INTO slug_exists;
      EXIT WHEN NOT slug_exists;
    END LOOP;
    UPDATE public.merchant_marketing_products SET tracking_slug = new_slug WHERE id = rec.id;
  END LOOP;
END $$;

-- 5. Criar tabela click_tracking
CREATE TABLE IF NOT EXISTS public.click_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_slug TEXT NOT NULL,
  product_id UUID,
  store_id UUID,
  group_id TEXT,
  postador_id TEXT,
  user_agent TEXT,
  referer TEXT,
  clicked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_click_tracking_slug ON public.click_tracking(tracking_slug);
CREATE INDEX IF NOT EXISTS idx_click_tracking_product ON public.click_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_click_tracking_clicked_at ON public.click_tracking(clicked_at);

-- 6. RLS: click_tracking precisa de INSERT anonimo (links publicos)
ALTER TABLE public.click_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_click_tracking" ON public.click_tracking;
CREATE POLICY "anon_insert_click_tracking" ON public.click_tracking
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_click_tracking" ON public.click_tracking;
CREATE POLICY "auth_select_click_tracking" ON public.click_tracking
  FOR SELECT TO authenticated
  USING (true);

-- 7. RPC: register_product_click (acessivel por anon)
CREATE OR REPLACE FUNCTION public.register_product_click(
  p_tracking_slug TEXT,
  p_group_id TEXT DEFAULT NULL,
  p_postador_id TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_referer TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id UUID;
  v_store_id UUID;
BEGIN
  -- Buscar produto pelo slug
  SELECT id, merchant_store_id
  INTO v_product_id, v_store_id
  FROM public.merchant_marketing_products
  WHERE tracking_slug = p_tracking_slug
    AND is_active = true;

  IF v_product_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Produto nao encontrado');
  END IF;

  -- Registrar clique
  INSERT INTO public.click_tracking (
    tracking_slug, product_id, store_id,
    group_id, postador_id, user_agent, referer
  ) VALUES (
    p_tracking_slug, v_product_id, v_store_id,
    p_group_id, p_postador_id, p_user_agent, p_referer
  );

  -- Incrementar contador de cliques no produto
  UPDATE public.merchant_marketing_products
  SET clicks_count = COALESCE(clicks_count, 0) + 1
  WHERE id = v_product_id;

  RETURN json_build_object(
    'success', true,
    'product_id', v_product_id,
    'store_id', v_store_id
  );
END;
$$;

-- Permitir chamada anonima
GRANT EXECUTE ON FUNCTION public.register_product_click TO anon, authenticated;
