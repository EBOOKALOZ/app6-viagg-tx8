-- Migration: Add expires_at to real_estate_credit_purchases
-- To track Pix/Boleto expiration and handle frontend countdowns

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'real_estate_credit_purchases' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE public.real_estate_credit_purchases ADD COLUMN expires_at timestamptz;
        
        -- Add index for performance in cleanup workers
        CREATE INDEX IF NOT EXISTS idx_real_estate_purchases_expiration ON public.real_estate_credit_purchases(expires_at, payment_status);
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
