-- ============================================================
-- DESPACHO POR service_type — cliente chama o profissional CERTO
-- 2026-07-08
--
-- PROBLEMA: create_customer_delivery_order (v2) inseria TUDO em
-- service_orders. O trigger de despacho ignora service_type e gera
-- oferta só para MOTOBOYS → chamadas de moto-táxi e carro nunca
-- chegavam aos painéis de moto-táxi (moto_taxi_corridas) nem de
-- carro (motorista_corridas). Só motoboy funcionava de fato.
--
-- FIX (decidido com o usuário 2026-07-08 — "rotear por tabela"):
-- a criação passa a gravar na TABELA que cada painel profissional já
-- lê e aceita, reaproveitando o despacho existente:
--
--   delivery / freight  → service_orders     (motoboy — como hoje)
--   mototaxi            → moto_taxi_corridas  (status 'pesquisando')
--   ride               → motorista_corridas  (status 'pendente')
--
-- Colunas espelham EXATAMENTE os INSERTs que já funcionam:
--   • moto_taxi_corridas: CREATE original (20260121002702) — status pt
--     ('pesquisando') via 20260121013115.
--   • motorista_corridas: mesmo shape do fluxo passageiro
--     (usePassengerRide → origem/destino/distancia_km/valor, 'pendente').
--
-- Endereços COALESCE p/ não violar NOT NULL quando o cliente usa só o
-- balão do mapa. A identidade do cliente vai por passenger_id (auth.uid)
-- — o painel resolve nome/foto via profiles, como no fluxo passageiro.
--
-- NÃO altera create_delivery_order (lojista), o trigger de despacho de
-- motoboy, nem o motor de ofertas. Idempotente. SQL Editor
-- (broifhfqmnzqoongtokm).
-- ============================================================

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
    RAISE EXCEPTION 'Usuário não autenticado';  -- cliente precisa da mini-conta (magic link)
  END IF;

  -- Só valores do domínio aceito; resto → delivery.
  v_service := CASE
    WHEN p_service_type IN ('delivery','mototaxi','ride','freight') THEN p_service_type
    ELSE 'delivery'
  END;

  v_label  := COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Cliente');
  v_origin := COALESCE(NULLIF(TRIM(p_pickup_address), ''), 'Local no mapa');
  v_dest   := COALESCE(NULLIF(TRIM(p_destination_address), ''), 'Destino no mapa');

  -- ─────────────────────────────────────────────────────────
  -- MOTO-TÁXI → moto_taxi_corridas (painel lê status 'pesquisando')
  -- ─────────────────────────────────────────────────────────
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

  -- ─────────────────────────────────────────────────────────
  -- CARRO / MOTORISTA → motorista_corridas (painel lê 'pendente')
  -- ─────────────────────────────────────────────────────────
  ELSIF v_service = 'ride' THEN
    INSERT INTO public.motorista_corridas (
      passenger_id, status, origem, destino, distancia_km, valor
    ) VALUES (
      v_customer, 'pendente', v_origin, v_dest, p_distance_km, p_estimated_value
    )
    RETURNING id INTO new_id;

  -- ─────────────────────────────────────────────────────────
  -- DELIVERY / FREIGHT → service_orders (motoboy — comportamento atual)
  -- ─────────────────────────────────────────────────────────
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
      v_customer,           -- ★ requester = o próprio cliente (uid válido)
      v_customer,           -- ★ payer_uid = cliente → aceite reserva da carteira dele
      p_customer_name,      -- customer_id é text e guarda o NOME (convenção existente)
      p_customer_phone,
      p_notes,
      p_estimated_value,
      p_estimated_value,
      p_distance_km,
      'awaiting_professional',
      v_service,
      pickup_lat, pickup_lng, drop_lat, drop_lng,
      v_origin,
      v_dest,
      v_label,              -- store_name snapshot = nome do cliente (não há loja)
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
