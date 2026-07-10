-- ============================================================
-- CORRIDA PRÉ-PAGA — pagamento ANTES da corrida (decisão 2026-07-10)
--
-- O solicitante paga NO MOMENTO DA CHAMADA (quando o valor aparece):
-- a criação debita a carteira de quem chama → platform_escrow, na MESMA
-- transação do INSERT (sem saldo → NADA é criado, erro claro).
--
-- Peças que fazem isso ser seguro/limpo:
--  • Idempotência 'ride_hold:'||order_id — a MESMA chave usada pelo hold
--    do aceite (pay_hold_ride_payment) ⇒ o hold do aceite vira NO-OP.
--    Zero cobrança dupla, sem alterar o fluxo do aceite.
--  • payment_status='paid' já na criação ⇒ o trigger do contador de 3 min
--    (tg_waiting_payment_*) NUNCA arma o gate (condição <> 'paid') ⇒
--    o motoboy não é mais expulso por timeout de pagamento.
--  • Liquidação inalterada: na entrega, pay_release_ride_payment move
--    escrow → profissional (líquido) + plataforma (comissão), como hoje.
--  • Carteira do pagador: customer_wallet SEMPRE (é onde a recarga
--    "Adicionar saldo" credita — mesmo se o usuário também tiver loja).
--
-- Branches mototaxi/motorista: também debitam no escrow na criação
-- (mesma chave); a marcação 'paid' nas tabelas é defensiva (colunas do
-- contador podem não existir se as migrations dele não rodaram).
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
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
  new_id        uuid := gen_random_uuid();
  v_customer    uuid;
  v_label       text;
  v_service     text;
  v_origin      text;
  v_dest        text;
  v_amount      numeric;
  v_payer_acct  uuid;
  v_escrow      uuid;
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
  v_amount := COALESCE(p_estimated_value, 0);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor da corrida inválido — recalcule a rota antes de chamar.';
  END IF;

  -- ── 1. CRIA a corrida (na transação; sem pagamento, tudo desfaz) ──
  IF v_service = 'mototaxi' THEN
    INSERT INTO public.moto_taxi_corridas (
      id, passenger_id, status,
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      estimated_km, estimated_price
    ) VALUES (
      new_id, v_customer, 'pesquisando',
      v_origin, pickup_lat, pickup_lng,
      v_dest,   drop_lat,   drop_lng,
      p_distance_km, v_amount
    );

  ELSIF v_service = 'ride' THEN
    INSERT INTO public.motorista_corridas (
      id, passenger_id, status, origem, destino, distancia_km, valor
    ) VALUES (
      new_id, v_customer, 'pendente', v_origin, v_dest, p_distance_km, v_amount
    );

  ELSE
    INSERT INTO public.service_orders (
      id, merchant_id, payer_uid, customer_id, customer_phone, notes,
      estimated_value, total_price, distance_km,
      status, service_type,
      payment_status, payment_confirmed_at,
      pickup_lat, pickup_lng, destination_lat, destination_lng,
      pickup_location, destination, store_name, created_at
    )
    VALUES (
      new_id, v_customer, v_customer, p_customer_name, p_customer_phone, p_notes,
      v_amount, v_amount, p_distance_km,
      'searching', v_service,
      'paid', now(),                     -- ★ PRÉ-PAGO: nasce paga (gate 3min nunca arma)
      pickup_lat, pickup_lng, drop_lat, drop_lng,
      v_origin, v_dest, v_label, now()
    );
  END IF;

  -- ── 2. PAGAMENTO: carteira de quem chama → platform_escrow ──
  -- Mesma chave do hold do aceite ⇒ aceite não cobra de novo (idempotente).
  -- Sem saldo: pay_post_transaction levanta o guard → transação inteira
  -- desfaz (a corrida NÃO é criada).
  --
  -- Carteira: SEMPRE customer_wallet aqui. Neste fluxo quem chama paga
  -- como PESSOA (é onde "Adicionar saldo" credita) — mesmo que também
  -- tenha loja. O _pay_ride_payer_account preferiria a merchant_wallet
  -- nesse caso e o saldo recarregado ficaria "invisível".
  v_payer_acct := public._pay_account_system('customer', v_customer, 'customer_wallet');
  v_escrow     := public._pay_account_system('platform', NULL, 'platform_escrow');

  PERFORM public.pay_post_transaction(
    'ride_hold',
    'ride_hold:' || new_id::text,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', v_payer_acct, 'direction', 'debit', 'entry_type', 'payment_out',
        'amount', v_amount, 'reference_type', 'service_order', 'reference_id', new_id,
        'description', 'Pagamento antecipado da corrida (' || v_service || ')'
      ),
      jsonb_build_object(
        'account_id', v_escrow, 'direction', 'credit', 'entry_type', 'payment_in',
        'amount', v_amount, 'reference_type', 'service_order', 'reference_id', new_id
      )
    ),
    'service_order', new_id,
    jsonb_build_object('kind', 'ride_prepay', 'service_type', v_service)
  );

  -- ── 3. Marca 'paid' nas tabelas de corrida (defensivo p/ drift) ──
  IF v_service = 'mototaxi' THEN
    BEGIN
      UPDATE public.moto_taxi_corridas
         SET payment_status = 'paid', payment_confirmed_at = now()
       WHERE id = new_id;
    EXCEPTION WHEN undefined_column THEN NULL; END;
  ELSIF v_service = 'ride' THEN
    BEGIN
      UPDATE public.motorista_corridas
         SET payment_status = 'paid', payment_confirmed_at = now()
       WHERE id = new_id;
    EXCEPTION WHEN undefined_column THEN NULL; END;
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
