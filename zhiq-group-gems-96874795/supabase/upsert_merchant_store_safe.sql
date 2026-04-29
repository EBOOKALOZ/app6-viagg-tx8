-- =====================================================================
-- RPC BLINDADA: upsert_merchant_store_safe
-- Única porta de entrada para INSERT/UPDATE em merchant_stores.
-- Usa auth.uid() internamente. Ignora campos desconhecidos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.upsert_merchant_store_safe(
  p_nome_loja     text    DEFAULT NULL,
  p_cnpj          text    DEFAULT NULL,
  p_descricao     text    DEFAULT NULL,
  p_categoria_id  text    DEFAULT NULL,
  p_telefone      text    DEFAULT NULL,
  p_email         text    DEFAULT NULL,
  p_street        text    DEFAULT NULL,
  p_number        text    DEFAULT NULL,
  p_neighborhood  text    DEFAULT NULL,
  p_logo_url      text    DEFAULT NULL,
  p_latitude      text    DEFAULT NULL,
  p_longitude     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_store_id    uuid;
  v_cat_id      uuid := NULL;
  v_lat         double precision := NULL;
  v_lng         double precision := NULL;
  v_result      jsonb;
BEGIN
  -- 1) Identifica o usuário pelo JWT
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- 2) Valida campo obrigatório
  IF p_nome_loja IS NULL OR trim(p_nome_loja) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nome_loja é obrigatório');
  END IF;

  -- 3) Converte categoria_id de text para uuid (se fornecido)
  IF p_categoria_id IS NOT NULL AND p_categoria_id != '' THEN
    BEGIN
      v_cat_id := p_categoria_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_cat_id := NULL;
    END;
  END IF;

  -- 4) Converte lat/lng de text para double precision
  IF p_latitude IS NOT NULL AND p_latitude != '' THEN
    BEGIN v_lat := p_latitude::double precision; EXCEPTION WHEN OTHERS THEN v_lat := NULL; END;
  END IF;
  IF p_longitude IS NOT NULL AND p_longitude != '' THEN
    BEGIN v_lng := p_longitude::double precision; EXCEPTION WHEN OTHERS THEN v_lng := NULL; END;
  END IF;

  -- 5) Verifica se já existe loja para este user
  SELECT id INTO v_store_id
  FROM public.merchant_stores
  WHERE user_id = v_user_id;

  IF v_store_id IS NOT NULL THEN
    -- UPDATE
    UPDATE public.merchant_stores
    SET
      nome_loja    = COALESCE(trim(p_nome_loja), nome_loja),
      cnpj         = COALESCE(p_cnpj, cnpj),
      descricao    = COALESCE(p_descricao, descricao),
      categoria_id = COALESCE(v_cat_id, categoria_id),
      telefone     = COALESCE(p_telefone, telefone),
      email        = COALESCE(p_email, email),
      street       = COALESCE(p_street, street),
      number       = COALESCE(p_number, number),
      neighborhood = COALESCE(p_neighborhood, neighborhood),
      logo_url     = COALESCE(p_logo_url, logo_url),
      latitude     = COALESCE(v_lat, latitude),
      longitude    = COALESCE(v_lng, longitude)
    WHERE id = v_store_id;
  ELSE
    -- INSERT
    INSERT INTO public.merchant_stores (
      user_id, nome_loja, cnpj, descricao, categoria_id,
      telefone, email, street, number, neighborhood, logo_url,
      latitude, longitude
    ) VALUES (
      v_user_id, trim(p_nome_loja), p_cnpj, p_descricao, v_cat_id,
      p_telefone, p_email, p_street, p_number, p_neighborhood, p_logo_url,
      v_lat, v_lng
    )
    RETURNING id INTO v_store_id;
  END IF;

  -- 6) Retorna dados persistidos
  SELECT jsonb_build_object(
    'success',         true,
    'store_id',        ms.id,
    'nome_loja',       ms.nome_loja,
    'cnpj',            ms.cnpj,
    'descricao',       ms.descricao,
    'categoria_id',    ms.categoria_id,
    'categoria_nome',  COALESCE(cl.nome, ''),
    'telefone',        ms.telefone,
    'email',           ms.email,
    'street',          ms.street,
    'number',          ms.number,
    'neighborhood',    ms.neighborhood,
    'logo_url',        ms.logo_url,
    'latitude',        ms.latitude,
    'longitude',       ms.longitude
  ) INTO v_result
  FROM public.merchant_stores ms
  LEFT JOIN public.categorias_loja cl ON cl.id = ms.categoria_id
  WHERE ms.id = v_store_id;

  RETURN v_result;
END;
$$;

-- Permissão (12 params agora)
GRANT EXECUTE ON FUNCTION public.upsert_merchant_store_safe(
  text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;
