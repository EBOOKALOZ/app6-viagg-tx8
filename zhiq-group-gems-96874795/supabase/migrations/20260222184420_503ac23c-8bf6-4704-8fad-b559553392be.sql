
-- Align with project guideline: avoid FK to auth.users; reference public.profiles instead
ALTER TABLE public.profile_onboarding
DROP CONSTRAINT IF EXISTS profile_onboarding_user_id_fkey;

ALTER TABLE public.profile_onboarding
ADD CONSTRAINT profile_onboarding_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;
