
-- Per-profile onboarding completion tracking
CREATE TABLE public.profile_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type text NOT NULL,
  profile_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, profile_type)
);

-- Enable RLS
ALTER TABLE public.profile_onboarding ENABLE ROW LEVEL SECURITY;

-- Users can read their own onboarding status
CREATE POLICY "Users can view own onboarding"
ON public.profile_onboarding
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own onboarding record
CREATE POLICY "Users can insert own onboarding"
ON public.profile_onboarding
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own onboarding record
CREATE POLICY "Users can update own onboarding"
ON public.profile_onboarding
FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- Admins can view all
CREATE POLICY "Admins can view all onboarding"
ON public.profile_onboarding
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update all
CREATE POLICY "Admins can update all onboarding"
ON public.profile_onboarding
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Function to check/ensure onboarding record exists
CREATE OR REPLACE FUNCTION public.check_profile_onboarding(p_user_id uuid, p_profile_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT profile_completed FROM profile_onboarding WHERE user_id = p_user_id AND profile_type = p_profile_type),
    false
  );
$$;

-- Function to mark profile as completed
CREATE OR REPLACE FUNCTION public.complete_profile_onboarding(p_user_id uuid, p_profile_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profile_onboarding (user_id, profile_type, profile_completed, completed_at)
  VALUES (p_user_id, p_profile_type, true, now())
  ON CONFLICT (user_id, profile_type)
  DO UPDATE SET profile_completed = true, completed_at = now();
END;
$$;
