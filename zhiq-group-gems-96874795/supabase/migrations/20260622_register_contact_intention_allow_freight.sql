/*
  Adiciona o branch 'freight' à RPC register_contact_intention (mesma RPC
  já corrigida hoje pra suportar 'services' — sem isso, o formulário de
  interesse em /fretes/:id falharia com "Erro ao registrar interesse",
  igual aconteceu com Serviços antes da correção de hoje).

  Recria a função preservando TODOS os branches existentes (real_estate,
  vehicles, product, services) + o novo (freight).
*/

DROP FUNCTION IF EXISTS public.register_contact_intention(text, uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.register_contact_intention(
  p_listing_module text,
  p_listing_id uuid,
  p_interest_type text,
  p_visitor_name text DEFAULT NULL,
  p_visitor_phone text DEFAULT NULL,
  p_visitor_message text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advertiser_user_id uuid;
  v_intention_id uuid;
BEGIN
  IF p_visitor_name IS NULL OR length(trim(p_visitor_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'nome_obrigatorio');
  END IF;

  IF p_listing_module = 'real_estate' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.real_estate_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'vehicles' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.vehicle_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'product' THEN
    SELECT created_by_user_id INTO v_advertiser_user_id FROM public.merchant_marketing_products WHERE id = p_listing_id;
    IF v_advertiser_user_id IS NULL THEN
      SELECT aa.user_id INTO v_advertiser_user_id
      FROM public.advertiser_listings al
      JOIN public.advertiser_accounts aa ON aa.id = al.advertiser_account_id
      WHERE al.id = p_listing_id;
    END IF;
  ELSIF p_listing_module = 'services' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.service_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'freight' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.freight_listings WHERE id = p_listing_id;
  END IF;

  -- Ensure listing was found
  IF v_advertiser_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'listing_not_found');
  END IF;

  -- Prevent self-contact
  IF auth.uid() = v_advertiser_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_contact_not_allowed');
  END IF;

  -- Insert intention
  INSERT INTO public.advertiser_contact_intentions (
    advertiser_user_id,
    listing_module,
    listing_id,
    interest_type,
    visitor_name,
    visitor_phone,
    visitor_message,
    city,
    region,
    status,
    created_at
  )
  VALUES (
    v_advertiser_user_id,
    p_listing_module,
    p_listing_id,
    p_interest_type,
    trim(p_visitor_name),
    regexp_replace(p_visitor_phone, '\D', '', 'g'),
    p_visitor_message,
    p_city,
    p_region,
    'pending_unlock',
    now()
  )
  RETURNING id INTO v_intention_id;

  RETURN jsonb_build_object('success', true, 'intention_id', v_intention_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_contact_intention(text, uuid, text, text, text, text, text, text) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
