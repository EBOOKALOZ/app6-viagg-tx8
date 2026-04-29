-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW PÚBLICA: public_real_estate_listings
-- Expõe imóveis com visibility_status = 'published' para leitura anônima.
-- ═══════════════════════════════════════════════════════════════════════════

-- Garante que imóveis com status "published" ou "approved" sejam visíveis
-- (legacy: alguns sistemas usavam 'approved' como status publicado)

DROP VIEW IF EXISTS public.public_real_estate_listings CASCADE;

CREATE OR REPLACE VIEW public.public_real_estate_listings AS
SELECT
  l.id,
  l.title,
  l.slug,
  l.property_type::text,
  l.operation_type::text,
  l.description,
  l.price_brl,
  l.total_area_m2,
  l.built_area_m2,
  l.bedrooms,
  l.bathrooms,
  l.parking_spots,
  l.city,
  l.state,
  l.neighborhood,
  l.lat,
  l.lng,
  -- public_address_label: usa o campo próprio ou gera automaticamente
  COALESCE(
    l.public_address_label,
    CASE
      WHEN l.neighborhood IS NOT NULL AND l.city IS NOT NULL
        THEN l.neighborhood || ', ' || l.city || '/' || l.state
      WHEN l.city IS NOT NULL
        THEN l.city || '/' || l.state
      ELSE l.state
    END
  ) AS public_address_label,
  -- public_location: versão curta para cards
  COALESCE(
    l.city || '/' || l.state,
    l.state
  ) AS public_location,
  l.visibility_status::text,
  l.published_at,
  l.created_at,
  l.contact_unlock_cost,
  l.owner_user_id
FROM public.real_estate_listings l
WHERE l.visibility_status IN ('published')
   OR l.visibility_status::text IN ('approved', 'active');

-- Permissão de leitura para todos (inclusive anon)
GRANT SELECT ON public.public_real_estate_listings TO anon, authenticated;

-- ─── Garante que a tabela base tem RLS correta ────────────────────────────────

ALTER TABLE public.real_estate_listings ENABLE ROW LEVEL SECURITY;

-- Policy para leitura pública de imóveis publicados
DROP POLICY IF EXISTS "public_read_published_listings" ON public.real_estate_listings;
CREATE POLICY "public_read_published_listings"
ON public.real_estate_listings
FOR SELECT
TO anon, authenticated
USING (
  visibility_status IN ('published')
  OR visibility_status::text IN ('approved', 'active')
);

-- Policy para owner ver os próprios (qualquer status)
DROP POLICY IF EXISTS "owner_manage_own_listings" ON public.real_estate_listings;
CREATE POLICY "owner_manage_own_listings"
ON public.real_estate_listings
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- Garantir que real_estate_media também seja acessível anonimamente
ALTER TABLE public.real_estate_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_media" ON public.real_estate_media;
CREATE POLICY "public_read_media"
ON public.real_estate_media
FOR SELECT
TO anon, authenticated
USING (true);

-- ─── Publica os imóveis que estejam com status draft/pending mas sejam ────────
-- ─── do anunciante (para teste do fluxo) ─────────────────────────────────────
-- COMENTADO INTENCIONALMENTE — não auto-publicar sem revisão.
-- Para testar, publique manualmente via:
--   UPDATE real_estate_listings SET visibility_status = 'published' WHERE id = '...';

-- ─── Notifica PostgREST para recarregar schema ────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM
-- ═══════════════════════════════════════════════════════════════════════════
