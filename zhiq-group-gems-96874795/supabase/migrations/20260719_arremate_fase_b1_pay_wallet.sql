-- ════════════════════════════════════════════════════════════════════════════
-- ORION-ARREMATES FASE B1 v1.0 — Pagamento do arremate por Customer Wallet
--
-- Aprovada por: ARCHITECTURE Pós-Leilão (D1-D8) · ARREMATES FASE A (ac04fc0) ·
--               ARCHITECTURE FASE B (ffba30f) · REVIEW FASE B1 (4fa71c8, 🟢).
--
-- ESCOPO ESTRITO: SOMENTE débito por saldo interno via motor PAY. NÃO implementa
-- Mercado Pago/PIX/cartão/checkout/escrow release/refund/notificação/contrato/
-- entrega/tela/IA. UMA única RPC oficial move dinheiro do comprador neste fluxo.
--
-- Requisitos P1 da REVIEW (cumpridos):
--  (1) débito + transição para 'pago' na MESMA transação (atômico);
--  (2) carteira SEMPRE via pay_get_or_create_account('customer',winner,'customer_wallet')
--      — NUNCA _pay_ride_payer_account (prefere merchant_wallet);
--  (3) crédito em account_type='platform_escrow'.
--
-- Zero primitiva financeira nova: reusa pay_get_or_create_account + pay_post_transaction
-- (owner=postgres, bypassa RLS; checa idempotência + FOR UPDATE + valida saldo + Σ=0).
-- Idempotência: chave 'auction_hold:<listing_id>' + gate de domínio (arremate já 'pago').
-- Idempotente e reversível (rollback no fim).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Pré-requisito ADITIVO: o registro de escrow precisa reconhecer 'auction' ──
-- (não altera lógica de escrow — só adiciona um service_type permitido; retrocompatível)
ALTER TABLE public.pay_escrow_holds DROP CONSTRAINT IF EXISTS pay_escrow_holds_service_type_check;
ALTER TABLE public.pay_escrow_holds ADD CONSTRAINT pay_escrow_holds_service_type_check
  CHECK (service_type = ANY (ARRAY['delivery','ride','mototaxi','freight','credit_purchase','auction']));

CREATE OR REPLACE FUNCTION public.arremate_pay_wallet(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_winner    uuid; v_seller uuid; v_valor numeric; v_com_val numeric; v_liq numeric;
  v_arr       text; v_pago boolean; v_settle_status text;
  v_customer  uuid; v_escrow uuid; v_saldo numeric;
  v_key       text := 'auction_hold:' || p_listing_id::text;
  v_dados     jsonb;
BEGIN
  -- ── Carrega e TRAVA o settlement (serializa concorrência) ──
  SELECT winner_user_id, seller_user_id, valor_final, comissao_valor, valor_liquido,
         arremate_status, coalesce(pagamento_ok,false), status
    INTO v_winner, v_seller, v_valor, v_com_val, v_liq, v_arr, v_pago, v_settle_status
    FROM orion_auction_settlements WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1: settlement % inexistente', p_listing_id USING ERRCODE='P0002'; END IF;

  -- ── Idempotência de DOMÍNIO: já pago → no-op (não recobra) ──
  IF v_pago OR v_arr IN ('pago','concluido') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'estado', v_arr, 'listing_id', p_listing_id);
  END IF;

  -- ── ETAPA 2 — validações (qualquer falha aborta tudo) ──
  IF v_winner IS NULL OR coalesce(v_settle_status,'') = 'no_winner' THEN
    RAISE EXCEPTION 'B1: arremate sem vencedor definido';
  END IF;
  -- usuário é o vencedor (contexto de serviço/admin = auth.uid() NULL é permitido p/ motor)
  IF v_uid IS NOT NULL AND v_uid <> v_winner
     AND NOT coalesce((SELECT is_admin FROM profiles WHERE id = v_uid), false) THEN
    RAISE EXCEPTION 'B1: apenas o vencedor do arremate pode pagar';
  END IF;
  IF v_arr <> 'aguardando_pagamento' THEN
    RAISE EXCEPTION 'B1: estado inválido para pagamento (%), esperado aguardando_pagamento', coalesce(v_arr,'NULL');
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'B1: valor_final inválido (%)', v_valor;
  END IF;

  -- ── ETAPA 3 — carteira do COMPRADOR (nunca merchant/ride_payer) ──
  v_customer := (pay_get_or_create_account('customer', v_winner, 'customer_wallet', '{}'::jsonb)).id;
  SELECT id INTO v_escrow FROM pay_financial_accounts
   WHERE owner_type = 'platform' AND account_type = 'platform_escrow' LIMIT 1;
  IF v_escrow IS NULL THEN RAISE EXCEPTION 'B1: conta platform_escrow ausente'; END IF;

  -- pré-checagem de saldo (erro claro; o motor é a guarda final)
  SELECT available_balance INTO v_saldo FROM pay_financial_accounts WHERE id = v_customer;
  IF coalesce(v_saldo,0) < v_valor THEN
    RAISE EXCEPTION 'B1: saldo insuficiente na carteira (saldo %, necessário %)', coalesce(v_saldo,0), v_valor
      USING ERRCODE='P0001';
  END IF;

  -- ── ETAPA 4+5 — movimento único via PAY (partida dobrada, idempotente) ──
  PERFORM pay_post_transaction(
    'auction_hold',                       -- scope → reason_code auction_hold:payment_*
    v_key,                                -- idempotency_key auction_hold:<listing_id>
    jsonb_build_array(
      jsonb_build_object('account_id', v_customer, 'direction', 'debit',  'entry_type', 'payment_out',
        'amount', v_valor, 'reference_type', 'auction_settlement', 'reference_id', p_listing_id,
        'description', 'Pagamento do arremate ' || p_listing_id::text),
      jsonb_build_object('account_id', v_escrow,   'direction', 'credit', 'entry_type', 'payment_in',
        'amount', v_valor, 'reference_type', 'auction_settlement', 'reference_id', p_listing_id,
        'description', 'Custódia do arremate ' || p_listing_id::text)
    ),
    'auction_settlement', p_listing_id,
    jsonb_build_object('kind', 'auction_hold', 'winner', v_winner, 'seller', v_seller)
  );

  -- ── Espelho de escrow (held) — idempotente ──
  INSERT INTO pay_escrow_holds (idempotency_key, service_type, service_id, payer_user_id,
    professional_user_id, amount_cents, platform_fee_cents, professional_amount_cents, status, held_at, metadata)
  VALUES (v_key, 'auction', p_listing_id, v_winner, v_seller,
    round(v_valor*100)::int, round(coalesce(v_com_val,0)*100)::int,
    round(coalesce(v_liq, v_valor)*100)::int, 'held', now(),
    jsonb_build_object('listing_id', p_listing_id))
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- ── Marca pagamento no settlement (pagamento_ok NÃO é campo protegido) ──
  UPDATE orion_auction_settlements SET pagamento_ok = true WHERE listing_id = p_listing_id;

  -- ── ETAPA 6 — transição de estado (mesma transação): aguardando → processando → pago ──
  PERFORM arremate_transition(p_listing_id, 'pagamento_em_processamento', 'pagamento por carteira', 'comprador');
  PERFORM arremate_transition(p_listing_id, 'pago', 'pagamento confirmado (carteira)', 'comprador');

  -- ── ETAPA 7 — eventos financeiros APROVADOS (sem novos, sem duplicidade) ──
  v_dados := jsonb_build_object('listing_id', p_listing_id, 'meio', 'customer_wallet',
    'valor', v_valor, 'winner', v_winner, 'idempotency_key', v_key);
  INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('pagamento.confirmado', 'arremate_pay', v_dados);
  INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('escrow.criado', 'arremate_pay', v_dados);

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'listing_id', p_listing_id,
    'valor', v_valor, 'estado', 'pago', 'idempotency_key', v_key);
END $fn$;

-- ── ETAPA 8 — segurança: menor privilégio (comprador logado; nunca anon) ──
REVOKE EXECUTE ON FUNCTION public.arremate_pay_wallet(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.arremate_pay_wallet(uuid) TO authenticated, service_role;

-- ── VERIFICAÇÃO ──
SELECT
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='arremate_pay_wallet') AS rpc_criada,
  has_function_privilege('authenticated','public.arremate_pay_wallet(uuid)','EXECUTE')::int AS auth_ok,
  has_function_privilege('anon','public.arremate_pay_wallet(uuid)','EXECUTE')::int AS anon_bloqueado_deve_ser_0;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reversível):
--   DROP FUNCTION IF EXISTS public.arremate_pay_wallet(uuid);
--   -- eventos/holds/ledger de pagamentos reais permanecem (imutáveis); um hold
--   -- indevido se estorna por transação compensatória auction_refund:<listing_id> (B3).
-- ════════════════════════════════════════════════════════════════════════════
