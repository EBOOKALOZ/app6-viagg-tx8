-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260330_advertiser_account_rebuild_fields.sql
-- Goal: Add administrative fields for account management and preferences.
-- ═══════════════════════════════════════════════════════════════

-- 1. ADD COLUMNS TO advertiser_accounts
ALTER TABLE public.advertiser_accounts 
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.real_estate_credit_packages(id),
  ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{
    "receive_email_notifications": true,
    "receive_listing_alerts": true,
    "receive_credit_warnings": true,
    "receive_commercial_messages": false
  }'::JSONB;

-- 2. ENSURE RLS FOR PREFERENCES
-- Users should be able to update their own account settings
DROP POLICY IF EXISTS "Advertisers can update their own account" ON public.advertiser_accounts;
CREATE POLICY "Advertisers can update their own account" 
  ON public.advertiser_accounts 
  FOR UPDATE 
  USING (auth.uid() = id);

-- 3. ENSURE CREDITS BALANCE TABLE FOR ADVERTISERS
-- This table already exists in some migrations but let's ensure it for new users
CREATE TABLE IF NOT EXISTS public.real_estate_credit_balances (
    owner_user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    available_credits INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.real_estate_credit_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own balance" ON public.real_estate_credit_balances;
CREATE POLICY "Users can view their own balance" 
    ON public.real_estate_credit_balances 
    FOR SELECT 
    USING (auth.uid() = owner_user_id);

-- 4. RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
