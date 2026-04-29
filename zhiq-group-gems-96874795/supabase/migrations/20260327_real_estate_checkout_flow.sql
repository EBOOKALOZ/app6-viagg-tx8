-- Migration: Add awaiting_payment and plan_selected to real_estate_listing_status
-- Add last_payment_id to real_estate_listings to track associated transactions

DO $$ 
BEGIN
    -- Add awaiting_payment to the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'awaiting_payment'
    ) THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'awaiting_payment';
    END IF;

    -- Add plan_selected to the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'plan_selected'
    ) THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'plan_selected';
    END IF;

    -- Add payment_confirmed to the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'payment_confirmed'
    ) THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'payment_confirmed';
    END IF;

    -- Add payment_failed to the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'payment_failed'
    ) THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'payment_failed';
    END IF;

    -- Add payment_expired to the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'payment_expired'
    ) THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'payment_expired';
    END IF;

    -- Add cancelled to the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'cancelled'
    ) THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'cancelled';
    END IF;
END $$;

-- Add last_payment_id to real_estate_listings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'real_estate_listings' AND column_name = 'last_payment_id'
    ) THEN
        ALTER TABLE public.real_estate_listings ADD COLUMN last_payment_id uuid REFERENCES public.real_estate_credit_purchases(id);
    END IF;
END $$;
