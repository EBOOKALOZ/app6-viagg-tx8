-- Run this script in the Supabase SQL Editor to fix the "updated_at" error
ALTER TABLE public.merchant_stores
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Optional: Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_merchant_stores_updated_at ON public.merchant_stores;
CREATE TRIGGER set_merchant_stores_updated_at
BEFORE UPDATE ON public.merchant_stores
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
