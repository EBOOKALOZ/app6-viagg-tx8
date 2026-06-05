/*
  RPC register_product_inquiry — visitante (anon ou logado) manda pergunta
  sobre um produto do /mercado direto pro painel "Mensagens" do lojista.

  Resolve o dono do produto (advertiser_user_id) a partir de:
    1. merchant_marketing_products.created_by_user_id, OU
    2. advertiser_listings (via advertiser_accounts.user_id)

  Insere em advertiser_contact_intentions com listing_module = 'product'.
  SECURITY DEFINER → roda como service_role, ignora RLS na inserção (anti-spam
  futuro vai por rate-limit, não por RLS).
*/

CREATE OR REPLACE FUNCTION public.register_product_inquiry(
  p_product_id uuid,
  p_visitor_name text,
  p_visitor_phone text,
  p_visitor_email text DEFAULT NULL,
  p_visitor_message text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advertiser_user_id uuid;
  v_intention_id uuid;
  v_full_message text;
BEGIN
  /* Validação básica */
  IF p_visitor_name IS NULL OR length(trim(p_visitor_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'nome_obrigatorio');
  END IF;
  IF p_visitor_phone IS NULL OR length(regexp_replace(p_visitor_phone, '\D', '', 'g')) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'whatsapp_invalido');
  END IF;

  /* Resolve dono — tenta merchant_marketing_products primeiro */
  SELECT created_by_user_id INTO v_advertiser_user_id
  FROM public.merchant_marketing_products
  WHERE id = p_product_id
  LIMIT 1;

  /* Se não achou, tenta advertiser_listings (advertiser_accounts.user_id) */
  IF v_advertiser_user_id IS NULL THEN
    SELECT aa.user_id INTO v_advertiser_user_id
    FROM public.advertiser_listings al
    JOIN public.advertiser_accounts aa ON aa.id = al.advertiser_account_id
    WHERE al.id = p_product_id
    LIMIT 1;
  END IF;

  IF v_advertiser_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'produto_nao_encontrado');
  END IF;

  /* Monta mensagem completa: pergunta + e-mail (se houver) */
  v_full_message := coalesce(p_visitor_message, '');
  IF p_visitor_email IS NOT NULL AND length(trim(p_visitor_email)) > 0 THEN
    v_full_message := v_full_message || E'\n\nE-mail: ' || trim(p_visitor_email);
  END IF;

  /* Insere o lead */
  INSERT INTO public.advertiser_contact_intentions (
    advertiser_user_id,
    listing_module,
    listing_id,
    interest_type,
    visitor_name,
    visitor_phone,
    visitor_message,
    city,
    status,
    created_at
  )
  VALUES (
    v_advertiser_user_id,
    'product',
    p_product_id,
    'message_request',
    trim(p_visitor_name),
    regexp_replace(p_visitor_phone, '\D', '', 'g'),
    NULLIF(v_full_message, ''),
    p_city,
    'pending_unlock',
    now()
  )
  RETURNING id INTO v_intention_id;

  RETURN jsonb_build_object('success', true, 'intention_id', v_intention_id);
END;
$$;

/* Expõe a RPC pra anon e authenticated (mesmo padrão das outras públicas) */
GRANT EXECUTE ON FUNCTION public.register_product_inquiry(uuid, text, text, text, text, text)
  TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
