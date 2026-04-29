
-- Harden onboarding RPCs: do not accept arbitrary user_id; rely on auth.uid() + RLS (security invoker)
DROP FUNCTION IF EXISTS public.check_profile_onboarding(uuid, text);
DROP FUNCTION IF EXISTS public.complete_profile_onboarding(uuid, text);

CREATE OR REPLACE FUNCTION public.check_profile_onboarding(p_profile_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT profile_completed
     FROM profile_onboarding
     WHERE user_id = auth.uid()
       AND profile_type = p_profile_type),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.complete_profile_onboarding(p_profile_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profile_onboarding (user_id, profile_type, profile_completed, completed_at)
  VALUES (auth.uid(), p_profile_type, true, now())
  ON CONFLICT (user_id, profile_type)
  DO UPDATE SET profile_completed = true, completed_at = now();
END;
$$;
