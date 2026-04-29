-- Migration: 20260324_update_create_delivery_order.sql
-- Description: Update create_delivery_order RPC to support new fields and use service_orders table

-- 1. Ensure columns exist in service_orders
DO $$ 
BEGIN
    -- Customer columns
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS customer_id text;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS customer_phone text;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS notes text;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS product_id uuid;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS estimated_value numeric;
    
    -- Location columns
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS pickup_location text;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS destination text;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS pickup_lat double precision;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS pickup_lng double precision;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS destination_lat double precision;
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS destination_lng double precision;
    
    -- New: Distance column
    ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS distance_km numeric;
END $$;

-- 2. Drop todas as versões anteriores da função para evitar conflitos de cache/assinatura
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, float8, float8, float8, float8, text, text, text, uuid, numeric);
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, uuid, text, text, numeric, text, float8, float8, float8, float8);
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, float8, float8, float8, float8, text, text, text, uuid, numeric, numeric);
DROP FUNCTION IF EXISTS public.create_delivery_order(p_store_id uuid, pickup_lat float8, pickup_lng float8, drop_lat float8, drop_lng float8, p_customer_name text, p_customer_phone text, p_notes text, p_product_id uuid, p_estimated_value numeric);

-- 3. Create or Replace the RPC
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
  p_distance_km numeric DEFAULT NULL
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

  -- Insert into service_orders
  INSERT INTO public.service_orders (
    id,
    merchant_id,
    customer_id, -- Used for customer name in this context
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
    'awaiting_professional', -- Usando 'awaiting_professional' instead of 'searching' to avoid enum error
    'delivery',
    pickup_lat,
    pickup_lng,
    drop_lat,
    drop_lng,
    now()
  );

  RETURN new_id;
END;
$$;
