CREATE OR REPLACE FUNCTION public.create_corrida(
  p_service_type text,
  p_origem text,
  p_destino text,
  p_valor numeric
)
RETURNS public.corridas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corrida public.corridas%ROWTYPE;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para criar corrida'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.corridas (
    service_type,
    passenger_id,
    origem,
    destino,
    valor,
    status,
    payment_status
  )
  VALUES (
    p_service_type,
    v_uid,
    p_origem,
    p_destino,
    p_valor,
    'pending',
    'pending'
  )
  RETURNING * INTO v_corrida;

  RETURN v_corrida;
END;
$$;

REVOKE ALL ON FUNCTION public.create_corrida(text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_corrida(text, text, text, numeric) TO authenticated;