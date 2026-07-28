CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Insert into profiles (verified columns only)
  INSERT INTO public.profiles (id, name, email, is_admin)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email), 
    NEW.email, 
    false
  );
  
  -- Insert default user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fallback to ensure Auth doesn't break if profile creation fails
  -- We will use the 'ensure_base_profile' pattern on frontend instead
  RETURN NEW;
END;
$$;
