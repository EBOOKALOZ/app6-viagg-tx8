-- ═══════════════════════════════════════════════════════
-- Backfill profiles.email from auth.users
-- Run this in the Supabase SQL Editor (Dashboard > SQL)
-- ═══════════════════════════════════════════════════════

-- 1. Backfill existing profiles that are missing email
UPDATE profiles p
SET email = a.email
FROM auth.users a
WHERE p.id = a.id
  AND (p.email IS NULL OR p.email = '');

-- 2. Create a trigger function to auto-sync email on new user creation
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET email = NEW.email
  WHERE id = NEW.id
    AND (email IS NULL OR email = '' OR email <> NEW.email);
  RETURN NEW;
END;
$$;

-- 3. Create trigger on auth.users (fires after insert or update)
DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();

-- 4. Admin-only RPC to get auth emails (fallback for client-side queries)
CREATE OR REPLACE FUNCTION public.admin_get_auth_emails(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, auth_email text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, email::text
  FROM auth.users
  WHERE id = ANY(p_user_ids);
$$;
