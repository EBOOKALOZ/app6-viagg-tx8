-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Enable realtime on service_orders
-- PURPOSE: O painel do lojista (MerchantDeliveryView) escuta postgres_changes
--          em service_orders para refletir mudanças de status em tempo real.
--          Sem essa publicação, updates como 'completed' não chegam ao cliente
--          até que a página seja recarregada.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
    RAISE LOG '✅ service_orders adicionada ao supabase_realtime';
  END IF;
END $$;

-- Garantir REPLICA IDENTITY FULL para que payloads de realtime carreguem
-- todos os campos (necessário para evitar undefined em payload.new).
ALTER TABLE public.service_orders REPLICA IDENTITY FULL;
