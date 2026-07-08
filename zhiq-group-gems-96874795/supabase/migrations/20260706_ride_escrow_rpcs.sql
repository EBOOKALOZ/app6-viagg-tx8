-- ============================================================
-- CARTEIRAS PRÉ-PAGAS — 3 PERFIS + CLIENTE — parte 2/2 (RPCs)
--
-- Move o hold/liquidação do escrow para o SERVIDOR (SECURITY DEFINER),
-- em vez do navegador do profissional. Motivo: pay_get_or_create_account
-- só deixa um NÃO-admin tocar na PRÓPRIA carteira — então o motoboy real
-- (não-admin) não conseguiria reservar da carteira de QUEM CHAMA. Hoje
-- "funciona" só porque se testa como admin (bypass). Estas RPCs validam
-- o ESTADO do pedido e roteiam a carteira certa por perfil, com segurança.
--
-- Reusa o núcleo auditado public.pay_post_transaction (double-entry,
-- idempotência, guard de saldo). Idempotency:
--   · hold ...... 'ride_hold:'  || order_id
--   · release ... 'ride_release:'|| order_id
-- (re-aceite / re-conclusão não duplicam nada).
--
-- ⚠️ RODAR DEPOIS de 20260706_pay_wallets_enum.sql (usa os valores novos).
-- SQL Editor (broifhfqmnzqoongtokm). Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Helper INTERNO: get-or-create de conta pay SEM o gate de posse.
-- Espelha o INSERT provado de pay_get_or_create_account (mesmas 5
-- colunas, resto por default). NÃO é exposto a clientes — só as RPCs
-- definer abaixo o chamam (rodam como o dono da função).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pay_account_system(
  p_owner_type    public.pay_owner_type,
  p_owner_id      uuid,
  p_account_type  public.pay_account_type
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pay_financial_accounts
   WHERE owner_type = p_owner_type
     AND owner_id IS NOT DISTINCT FROM p_owner_id
     AND account_type = p_account_type;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.pay_financial_accounts (owner_type, owner_id, account_type, metadata, created_by)
  VALUES (p_owner_type, p_owner_id, p_account_type, '{}'::jsonb, COALESCE(auth.uid(), p_owner_id))
  ON CONFLICT (owner_type, owner_id, account_type) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public._pay_account_system(public.pay_owner_type, uuid, public.pay_account_type) FROM public, anon, authenticated;

-- ------------------------------------------------------------
-- Helper INTERNO: resolve a conta de QUEM PAGA um service_order.
--   · lojista  → merchant_store / merchant_wallet (dono = merchant_stores.id)
--   · cliente  → customer / customer_wallet       (dono = payer_uid|merchant_id)
-- A distinção é factual: existe merchant_stores para o merchant_id?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pay_ride_payer_account(
  p_merchant_id uuid,
  p_payer_uid   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT id INTO v_store_id FROM public.merchant_stores
   WHERE id = p_merchant_id OR user_id = p_merchant_id
   LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    RETURN public._pay_account_system('merchant_store', v_store_id, 'merchant_wallet');
  END IF;

  -- Sem loja → é cliente (mini-conta). Carteira própria do cliente.
  RETURN public._pay_account_system('customer', COALESCE(p_payer_uid, p_merchant_id), 'customer_wallet');
END $$;

REVOKE ALL ON FUNCTION public._pay_ride_payer_account(uuid, uuid) FROM public, anon, authenticated;

-- ------------------------------------------------------------
-- pay_hold_ride_payment(order_id): reserva o valor de QUEM CHAMA no
-- platform_escrow, no ACEITE. Se a carteira não tem saldo, pay_post_
-- transaction levanta o guard (saldo negativo) → o chamador reverte
-- o aceite. Idempotente por 'ride_hold:'||order_id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_hold_ride_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_ord     public.service_orders%ROWTYPE;
  v_payer   uuid;
  v_escrow  uuid;
  v_gross   numeric(12,2);
  v_res     jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — requer autenticação' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ord FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_order % não existe', p_order_id USING ERRCODE = '23503';
  END IF;

  v_gross := COALESCE(v_ord.total_price, 0);
  IF v_gross <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'valor zero', 'order_id', p_order_id);
  END IF;

  v_payer  := public._pay_ride_payer_account(v_ord.merchant_id, v_ord.payer_uid);
  v_escrow := public._pay_account_system('platform', NULL, 'platform_escrow');

  v_res := public.pay_post_transaction(
    'ride_hold',
    'ride_hold:' || p_order_id::text,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', v_payer, 'direction', 'debit', 'entry_type', 'payment_out',
        'amount', v_gross, 'reference_type', 'service_order', 'reference_id', p_order_id,
        'description', 'Reserva corrida ' || p_order_id::text
      ),
      jsonb_build_object(
        'account_id', v_escrow, 'direction', 'credit', 'entry_type', 'payment_in',
        'amount', v_gross, 'reference_type', 'service_order', 'reference_id', p_order_id
      )
    ),
    'service_order', p_order_id,
    jsonb_build_object('kind', 'ride_hold', 'service_type', v_ord.service_type)
  );

  RETURN jsonb_build_object('ok', true, 'amount', v_gross, 'payer_account', v_payer, 'tx', v_res);
END $$;

REVOKE ALL ON FUNCTION public.pay_hold_ride_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_hold_ride_payment(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- pay_release_ride_payment(order_id): na conclusão, escrow → profissional
-- (líquido) + plataforma (comissão). A carteira do profissional é ESCOLHIDA
-- pelo service_type (saldos independentes por perfil):
--   delivery → motoboy_wallet | mototaxi → mototaxi_wallet | ride → driver_wallet
-- net = net_value da oferta aceita, senão fallback 80/20. Idempotente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_release_ride_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_ord       public.service_orders%ROWTYPE;
  v_prof      uuid;
  v_gross     numeric(12,2);
  v_net       numeric(12,2);
  v_fee       numeric(12,2);
  v_offer_net numeric(12,2);
  v_owner_t   public.pay_owner_type;
  v_acct_t    public.pay_account_type;
  v_escrow    uuid;
  v_prof_acct uuid;
  v_platform  uuid;
  v_res       jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — requer autenticação' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ord FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_order % não existe', p_order_id USING ERRCODE = '23503';
  END IF;

  v_prof  := COALESCE(v_ord.courier_id, v_ord.motoboy_id, v_ord.professional_uid);
  v_gross := COALESCE(v_ord.total_price, 0);
  IF v_gross <= 0 OR v_prof IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'sem valor ou sem profissional', 'order_id', p_order_id);
  END IF;

  -- net = oferta aceita (se tiver), senão 80/20
  SELECT net_value INTO v_offer_net
    FROM public.delivery_offers
   WHERE service_order_id = p_order_id
     AND offer_status = 'accepted'
     AND net_value IS NOT NULL
   ORDER BY accepted_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  v_net := COALESCE(v_offer_net, round(v_gross * 0.80, 2));
  v_fee := v_gross - v_net;

  -- carteira do profissional POR PERFIL (saldos independentes)
  CASE v_ord.service_type::text
    WHEN 'mototaxi' THEN v_owner_t := 'mototaxi_profile'; v_acct_t := 'mototaxi_wallet';
    WHEN 'ride'     THEN v_owner_t := 'driver_profile';   v_acct_t := 'driver_wallet';
    ELSE                 v_owner_t := 'motoboy_profile';  v_acct_t := 'motoboy_wallet';
  END CASE;

  v_escrow    := public._pay_account_system('platform', NULL, 'platform_escrow');
  v_prof_acct := public._pay_account_system(v_owner_t, v_prof, v_acct_t);
  v_platform  := public._pay_account_system('platform', NULL, 'platform_main');

  v_res := public.pay_post_transaction(
    'ride_release',
    'ride_release:' || p_order_id::text,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', v_escrow, 'direction', 'debit', 'entry_type', 'payment_out',
        'amount', v_gross, 'reference_type', 'service_order', 'reference_id', p_order_id
      ),
      jsonb_build_object(
        'account_id', v_prof_acct, 'direction', 'credit', 'entry_type', 'motoboy_earning',
        'amount', v_net, 'reference_type', 'service_order', 'reference_id', p_order_id,
        'metadata', jsonb_build_object('gross', v_gross, 'fee', v_fee, 'profile', v_owner_t::text)
      ),
      jsonb_build_object(
        'account_id', v_platform, 'direction', 'credit', 'entry_type', 'commission_income',
        'amount', v_fee, 'reference_type', 'service_order', 'reference_id', p_order_id
      )
    ),
    'service_order', p_order_id,
    jsonb_build_object('kind', 'ride_release', 'service_type', v_ord.service_type)
  );

  RETURN jsonb_build_object('ok', true, 'gross', v_gross, 'net', v_net, 'fee', v_fee,
                            'profile', v_owner_t::text, 'tx', v_res);
END $$;

REVOKE ALL ON FUNCTION public.pay_release_ride_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_release_ride_payment(uuid) TO authenticated, service_role;
