-- =========================================================
-- DEFINITIVE FIX: REAL ESTATE SCHEMA (BUTTON_LABEL & EXTENDED FIELDS)
-- =========================================================

-- 1. Ensure ALL requested columns exist in real_estate_credit_packages
DO $$ 
BEGIN 
    -- button_label
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='button_label') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN button_label text DEFAULT 'Selecionar';
    END IF;

    -- package_type (e.g., 'standard', 'premium', 'exclusive')
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='package_type') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN package_type text DEFAULT 'standard';
    END IF;

    -- bonus_credits
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='bonus_credits') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN bonus_credits integer DEFAULT 0;
    END IF;

    -- is_featured (commercial highlight)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='is_featured') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN is_featured boolean DEFAULT false;
    END IF;

    -- badge_text
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='badge_text') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN badge_text text;
    END IF;

    -- is_recommended
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='is_recommended') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN is_recommended boolean NOT NULL DEFAULT false;
    END IF;

    -- sort_order
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='sort_order') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
    END IF;

    -- is_active
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='real_estate_credit_packages' AND column_name='is_active') THEN
        ALTER TABLE public.real_estate_credit_packages ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    END IF;
END $$;

-- 2. Update existing data to have a button_label if null
UPDATE public.real_estate_credit_packages 
SET button_label = 'Selecionar' 
WHERE button_label IS NULL;

-- 3. Force Reload Schema Cache (PostgREST)
NOTIFY pgrst, 'reload schema';
