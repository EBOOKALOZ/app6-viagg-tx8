-- Revoke all access from anonymous and public roles
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM public;

REVOKE ALL ON public.motoboy_profiles FROM anon;
REVOKE ALL ON public.motoboy_profiles FROM public;

-- Grant access only to authenticated users (RLS will filter)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.motoboy_profiles TO authenticated;

-- Ensure RLS is enabled and forced
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.motoboy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoboy_profiles FORCE ROW LEVEL SECURITY;