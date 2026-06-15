-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FIX: webhook não credita pagamentos via Checkout Pro
--
-- Problema: pay_webhook_apply_event casava a ordem APENAS por
-- provider_payment_id. Funciona p/ PIX e cartão tokenizado (a ordem guarda o
-- payment_id numérico). Mas no Checkout Pro a ordem guarda o PREFERENCE_ID
-- (ex.: "461911790-...") e o webhook chega com o PAYMENT_ID numérico — então o
-- WHERE nunca casava, a ordem ficava presa em waiting_payment e o saldo nunca
-- creditava ("cartão paga e não aparece no saldo").
--
-- Correção: adiciona o parâmetro p_external_reference (default NULL) e um
-- fallback — quando não acha por provider_payment_id, extrai o order_id embutido
-- no external_reference ("<tipo>:<order_id>", ex. "credit_package:<uuid>"),
-- localiza a ordem por id e (de quebra) grava o payment_id numérico real em
-- provider_payment_id para eventos futuros casarem direto.
--
-- A função antiga de 6 parâmetros é removida para o caller de 6 args resolver
-- nesta nova versão (p_external_reference assume NULL).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pay_webhook_apply_event(
  p_provider_name       text,
  p_provider_payment_id text,
  p_provider_event_id   text,
  p_event_type          text,
  p_raw_payload         jsonb DEFAULT '{}'::jsonb,
  p_normalized_payload  jsonb DEFAULT '{}'::jsonb,
  p_external_reference  text  DEFAULT NULL
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
  v_ref_id  uuid;
BEGIN
  -- Idempotência do evento.
  IF p_provider_event_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.pay_payment_events
     WHERE provider_name = p_provider_name AND provider_event_id = p_provider_event_id
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('idempotent_replay', true, 'event_id', v_existing_id);
    END IF;
  END IF;

  -- 1ª tentativa: casa pelo provider_payment_id (PIX / cartão tokenizado).
  SELECT * INTO v_order FROM public.pay_payment_orders
   WHERE provider_name = p_provider_name AND provider_payment_id = p_provider_payment_id
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  -- Fallback Checkout Pro: ordem guardada com preference_id, webhook traz o
  -- payment_id numérico. Casa pelo order_id embutido no external_reference.
  IF v_order.id IS NULL AND p_external_reference IS NOT NULL THEN
    BEGIN
      v_ref_id := NULLIF(split_part(p_external_reference, ':', 2), '')::uuid;
    EXCEPTION WHEN others THEN
      v_ref_id := NULL;
    END;
    IF v_ref_id IS NOT NULL THEN
      SELECT * INTO v_order FROM public.pay_payment_orders
       WHERE id = v_ref_id AND provider_name = p_provider_name
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
      -- Canoniza: passa a guardar o payment_id real (próximos eventos casam direto).
      IF v_order.id IS NOT NULL
         AND v_order.provider_payment_id IS DISTINCT FROM p_provider_payment_id THEN
        UPDATE public.pay_payment_orders
           SET provider_payment_id = p_provider_payment_id, updated_at = now()
         WHERE id = v_order.id;
      END IF;
    END IF;
  END IF;

  -- Registra o evento (mesmo sem ordem — auditoria/replay).
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
           processing_error = 'Nenhuma pay_payment_orders para provider_payment_id/external_reference'
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

-- Remove a versão antiga de 6 parâmetros para o caller de 6 args resolver na
-- nova função (p_external_reference assume NULL) e evitar ambiguidade de overload.
DROP FUNCTION IF EXISTS public.pay_webhook_apply_event(text, text, text, text, jsonb, jsonb);

REVOKE ALL ON FUNCTION public.pay_webhook_apply_event(text, text, text, text, jsonb, jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_webhook_apply_event(text, text, text, text, jsonb, jsonb, text) TO service_role;
