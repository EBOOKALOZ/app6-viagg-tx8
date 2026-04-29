-- ================================================
-- Add category and condition columns to merchant_marketing_products
-- Supports both existing and new products
-- ================================================

-- 1. Add category column
ALTER TABLE public.merchant_marketing_products
ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;

-- 2. Add condition column (novo / usado)
ALTER TABLE public.merchant_marketing_products
ADD COLUMN IF NOT EXISTS condition text DEFAULT 'novo'
CHECK (condition IN ('novo', 'usado'));

-- 3. Index for category filtering
CREATE INDEX IF NOT EXISTS idx_mmp_category
ON public.merchant_marketing_products(category)
WHERE category IS NOT NULL;

-- 4. Index for condition filtering
CREATE INDEX IF NOT EXISTS idx_mmp_condition
ON public.merchant_marketing_products(condition);

-- 5. Set default for existing rows
UPDATE public.merchant_marketing_products
SET condition = 'novo'
WHERE condition IS NULL;
