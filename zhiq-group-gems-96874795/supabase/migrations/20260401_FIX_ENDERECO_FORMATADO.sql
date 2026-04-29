-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260401_FIX_ENDERECO_FORMATADO_V2.sql
-- Restaura a coluna endereco_formatado em merchant_stores
-- Popula automaticamente a partir dos campos fragmentados
-- Atualiza upsert_merchant_store_safe para gravá-la
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG '=== RESTAURANDO endereco_formatado ==='; END $$;

-- 1. ADICIONAR A COLUNA (caso não exista)
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS endereco_formatado text,
  ADD COLUMN IF NOT EXISTS latitude           double precision,
  ADD COLUMN IF NOT EXISTS longitude          double precision,
  ADD COLUMN IF NOT EXISTS street             text,
  ADD COLUMN IF NOT EXISTS number             text,
  ADD COLUMN IF NOT EXISTS neighborhood       text;

-- 2. BACKFILL: Montar endereco_formatado para registros existentes
UPDATE public.merchant_stores
SET endereco_formatado = NULLIF(
  CONCAT_WS(', ',
    NULLIF(TRIM(COALESCE(street,      rua,    '')), ''),
    NULLIF(TRIM(COALESCE(number,      numero, '')), ''),
    NULLIF(TRIM(COALESCE(neighborhood,bairro, '')), ''),
    NULLIF(TRIM(COALESCE(cidade, '')),              ''),
    NULLIF(TRIM(COALESCE(estado, '')),              '')
  ), ''
)
WHERE endereco_formatado IS NULL
  AND (
    street IS NOT NULL OR rua IS NOT NULL OR
    cidade IS NOT NULL OR bairro IS NOT NULL
  );

-- 3. ATUALIZAR upsert_merchant_store_safe para persistir endereco_formatado
DO $$
DECLARE
  r RECORD;
  i INT := 1;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'upsert_merchant_store_safe'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'ALTER FUNCTION ' || r.sig || ' RENAME TO upsert_merchant_store_safe_legacy_' || i;
    i := i + 1;
  END LOOP;
END $$;

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
    )
    RETURNING id INTO v_store_id;
  END IF;

  -- Retornar dados completos incluindo endereco_formatado
  SELECT jsonb_build_object(
    'success',           true,
    'store_id',          ms.id,
    'nome_loja',         ms.nome_loja,
    'cnpj',              ms.cnpj,
    'descricao',         ms.descricao,
    'categoria_id',      ms.categoria_id,
    'categoria_nome',    COALESCE(cl.nome, ''),
    'telefone',          ms.telefone,
    'email',             ms.email,
    'street',            ms.street,
    'number',            ms.number,
    'neighborhood',      ms.neighborhood,
    'logo_url',          ms.logo_url,
    'latitude',          ms.latitude,
    'longitude',         ms.longitude,
    'cep',               ms.cep,
    'cidade',            ms.cidade,
    'estado',            ms.estado,
    'endereco_formatado', ms.endereco_formatado
  ) INTO v_result
  FROM public.merchant_stores ms
  LEFT JOIN public.categorias_loja cl ON cl.id = ms.categoria_id
  WHERE ms.id = v_store_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_merchant_store_safe(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;

-- 4. CORRIGIR create_delivery_order para não referenciar endereco_formatado
--    via COALESCE (usa o que tiver: coluna direta ou montagem de campos)
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_store_id        uuid,
  pickup_lat        double precision,
  pickup_lng        double precision,
  drop_lat          double precision,
  drop_lng          double precision,
  p_customer_name   text    DEFAULT NULL,
  p_customer_phone  text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_product_id      uuid    DEFAULT NULL,
  p_estimated_value numeric DEFAULT 0,
  p_distance_km     numeric DEFAULT NULL,
  p_pickup_address  text    DEFAULT NULL,
  p_destination_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id       uuid;
  merchant_uid uuid;
  v_store_name text;
  v_store_addr text;
  v_store_logo text;
  v_store_mgr  text;
BEGIN
  merchant_uid := auth.uid();
  IF merchant_uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;

  -- Buscar dados da loja — usa endereco_formatado se existir, senão monta
  SELECT
    nome_loja,
    COALESCE(
      NULLIF(endereco_formatado, ''),
      NULLIF(CONCAT_WS(', ',
        NULLIF(TRIM(COALESCE(street, rua, '')),           ''),
        NULLIF(TRIM(COALESCE(number, numero, '')),        ''),
        NULLIF(TRIM(COALESCE(neighborhood, bairro, '')),  ''),
        NULLIF(TRIM(COALESCE(cidade, '')),                ''),
        NULLIF(TRIM(COALESCE(estado, '')),                '')
      ), '')
    ),
    logo_url
  INTO v_store_name, v_store_addr, v_store_logo
  FROM public.merchant_stores
  WHERE user_id = merchant_uid
  LIMIT 1;

  SELECT name INTO v_store_mgr
  FROM public.profiles
  WHERE id = merchant_uid
  LIMIT 1;

  new_id := gen_random_uuid();

  INSERT INTO public.service_orders (
    id, merchant_id, customer_id, customer_name, customer_phone,
    notes, product_id, estimated_value, total_price, distance_km,
    status, service_type, pickup_lat, pickup_lng, destination_lat, destination_lng,
    pickup_location, destination,
    store_name, store_address, store_manager, store_logo_url,
    created_at
  )
  VALUES (
    new_id, merchant_uid, p_customer_name, p_customer_name, p_customer_phone,
    p_notes, p_product_id, p_estimated_value, p_estimated_value, p_distance_km,
    'awaiting_professional', 'delivery',
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    COALESCE(p_pickup_address,     v_store_addr, 'Coleta na Loja'),
    COALESCE(p_destination_address, 'Entrega no Cliente'),
    COALESCE(v_store_name, 'Loja Principal'),
    COALESCE(v_store_addr, p_pickup_address, 'Endereço da Loja'),
    COALESCE(v_store_mgr,  'Gerente'),
    v_store_logo,
    now()
  );

  RETURN new_id;
END;
$$;

DO $$ BEGIN RAISE LOG '=== endereco_formatado RESTAURADO E ALINHADO ==='; END $$;
