-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 2 / SQL 01 / Recarga via gateway + webhook handler
--
-- Decisão de modelo (ditada pelas constraints da Fase 1, não por preferência):
--  - pay_post_transaction exige auth.uid() + double-entry balanceado + saldo
--    não-negativo. Inutilizável a partir do webhook (service_role → auth.uid
--    NULL) e sem conta-contra interna válida para um aporte externo.
--  - pay_create_ledger_entry é SECURITY DEFINER, sem guard auth.uid(),
--    single-sided. É como o payment_in inicial de platform_main foi gravado.
--
-- Portanto:
--  - Aporte (recarga PIX/cartão) e reversões via webhook  → single-sided
--    pay_create_ledger_entry. A contra-perna é o caixa do PSP (off-ledger),
--    conferido na reconciliação (Prioridade 7).
--  - Movimentos internos (escrow de entrega, reserva de saque) seguem em
--    double-entry via pay_post_transaction pelo orchestrator autenticado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Idempotência de webhook + de ordem ────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS pay_payment_events_provider_event_ux
  ON public.pay_payment_events (provider_name, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pay_payment_orders_idempotency_ux
  ON public.pay_payment_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Busca de ordem por pagamento do provider (webhook reconcilia por aqui).
CREATE INDEX IF NOT EXISTS pay_payment_orders_provider_payment_ix
  ON public.pay_payment_orders (provider_name, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- ─── 2. RPC pay_create_payment_order (autenticado — orchestrator) ──────────
-- Cria a ordem em 'pending'. NÃO credita saldo: o crédito só acontece quando
-- o webhook confirmar o pagamento.
CREATE OR REPLACE FUNCTION public.pay_create_payment_order(
  p_payer_owner_type  public.pay_owner_type,
  p_payer_owner_id    uuid,
  p_target_account_id uuid,
  p_amount            numeric,
  p_provider_name     text,
  p_idempotency_key   text,
  p_product_type      text   DEFAULT NULL,
  p_product_id        uuid   DEFAULT NULL,
  p_product_snapshot  jsonb  DEFAULT '{}'::jsonb,
  p_expires_at        timestamptz DEFAULT NULL,
  p_metadata          jsonb  DEFAULT '{}'::jsonb
)
RETURNS public.pay_payment_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pay_payment_orders;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount inválido: %', p_amount USING ERRCODE = '23514';
  END IF;

  -- Idempotência: mesma chave → devolve a ordem já criada.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row FROM public.pay_payment_orders
     WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  INSERT INTO public.pay_payment_orders (
    payer_owner_type, payer_owner_id, target_account_id, status, amount,
    provider_name, product_type, product_id, product_snapshot,
    idempotency_key, expires_at, metadata, created_by
  ) VALUES (
    p_payer_owner_type, p_payer_owner_id, p_target_account_id, 'pending', p_amount,
    p_provider_name, p_product_type, p_product_id, COALESCE(p_product_snapshot,'{}'::jsonb),
    p_idempotency_key, p_expires_at, COALESCE(p_metadata,'{}'::jsonb), v_uid
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_create_payment_order(public.pay_owner_type, uuid, uuid, numeric, text, text, text, uuid, jsonb, timestamptz, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_create_payment_order(public.pay_owner_type, uuid, uuid, numeric, text, text, text, uuid, jsonb, timestamptz, jsonb) TO authenticated, service_role;

-- ─── 3. RPC pay_set_order_provider (autenticado — orchestrator) ────────────
-- Após driver.charge(): grava provider_payment_id + checkout/QR e move
-- pending → waiting_payment (CAS) na mesma chamada.
CREATE OR REPLACE FUNCTION public.pay_set_order_provider(
  p_order_id            uuid,
  p_provider_name       text,
  p_provider_payment_id text,
  p_provider_checkout_url text DEFAULT NULL,
  p_metadata            jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pay_payment_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pay_payment_orders;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pay_payment_orders
     SET provider_name        = p_provider_name,
         provider_payment_id  = p_provider_payment_id,
         provider_checkout_url = COALESCE(p_provider_checkout_url, provider_checkout_url),
         metadata             = metadata || COALESCE(p_metadata,'{}'::jsonb),
         updated_at           = now()
   WHERE id = p_order_id AND status = 'pending'
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem % inexistente ou não está em pending', p_order_id USING ERRCODE = '40001';
  END IF;

  -- pending → waiting_payment (transição catalogada, ator system).
  v_row := public.pay_update_payment_order_status(
    p_order_id, 'waiting_payment'::public.pay_payment_order_status,
    'system', 'pending'::public.pay_payment_order_status,
    'provider gerou pagamento', p_metadata
  );
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_set_order_provider(uuid, text, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_set_order_provider(uuid, text, text, text, jsonb) TO authenticated, service_role;

-- ─── 4. RPC pay_webhook_apply_event (service_role — SEM guard auth.uid) ────
-- Idempotente por (provider_name, provider_event_id). Resolve a ordem por
-- provider_payment_id, aplica a transição de status e, em 'paid', credita o
-- target_account_id via pay_create_ledger_entry (single-sided, ver topo).
--
-- Retorna jsonb com o desfecho. Erros de concorrência sobem como 40001 para
-- o caller (Edge Function) fazer retry exponencial.
CREATE OR REPLACE FUNCTION public.pay_webhook_apply_event(
  p_provider_name       text,
  p_provider_payment_id text,
  p_provider_event_id   text,
  p_event_type          text,           -- charge.paid|charge.failed|charge.expired|charge.refunded
  p_raw_payload         jsonb DEFAULT '{}'::jsonb,
  p_normalized_payload  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event   public.pay_payment_events;
  v_order   public.pay_payment_orders;
  v_new     public.pay_payment_order_status;
  v_from    public.pay_payment_order_status;
  v_existing_id uuid;
BEGIN
  -- 4.1 Idempotência do evento.
  IF p_provider_event_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.pay_payment_events
     WHERE provider_name = p_provider_name
       AND provider_event_id = p_provider_event_id
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('idempotent_replay', true, 'event_id', v_existing_id);
    END IF;
  END IF;

  -- 4.2 Localiza a ordem pelo pagamento do provider.
  SELECT * INTO v_order FROM public.pay_payment_orders
   WHERE provider_name = p_provider_name
     AND provider_payment_id = p_provider_payment_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

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
           processing_error = 'Nenhuma pay_payment_orders para provider_payment_id'
     WHERE id = v_event.id;
    RETURN jsonb_build_object('event_id', v_event.id, 'order_found', false);
  END IF;

  v_from := v_order.status;

  -- 4.3 Mapeia evento → novo status.
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

  -- Já no estado alvo (replay tardio) → no-op idempotente.
  IF v_from = v_new THEN
    UPDATE public.pay_payment_events
       SET processed = true, processed_at = now()
     WHERE id = v_event.id;
    RETURN jsonb_build_object('event_id', v_event.id, 'order_id', v_order.id,
                              'already_in_status', v_new, 'idempotent_replay', true);
  END IF;

  -- 4.4 Valida a transição no catálogo (ator system).
  IF NOT EXISTS (
    SELECT 1 FROM public.pay_state_transitions t
     WHERE t.entity_type = 'payment_order'
       AND t.from_status = v_from::text
       AND t.to_status   = v_new::text
       AND t.actor_role IN ('system','any')
  ) THEN
    -- Marca o evento e aborta. Como tudo roda numa transação, o RAISE
    -- desfaz inclusive este UPDATE — mas mantemos por clareza de intenção;
    -- o erro 23514 (não 40001) sinaliza ao caller que NÃO deve retry.
    UPDATE public.pay_payment_events
       SET processing_error = format('transição inválida %s → %s', v_from, v_new),
           retry_count = retry_count + 1
     WHERE id = v_event.id;
    RAISE EXCEPTION 'Transição inválida em payment_order %: % → %',
      v_order.id, v_from, v_new USING ERRCODE = '23514';
  END IF;

  -- 4.5 Aplica a transição.
  UPDATE public.pay_payment_orders
     SET status     = v_new,
         paid_at    = CASE WHEN v_new = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
         updated_at = now()
   WHERE id = v_order.id
   RETURNING * INTO v_order;

  -- 4.6 Efeito financeiro single-sided.
  IF v_new = 'paid' THEN
    PERFORM public.pay_create_ledger_entry(
      v_order.target_account_id, 'credit', 'payment_in', v_order.amount,
      'payment_order', v_order.id, 'recharge:' || COALESCE(v_order.provider_name,'gateway'),
      'Recarga confirmada via ' || COALESCE(v_order.provider_name,'gateway'),
      jsonb_build_object('payment_order_id', v_order.id,
                         'provider_payment_id', p_provider_payment_id),
      'recharge:' || v_order.id::text || ':in',  -- idempotency_key do ledger
      v_order.created_by
    );
  ELSIF v_new = 'refunded' THEN
    PERFORM public.pay_create_ledger_entry(
      v_order.target_account_id, 'debit', 'refund', v_order.amount,
      'payment_order', v_order.id, 'refund:' || COALESCE(v_order.provider_name,'gateway'),
      'Estorno de recarga via ' || COALESCE(v_order.provider_name,'gateway'),
      jsonb_build_object('payment_order_id', v_order.id,
                         'provider_payment_id', p_provider_payment_id),
      'recharge:' || v_order.id::text || ':refund',
      v_order.created_by
    );
  END IF;

  UPDATE public.pay_payment_events
     SET processed = true, processed_at = now()
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

REVOKE ALL ON FUNCTION public.pay_webhook_apply_event(text, text, text, text, jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_webhook_apply_event(text, text, text, text, jsonb, jsonb) TO service_role;
