-- ============================================================
-- MINI-CONTA / CLIENTE CHAMA PROFISSIONAL — v2
--
-- Evolui public.create_customer_delivery_order para o modelo
-- CARTEIRA PRÉ-PAGA (decidido com o usuário em 2026-07-06):
--
--   1) payer_uid = o próprio cliente (auth.uid). Marca o pedido como
--      "pago pela carteira do cliente" — o aceite do profissional
--      reserva do merchant_wallet DO CLIENTE (owner = auth uid), não
--      de uma loja. É também o que o espelho de escrow já usa via
--      COALESCE(payer_uid, customer_uid, merchant_id).
--
--   2) p_service_type: permite o MESMO fluxo servir motoboy (delivery),
--      moto-táxi (mototaxi) e carro/motorista (ride). Default 'delivery'
--      mantém compatibilidade com quem já chama sem o parâmetro.
--      Só aceita valores do domínio conhecido; qualquer outro cai em
--      'delivery' (defensivo — não deixa entrar lixo em service_type).
--
-- NÃO altera create_delivery_order (lojista), o trigger de despacho,
-- nem o motor de ofertas. Idempotente. Rodar no SQL Editor
-- (broifhfqmnzqoongtokm).
-- ============================================================

-- Remove a assinatura ANTIGA (11 params) para evitar overload ambíguo:
-- com as duas versões coexistindo, o PostgREST pode recusar a chamada
-- por named-params ("could not choose the best candidate function").
DROP FUNCTION IF EXISTS public.create_customer_delivery_order(
  double precision, double precision, double precision, double precision,
  text, text, text, numeric, numeric, text, text);

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
BEGIN
  v_customer := auth.uid();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';  -- cliente precisa da mini-conta (magic link)
  END IF;

  -- Só valores do domínio aceito pela cadeia (dispatch/escrow); resto → delivery.
  v_service := CASE
    WHEN p_service_type IN ('delivery','mototaxi','ride','freight') THEN p_service_type
    ELSE 'delivery'
  END;

  v_label := COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Cliente');
  new_id  := gen_random_uuid();

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
    p_pickup_address,
    p_destination_address,
    v_label,              -- store_name snapshot = nome do cliente (não há loja)
    now()
  );

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_delivery_order(
  double precision, double precision, double precision, double precision,
  text, text, text, numeric, numeric, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(
  double precision, double precision, double precision, double precision,
  text, text, text, numeric, numeric, text, text, text) TO authenticated, service_role;
