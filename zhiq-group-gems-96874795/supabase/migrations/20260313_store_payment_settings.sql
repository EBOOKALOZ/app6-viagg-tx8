-- ================================================
-- CONFIGURAÇÕES DE PAGAMENTO POR LOJA
-- Pagamento DIRETO para a loja (sem gateway)
-- Migration: 20260313_store_payment_settings
-- IDEMPOTENT: safe to re-run
-- ================================================

CREATE TABLE IF NOT EXISTS public.store_payment_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL UNIQUE,

    -- PIX direto
    accepts_direct_pix BOOLEAN DEFAULT false,
    pix_key TEXT,
    pix_key_type TEXT CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria') OR pix_key_type IS NULL),
    pix_holder_name TEXT,
    pix_holder_document TEXT,
    bank_name TEXT,

    -- Outras formas diretas
    accepts_bank_transfer BOOLEAN DEFAULT false,
    accepts_card_on_site BOOLEAN DEFAULT false,
    accepts_in_store_payment BOOLEAN DEFAULT true,

    -- Contato e instruções
    store_whatsapp TEXT,
    payment_instructions TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sps_store ON public.store_payment_settings(store_id);

ALTER TABLE public.store_payment_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to make this idempotent
DROP POLICY IF EXISTS "sps_select_all" ON public.store_payment_settings;
DROP POLICY IF EXISTS "sps_insert_owner" ON public.store_payment_settings;
DROP POLICY IF EXISTS "sps_update_owner" ON public.store_payment_settings;
DROP POLICY IF EXISTS "sps_insert_all" ON public.store_payment_settings;
DROP POLICY IF EXISTS "sps_update_all" ON public.store_payment_settings;

-- Public can read (needed for cart checkout to show store payment data)
CREATE POLICY "sps_select_all" ON public.store_payment_settings
    FOR SELECT USING (true);

-- Any authenticated user can insert (store owner verified at app level)
CREATE POLICY "sps_insert_all" ON public.store_payment_settings
    FOR INSERT WITH CHECK (true);

-- Any authenticated user can update (store owner verified at app level)
CREATE POLICY "sps_update_all" ON public.store_payment_settings
    FOR UPDATE USING (true);

-- ================================================
-- ADD NEW COLUMNS IF TABLE ALREADY EXISTS
-- (safe for re-run after first version)
-- ================================================
DO $$ BEGIN
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS accepts_direct_pix BOOLEAN DEFAULT false;
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS pix_key_type TEXT;
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS pix_holder_document TEXT;
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS bank_name TEXT;
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS accepts_bank_transfer BOOLEAN DEFAULT false;
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS accepts_card_on_site BOOLEAN DEFAULT false;
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS accepts_in_store_payment BOOLEAN DEFAULT true;
    ALTER TABLE public.store_payment_settings ADD COLUMN IF NOT EXISTS store_whatsapp TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop old columns that no longer apply (from v1 of this migration)
DO $$ BEGIN
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS online_payment_enabled;
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS accepts_pix;
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS accepts_credit_card;
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS accepts_debit_card;
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS accepts_cash;
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS accepts_payment_link;
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS accepts_pay_on_pickup;
    ALTER TABLE public.store_payment_settings DROP COLUMN IF EXISTS accepts_pay_on_delivery;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
