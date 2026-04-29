
-- Enable RLS on delivery_offers
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT delivery_offers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_offers' AND policyname = 'delivery_offers_select_authenticated'
  ) THEN
    CREATE POLICY delivery_offers_select_authenticated
      ON public.delivery_offers
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END$$;

-- Allow authenticated users to INSERT delivery_offers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_offers' AND policyname = 'delivery_offers_insert_authenticated'
  ) THEN
    CREATE POLICY delivery_offers_insert_authenticated
      ON public.delivery_offers
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END$$;

-- Allow authenticated users to UPDATE delivery_offers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_offers' AND policyname = 'delivery_offers_update_authenticated'
  ) THEN
    CREATE POLICY delivery_offers_update_authenticated
      ON public.delivery_offers
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- Add delivery_offers to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
