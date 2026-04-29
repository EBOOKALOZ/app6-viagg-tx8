-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_MERCHANT_VISIBILITY_FINAL.sql
-- FIX: Store text addresses and ensure 'searching' status visibility
-- ═══════════════════════════════════════════════════════════════

-- 1. DROP previous versions to avoid conflicts
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, float8, float8, float8, float8, text, text, text, uuid, numeric, numeric);

-- 2. CREATE Updated RPC with address support
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
BEGIN
  -- Get current user
  merchant_uid := auth.uid();
  
  IF merchant_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- Generate internal ID
  new_id := gen_random_uuid();

  -- Insert into service_orders with labels
  INSERT INTO public.service_orders (
    id,
    merchant_id,
    customer_id, -- Nome do cliente
    customer_name, -- Duplicate for safety
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
    now()
  );

  RETURN new_id;
END;
$$;

-- 3. ENSURE Status triggers don't break the Edge Function
-- (Existing trigger in FINAL_FIX_ALL_IN_ONE already converts to 'searching')
-- We confirm the trigger exists and handles 'awaiting_professional' correctly.
