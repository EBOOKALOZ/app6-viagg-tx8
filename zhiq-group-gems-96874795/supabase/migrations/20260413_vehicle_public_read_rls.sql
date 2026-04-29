-- =========================================================
-- VEHICLE LISTINGS: políticas de leitura pública
-- =========================================================
-- Sem essa política, visitantes anônimos (e autenticados que
-- não são o dono) não conseguem visualizar detalhes de veículos.

-- 1. Leitura pública de anúncios publicados / ativos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'vehicle_listings_public_read' AND tablename = 'vehicle_listings'
  ) THEN
    CREATE POLICY vehicle_listings_public_read
      ON public.vehicle_listings
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- 2. Leitura pública de mídias de veículos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'vehicle_media_public_read' AND tablename = 'vehicle_media'
  ) THEN
    CREATE POLICY vehicle_media_public_read
      ON public.vehicle_media
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
