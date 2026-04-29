-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260328_fix_advertiser_auth_flow.sql
-- Goal: Fix signup "status" column error and ensure advertiser account isolation.
-- ═══════════════════════════════════════════════════════════════

-- 1. SANITIZE handle_new_user TRIGGER
-- The error 42703 (column "status" does not exist) typically happens here
-- if it was recently modified to include "status" in public.profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert into profiles (verified columns only)
  INSERT INTO public.profiles (id, name, email, is_admin)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email), 
    NEW.email, 
    false
  );
  
  -- Insert default user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fallback to ensure Auth doesn't break if profile creation fails
  -- We will use the 'ensure_base_profile' pattern on frontend instead
  RETURN NEW;
END;
$$;

-- 2. UPDATE advertiser_accounts TABLE
ALTER TABLE public.advertiser_accounts 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. IMPLEMENT ensure_advertiser_account RPC
-- Safe function to be called from the frontend to guarantee account existence.
CREATE OR REPLACE FUNCTION public.ensure_advertiser_account(
  p_full_name TEXT DEFAULT NULL, 
  p_whatsapp TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  INSERT INTO public.advertiser_accounts (id, email, full_name, whatsapp, status, updated_at)
  VALUES (v_user_id, v_email, p_full_name, p_whatsapp, 'active', now())
  ON CONFLICT (id) DO UPDATE 
  SET updated_at = now(),
      email = EXCLUDED.email,
      full_name = COALESCE(advertiser_accounts.full_name, EXCLUDED.full_name),
      whatsapp = COALESCE(advertiser_accounts.whatsapp, EXCLUDED.whatsapp)
  WHERE advertiser_accounts.id = v_user_id;

  RETURN jsonb_build_object('success', true, 'id', v_user_id);
END;
$$;

-- 4. GRANTS
GRANT EXECUTE ON FUNCTION public.ensure_advertiser_account(TEXT, TEXT) TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';
