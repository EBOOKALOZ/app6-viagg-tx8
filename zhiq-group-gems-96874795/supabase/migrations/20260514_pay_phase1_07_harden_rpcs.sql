-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 07 / Endurecimento dos RPCs
-- Revoga EXECUTE de anon nos RPCs sensíveis e adiciona guard auth.uid().
-- pay_get_active_gateway segue público de propósito (sem credenciais).
-- Este SQL contém a versão FINAL VIVA das funções no banco.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.pay_compute_balance(uuid)                                                                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_post_transaction(text, text, jsonb, text, uuid, jsonb)                                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_update_delivery_status(uuid, text, text, text, jsonb)                                           FROM anon;

CREATE OR REPLACE FUNCTION public.pay_compute_balance(p_account_id uuid)
RETURNS TABLE (
  current_balance   numeric,
  available_balance numeric,
  reserved_balance  numeric,
  pending_balance   numeric,
  computed_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_owner   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  SELECT owner_id INTO v_owner FROM public.pay_financial_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta % não existe', p_account_id USING ERRCODE = '23503';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin') THEN
      RAISE EXCEPTION 'Sem permissão para ler saldo da conta %', p_account_id USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT a.current_balance, a.available_balance, a.reserved_balance, a.pending_balance, now()
    FROM public.pay_financial_accounts a WHERE a.id = p_account_id;
END $$;

REVOKE ALL ON FUNCTION public.pay_compute_balance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_compute_balance(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pay_get_or_create_account(
  p_owner_type    public.pay_owner_type,
  p_owner_id      uuid,
  p_account_type  public.pay_account_type,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pay_financial_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pay_financial_accounts;
  v_uid uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF NOT v_is_admin THEN
    IF p_owner_id IS DISTINCT FROM v_uid OR p_account_type NOT IN ('merchant_wallet','motoboy_wallet') THEN
      RAISE EXCEPTION 'Sem permissão para criar/obter conta %/% do owner %', p_owner_type, p_account_type, p_owner_id
        USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT * INTO v_row FROM public.pay_financial_accounts
   WHERE owner_type = p_owner_type
     AND owner_id IS NOT DISTINCT FROM p_owner_id
     AND account_type = p_account_type;
  IF FOUND THEN RETURN v_row; END IF;
  INSERT INTO public.pay_financial_accounts (owner_type, owner_id, account_type, metadata, created_by)
  VALUES (p_owner_type, p_owner_id, p_account_type, COALESCE(p_metadata,'{}'::jsonb), v_uid)
  ON CONFLICT (owner_type, owner_id, account_type) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pay_post_transaction(
  p_scope            text,
  p_idempotency_key  text,
  p_entries          jsonb,
  p_reference_type   text DEFAULT NULL,
  p_reference_id     uuid DEFAULT NULL,
  p_metadata         jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing      public.pay_idempotency_registry%ROWTYPE;
  v_response      jsonb := '{}'::jsonb;
  v_entry         jsonb;
  v_entry_ids     uuid[] := ARRAY[]::uuid[];
  v_new_entry_id  uuid;
  v_acct          public.pay_financial_accounts%ROWTYPE;
  v_total_credit  numeric := 0;
  v_total_debit   numeric := 0;
  v_account_ids   uuid[];
  v_account_id    uuid;
  v_dc            record;
  v_balance_before numeric;
  v_balance_after  numeric;
  v_avail_before   numeric;
  v_avail_after    numeric;
  v_resv_before    numeric;
  v_resv_after     numeric;
  v_dir            public.pay_ledger_direction;
  v_etype          public.pay_ledger_entry_type;
  v_amount         numeric;
  v_uid            uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  IF p_scope IS NULL OR length(p_scope) = 0 THEN
    RAISE EXCEPTION 'p_scope é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'p_idempotency_key é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_entries) < 2 THEN
    RAISE EXCEPTION 'Double-entry requer ao menos 2 entries (recebeu %)', jsonb_array_length(p_entries)
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing FROM public.pay_idempotency_registry
   WHERE scope = p_scope AND idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('idempotent_replay', true, 'response', v_existing.response_payload);
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_amount := (v_entry->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'amount inválido em entry %: %', v_entry, v_amount USING ERRCODE = '23514';
    END IF;
    IF (v_entry->>'direction') = 'credit' THEN v_total_credit := v_total_credit + v_amount;
    ELSIF (v_entry->>'direction') = 'debit'  THEN v_total_debit  := v_total_debit  + v_amount;
    ELSE RAISE EXCEPTION 'direction inválida em entry %', v_entry USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF v_total_credit <> v_total_debit THEN
    RAISE EXCEPTION 'Soma double-entry quebrada: créditos=% / débitos=% (entries=%)',
      v_total_credit, v_total_debit, p_entries USING ERRCODE = '23514';
  END IF;

  SELECT array_agg(DISTINCT (e->>'account_id')::uuid ORDER BY (e->>'account_id')::uuid)
    INTO v_account_ids FROM jsonb_array_elements(p_entries) e;
  FOREACH v_account_id IN ARRAY v_account_ids LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_account_id::text, 17));
  END LOOP;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_account_id := (v_entry->>'account_id')::uuid;
    v_dir        := (v_entry->>'direction')::public.pay_ledger_direction;
    v_etype      := (v_entry->>'entry_type')::public.pay_ledger_entry_type;
    v_amount     := (v_entry->>'amount')::numeric;

    SELECT * INTO v_acct FROM public.pay_financial_accounts WHERE id = v_account_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta % não existe', v_account_id USING ERRCODE = '23503'; END IF;
    IF v_acct.status <> 'active' THEN
      RAISE EXCEPTION 'Conta % não está ativa (status=%)', v_account_id, v_acct.status USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_dc FROM public.pay_apply_balance_impact(v_etype, v_dir, v_amount);

    v_balance_before := v_acct.current_balance;     v_balance_after := v_balance_before + v_dc.delta_current;
    v_avail_before   := v_acct.available_balance;   v_avail_after   := v_avail_before   + v_dc.delta_available;
    v_resv_before    := v_acct.reserved_balance;    v_resv_after    := v_resv_before    + v_dc.delta_reserved;

    IF v_avail_after < 0 THEN
      RAISE EXCEPTION 'Saldo disponível ficaria negativo em %: % → %', v_account_id, v_avail_before, v_avail_after
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.pay_ledger_entries (
      account_id, direction, entry_type, amount,
      balance_before, balance_after,
      available_balance_before, available_balance_after,
      reserved_balance_before, reserved_balance_after,
      reference_type, reference_id, reason_code, description, metadata,
      idempotency_key, created_by
    ) VALUES (
      v_account_id, v_dir, v_etype, v_amount,
      v_balance_before, v_balance_after,
      v_avail_before, v_avail_after,
      v_resv_before, v_resv_after,
      COALESCE(v_entry->>'reference_type', p_reference_type),
      COALESCE((v_entry->>'reference_id')::uuid, p_reference_id),
      COALESCE(v_entry->>'reason_code', p_scope || ':' || v_etype::text),
      v_entry->>'description',
      COALESCE(v_entry->'metadata', '{}'::jsonb),
      p_idempotency_key || ':' || (array_length(v_entry_ids,1)+1)::text,
      v_uid
    ) RETURNING id INTO v_new_entry_id;

    v_entry_ids := v_entry_ids || v_new_entry_id;

    UPDATE public.pay_financial_accounts
       SET current_balance = v_balance_after, available_balance = v_avail_after,
           reserved_balance = v_resv_after,   updated_at = now()
     WHERE id = v_account_id;
  END LOOP;

  v_response := jsonb_build_object(
    'idempotent_replay', false, 'entry_ids', to_jsonb(v_entry_ids),
    'scope', p_scope, 'idempotency_key', p_idempotency_key, 'posted_at', now()
  );

  INSERT INTO public.pay_idempotency_registry
    (scope, idempotency_key, reference_type, reference_id, metadata, response_payload)
  VALUES
    (p_scope, p_idempotency_key, p_reference_type, p_reference_id, COALESCE(p_metadata,'{}'::jsonb), v_response);

  RETURN v_response;

EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM public.pay_idempotency_registry
   WHERE scope = p_scope AND idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('idempotent_replay', true, 'response', v_existing.response_payload); END IF;
  RAISE;
END $$;

REVOKE ALL ON FUNCTION public.pay_post_transaction(text, text, jsonb, text, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_post_transaction(text, text, jsonb, text, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pay_update_delivery_status(
  p_delivery_id  uuid,
  p_new_status   text,
  p_actor_role   text DEFAULT 'system',
  p_reason       text DEFAULT NULL,
  p_metadata     jsonb DEFAULT '{}'::jsonb
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
                         'metadata', COALESCE(p_metadata, '{}'::jsonb))
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_update_delivery_status(uuid, text, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_update_delivery_status(uuid, text, text, text, jsonb) TO authenticated, service_role;
