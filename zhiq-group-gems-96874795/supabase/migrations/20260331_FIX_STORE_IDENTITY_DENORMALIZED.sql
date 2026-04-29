-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_FIX_STORE_IDENTITY_DENORMALIZED.sql
-- V7: Denormalização de dados da loja para Service Orders
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG '=== INICIANDO DENORMALIZAÇÃO DE LOJA (V7) ==='; END $$;

-- 1. ADICIONAR COLUNAS DE IDENTIDADE DA LOJA NA SERVICE_ORDERS
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS store_address text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS store_manager text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS store_logo_url text;

-- 2. ATUALIZAR create_delivery_order PARA POPULAR ESSES DADOS (Versão Final Robusta)
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_store_id uuid,
  pickup_lat double precision,
  pickup_lng double precision,
  drop_lat double precision,
  drop_lng double precision,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_estimated_value numeric DEFAULT 0,
  p_distance_km numeric DEFAULT NULL,
  p_pickup_address text DEFAULT NULL,
  p_destination_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id uuid;
  merchant_uid uuid;
  v_store_name text;
  v_store_address text;
  v_store_manager text;
  v_store_logo text;
BEGIN
  -- Identificar usuário
  merchant_uid := auth.uid();
  IF merchant_uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;

  -- Buscar dados da loja para denormalização instantânea
  SELECT 
    nome_loja, 
    COALESCE(endereco_formatado, street || ', ' || number || ' - ' || neighborhood),
    logo_url
  INTO v_store_name, v_store_address, v_store_logo
  FROM public.merchant_stores 
  WHERE user_id = merchant_uid 
  LIMIT 1;

  -- Buscar nome do responsável
  SELECT name INTO v_store_manager FROM public.profiles WHERE id = merchant_uid LIMIT 1;

  -- Gerar ID
  new_id := gen_random_uuid();

  -- Inserir Ordem com Identidade Denormalizada
  INSERT INTO public.service_orders (
    id,
    merchant_id,
    customer_id, 
    customer_name,
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
    pickup_location,
    destination,
    store_name,
    store_address,
    store_manager,
    store_logo_url,
    created_at
  )
  VALUES (
    new_id,
    merchant_uid,
    p_customer_name,
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
    COALESCE(v_store_name, 'Loja Principal'),
    COALESCE(v_store_address, p_pickup_address),
    COALESCE(v_store_manager, 'Gerente'),
    v_store_logo,
    now()
  );

  RETURN new_id;
END;
$$;

DO $$ BEGIN RAISE LOG '=== DENORMALIZAÇÃO DE LOJA (V7) COMPLETA ==='; END $$;
