-- ============================================================
-- FIX DESPACHO CLIENTE→MOTOBOY + CRIAÇÃO DA motorista_corridas
-- 2026-07-09
--
-- CAUSA RAIZ (diagnosticada ao vivo no banco): o motor de despacho
-- atual (fn_trigger_service_order_dispatch) só dispara com
-- INSERT status='searching', mas create_customer_delivery_order
-- inseria 'awaiting_professional' (contrato do trigger ANTIGO).
-- → pedido preso, 0 ofertas, motoboy nunca recebe.
--
-- FIXES:
--  1. create_customer_delivery_order: branch delivery/freight passa a
--     inserir status='searching' (contrato do motor vivo).
--  2. Remove o trigger de despacho DUPLICADO (dois triggers chamavam a
--     mesma função → ofertas em dobro). Mantém trigger_dispatch_final.
--  3. CRIA public.motorista_corridas (NÃO EXISTIA neste banco — drift
--     entre cópias): tabela do fluxo carro/motorista + RLS.
--     Depois desta migration, rodar NA ORDEM:
--       a) 20260706_ride_countdown_3_profiles.sql  (agora vai passar)
--       b) 20260708_mototaxi_payment_countdown.sql
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ─── 1. RPC de criação — delivery nasce em 'searching' ────────
CREATE OR REPLACE FUNCTION public.create_customer_delivery_order(
  pickup_lat              double precision,
  pickup_lng              double precision,
  drop_lat                double precision,
  drop_lng                double precision,
  p_customer_name         text    DEFAULT NULL,
  p_customer_phone        text    DEFAULT NULL,
  p_notes                 text    DEFAULT NULL,
  p_estimated_value       numeric DEFAULT 0,
  p_distance_km           numeric DEFAULT NULL,
  p_pickup_address        text    DEFAULT NULL,
  p_destination_address   text    DEFAULT NULL,
  p_service_type          text    DEFAULT 'delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id        uuid;
  v_customer    uuid;
  v_label       text;
  v_service     text;
  v_origin      text;
  v_dest        text;
BEGIN
  v_customer := auth.uid();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  v_service := CASE
    WHEN p_service_type IN ('delivery','mototaxi','ride','freight') THEN p_service_type
    ELSE 'delivery'
  END;

  v_label  := COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Cliente');
  v_origin := COALESCE(NULLIF(TRIM(p_pickup_address), ''), 'Local no mapa');
  v_dest   := COALESCE(NULLIF(TRIM(p_destination_address), ''), 'Destino no mapa');

  IF v_service = 'mototaxi' THEN
    INSERT INTO public.moto_taxi_corridas (
      passenger_id, status,
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      estimated_km, estimated_price
    ) VALUES (
      v_customer, 'pesquisando',
      v_origin, pickup_lat, pickup_lng,
      v_dest,   drop_lat,   drop_lng,
      p_distance_km, p_estimated_value
    )
    RETURNING id INTO new_id;

  ELSIF v_service = 'ride' THEN
    INSERT INTO public.motorista_corridas (
      passenger_id, status, origem, destino, distancia_km, valor
    ) VALUES (
      v_customer, 'pendente', v_origin, v_dest, p_distance_km, p_estimated_value
    )
    RETURNING id INTO new_id;

  ELSE
    new_id := gen_random_uuid();
    INSERT INTO public.service_orders (
      id, merchant_id, payer_uid, customer_id, customer_phone, notes,
      estimated_value, total_price, distance_km,
      status, service_type,
      pickup_lat, pickup_lng, destination_lat, destination_lng,
      pickup_location, destination, store_name, created_at
    )
    VALUES (
      new_id,
      v_customer,
      v_customer,
      p_customer_name,
      p_customer_phone,
      p_notes,
      p_estimated_value,
      p_estimated_value,
      p_distance_km,
      'searching',          -- ★ contrato do motor de despacho VIVO
      v_service,
      pickup_lat, pickup_lng, drop_lat, drop_lng,
      v_origin,
      v_dest,
      v_label,
      now()
    );
  END IF;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_delivery_order(
  double precision, double precision, double precision, double precision,
  text, text, text, numeric, numeric, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(
  double precision, double precision, double precision, double precision,
  text, text, text, numeric, numeric, text, text, text) TO authenticated, service_role;

-- ─── 2. Remove o trigger de despacho duplicado ────────────────
-- (trigger_dispatch_final e trigger_service_order_dispatch_engine chamam
--  a MESMA função → cada chamada geraria ofertas em dobro)
DROP TRIGGER IF EXISTS trigger_service_order_dispatch_engine ON public.service_orders;

-- ─── 3. motorista_corridas (fluxo carro) — criação + RLS ──────
CREATE TABLE IF NOT EXISTS public.motorista_corridas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id  uuid REFERENCES auth.users(id),
  motorista_id  uuid REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN (
                  'pendente','reserva','aceita','a_caminho',
                  'em_andamento','finalizada','cancelada')),
  origem        text,
  destino       text,
  distancia_km  numeric,
  tempo_estimado text,
  valor         numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_motorista_corridas_status
  ON public.motorista_corridas (status);
CREATE INDEX IF NOT EXISTS idx_motorista_corridas_passenger
  ON public.motorista_corridas (passenger_id);

ALTER TABLE public.motorista_corridas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mc_passenger_insert ON public.motorista_corridas;
CREATE POLICY mc_passenger_insert ON public.motorista_corridas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = passenger_id);

DROP POLICY IF EXISTS mc_read ON public.motorista_corridas;
CREATE POLICY mc_read ON public.motorista_corridas
  FOR SELECT TO authenticated
  USING (status IN ('pendente','reserva')
         OR auth.uid() = motorista_id
         OR auth.uid() = passenger_id);

DROP POLICY IF EXISTS mc_update ON public.motorista_corridas;
CREATE POLICY mc_update ON public.motorista_corridas
  FOR UPDATE TO authenticated
  USING (status IN ('pendente','reserva')
         OR auth.uid() = motorista_id
         OR auth.uid() = passenger_id)
  WITH CHECK (auth.uid() = motorista_id OR auth.uid() = passenger_id);
