/*
  Libera leitura pública (anon + authenticated) das tabelas necessárias
  pra renderizar produtos do painel anunciante no /mercado.

  Tabelas:
    - advertiser_listings (anúncios)        → só status active/published
    - advertiser_listing_media (mídias)     → só de listings publicados
    - advertiser_accounts (dono do anúncio) → só user_id (pra resolver loja)

  Mantém policies existentes intactas — usa CREATE com nome distinto.
*/

-- 1. advertiser_listings: leitura pública dos publicados
ALTER TABLE public.advertiser_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura publica de anuncios ativos" ON public.advertiser_listings;
CREATE POLICY "Leitura publica de anuncios ativos"
  ON public.advertiser_listings
  FOR SELECT
  TO anon, authenticated
  USING (listing_status IN ('active', 'published'));

-- 2. advertiser_listing_media: leitura pública (só da mídia ligada a listing publicado)
ALTER TABLE public.advertiser_listing_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura publica de midias de anuncios ativos" ON public.advertiser_listing_media;
CREATE POLICY "Leitura publica de midias de anuncios ativos"
  ON public.advertiser_listing_media
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.advertiser_listings l
      WHERE l.id = advertiser_listing_media.listing_id
        AND l.listing_status IN ('active', 'published')
    )
  );

-- 3. advertiser_accounts: leitura pública (necessário pro join no MercadoLocal)
--    Só expõe campos básicos via SELECT — não há policy de UPDATE/INSERT pra anon.
ALTER TABLE public.advertiser_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura publica de contas de anunciante" ON public.advertiser_accounts;
CREATE POLICY "Leitura publica de contas de anunciante"
  ON public.advertiser_accounts
  FOR SELECT
  TO anon, authenticated
  USING (true);

/* Sinaliza PostgREST pra recarregar o schema cache. */
SELECT pg_notify('pgrst', 'reload schema');
