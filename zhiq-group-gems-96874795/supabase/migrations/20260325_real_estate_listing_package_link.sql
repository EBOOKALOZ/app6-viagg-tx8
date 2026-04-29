-- =========================================================
-- 🔗 LINK: LISTINGS + VISIBILITY PACKAGES
-- =========================================================

-- 1. Adicionar o vínculo do pacote no anúncio
ALTER TABLE public.real_estate_listings 
ADD COLUMN IF NOT EXISTS visibility_package_id uuid REFERENCES public.real_estate_credit_packages(id) ON DELETE SET NULL;

-- 2. Garantir que as colunas comerciais de pacotes estejam corretas (Reforço)
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;

-- 3. Recarregar cache
NOTIFY pgrst, 'reload schema';

-- 4. Permissões
GRANT ALL ON TABLE public.real_estate_listings TO authenticated, anon;
