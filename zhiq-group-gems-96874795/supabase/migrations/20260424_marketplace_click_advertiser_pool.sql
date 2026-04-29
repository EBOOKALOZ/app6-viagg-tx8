-- ═══════════════════════════════════════════════════════════════
-- MARKETPLACE PRODUCT CLICK — unificar pool de créditos
-- A RPC passa a debitar do pool do ANUNCIANTE primeiro
-- (advertiser_credit_balances) e só cai em merchant_credit_balances
-- como fallback se não houver advertiser_account ligado à loja.
-- Mantém todos os gates: owner_skip, dedup, dry_run, insufficient_balance.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.consume_marketplace_product_click(
  p_product_id   uuid,
  p_store_id     uuid,
  p_anon_id      text DEFAULT NULL,
  p_city         text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_source       text DEFAULT 'card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_id     uuid := auth.uid();
  v_owner_id       uuid;
  v_advertiser_id  uuid;
  v_pool           text;   -- 'advertiser' | 'merchant'
  v_cost           integer;
  v_dedup_minutes  integer;
  v_dry_run        boolean;
  v_balance        integer;
  v_consumed       integer;
  v_new_balance    integer;
  v_ledger_id      uuid;
  v_event_id       uuid;
  v_existing_count integer;
BEGIN
  -- 1. Lê regra (custo + dedup + dry_run)
  SELECT credits_cost::integer,
         COALESCE((metadata->>'dedup_minutes')::integer, 0),
         COALESCE((metadata->>'dry_run')::boolean, false)
    INTO v_cost, v_dedup_minutes, v_dry_run
    FROM public.merchant_credit_usage_rules
   WHERE feature_code = 'marketplace_product_click'
     AND is_active = true
   LIMIT 1;

  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'rule_not_found');
  END IF;

  -- 2. Dono da loja
  SELECT user_id INTO v_owner_id
    FROM public.merchant_stores
   WHERE id = p_store_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'store_not_found');
  END IF;

  -- 2.1 Owner self-skip
  IF v_visitor_id IS NOT NULL AND v_visitor_id = v_owner_id THEN
    INSERT INTO public.marketplace_product_click_events
      (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged)
    VALUES
      (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'owner_skip', 0);
    RETURN jsonb_build_object('charged', false, 'reason', 'owner_self_view');
  END IF;

  -- 3. Dedup
  IF v_dedup_minutes > 0 THEN
    SELECT COUNT(*) INTO v_existing_count
      FROM public.marketplace_product_click_events
     WHERE store_id = p_store_id
       AND status = 'charged'
       AND created_at > now() - make_interval(mins => v_dedup_minutes)
       AND (
            (v_visitor_id IS NOT NULL AND visitor_user_id = v_visitor_id)
         OR (v_visitor_id IS NULL AND p_anon_id IS NOT NULL AND anon_id = p_anon_id)
       );

    IF v_existing_count > 0 THEN
      INSERT INTO public.marketplace_product_click_events
        (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged)
      VALUES
        (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'deduped', 0);
      RETURN jsonb_build_object('charged', false, 'reason', 'deduped');
    END IF;
  END IF;

  -- 4. Dry-run
  IF v_dry_run THEN
    INSERT INTO public.marketplace_product_click_events
      (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged, metadata)
    VALUES
      (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'dry_run', 0,
       jsonb_build_object('would_charge', v_cost))
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object('charged', false, 'reason', 'dry_run', 'would_charge', v_cost, 'event_id', v_event_id);
  END IF;

  -- 5. Escolher pool: advertiser > merchant
  SELECT id INTO v_advertiser_id
    FROM public.advertiser_accounts
   WHERE user_id = v_owner_id
   LIMIT 1;

  IF v_advertiser_id IS NOT NULL THEN
    SELECT available_credits, COALESCE(consumed_credits, 0)
      INTO v_balance, v_consumed
      FROM public.advertiser_credit_balances
     WHERE advertiser_account_id = v_advertiser_id
     FOR UPDATE;

    IF v_balance IS NOT NULL AND v_balance >= v_cost THEN
      v_pool := 'advertiser';
    END IF;
  END IF;

  IF v_pool IS NULL THEN
    SELECT available_credits, COALESCE(consumed_credits, 0)
      INTO v_balance, v_consumed
      FROM public.merchant_credit_balances
     WHERE store_id = p_store_id
     FOR UPDATE;

    IF v_balance IS NOT NULL AND v_balance >= v_cost THEN
      v_pool := 'merchant';
    END IF;
  END IF;

  IF v_pool IS NULL THEN
    INSERT INTO public.marketplace_product_click_events
      (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged, metadata)
    VALUES
      (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'insufficient_balance', 0,
       jsonb_build_object('available', COALESCE(v_balance, 0), 'required', v_cost, 'advertiser_account_id', v_advertiser_id));
    RETURN jsonb_build_object('charged', false, 'reason', 'insufficient_balance', 'available', COALESCE(v_balance, 0), 'required', v_cost);
  END IF;

  -- 6. Débito atômico no pool escolhido
  v_new_balance := v_balance - v_cost;

  IF v_pool = 'advertiser' THEN
    UPDATE public.advertiser_credit_balances
       SET available_credits = v_new_balance,
           consumed_credits  = v_consumed + v_cost,
           updated_at        = now()
     WHERE advertiser_account_id = v_advertiser_id;

    INSERT INTO public.advertiser_credit_ledger
      (advertiser_account_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata, source_type)
    VALUES
      (v_advertiser_id, 'debit', v_cost, v_balance, v_new_balance,
       'marketplace_product_click',
       'Entrada na loja a partir de anúncio — ' || v_cost || ' créditos',
       jsonb_build_object(
         'store_id',        p_store_id,
         'product_id',      p_product_id,
         'visitor_user_id', v_visitor_id,
         'anon_id',         p_anon_id,
         'city',            p_city,
         'neighborhood',    p_neighborhood,
         'source',          p_source
       ),
       'consumption')
    RETURNING id INTO v_ledger_id;
  ELSE
    UPDATE public.merchant_credit_balances
       SET available_credits = v_new_balance,
           consumed_credits  = v_consumed + v_cost,
           updated_at        = now()
     WHERE store_id = p_store_id;

    INSERT INTO public.merchant_credit_ledger
      (store_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata)
    VALUES
      (p_store_id, 'debit', v_cost, v_balance, v_new_balance,
       'marketplace_product_click',
       'Entrada na loja a partir de anúncio — ' || v_cost || ' créditos',
       jsonb_build_object(
         'product_id',      p_product_id,
         'visitor_user_id', v_visitor_id,
         'anon_id',         p_anon_id,
         'city',            p_city,
         'neighborhood',    p_neighborhood,
         'source',          p_source
       ))
    RETURNING id INTO v_ledger_id;
  END IF;

  INSERT INTO public.marketplace_product_click_events
    (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged, ledger_entry_id, metadata)
  VALUES
    (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'charged', v_cost, v_ledger_id,
     jsonb_build_object('pool', v_pool))
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'charged', true,
    'credits_charged', v_cost,
    'balance_after', v_new_balance,
    'pool', v_pool,
    'event_id', v_event_id,
    'ledger_entry_id', v_ledger_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_marketplace_product_click(uuid, uuid, text, text, text, text)
  TO anon, authenticated;
