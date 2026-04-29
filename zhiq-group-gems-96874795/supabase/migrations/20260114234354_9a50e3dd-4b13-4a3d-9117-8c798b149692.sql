-- Create a function to automatically assign admin role to specific emails
CREATE OR REPLACE FUNCTION public.assign_admin_role_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user's email is an admin email
  IF NEW.email IN ('suporte@zhiq.app') THEN
    -- Insert admin role for this user
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table (which is created after auth.users)
DROP TRIGGER IF EXISTS assign_admin_role_trigger ON public.profiles;
CREATE TRIGGER assign_admin_role_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.assign_admin_role_on_signup();

-- Also check existing users and assign admin role if needed
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE p.email = 'suporte@zhiq.app'
ON CONFLICT (user_id, role) DO NOTHING;