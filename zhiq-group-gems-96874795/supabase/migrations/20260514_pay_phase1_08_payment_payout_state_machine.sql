-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 08 / State machine de payment_orders + payout_requests
-- + CAS (expected_from_status) em todos os RPCs de transição.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Seed transições de payment_order ───────────────────────────────────
INSERT INTO public.pay_state_transitions
  (entity_type, from_status, to_status, actor_role, is_terminal, description) VALUES
  ('payment_order', 'pending',         'waiting_payment', 'system',   false, 'Provider gerou link/QR e estamos aguardando confirmação'),
  ('payment_order', 'pending',         'cancelled',       'merchant', true,  'Lojista cancelou antes de gerar pagamento'),
  ('payment_order', 'pending',         'cancelled',       'admin',    true,  'Admin cancelou pagamento'),
  ('payment_order', 'pending',         'failed',          'system',   true,  'Falha imediata no provider'),
  ('payment_order', 'waiting_payment', 'paid',            'system',   false, 'Webhook do gateway confirmou pagamento'),
  ('payment_order', 'waiting_payment', 'failed',          'system',   true,  'Provider reportou falha'),
  ('payment_order', 'waiting_payment', 'cancelled',       'system',   true,  'Expiração (PIX/boleto)'),
  ('payment_order', 'waiting_payment', 'cancelled',       'merchant', true,  'Lojista cancelou antes do pagamento'),
  ('payment_order', 'waiting_payment', 'cancelled',       'admin',    true,  'Admin cancelou'),
  ('payment_order', 'paid',            'refunded',        'system',   true,  'Estorno via webhook'),
  ('payment_order', 'paid',            'refunded',        'admin',    true,  'Estorno manual')
ON CONFLICT (entity_type, from_status, to_status, actor_role) DO NOTHING;

-- ─── 2. Seed transições de payout_request ──────────────────────────────────
INSERT INTO public.pay_state_transitions
  (entity_type, from_status, to_status, actor_role, is_terminal, description) VALUES
  ('payout_request', 'pending',    'approved',   'admin',     false, 'Admin aprovou o saque'),
  ('payout_request', 'pending',    'cancelled',  'admin',     true,  'Admin cancelou'),
  ('payout_request', 'pending',    'cancelled',  'motoboy',   true,  'Motoboy desistiu antes da aprovação'),
  ('payout_request', 'pending',    'cancelled',  'merchant',  true,  'Lojista desistiu antes da aprovação'),
  ('payout_request', 'approved',   'processing', 'system',    false, 'Sistema enviou ao gateway'),
  ('payout_request', 'approved',   'cancelled',  'admin',     true,  'Admin cancelou após aprovação'),
  ('payout_request', 'processing', 'paid',       'system',    true,  'Gateway confirmou PIX'),
  ('payout_request', 'processing', 'failed',     'system',    true,  'Gateway falhou'),
  ('payout_request', 'processing', 'failed',     'admin',     true,  'Admin marcou como falha')
ON CONFLICT (entity_type, from_status, to_status, actor_role) DO NOTHING;

-- ─── 3. RPC pay_update_payment_order_status (com CAS) ──────────────────────
CREATE OR REPLACE FUNCTION public.pay_update_payment_order_status(
  p_order_id              uuid,
  p_new_status            public.pay_payment_order_status,
  p_actor_role            text DEFAULT 'system',
  p_expected_from_status  public.pay_payment_order_status DEFAULT NULL,
  p_reason                text DEFAULT NULL,
  p_metadata              jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pay_payment_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.pay_payment_orders;
  v_current   text;
  v_allowed   boolean;
  v_terminal  boolean;
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF p_actor_role = 'admin' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Caller não é admin' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.pay_payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_payment_orders % não existe', p_order_id USING ERRCODE = '23503';
  END IF;
  v_current := v_row.status::text;

  IF p_expected_from_status IS NOT NULL AND v_current <> p_expected_from_status::text THEN
    RAISE EXCEPTION 'CAS falhou em payment_order %: esperado from=%, atual=%',
      p_order_id, p_expected_from_status, v_current USING ERRCODE = '40001';
  END IF;
  IF v_current = p_new_status::text THEN RETURN v_row; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pay_state_transitions t
    WHERE t.entity_type = 'payment_order'
      AND t.from_status = v_current
      AND t.to_status   = p_new_status::text
      AND (t.actor_role = p_actor_role OR t.actor_role = 'any')
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Transição não permitida em payment_order: % → % por ator %',
      v_current, p_new_status, p_actor_role USING ERRCODE = '23514';
  END IF;

  SELECT bool_or(is_terminal) INTO v_terminal
    FROM public.pay_state_transitions
   WHERE entity_type = 'payment_order' AND from_status = v_current AND to_status = p_new_status::text;

  UPDATE public.pay_payment_orders
     SET status     = p_new_status,
         paid_at    = CASE WHEN p_new_status::text = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
         updated_at = now()
   WHERE id = p_order_id
   RETURNING * INTO v_row;

  BEGIN
    INSERT INTO public.system_events_log (event_type, event_data) VALUES (
      'payment_order_status_transition',
      jsonb_build_object('order_id', p_order_id, 'from', v_current, 'to', p_new_status,
                         'actor_role', p_actor_role, 'actor_id', v_uid, 'reason', p_reason,
                         'is_terminal', v_terminal, 'metadata', COALESCE(p_metadata, '{}'::jsonb)));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_update_payment_order_status(uuid, public.pay_payment_order_status, text, public.pay_payment_order_status, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_update_payment_order_status(uuid, public.pay_payment_order_status, text, public.pay_payment_order_status, text, jsonb) TO authenticated, service_role;

-- ─── 4. RPC pay_update_payout_request_status (com CAS) ─────────────────────
CREATE OR REPLACE FUNCTION public.pay_update_payout_request_status(
  p_request_id            uuid,
  p_new_status            public.pay_payout_request_status,
  p_actor_role            text DEFAULT 'system',
  p_expected_from_status  public.pay_payout_request_status DEFAULT NULL,
  p_reason                text DEFAULT NULL,
  p_metadata              jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pay_payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.pay_payout_requests;
  v_current   text;
  v_allowed   boolean;
  v_terminal  boolean;
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF p_actor_role = 'admin' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Caller não é admin' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.pay_payout_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_payout_requests % não existe', p_request_id USING ERRCODE = '23503';
  END IF;
  v_current := v_row.status::text;

  IF p_expected_from_status IS NOT NULL AND v_current <> p_expected_from_status::text THEN
    RAISE EXCEPTION 'CAS falhou em payout_request %: esperado from=%, atual=%',
      p_request_id, p_expected_from_status, v_current USING ERRCODE = '40001';
  END IF;
  IF v_current = p_new_status::text THEN RETURN v_row; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pay_state_transitions t
    WHERE t.entity_type = 'payout_request'
      AND t.from_status = v_current
      AND t.to_status   = p_new_status::text
      AND (t.actor_role = p_actor_role OR t.actor_role = 'any')
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Transição não permitida em payout_request: % → % por ator %',
      v_current, p_new_status, p_actor_role USING ERRCODE = '23514';
  END IF;

  SELECT bool_or(is_terminal) INTO v_terminal
    FROM public.pay_state_transitions
   WHERE entity_type = 'payout_request' AND from_status = v_current AND to_status = p_new_status::text;

  UPDATE public.pay_payout_requests
     SET status        = p_new_status,
         approved_at   = CASE WHEN p_new_status::text = 'approved' AND approved_at IS NULL THEN now() ELSE approved_at END,
         processed_at  = CASE WHEN p_new_status::text IN ('paid','failed') AND processed_at IS NULL THEN now() ELSE processed_at END,
         failure_reason= CASE WHEN p_new_status::text = 'failed' THEN COALESCE(p_reason, failure_reason) ELSE failure_reason END,
         updated_at    = now()
   WHERE id = p_request_id
   RETURNING * INTO v_row;

  BEGIN
    INSERT INTO public.system_events_log (event_type, event_data) VALUES (
      'payout_request_status_transition',
      jsonb_build_object('request_id', p_request_id, 'from', v_current, 'to', p_new_status,
                         'actor_role', p_actor_role, 'actor_id', v_uid, 'reason', p_reason,
                         'is_terminal', v_terminal, 'metadata', COALESCE(p_metadata, '{}'::jsonb)));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_update_payout_request_status(uuid, public.pay_payout_request_status, text, public.pay_payout_request_status, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_update_payout_request_status(uuid, public.pay_payout_request_status, text, public.pay_payout_request_status, text, jsonb) TO authenticated, service_role;

-- ─── 5. CAS em pay_update_delivery_status (parâmetro novo opcional) ────────
CREATE OR REPLACE FUNCTION public.pay_update_delivery_status(
  p_delivery_id          uuid,
  p_new_status           text,
  p_actor_role           text DEFAULT 'system',
  p_reason               text DEFAULT NULL,
  p_metadata             jsonb DEFAULT '{}'::jsonb,
  p_expected_from_status text DEFAULT NULL
)
RETURNS public.delivery_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.delivery_orders;
  v_current text;
  v_allowed boolean;
  v_terminal boolean;
  v_uid     uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF p_actor_role = 'admin' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Caller não é admin' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.delivery_orders WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_order % não existe', p_delivery_id USING ERRCODE = '23503';
  END IF;
  v_current := v_row.status;

  IF p_expected_from_status IS NOT NULL AND v_current <> p_expected_from_status THEN
    RAISE EXCEPTION 'CAS falhou em delivery_order %: esperado from=%, atual=%',
      p_delivery_id, p_expected_from_status, v_current USING ERRCODE = '40001';
  END IF;
  IF v_current = p_new_status THEN RETURN v_row; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pay_state_transitions t
    WHERE t.entity_type = 'delivery_order'
      AND t.from_status = v_current
      AND t.to_status   = p_new_status
      AND (t.actor_role = p_actor_role OR t.actor_role = 'any')
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Transição não permitida: % → % por ator %', v_current, p_new_status, p_actor_role
      USING ERRCODE = '23514';
  END IF;

  SELECT bool_or(is_terminal) INTO v_terminal
    FROM public.pay_state_transitions
   WHERE entity_type = 'delivery_order' AND from_status = v_current AND to_status = p_new_status;

  UPDATE public.delivery_orders
     SET status = p_new_status,
         accepted_at = CASE WHEN p_new_status = 'accepted'  AND accepted_at  IS NULL THEN now() ELSE accepted_at  END,
         started_at  = CASE WHEN p_new_status = 'picked_up' AND started_at   IS NULL THEN now() ELSE started_at   END,
         delivered_at= CASE WHEN p_new_status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
         finished_at = CASE WHEN v_terminal AND finished_at IS NULL THEN now() ELSE finished_at END
   WHERE id = p_delivery_id
   RETURNING * INTO v_row;

  BEGIN
    INSERT INTO public.system_events_log (event_type, event_data) VALUES (
      'delivery_status_transition',
      jsonb_build_object('delivery_id', p_delivery_id, 'from', v_current, 'to', p_new_status,
                         'actor_role', p_actor_role, 'actor_id', v_uid, 'reason', p_reason,
                         'is_terminal', v_terminal, 'metadata', COALESCE(p_metadata, '{}'::jsonb)));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_update_delivery_status(uuid, text, text, text, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_update_delivery_status(uuid, text, text, text, jsonb, text) TO authenticated, service_role;
