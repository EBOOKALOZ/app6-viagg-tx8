-- ORION-480 FASE 4 — P0-01
-- pay_release_ride_payment liberava escrow sem checar se o chamador tem
-- vínculo com a corrida (qualquer usuário autenticado podia liquidar
-- QUALQUER service_order chamando a RPC direto). Corrige adicionando
-- checagem de ownership (profissional da corrida OU admin) antes de
-- prosseguir com a liquidação. Mantém 100% do restante da lógica
-- (fonte oficial de comissão, idempotência, espelho de escrow) igual
-- à versão vigente em 20260710_comissao_fonte_unica.sql.

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
  v_pct       numeric;
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

  -- P0-01: só o profissional vinculado à corrida (ou admin) pode disparar
  -- a liquidação. Antes, qualquer usuário autenticado adivinhando/sabendo
  -- p_order_id conseguia liberar o escrow de uma corrida de terceiro.
  IF v_prof IS NOT NULL AND v_uid <> v_prof AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'não autorizado a liquidar esta corrida' USING ERRCODE = '42501';
  END IF;

  v_gross := COALESCE(v_ord.total_price, 0);
  IF v_gross <= 0 OR v_prof IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'sem valor ou sem profissional', 'order_id', p_order_id);
  END IF;

  -- net OFICIAL = o da oferta aceita (aceita QUALQUER uma das duas colunas).
  SELECT net_value INTO v_offer_net
    FROM public.delivery_offers
   WHERE service_order_id = p_order_id
     AND (offer_status = 'accepted' OR status = 'accepted')
     AND net_value IS NOT NULL
   ORDER BY accepted_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF v_offer_net IS NOT NULL THEN
    v_net := v_offer_net;
  ELSE
    -- Borda sem oferta: a MESMA fonte oficial — nunca número fixo.
    v_pct := public.official_motoboy_commission(v_prof);
    v_net := round(v_gross * (1.0 - v_pct / 100.0), 2);
  END IF;
  v_fee := v_gross - v_net;

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

  -- ESPELHO = CÓPIA EXATA do liquidado (upsert sobrescreve qualquer valor
  -- pré-existente do trigger de delivered) → extrato/admin = carteira/ledger.
  INSERT INTO public.pay_escrow_holds (
    idempotency_key, service_type, service_id,
    payer_user_id, professional_user_id,
    amount_cents, platform_fee_cents, professional_amount_cents,
    status, held_at, released_at, metadata
  ) VALUES (
    'so-' || p_order_id::text,
    CASE WHEN v_ord.service_type::text IN ('delivery','ride','mototaxi','freight','credit_purchase')
         THEN v_ord.service_type::text ELSE 'delivery' END,
    p_order_id,
    COALESCE(v_ord.payer_uid, v_ord.customer_uid, v_ord.merchant_id),
    v_prof,
    round(v_gross * 100)::int,
    round(v_fee   * 100)::int,
    round(v_net   * 100)::int,
    'released',
    COALESCE(v_ord.accepted_at, v_ord.created_at, now()),
    now(),
    jsonb_build_object(
      'source', 'pay_release_ride_payment',
      'commission_percent', CASE WHEN v_gross > 0 THEN round((v_fee / v_gross) * 100, 2) ELSE NULL END,
      'settled_copy', true
    )
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    amount_cents              = EXCLUDED.amount_cents,
    platform_fee_cents        = EXCLUDED.platform_fee_cents,
    professional_amount_cents = EXCLUDED.professional_amount_cents,
    status                    = EXCLUDED.status,
    released_at               = EXCLUDED.released_at,
    metadata                  = EXCLUDED.metadata;

  RETURN jsonb_build_object('ok', true, 'gross', v_gross, 'net', v_net, 'fee', v_fee,
                            'profile', v_owner_t::text, 'tx', v_res);
END $$;

REVOKE ALL ON FUNCTION public.pay_release_ride_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_release_ride_payment(uuid) TO authenticated, service_role;
