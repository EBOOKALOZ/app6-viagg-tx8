CREATE OR REPLACE FUNCTION public.create_corrida(
  p_service_type text,
  p_origem text,
  p_destino text,
  p_valor numeric,
  p_region_id text DEFAULT 'BR',
  p_city_id text DEFAULT NULL,
  p_loja_nome text DEFAULT NULL,
  p_loja_logo text DEFAULT NULL,
  p_loja_endereco text DEFAULT NULL,
  p_cliente_nome text DEFAULT NULL,
  p_distance_km numeric DEFAULT NULL,
  p_duration_min integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corrida public.corridas%ROWTYPE;
  v_offer public.delivery_offers%ROWTYPE;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para criar corrida'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Criar corrida
  INSERT INTO public.corridas (
    service_type, passenger_id, origem, destino, valor,
    status, payment_status, distancia_km
  )
  VALUES (
    p_service_type, v_uid, p_origem, p_destino, p_valor,
    'pending', 'pending', p_distance_km
  )
  RETURNING * INTO v_corrida;

  -- 2. Criar delivery_offer vinculada (sem duplicar)
  INSERT INTO public.delivery_offers (
    corrida_id, region_id, city_id, status
  )
  VALUES (
    v_corrida.id, COALESCE(p_region_id, 'BR'), p_city_id, 'open'
  )
  RETURNING * INTO v_offer;

  -- 3. Retornar ambos como JSON
  RETURN jsonb_build_object(
    'corrida', row_to_json(v_corrida),
    'offer', row_to_json(v_offer),
    'loja_nome', p_loja_nome,
    'loja_logo', p_loja_logo,
    'loja_endereco', p_loja_endereco,
    'cliente_nome', p_cliente_nome,
    'distance_km', p_distance_km,
    'duration_min', p_duration_min
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_corrida(text, text, text, numeric, text, text, text, text, text, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_corrida(text, text, text, numeric, text, text, text, text, text, text, numeric, integer) TO authenticated;