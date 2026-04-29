-- ═══════════════════════════════════════════════════════════════
-- WhatsApp Contact Unlock — Backend-Driven Credit Debit
-- ═══════════════════════════════════════════════════════════════

-- 1. Audit table for contact unlocks (idempotency via unique constraint)
CREATE TABLE IF NOT EXISTS public.merchant_credit_contact_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  offer_id uuid NOT NULL,
  user_id uuid,
  credits_charged integer NOT NULL DEFAULT 0,
  rule_code text NOT NULL DEFAULT 'whatsapp_contact_unlock',
  offer_value_cents integer DEFAULT 0,
  channel text NOT NULL DEFAULT 'whatsapp',
  already_unlocked boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, offer_id)
);

-- RLS
ALTER TABLE public.merchant_credit_contact_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can read own unlocks"
  ON public.merchant_credit_contact_unlocks FOR SELECT
  USING (store_id IN (
    SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()
  ));

-- 2. Usage rule insert (6% = credits_cost stores the percentage)
INSERT INTO public.merchant_credit_usage_rules
  (feature_code, feature_name, module_name, event_type, credits_cost, description, is_active)
VALUES
  ('whatsapp_contact_unlock', 'Desbloqueio de contato WhatsApp', 'ARREMATE', 'whatsapp_contact_unlock', 2.5, 'Custo percentual sobre o valor da oferta aceita para desbloquear contato WhatsApp', true)
ON CONFLICT DO NOTHING;

-- 3. RPC function: unlock_whatsapp_contact
CREATE OR REPLACE FUNCTION public.unlock_whatsapp_contact(
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
  v_rule record;
  v_cost integer;
  v_balance integer;
  v_consumed integer;
  v_new_balance integer;
  v_existing record;
  v_customer_whatsapp text;
BEGIN
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

  -- Check if already unlocked (idempotent)
  SELECT * INTO v_existing
  FROM public.merchant_credit_contact_unlocks
  WHERE store_id = p_store_id AND offer_id = p_offer_id;

  IF FOUND THEN
    -- Already unlocked — return success without charging
    RETURN jsonb_build_object(
      'success', true,
      'already_unlocked', true,
      'credits_charged', 0
    );
  END IF;

  -- Get offer and validate
  SELECT ao.id, ao.amount_cents, ao.status, ao.customer_whatsapp, ao.arremate_listing_id
  INTO v_offer
  FROM public.arremate_offers ao
  JOIN public.arremate_listings al ON al.id = ao.arremate_listing_id
  WHERE ao.id = p_offer_id
    AND al.store_id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_found');
  END IF;

  -- Read cost rule
  SELECT credits_cost INTO v_rule
  FROM public.merchant_credit_usage_rules
  WHERE feature_code = 'whatsapp_contact_unlock' AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback to 6% if no rule
    v_cost := GREATEST(1, CEIL((COALESCE(v_offer.amount_cents, 0) / 100.0) * 0.025));
  ELSE
    -- credits_cost stores the percentage (e.g. 6 = 6%)
    v_cost := GREATEST(1, CEIL((COALESCE(v_offer.amount_cents, 0) / 100.0) * (v_rule.credits_cost / 100.0)));
  END IF;

  -- Check balance
  SELECT available_credits, consumed_credits
  INTO v_balance, v_consumed
  FROM public.merchant_credit_balances
  WHERE store_id = p_store_id;

  IF NOT FOUND OR v_balance < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'required', v_cost,
      'available', COALESCE(v_balance, 0)
    );
  END IF;

  -- Atomic debit
  v_new_balance := v_balance - v_cost;

  UPDATE public.merchant_credit_balances
  SET available_credits = v_new_balance,
      consumed_credits = COALESCE(v_consumed, 0) + v_cost,
      updated_at = now()
  WHERE store_id = p_store_id;

  -- Ledger entry
  INSERT INTO public.merchant_credit_ledger (
    store_id, entry_type, amount,
    balance_before, balance_after,
    reason_code, description, metadata
  ) VALUES (
    p_store_id, 'debit', v_cost,
    v_balance, v_new_balance,
    'whatsapp_contact_unlock',
    'Desbloqueio de contato WhatsApp — oferta R$ ' || TRIM(TO_CHAR(COALESCE(v_offer.amount_cents, 0) / 100.0, 'FM999G999D00')),
    jsonb_build_object(
      'offer_id', p_offer_id,
      'listing_id', v_offer.arremate_listing_id,
      'offer_amount_cents', v_offer.amount_cents,
      'cost_percent', COALESCE(v_rule.credits_cost, 6),
      'channel', 'whatsapp'
    )
  );

  -- Audit log
  INSERT INTO public.merchant_credit_contact_unlocks (
    store_id, offer_id, user_id, credits_charged,
    rule_code, offer_value_cents, channel, already_unlocked
  ) VALUES (
    p_store_id, p_offer_id, v_user_id, v_cost,
    'whatsapp_contact_unlock', v_offer.amount_cents, 'whatsapp', false
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_unlocked', false,
    'credits_charged', v_cost
  );
END;
$$;
