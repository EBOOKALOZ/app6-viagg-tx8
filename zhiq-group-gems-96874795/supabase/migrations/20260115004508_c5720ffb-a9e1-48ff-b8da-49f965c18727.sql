-- Fix RLS policies for profiles table
-- Drop existing restrictive policies and recreate as permissive

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (critical for security)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- Create PERMISSIVE policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Fix RLS policies for motoboy_profiles table
DROP POLICY IF EXISTS "Admins can update all motoboy profiles" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Admins can view all motoboy profiles" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Users can insert their own motoboy profile" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Users can update their own motoboy profile" ON public.motoboy_profiles;
DROP POLICY IF EXISTS "Users can view their own motoboy profile" ON public.motoboy_profiles;

-- Ensure RLS is enabled
ALTER TABLE public.motoboy_profiles ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too
ALTER TABLE public.motoboy_profiles FORCE ROW LEVEL SECURITY;

-- Create PERMISSIVE policies for motoboy_profiles
CREATE POLICY "Users can view their own motoboy profile"
ON public.motoboy_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all motoboy profiles"
ON public.motoboy_profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own motoboy profile"
ON public.motoboy_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own motoboy profile"
ON public.motoboy_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update all motoboy profiles"
ON public.motoboy_profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));