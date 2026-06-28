-- Fix 1: Garantir colunas opcionais em service_orders que dispatch usa
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS store_address text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS order_description text;

-- Fix 2: Garantir colunas extras em delivery_offers usadas pelo dispatch atual
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS service_order_id uuid;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS total_price numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS gross_value numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS net_value numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS pickup_lat_snapshot double precision;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS pickup_lng_snapshot double precision;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS dropoff_lat_snapshot double precision;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS dropoff_lng_snapshot double precision;

-- Fix 3: Notificações realtime para public_rides (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'public_rides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.public_rides;
  END IF;
END $$;
