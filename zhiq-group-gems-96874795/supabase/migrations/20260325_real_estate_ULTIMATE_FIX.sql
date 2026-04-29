-- =========================================================
-- 🛠️ ULTIMATE REPAIR: REAL ESTATE CREDIT PACKAGES
-- =========================================================

-- 1. ADICIONAR COLUNAS FALTANTES (SIMPLIFICADO)
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS badge_text text;
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS button_label text DEFAULT 'Selecionar';
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS features_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS package_type text DEFAULT 'standard';
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS bonus_credits integer DEFAULT 0;
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. LIMPAR VALORES NULOS
UPDATE public.real_estate_credit_packages 
SET 
  button_label = COALESCE(button_label, 'Selecionar'),
  features_json = COALESCE(features_json, '[]'::jsonb),
  is_active = COALESCE(is_active, true),
  is_recommended = COALESCE(is_recommended, false),
  is_featured = COALESCE(is_featured, false);

-- 3. RESETAR RLS (PERMISSÕES TOTAIS)
ALTER TABLE public.real_estate_credit_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public_Visibility_Access" ON public.real_estate_credit_packages;
CREATE POLICY "Public_Visibility_Access"
ON public.real_estate_credit_packages
FOR SELECT
TO public
USING (is_active = true AND credits_amount > 0);

DROP POLICY IF EXISTS "Admin_Full_Management_Access" ON public.real_estate_credit_packages;
CREATE POLICY "Admin_Full_Management_Access"
ON public.real_estate_credit_packages
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. RECARREGAR CACHE DO SCHEMA
NOTIFY pgrst, 'reload schema';

-- 5. SEED (OPCIONAL: SÓ CRIA SE ESTIVER VAZIO)
INSERT INTO public.real_estate_credit_packages 
  (name, slug, credits_amount, price_brl, description, badge_text, is_recommended, sort_order, features_json, button_label)
SELECT 'Plano Ouro', 'pacote-ouro-seed', 10, 89.90, 'Melhor custo-benefício.', 'MAIS VENDIDO', true, 2, '["10 Créditos Base", "2 Créditos Bônus", "Destaque nas buscas"]'::jsonb, 'Selecionar Ouro'
WHERE NOT EXISTS (SELECT 1 FROM public.real_estate_credit_packages LIMIT 1);
