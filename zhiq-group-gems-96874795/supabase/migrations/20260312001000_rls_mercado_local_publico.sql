-- Politica RLS para leitura publica de produtos ativos
-- Permite que usuarios anonimos e autenticados leiam produtos ativos

ALTER TABLE public.merchant_marketing_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura publica de produtos ativos" ON public.merchant_marketing_products;
CREATE POLICY "Leitura publica de produtos ativos"
  ON public.merchant_marketing_products
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Lojista gerencia seus produtos" ON public.merchant_marketing_products;
CREATE POLICY "Lojista gerencia seus produtos"
  ON public.merchant_marketing_products
  FOR ALL
  TO authenticated
  USING (created_by_user_id = auth.uid());

ALTER TABLE public.merchant_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura publica de lojas" ON public.merchant_stores;
CREATE POLICY "Leitura publica de lojas"
  ON public.merchant_stores
  FOR SELECT
  TO anon, authenticated
  USING (true);
