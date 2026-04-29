-- Add profile columns to existing profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS available_profiles text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS active_profile text DEFAULT NULL;

-- Update the handle_new_user function to include new columns
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, email, available_profiles, active_profile)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'name', NEW.email, '{}', NULL);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$function$;