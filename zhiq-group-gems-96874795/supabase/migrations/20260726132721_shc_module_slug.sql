-- Adiciona a coluna slug na tabela shc_modules para desvincular do id UUID
ALTER TABLE public.shc_modules ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Caso existam módulos que foram inseridos incorretamente (o que seria impossível se id for UUID e tentaram string, 
-- mas por garantia), ou para inicializar módulos existentes com base no name
UPDATE public.shc_modules SET slug = LOWER(name) WHERE slug IS NULL;
