-- ============================================================
-- Leilão e Arremate para Anunciantes
-- Fase 1: extensão mínima de schema para suportar advertisers
-- ============================================================

-- 1. auction_listings: suportar ownership direta (anunciante sem loja)
ALTER TABLE public.auction_listings
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Tornar store_id nullable (lojistas continuam passando store_id;
-- anunciantes passarão owner_user_id + store_id NULL)
ALTER TABLE public.auction_listings
  ALTER COLUMN store_id DROP NOT NULL;

-- 2. product_listings: campos de modalidade e referência ao auction
ALTER TABLE public.product_listings
  ADD COLUMN IF NOT EXISTS listing_mode TEXT DEFAULT 'normal'
    CHECK (listing_mode IN ('normal', 'auction', 'arremate')),
  ADD COLUMN IF NOT EXISTS auction_listing_id UUID REFERENCES public.auction_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auction_listings_owner_user_id
  ON public.auction_listings(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_product_listings_auction_listing_id
  ON public.product_listings(auction_listing_id);

-- 3. Balancete de créditos para anunciantes
CREATE TABLE IF NOT EXISTS public.advertiser_credit_balances (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_account_id UUID NOT NULL UNIQUE REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  available_credits     INTEGER NOT NULL DEFAULT 0,
  consumed_credits      INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.advertiser_credit_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advertisers_own_credit_balance" ON public.advertiser_credit_balances;
CREATE POLICY "advertisers_own_credit_balance"
  ON public.advertiser_credit_balances
  USING (
    advertiser_account_id IN (
      SELECT id FROM public.advertiser_accounts WHERE user_id = auth.uid()
    )
  );

-- 4. Ledger de créditos para anunciantes
CREATE TABLE IF NOT EXISTS public.advertiser_credit_ledger (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_account_id UUID NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  entry_type            TEXT NOT NULL CHECK (entry_type IN ('credit', 'debit')),
  amount                INTEGER NOT NULL,
  balance_before        INTEGER NOT NULL DEFAULT 0,
  balance_after         INTEGER NOT NULL DEFAULT 0,
  reason_code           TEXT NOT NULL DEFAULT 'manual',
  description           TEXT,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.advertiser_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advertisers_own_credit_ledger" ON public.advertiser_credit_ledger;
CREATE POLICY "advertisers_own_credit_ledger"
  ON public.advertiser_credit_ledger
  USING (
    advertiser_account_id IN (
      SELECT id FROM public.advertiser_accounts WHERE user_id = auth.uid()
    )
  );

-- 5. RLS atualizada para auction_listings: anunciantes podem gerenciar os próprios
DROP POLICY IF EXISTS "advertiser_own_auction_listings" ON public.auction_listings;
CREATE POLICY "advertiser_own_auction_listings"
  ON public.auction_listings
  FOR ALL
  USING (owner_user_id = auth.uid() OR store_id IN (
    SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()
  ));

-- 6. RPC: criar listing de leilão/arremate aceitando owner_user_id
CREATE OR REPLACE FUNCTION public.create_auction_listing_v2(
  p_title               TEXT,
  p_starting_bid        NUMERIC,
  p_listing_type        TEXT DEFAULT 'auction',
  p_description         TEXT DEFAULT NULL,
  p_product_image_url   TEXT DEFAULT NULL,
  p_buy_now_price       NUMERIC DEFAULT NULL,
  p_duration_hours      INTEGER DEFAULT 24,
  p_starts_at           TIMESTAMPTZ DEFAULT NULL,
  p_ends_at             TIMESTAMPTZ DEFAULT NULL,
  p_fulfillment_type    TEXT DEFAULT 'pickup',
  -- Merchant path
  p_store_id            UUID DEFAULT NULL,
  -- Advertiser path
  p_owner_user_id       UUID DEFAULT NULL,
  p_city                TEXT DEFAULT NULL,
  p_neighborhood        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing_id   UUID;
  v_starts_at    TIMESTAMPTZ;
  v_ends_at      TIMESTAMPTZ;
BEGIN
  -- Require either store_id or owner_user_id
  IF p_store_id IS NULL AND p_owner_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_id or owner_user_id required');
  END IF;

  -- Resolve timestamps
  v_starts_at := COALESCE(p_starts_at, now());
  v_ends_at   := COALESCE(p_ends_at, v_starts_at + (p_duration_hours || ' hours')::INTERVAL);

  INSERT INTO public.auction_listings (
    store_id,
    owner_user_id,
    title,
    description,
    product_image_url,
    listing_type,
    starting_bid,
    current_bid,
    buy_now_price,
    starts_at,
    ends_at,
    status,
    city,
    neighborhood,
    minimum_increment,
    total_bids,
    watchers_count
  ) VALUES (
    p_store_id,
    p_owner_user_id,
    p_title,
    p_description,
    p_product_image_url,
    p_listing_type,
    p_starting_bid,
    p_starting_bid,
    p_buy_now_price,
    v_starts_at,
    v_ends_at,
    'active',
    p_city,
    p_neighborhood,
    1,
    0,
    0
  )
  RETURNING id INTO v_listing_id;

  RETURN jsonb_build_object(
    'success',     true,
    'listing_id',  v_listing_id,
    'ends_at',     v_ends_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_auction_listing_v2 TO authenticated;

-- 7. RPC: aceitar oferta de arremate (path do anunciante, com débito de créditos)
CREATE OR REPLACE FUNCTION public.accept_arremate_offer_advertiser(
  p_offer_id            UUID,
  p_advertiser_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer          RECORD;
  v_balance        RECORD;
  v_contact_cost   INTEGER;
  v_intention_cost INTEGER;
  v_total_cost     INTEGER;
  v_new_balance    INTEGER;
BEGIN
  -- Fetch offer
  SELECT * INTO v_offer
  FROM public.arremate_offers
  WHERE id = p_offer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_found');
  END IF;

  IF v_offer.status = 'accepted' THEN
    RETURN jsonb_build_object('success', true, 'already_accepted', true, 'credits_charged', 0);
  END IF;

  IF v_offer.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_pending');
  END IF;

  -- Fetch credit costs from usage rules
  SELECT COALESCE(
    (SELECT credits_cost::INTEGER FROM public.merchant_credit_usage_rules
     WHERE feature_code = 'offer_accept_contact_unlock' AND is_active = true LIMIT 1), 2
  ) INTO v_contact_cost;

  SELECT COALESCE(
    (SELECT credits_cost::INTEGER FROM public.merchant_credit_usage_rules
     WHERE feature_code = 'purchase_intention_received' AND is_active = true LIMIT 1), 5
  ) INTO v_intention_cost;

  v_total_cost := v_contact_cost + v_intention_cost;

  -- Fetch or create balance
  SELECT * INTO v_balance
  FROM public.advertiser_credit_balances
  WHERE advertiser_account_id = p_advertiser_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.advertiser_credit_balances (advertiser_account_id, available_credits, consumed_credits)
    VALUES (p_advertiser_account_id, 0, 0)
    RETURNING * INTO v_balance;
  END IF;

  IF v_balance.available_credits < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'required', v_total_cost,
      'available', v_balance.available_credits
    );
  END IF;

  v_new_balance := v_balance.available_credits - v_total_cost;

  -- Debit credits
  UPDATE public.advertiser_credit_balances
  SET available_credits = v_new_balance,
      consumed_credits  = consumed_credits + v_total_cost,
      updated_at        = now()
  WHERE advertiser_account_id = p_advertiser_account_id;

  INSERT INTO public.advertiser_credit_ledger (
    advertiser_account_id, entry_type, amount,
    balance_before, balance_after, reason_code, description
  ) VALUES (
    p_advertiser_account_id, 'debit', v_total_cost,
    v_balance.available_credits, v_new_balance,
    'offer_accept',
    'Aceite de oferta de arremate (comunicação + intenção)'
  );

  -- Accept the offer
  UPDATE public.arremate_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  RETURN jsonb_build_object(
    'success',         true,
    'credits_charged', v_total_cost,
    'balance_after',   v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_arremate_offer_advertiser TO authenticated;
