-- Drop and recreate the RPC with all necessary parameters
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  _delivery_code text,
  _pickup_location text,
  _destination text,
  _customer_name text,
  _estimated_value numeric,
  _vehicle_type text,
  _region_id text,
  _service_type text,
  _pickup_code text DEFAULT NULL,
  _pickup_lat double precision DEFAULT NULL,
  _pickup_lng double precision DEFAULT NULL,
  _destination_lat double precision DEFAULT NULL,
  _destination_lng double precision DEFAULT NULL,
  _distancia_km numeric DEFAULT NULL,
  _customer_phone text DEFAULT NULL,
  _order_description text DEFAULT NULL,
  _product_id uuid DEFAULT NULL
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
  -- Garantir que o usuário esteja autenticado
  merchant_uid := auth.uid();

  IF merchant_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- Gerar ID interno
  new_id := gen_random_uuid();

  -- Validações mínimas obrigatórias
  IF _estimated_value IS NULL OR _estimated_value <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  IF _pickup_location IS NULL OR _destination IS NULL THEN
    RAISE EXCEPTION 'Localização inválida';
  END IF;

  -- Inserção no banco
  INSERT INTO public.delivery_orders (
    id,
    merchant_id,
    user_id,
    delivery_code,
    pickup_code,
    pickup_location,
    pickup_lat,
    pickup_lng,
    destination,
    destination_lat,
    destination_lng,
    distancia_km,
    customer_name,
    customer_phone,
    estimated_value,
    valor_total,
    vehicle_type,
    region_id,
    service_type,
    order_description,
    product_id,
    status,
    created_at
  )
  VALUES (
    new_id,
    merchant_uid,
    merchant_uid,
    _delivery_code,
    _pickup_code,
    _pickup_location,
    _pickup_lat,
    _pickup_lng,
    _destination,
    _destination_lat,
    _destination_lng,
    _distancia_km,
    _customer_name,
    _customer_phone,
    _estimated_value,
    _estimated_value,
    _vehicle_type,
    _region_id,
    _service_type,
    _order_description,
    _product_id,
    'pending',
    now()
  );

  RETURN new_id;
END;
$$;