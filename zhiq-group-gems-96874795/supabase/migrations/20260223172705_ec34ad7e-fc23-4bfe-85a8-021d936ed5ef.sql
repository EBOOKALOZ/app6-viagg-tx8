
CREATE OR REPLACE FUNCTION public.try_create_whatsapp_group(
  p_link TEXT,
  p_city TEXT,
  p_group_type TEXT,
  p_created_by UUID
) RETURNS TABLE(created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_groups WHERE link = p_link) THEN
    RETURN QUERY SELECT FALSE;
  ELSE
    INSERT INTO public.whatsapp_groups (created_by, user_id, link, city, group_type, status, name)
    VALUES (p_created_by, p_created_by, p_link, p_city, p_group_type, 'em_analise', p_city);
    RETURN QUERY SELECT TRUE;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_create_driver_whatsapp_group(
  p_link TEXT,
  p_cidade TEXT,
  p_estado TEXT,
  p_tipo TEXT,
  p_user_id UUID
) RETURNS TABLE(created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.driver_whatsapp_groups WHERE link = p_link) THEN
    RETURN QUERY SELECT FALSE;
  ELSE
    INSERT INTO public.driver_whatsapp_groups (user_id, link, cidade, estado, tipo, status)
    VALUES (p_user_id, p_link, p_cidade, p_estado, p_tipo, 'em_analise');
    RETURN QUERY SELECT TRUE;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_create_merchant_whatsapp_group(
  p_link TEXT,
  p_cidade TEXT,
  p_estado TEXT,
  p_tipo TEXT,
  p_user_id UUID
) RETURNS TABLE(created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.merchant_whatsapp_groups WHERE link = p_link) THEN
    RETURN QUERY SELECT FALSE;
  ELSE
    INSERT INTO public.merchant_whatsapp_groups (user_id, link, cidade, estado, tipo, status)
    VALUES (p_user_id, p_link, p_cidade, p_estado, p_tipo, 'em_analise');
    RETURN QUERY SELECT TRUE;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_create_motoboy_whatsapp_group(
  p_link TEXT,
  p_cidade TEXT,
  p_estado TEXT,
  p_city_id TEXT,
  p_tipo TEXT,
  p_user_id UUID
) RETURNS TABLE(created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.motoboy_whatsapp_groups WHERE link = p_link) THEN
    RETURN QUERY SELECT FALSE;
  ELSE
    INSERT INTO public.motoboy_whatsapp_groups (user_id, motoboy_id, link, cidade, estado, city_id, tipo, status)
    VALUES (p_user_id, p_user_id, p_link, p_cidade, p_estado, p_city_id, p_tipo, 'em_analise');
    RETURN QUERY SELECT TRUE;
  END IF;
END;
$$;
