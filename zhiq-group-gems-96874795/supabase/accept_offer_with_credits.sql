-- ═══════════════════════════════════════════════════════════════
-- Accept Offer with Credits — Atomic 7-credit debit on acceptance
-- ═══════════════════════════════════════════════════════════════

-- RPC function: accept_offer_with_credits
-- Debits 7 credits total (2 communication + 5 intention) as separate ledger entries
-- Idempotent: if already accepted, returns success without re-charging
CREATE OR REPLACE FUNCTION public.accept_offer_with_credits(
  p_offer_id uuid,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_offer record;
  v_balance integer;
  v_consumed integer;
  v_new_balance integer;
  v_cost_communication integer;
  v_cost_intention integer;
  v_total_cost integer;
BEGIN
  -- Read costs from usage rules (fallback to defaults if not found)
  SELECT COALESCE(credits_cost, 2)::integer INTO v_cost_communication
  FROM public.merchant_credit_usage_rules
  WHERE feature_code = 'offer_accept_contact_unlock' AND is_active = true
  LIMIT 1;
  v_cost_communication := COALESCE(v_cost_communication, 2);

  SELECT COALESCE(credits_cost, 5)::integer INTO v_cost_intention
  FROM public.merchant_credit_usage_rules
  WHERE feature_code = 'purchase_intention_received' AND is_active = true
  LIMIT 1;
  v_cost_intention := COALESCE(v_cost_intention, 5);

  v_total_cost := v_cost_communication + v_cost_intention;
  -- Get caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Validate store ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_stores WHERE id = p_store_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_not_owned');
  END IF;

  -- Get offer and validate
  SELECT ao.id, ao.offer_amount, ao.status, ao.customer_whatsapp,
         ao.customer_name, ao.arremate_listing_id,
         COALESCE(ao.amount_cents, ROUND(ao.offer_amount * 100)) as amount_cents_resolved
  INTO v_offer
  FROM public.arremate_offers ao
  JOIN public.arremate_listings al ON al.id = ao.arremate_listing_id
  WHERE ao.id = p_offer_id
    AND al.store_id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_found');
  END IF;

  -- If already accepted, return success without charging (idempotent)
  IF v_offer.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_accepted', true,
      'credits_charged', 0
    );
  END IF;

  -- Check balance
  SELECT available_credits, consumed_credits
  INTO v_balance, v_consumed
  FROM public.merchant_credit_balances
  WHERE store_id = p_store_id;

  IF NOT FOUND OR v_balance < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'required', v_total_cost,
      'available', COALESCE(v_balance, 0)
    );
  END IF;

  -- Atomic debit
  v_new_balance := v_balance - v_total_cost;

  UPDATE public.merchant_credit_balances
  SET available_credits = v_new_balance,
      consumed_credits = COALESCE(v_consumed, 0) + v_total_cost,
      updated_at = now()
  WHERE store_id = p_store_id;

  -- Ledger entry 1: Communication (2 credits)
  INSERT INTO public.merchant_credit_ledger (
    store_id, entry_type, amount,
    balance_before, balance_after,
    reason_code, description, metadata
  ) VALUES (
    p_store_id, 'debit', v_cost_communication,
    v_balance, v_balance - v_cost_communication,
    'offer_accept_communication',
    'Liberação de comunicação — oferta de ' || COALESCE(v_offer.customer_name, 'cliente'),
    jsonb_build_object(
      'offer_id', p_offer_id,
      'listing_id', v_offer.arremate_listing_id,
      'component', 'communication',
      'offer_amount', v_offer.offer_amount
    )
  );

  -- Ledger entry 2: Purchase intention (5 credits)
  INSERT INTO public.merchant_credit_ledger (
    store_id, entry_type, amount,
    balance_before, balance_after,
    reason_code, description, metadata
  ) VALUES (
    p_store_id, 'debit', v_cost_intention,
    v_balance - v_cost_communication, v_new_balance,
    'offer_accept_intention',
    'Envio de intenção de compra — oferta de ' || COALESCE(v_offer.customer_name, 'cliente'),
    jsonb_build_object(
      'offer_id', p_offer_id,
      'listing_id', v_offer.arremate_listing_id,
      'component', 'intention',
      'offer_amount', v_offer.offer_amount
    )
  );

  -- Update offer status to accepted
  UPDATE public.arremate_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- Record in contact_unlocks for WhatsApp idempotency (already unlocked on accept)
  INSERT INTO public.merchant_credit_contact_unlocks (
    store_id, offer_id, user_id, credits_charged,
    rule_code, offer_value_cents, channel, already_unlocked
  ) VALUES (
    p_store_id, p_offer_id, v_user_id, v_total_cost,
    'offer_accept', COALESCE(v_offer.amount_cents_resolved, 0)::integer, 'whatsapp', false
  )
  ON CONFLICT (store_id, offer_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'already_accepted', false,
    'credits_charged', v_total_cost,
    'communication_credits', v_cost_communication,
    'intention_credits', v_cost_intention
  );
END;
$$;
