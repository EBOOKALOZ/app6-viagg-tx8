-- Update the function to use the correct admin email
CREATE OR REPLACE FUNCTION public.assign_admin_role_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user's email is an admin email
  IF NEW.email IN ('angelo_zanatta@hotmail.com') THEN
    -- Insert admin role for this user
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Assign admin role to existing user with this email
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE p.email = 'angelo_zanatta@hotmail.com'
ON CONFLICT (user_id, role) DO NOTHING;