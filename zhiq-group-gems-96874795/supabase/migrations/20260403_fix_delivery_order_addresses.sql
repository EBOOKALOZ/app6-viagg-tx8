-- ══════════════════════════════════════════════════════════════════════
-- FIX: Dados do lojista não chegam corretos ao motoboy
-- Problema: create_delivery_order não aceitava p_pickup_address/
--           p_destination_address → campos ficavam NULL → dispatch
--           mostrava "Coleta na Loja" / "Entrega no Cliente"
-- ══════════════════════════════════════════════════════════════════════

-- 1. Drop versões anteriores para evitar conflito de assinatura
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, float8, float8, float8, float8, text, text, text, uuid, numeric);
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, float8, float8, float8, float8, text, text, text, uuid, numeric, numeric);

-- 2. Garantir colunas de texto nas service_orders
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS pickup_location  text,
  ADD COLUMN IF NOT EXISTS destination      text,
  ADD COLUMN IF NOT EXISTS store_name       text;

-- 3. Recriar função com suporte a endereços e nome da loja
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_store_id              uuid,
  pickup_lat              double precision,
  pickup_lng              double precision,
  drop_lat                double precision,
  drop_lng                double precision,
  p_customer_name         text    DEFAULT NULL,
  p_customer_phone        text    DEFAULT NULL,
  p_notes                 text    DEFAULT NULL,
  p_product_id            uuid    DEFAULT NULL,
  p_estimated_value       numeric DEFAULT 0,
  p_distance_km           numeric DEFAULT NULL,
  -- Novos parâmetros de endereço (antes ignorados → agora armazenados)
  p_pickup_address        text    DEFAULT NULL,
  p_destination_address   text    DEFAULT NULL
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
BEGIN
  merchant_uid := auth.uid();
  IF merchant_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- Buscar nome da loja
  SELECT COALESCE(nome_loja, 'Loja Parceira') INTO v_store_name
  FROM public.merchant_stores
  WHERE id = p_store_id
  LIMIT 1;

  new_id := gen_random_uuid();

  INSERT INTO public.service_orders (
    id,
    merchant_id,
    customer_id,
    customer_phone,
    notes,
    product_id,
    estimated_value,
    total_price,
    distance_km,
    status,
    service_type,
    pickup_lat,
    pickup_lng,
    destination_lat,
    destination_lng,
    pickup_location,  -- ★ endereço de texto da coleta
    destination,      -- ★ endereço de texto da entrega
    store_name,       -- ★ nome da loja snapshotado
    created_at
  )
  VALUES (
    new_id,
    merchant_uid,
    p_customer_name,
    p_customer_phone,
    p_notes,
    p_product_id,
    p_estimated_value,
    p_estimated_value,
    p_distance_km,
    'awaiting_professional',
    'delivery',
    pickup_lat,
    pickup_lng,
    drop_lat,
    drop_lng,
    p_pickup_address,
    p_destination_address,
    v_store_name,
    now()
  );

  RETURN new_id;
END;
$$;

-- 4. Melhorar dispatch: calcular total_price se NULL (R$ 3,50/km mínimo)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_order       RECORD;
  v_motoboy     RECORD;
  v_offer_count integer := 0;
  v_commission  numeric := 20;
  v_store_name  text;
  v_net_value   numeric;
  v_dest_address text;
  v_pickup_address text;
  v_price        numeric;
BEGIN
  SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'order_not_found');
  END IF;

  -- ★ DEBOUNCE: evita criação duplicada em 30s
  IF EXISTS (
    SELECT 1 FROM public.delivery_offers
    WHERE delivery_order_id = p_delivery_order_id
      AND created_at > now() - interval '30 seconds'
  ) THEN
    RAISE LOG '[dispatch] Debounce ativo para order %, saindo', p_delivery_order_id;
    RETURN jsonb_build_object('skipped', 'debounce_active');
  END IF;

  -- Nome da loja (snapshot → merchant_stores → fallback)
  v_store_name := NULLIF(TRIM(COALESCE(v_order.store_name, '')), '');
  IF v_store_name IS NULL THEN
    BEGIN
      SELECT COALESCE(ms.nome_loja, 'Loja Parceira') INTO v_store_name
      FROM public.merchant_stores ms
      WHERE ms.user_id = v_order.merchant_id
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_store_name := 'Loja Parceira'; END;
  END IF;
  v_store_name := COALESCE(v_store_name, 'Loja Parceira');

  -- Endereço de coleta (texto → store_address → merchant_stores → fallback)
  v_pickup_address := NULLIF(TRIM(COALESCE(v_order.pickup_location, '')), '');
  IF v_pickup_address IS NULL THEN
    v_pickup_address := NULLIF(TRIM(COALESCE(v_order.store_address, '')), '');
  END IF;
  IF v_pickup_address IS NULL THEN
    BEGIN
      SELECT COALESCE(ms.nome_loja, '') INTO v_pickup_address
      FROM public.merchant_stores ms
      WHERE ms.user_id = v_order.merchant_id
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_pickup_address := NULL; END;
  END IF;
  v_pickup_address := COALESCE(NULLIF(TRIM(v_pickup_address), ''), 'Coleta na Loja');

  -- Endereço de entrega (ignora coordenadas brutas)
  v_dest_address := NULLIF(TRIM(COALESCE(v_order.destination, '')), '');
  IF v_dest_address IS NOT NULL
     AND v_dest_address ~ '^-?[0-9]+\.[0-9]+,\s*-?[0-9]+\.[0-9]+' THEN
    v_dest_address := NULL;
  END IF;
  v_dest_address := COALESCE(v_dest_address, 'Entrega no Cliente');

  -- ★ Preço: usa total_price; se NULL, estima pela distância (R$3,50/km mín R$5)
  v_price := v_order.total_price;
  IF v_price IS NULL OR v_price = 0 THEN
    v_price := GREATEST(
      COALESCE(v_order.distance_km, 0) * 3.5,
      5.0
    );
  END IF;

  -- Loop pelos motoboys online e aprovados
  FOR v_motoboy IN
    SELECT user_id
    FROM public.motoboy_profiles
    WHERE is_approved = true AND is_online = true
  LOOP
    BEGIN
      SELECT COALESCE(percentual_comissao_atual, 20) INTO v_commission
      FROM public.profiles WHERE id = v_motoboy.user_id;
    EXCEPTION WHEN OTHERS THEN v_commission := 20; END;

    v_net_value := v_price * (1.0 - v_commission / 100.0);

    -- Cancelar oferta pending anterior deste motoboy
    UPDATE public.delivery_offers
    SET status = 'cancelled', expires_at = now()
    WHERE motoboy_id = v_motoboy.user_id
      AND status IN ('pending', 'open');

    -- Inserir nova oferta com todos os dados
    INSERT INTO public.delivery_offers (
      service_order_id, delivery_order_id, motoboy_id, professional_uid, store_id,
      status, expires_at,
      pickup_address_snapshot, dropoff_address_snapshot, store_name_snapshot,
      pickup_lat_snapshot, pickup_lng_snapshot, dropoff_lat_snapshot, dropoff_lng_snapshot,
      total_price, estimated_price_snapshot, distance_km_snapshot,
      commission_percent, gross_value, net_value
    ) VALUES (
      v_order.id, v_order.id,
      v_motoboy.user_id, v_motoboy.user_id, v_order.merchant_id,
      'pending', now() + interval '10 minutes',
      v_pickup_address,
      v_dest_address,
      v_store_name,
      v_order.pickup_lat, v_order.pickup_lng,
      v_order.destination_lat, v_order.destination_lng,
      v_price, v_price, v_order.distance_km,
      v_commission, v_price, v_net_value
    );

    v_offer_count := v_offer_count + 1;
  END LOOP;

  RETURN jsonb_build_object('offers_created', v_offer_count);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[create_delivery_offers] order=%: %', p_delivery_order_id, SQLERRM;
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Confirmação
SELECT 'Migração aplicada: endereços e preço corrigidos no dispatch' AS resultado;
