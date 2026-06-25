-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_UPDATE_ONBOARDING_STATUS_ON_STORE_SAVE.sql
-- Atualiza upsert_merchant_store_safe para marcar onboarding_completed = true
-- na tabela advertiser_accounts do usuário logado ao salvar a loja.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_merchant_store_safe(
  p_nome_loja      text    DEFAULT NULL,
  p_cnpj           text    DEFAULT NULL,
  p_descricao      text    DEFAULT NULL,
  p_categoria_id   text    DEFAULT NULL,
  p_telefone       text    DEFAULT NULL,
  p_email          text    DEFAULT NULL,
  p_street         text    DEFAULT NULL,
  p_number         text    DEFAULT NULL,
  p_neighborhood   text    DEFAULT NULL,
  p_logo_url       text    DEFAULT NULL,
  p_latitude       text    DEFAULT NULL,
  p_longitude      text    DEFAULT NULL,
  p_cep            text    DEFAULT NULL,
  p_cidade         text    DEFAULT NULL,
  p_estado         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_store_id     uuid;
  v_cat_id       uuid    := NULL;
  v_lat          double precision := NULL;
  v_lng          double precision := NULL;
  v_endereco_fmt text;
  v_result       jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  IF p_nome_loja IS NULL OR TRIM(p_nome_loja) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nome_loja é obrigatório');
  END IF;

  -- Categoria
  IF p_categoria_id IS NOT NULL AND p_categoria_id != '' THEN
    BEGIN v_cat_id := p_categoria_id::uuid; EXCEPTION WHEN OTHERS THEN v_cat_id := NULL; END;
  END IF;

  -- Coordenadas
  IF p_latitude  IS NOT NULL AND p_latitude  != '' THEN
    BEGIN v_lat := p_latitude::double precision;  EXCEPTION WHEN OTHERS THEN v_lat := NULL; END;
  END IF;
  IF p_longitude IS NOT NULL AND p_longitude != '' THEN
    BEGIN v_lng := p_longitude::double precision; EXCEPTION WHEN OTHERS THEN v_lng := NULL; END;
  END IF;

  -- Montar endereco_formatado a partir dos campos recebidos
  v_endereco_fmt := NULLIF(
    CONCAT_WS(', ',
      NULLIF(TRIM(COALESCE(p_street, '')),       ''),
      NULLIF(TRIM(COALESCE(p_number, '')),       ''),
      NULLIF(TRIM(COALESCE(p_neighborhood, '')), ''),
      NULLIF(TRIM(COALESCE(p_cidade, '')),       ''),
      NULLIF(TRIM(COALESCE(p_estado, '')),       '')
    ), ''
  );

  SELECT id INTO v_store_id
  FROM public.merchant_stores
  WHERE user_id = v_user_id;

  IF v_store_id IS NOT NULL THEN
    UPDATE public.merchant_stores
    SET
      nome_loja          = COALESCE(TRIM(p_nome_loja), nome_loja),
      cnpj               = COALESCE(p_cnpj, cnpj),
      descricao          = COALESCE(p_descricao, descricao),
      categoria_id       = COALESCE(v_cat_id, categoria_id),
      telefone           = COALESCE(p_telefone, telefone),
      email              = COALESCE(p_email, email),
      street             = COALESCE(p_street, street),
      number             = COALESCE(p_number, number),
      neighborhood       = COALESCE(p_neighborhood, neighborhood),
      logo_url           = COALESCE(p_logo_url, logo_url),
      latitude           = COALESCE(v_lat, latitude),
      longitude          = COALESCE(v_lng, longitude),
      cep                = COALESCE(p_cep, cep),
      cidade             = COALESCE(p_cidade, cidade),
      estado             = COALESCE(p_estado, estado),
      endereco_formatado = COALESCE(v_endereco_fmt, endereco_formatado),
      updated_at         = now()
    WHERE id = v_store_id;
  ELSE
    INSERT INTO public.merchant_stores (
      user_id, nome_loja, cnpj, descricao, categoria_id,
      telefone, email, street, number, neighborhood,
      logo_url, latitude, longitude, cep, cidade, estado,
      endereco_formatado
    ) VALUES (
      v_user_id, TRIM(p_nome_loja), p_cnpj, p_descricao, v_cat_id,
      p_telefone, p_email, p_street, p_number, p_neighborhood,
      p_logo_url, v_lat, v_lng, p_cep, p_cidade, p_estado,
      v_endereco_fmt
    ) RETURNING id INTO v_store_id;
  END IF;

  -- NOVIDADE: Marca o onboarding como concluído na tabela advertiser_accounts
  UPDATE public.advertiser_accounts
  SET onboarding_completed = true
  WHERE user_id = v_user_id;

  SELECT jsonb_build_object(
    'success',         true,
    'id',              id,
    'nome_loja',       nome_loja,
    'telefone',        telefone,
    'categoria_id',    categoria_id,
    'logo_url',        logo_url,
    'endereco_formatado', endereco_formatado,
    'latitude',        latitude,
    'longitude',       longitude
  ) INTO v_result
  FROM public.merchant_stores
  WHERE id = v_store_id;

  RETURN v_result;
END;
$$;
