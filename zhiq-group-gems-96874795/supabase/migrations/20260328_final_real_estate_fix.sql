-- Migration: Final Real Estate Fix - RLS, Enums and Infrastructure
-- Ensures public visibility of published listings and correct checkout flow

DO $$ 
BEGIN
    -- 1. Ensure the enum type exists and has all required values
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'awaiting_payment') THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'awaiting_payment';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'payment_confirmed') THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'payment_confirmed';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'payment_failed') THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'payment_failed';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'real_estate_listing_status' AND pg_enum.enumlabel = 'cancelled') THEN
        ALTER TYPE public.real_estate_listing_status ADD VALUE 'cancelled';
    END IF;
END $$;

-- 2. Infrastructure: Restore Missing Tables
CREATE TABLE IF NOT EXISTS public.footer_contents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type text NOT NULL,
    title text NOT NULL,
    content text,
    is_active boolean DEFAULT true,
    display_order integer NOT NULL DEFAULT 99,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.footer_contents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.footer_contents;
CREATE POLICY "Allow public read access" ON public.footer_contents FOR SELECT USING (true);

-- 3. RLS: Public Visibility for Published Listings
-- Allows anyone (including anonymous visitors) to see properties that are published
DROP POLICY IF EXISTS "Allow public read for published listings" ON public.real_estate_listings;
CREATE POLICY "Allow public read for published listings" 
ON public.real_estate_listings FOR SELECT 
TO anon, authenticated 
USING (visibility_status = 'published');

-- 4. RLS: Public Visibility for Media of Published Listings
DROP POLICY IF EXISTS "Allow public read for published media" ON public.real_estate_media;
CREATE POLICY "Allow public read for published media" 
ON public.real_estate_media FOR SELECT 
TO anon, authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.real_estate_listings l 
        WHERE l.id = real_estate_media.listing_id 
        AND l.visibility_status = 'published'
    )
);

-- 5. RLS: Purchases read access (Owners can see their own orders)
ALTER TABLE public.real_estate_credit_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow owners to read their own purchases" ON public.real_estate_credit_purchases;
CREATE POLICY "Allow owners to read their own purchases" 
ON public.real_estate_credit_purchases FOR SELECT 
TO authenticated 
USING (owner_user_id = auth.uid());

-- 6. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
