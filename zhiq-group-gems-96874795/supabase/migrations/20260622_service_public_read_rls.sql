-- =========================================================
-- SERVICE LISTINGS: políticas de leitura pública
-- =========================================================
-- Mesma falha já corrigida pra veículos (20260413_vehicle_public_read_rls.sql):
-- sem essa política, visitantes anônimos (e autenticados que não são o dono)
-- não conseguem ver as fotos do serviço (service_media) nem os dados da
-- página de detalhe (ServiceDetailPage consulta service_listings direto,
-- não só a view public_service_listings).

-- 1. Leitura pública de anúncios publicados / ativos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_listings_public_read' AND tablename = 'service_listings'
  ) THEN
    CREATE POLICY service_listings_public_read
      ON public.service_listings
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- 2. Leitura pública de mídias de serviços
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_media_public_read' AND tablename = 'service_media'
  ) THEN
    CREATE POLICY service_media_public_read
      ON public.service_media
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
