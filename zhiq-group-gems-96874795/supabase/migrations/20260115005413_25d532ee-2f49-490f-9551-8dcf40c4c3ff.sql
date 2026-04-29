-- =============================================
-- SECURITY FIX: profiles, motoboy_profiles, driver_profiles
-- =============================================

-- 1. PROFILES TABLE
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Revoke all access from anonymous/public
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM public;

-- Enable and force RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- Grant only to authenticated
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- Create explicit policies
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 2. MOTOBOY_PROFILES TABLE
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own motoboy profile" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Admins can view all motoboy profiles" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Users can insert their own motoboy profile" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Users can update their own motoboy profile" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Admins can update all motoboy profiles" ON public.motoboy_profiles;

-- Revoke all access from anonymous/public
REVOKE ALL ON public.motoboy_profiles FROM anon;
REVOKE ALL ON public.motoboy_profiles FROM public;

-- Enable and force RLS
ALTER TABLE public.motoboy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoboy_profiles FORCE ROW LEVEL SECURITY;

-- Grant only to authenticated
GRANT SELECT, INSERT, UPDATE ON public.motoboy_profiles TO authenticated;

-- Create explicit policies
CREATE POLICY "motoboy_profiles_select"
ON public.motoboy_profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "motoboy_profiles_insert"
ON public.motoboy_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "motoboy_profiles_update"
ON public.motoboy_profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 3. DRIVER_PROFILES TABLE
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own driver profile" ON public.driver_profiles;
DROP POLICY IF EXISTS "Admins can view all driver profiles" ON public.driver_profiles;
DROP POLICY IF EXISTS "Users can insert their own driver profile" ON public.driver_profiles;
DROP POLICY IF EXISTS "Users can update their own driver profile" ON public.driver_profiles;
DROP POLICY IF EXISTS "Admins can update all driver profiles" ON public.driver_profiles;

-- Revoke all access from anonymous/public
REVOKE ALL ON public.driver_profiles FROM anon;
REVOKE ALL ON public.driver_profiles FROM public;

-- Enable and force RLS
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles FORCE ROW LEVEL SECURITY;

-- Grant only to authenticated
GRANT SELECT, INSERT, UPDATE ON public.driver_profiles TO authenticated;

-- Create explicit policies
CREATE POLICY "driver_profiles_select"
ON public.driver_profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "driver_profiles_insert"
ON public.driver_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "driver_profiles_update"
ON public.driver_profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));