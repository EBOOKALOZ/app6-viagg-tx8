-- Enable realtime for purchase_intentions
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_intentions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_intentions;
    END IF;
  END
  $$;
COMMIT;
