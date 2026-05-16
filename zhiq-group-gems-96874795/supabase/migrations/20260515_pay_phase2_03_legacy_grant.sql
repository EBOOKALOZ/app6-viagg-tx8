-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 2 / SQL 03 / Ponte webhook → concessão de crédito legada
--
-- Cada checkout cria sua linha de compra legada e manda no metadata da
-- pay_payment_orders:  { grant_kind, <ref>_id }.
-- Ao confirmar o pagamento, pay_webhook_apply_event chama pay_grant_legacy,
-- que despacha a concessão no sistema de crédito de cada perfil.
--
--  merchant     → RPC confirm_credit_purchase (já existia; idempotente)
--  advertiser   → concessão NOVA (não existia): paid + saldo + ledger
--  real_estate  → concessão NOVA (não existia): paid + saldo + ledger
--
-- Tudo idempotente: cada ramo sai cedo se a compra legada já está paga.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pay_grant_legacy(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.pay_payment_orders;
  v_kind    text;
  v_ref     uuid;
  v_pur     record;
  v_before  integer;
  v_after   integer;
BEGIN
  SELECT * INTO v_order FROM public.pay_payment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order não encontrada');
  END IF;

  v_kind := v_order.metadata->>'grant_kind';
  IF v_kind IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'sem grant_kind');
  END IF;

  -- ─── MERCHANT: reusa a RPC existente (idempotente) ───────────────────────
  IF v_kind = 'merchant' THEN
    v_ref := (v_order.metadata->>'credit_purchase_id')::uuid;
    IF v_ref IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'credit_purchase_id ausente');
    END IF;
    RETURN jsonb_build_object('ok', true, 'kind', 'merchant',
                              'result', public.confirm_credit_purchase(v_ref));

  -- ─── ADVERTISER: concessão nova ──────────────────────────────────────────
  ELSIF v_kind = 'advertiser' THEN
    v_ref := (v_order.metadata->>'advertiser_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.advertiser_credit_purchases
      WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'advertiser purchase não encontrada');
    END IF;
    IF v_pur.payment_status = 'paid' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind', 'advertiser');
    END IF;

    UPDATE public.advertiser_credit_purchases
      SET payment_status='paid', paid_at=now(),
          provider_name=COALESCE(v_order.provider_name, provider_name)
      WHERE id = v_ref;

    SELECT available_credits INTO v_before
      FROM public.advertiser_credit_balances
      WHERE advertiser_account_id = v_pur.advertiser_account_id FOR UPDATE;
    IF NOT FOUND THEN
      v_before := 0;
      INSERT INTO public.advertiser_credit_balances
        (advertiser_account_id, available_credits, consumed_credits)
      VALUES (v_pur.advertiser_account_id, 0, 0);
    END IF;
    v_after := v_before + v_pur.credits_total;

    UPDATE public.advertiser_credit_balances
      SET available_credits = v_after, updated_at = now()
      WHERE advertiser_account_id = v_pur.advertiser_account_id;

    INSERT INTO public.advertiser_credit_ledger
      (advertiser_account_id, entry_type, amount, balance_before, balance_after,
       reason_code, description, source_type, source_id)
    VALUES
      (v_pur.advertiser_account_id, 'credit', v_pur.credits_total, v_before, v_after,
       'credit_purchase', 'Pagamento confirmado (' || v_pur.credits_total || ' créditos)',
       'advertiser_credit_purchase', v_ref);

    RETURN jsonb_build_object('ok', true, 'kind','advertiser',
                              'credits', v_pur.credits_total, 'new_balance', v_after);

  -- ─── REAL ESTATE: concessão nova ─────────────────────────────────────────
  ELSIF v_kind = 'real_estate' THEN
    v_ref := (v_order.metadata->>'real_estate_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.real_estate_credit_purchases
      WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'real_estate purchase não encontrada');
    END IF;
    IF v_pur.payment_status = 'paid' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind','real_estate');
    END IF;

    UPDATE public.real_estate_credit_purchases
      SET payment_status='paid', paid_at=now(),
          provider_name=COALESCE(v_order.provider_name, provider_name)
      WHERE id = v_ref;

    SELECT available_credits INTO v_before
      FROM public.real_estate_credit_balances
      WHERE owner_user_id = v_pur.owner_user_id FOR UPDATE;
    IF NOT FOUND THEN
      v_before := 0;
      INSERT INTO public.real_estate_credit_balances
        (owner_user_id, available_credits, reserved_credits, consumed_credits)
      VALUES (v_pur.owner_user_id, 0, 0, 0);
    END IF;
    v_after := v_before + v_pur.credits_total;

    UPDATE public.real_estate_credit_balances
      SET available_credits = v_after, updated_at = now()
      WHERE owner_user_id = v_pur.owner_user_id;

    INSERT INTO public.real_estate_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after,
       purchase_id, metadata)
    VALUES
      (v_pur.owner_user_id, 'purchase', v_pur.credits_total, v_before, v_after,
       v_ref, jsonb_build_object('order_id', p_order_id));

    RETURN jsonb_build_object('ok', true, 'kind','real_estate',
                              'credits', v_pur.credits_total, 'new_balance', v_after);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'grant_kind desconhecido: ' || v_kind);
END $$;

REVOKE ALL ON FUNCTION public.pay_grant_legacy(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_grant_legacy(uuid) TO service_role;

-- ─── Extensão: webhook chama a ponte ao confirmar pagamento ───────────────
-- Recria pay_webhook_apply_event acrescentando PERFORM pay_grant_legacy
-- logo após o crédito single-sided no pay_* wallet (mesma transação: se a
-- concessão falhar, tudo desfaz e o MP reenvia).
CREATE OR REPLACE FUNCTION public.pay_webhook_apply_event(
  p_provider_name       text,
  p_provider_payment_id text,
  p_provider_event_id   text,
  p_event_type          text,
  p_raw_payload         jsonb DEFAULT '{}'::jsonb,
  p_normalized_payload  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event   public.pay_payment_events;
  v_order   public.pay_payment_orders;
  v_new     public.pay_payment_order_status;
  v_from    public.pay_payment_order_status;
  v_existing_id uuid;
BEGIN
  IF p_provider_event_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.pay_payment_events
     WHERE provider_name = p_provider_name AND provider_event_id = p_provider_event_id
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('idempotent_replay', true, 'event_id', v_existing_id);
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.pay_payment_orders
   WHERE provider_name = p_provider_name AND provider_payment_id = p_provider_payment_id
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  INSERT INTO public.pay_payment_events (
    payment_order_id, provider_name, provider_event_type, provider_event_id,
    provider_payment_id, raw_payload, normalized_payload, idempotency_key
  ) VALUES (
    v_order.id, p_provider_name, p_event_type, p_provider_event_id,
    p_provider_payment_id, COALESCE(p_raw_payload,'{}'::jsonb),
    COALESCE(p_normalized_payload,'{}'::jsonb),
    p_provider_name || ':' || COALESCE(p_provider_event_id, p_provider_payment_id)
  )
  RETURNING * INTO v_event;

  IF v_order.id IS NULL THEN
    UPDATE public.pay_payment_events
       SET processed = true, processed_at = now(),
           processing_error = 'Nenhuma pay_payment_orders para provider_payment_id'
     WHERE id = v_event.id;
    RETURN jsonb_build_object('event_id', v_event.id, 'order_found', false);
  END IF;

  v_from := v_order.status;
  v_new := CASE p_event_type
    WHEN 'charge.paid'     THEN 'paid'
    WHEN 'charge.failed'   THEN 'failed'
    WHEN 'charge.expired'  THEN 'cancelled'
    WHEN 'charge.refunded' THEN 'refunded'
    ELSE NULL
  END::public.pay_payment_order_status;

  IF v_new IS NULL THEN
    UPDATE public.pay_payment_events
       SET processed = true, processed_at = now(),
           processing_error = 'event_type não acionável: ' || p_event_type
     WHERE id = v_event.id;
    RETURN jsonb_build_object('event_id', v_event.id, 'order_id', v_order.id,
                              'ignored_event_type', p_event_type);
  END IF;

  IF v_from = v_new THEN
    UPDATE public.pay_payment_events SET processed = true, processed_at = now()
     WHERE id = v_event.id;
    RETURN jsonb_build_object('event_id', v_event.id, 'order_id', v_order.id,
                              'already_in_status', v_new, 'idempotent_replay', true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pay_state_transitions t
     WHERE t.entity_type = 'payment_order'
       AND t.from_status = v_from::text AND t.to_status = v_new::text
       AND t.actor_role IN ('system','any')
  ) THEN
    UPDATE public.pay_payment_events
       SET processing_error = format('transição inválida %s → %s', v_from, v_new),
           retry_count = retry_count + 1
     WHERE id = v_event.id;
    RAISE EXCEPTION 'Transição inválida em payment_order %: % → %',
      v_order.id, v_from, v_new USING ERRCODE = '23514';
  END IF;

  UPDATE public.pay_payment_orders
     SET status = v_new,
         paid_at = CASE WHEN v_new = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
         updated_at = now()
   WHERE id = v_order.id
   RETURNING * INTO v_order;

  IF v_new = 'paid' THEN
    PERFORM public.pay_create_ledger_entry(
      v_order.target_account_id, 'credit', 'payment_in', v_order.amount,
      'payment_order', v_order.id, 'recharge:' || COALESCE(v_order.provider_name,'gateway'),
      'Recarga confirmada via ' || COALESCE(v_order.provider_name,'gateway'),
      jsonb_build_object('payment_order_id', v_order.id, 'provider_payment_id', p_provider_payment_id),
      'recharge:' || v_order.id::text || ':in',
      v_order.created_by
    );
    -- Ponte para a concessão de crédito legada (merchant/advertiser/real_estate).
    PERFORM public.pay_grant_legacy(v_order.id);
  ELSIF v_new = 'refunded' THEN
    PERFORM public.pay_create_ledger_entry(
      v_order.target_account_id, 'debit', 'refund', v_order.amount,
      'payment_order', v_order.id, 'refund:' || COALESCE(v_order.provider_name,'gateway'),
      'Estorno de recarga via ' || COALESCE(v_order.provider_name,'gateway'),
      jsonb_build_object('payment_order_id', v_order.id, 'provider_payment_id', p_provider_payment_id),
      'recharge:' || v_order.id::text || ':refund',
      v_order.created_by
    );
  END IF;

  UPDATE public.pay_payment_events SET processed = true, processed_at = now()
   WHERE id = v_event.id;

  BEGIN
    INSERT INTO public.system_events_log (event_type, event_data) VALUES (
      'payment_webhook_applied',
      jsonb_build_object('order_id', v_order.id, 'event_id', v_event.id,
                         'from', v_from, 'to', v_new, 'provider', p_provider_name,
                         'provider_payment_id', p_provider_payment_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('event_id', v_event.id, 'order_id', v_order.id,
                            'from', v_from, 'to', v_new, 'applied', true);
END $$;
