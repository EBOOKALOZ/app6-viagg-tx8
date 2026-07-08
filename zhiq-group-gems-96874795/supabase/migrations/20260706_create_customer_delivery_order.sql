-- ============================================================
-- MINI-CONTA / CHAMAR MOTOBOY — cliente entra no MOTOR REAL
--
-- Espelha public.create_delivery_order, MAS sem loja: o cliente
-- (autenticado por magic link) é o "requester". merchant_id recebe
-- o auth.uid() do CLIENTE — exatamente como a versão do lojista põe
-- o auth.uid() do dono da loja. Assim:
--   · o MESMO trigger trigger_dispatch_final dispara (só olha status);
--   · create_delivery_offers_for_order insere delivery_offers.store_id
--     = merchant_id = uid do cliente (auth.users válido → NOT NULL ok);
--   · a RLS auth.uid()=store_id deixa o cliente ver as ofertas;
--   · o escrow (record_escrow_on_service_order_delivered) atribui o
--     payer via COALESCE(payer_uid, customer_uid, merchant_id) = cliente.
--
-- NÃO altera create_delivery_order, o trigger, nem o despacho — o
-- fluxo do lojista fica idêntico. Pagamento do cliente é feito DEPOIS
-- do aceite, via payments-charge (PIX/cartão) — fora desta RPC.
--
-- Rodar no SQL Editor (broifhfqmnzqoongtokm). Idempotente.
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
  p_destination_address   text    DEFAULT NULL
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
BEGIN
  v_customer := auth.uid();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';  -- cliente precisa da mini-conta (magic link)
  END IF;

  v_label := COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Cliente');
  new_id  := gen_random_uuid();

  INSERT INTO public.service_orders (
    id, merchant_id, customer_id, customer_phone, notes,
    estimated_value, total_price, distance_km,
    status, service_type,
    pickup_lat, pickup_lng, destination_lat, destination_lng,
    pickup_location, destination, store_name, created_at
  )
  VALUES (
    new_id,
    v_customer,           -- ★ requester = o próprio cliente (uid válido)
    p_customer_name,      -- customer_id é text e guarda o NOME (convenção existente)
    p_customer_phone,
    p_notes,
    p_estimated_value,
    p_estimated_value,
    p_distance_km,
    'awaiting_professional',
    'delivery',
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
  text, text, text, numeric, numeric, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(
  double precision, double precision, double precision, double precision,
  text, text, text, numeric, numeric, text, text) TO authenticated, service_role;
