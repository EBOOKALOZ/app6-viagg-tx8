-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260330_correct_ensure_advertiser_account_signature.sql
-- Goal: Correct the ensure_advertiser_account function signature to (p_full_name, p_whatsapp).
-- ═══════════════════════════════════════════════════════════════

-- 1. DROP THE OLD PARAMETERLESS FUNCTION
DROP FUNCTION IF EXISTS public.ensure_advertiser_account();

-- 2. CREATE THE UPDATED FUNCTION WITH PARAMETERS
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
      -- Only update name/phone if they are provided and current ones are null
      full_name = COALESCE(advertiser_accounts.full_name, EXCLUDED.full_name),
      whatsapp = COALESCE(advertiser_accounts.whatsapp, EXCLUDED.whatsapp)
  WHERE advertiser_accounts.id = v_user_id;

  RETURN jsonb_build_object('success', true, 'id', v_user_id);
END;
$$;

-- 3. GRANTS
GRANT EXECUTE ON FUNCTION public.ensure_advertiser_account(TEXT, TEXT) TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';
