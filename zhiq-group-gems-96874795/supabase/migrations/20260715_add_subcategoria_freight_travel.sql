-- ==============================================================================
-- ADIÇÃO DA COLUNA SUBCATEGORIA EM FRETES E VIAGENS (2026-07-15)
-- Padronização de navegação:
--   - Categoria Fretes -> Subcategoria: Fretes ou Mudanças
--   - Categoria Viagens -> Subcategoria: Viagens ou Turismo
-- ==============================================================================

ALTER TABLE public.freight_listings
  ADD COLUMN IF NOT EXISTS subcategoria text DEFAULT 'Fretes';

ALTER TABLE public.travel_listings
  ADD COLUMN IF NOT EXISTS subcategoria text DEFAULT 'Viagens';

-- Atualizar ou recriar view public_freight_listings para incluir subcategoria
CREATE OR REPLACE VIEW public.public_freight_listings AS
SELECT * FROM public.freight_listings
WHERE visibility_status = 'published'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');

GRANT SELECT ON public.public_freight_listings TO anon, authenticated;

-- Backfill inteligente em freight_listings com base no título/descrição
UPDATE public.freight_listings
SET subcategoria = 'Mudanças'
WHERE subcategoria IS NULL
   OR (
     title ILIKE '%mudanç%' OR title ILIKE '%carreto%' OR
     description ILIKE '%mudanç%' OR description ILIKE '%carreto%'
   );

UPDATE public.freight_listings
SET subcategoria = 'Fretes'
WHERE subcategoria IS NULL;

-- Backfill inteligente em travel_listings com base na categoria e título
UPDATE public.travel_listings
SET subcategoria = 'Turismo'
WHERE subcategoria IS NULL
   OR (
     category IN ('ecoturismo', 'cultural', 'religioso', 'rural', 'aventura', 'praia', 'gastronomico') OR
     title ILIKE '%passeio%' OR title ILIKE '%turismo%' OR title ILIKE '%pacote%'
   );

UPDATE public.travel_listings
SET subcategoria = 'Viagens'
WHERE subcategoria IS NULL
   OR (
     category IN ('pacote_completo', 'cruzeiro') OR
     title ILIKE '%passagem%' OR title ILIKE '%excursão%' OR title ILIKE '%viagem%'
   );
