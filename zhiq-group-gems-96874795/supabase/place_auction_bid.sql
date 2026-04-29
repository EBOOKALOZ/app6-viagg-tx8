-- ═══════════════════════════════════════════════════
-- PASSO 1: Recriar auction_bids do zero
-- Cole TUDO no SQL Editor e clique RUN
-- ═══════════════════════════════════════════════════

-- Dropar se existir
DROP TABLE IF EXISTS public.auction_bids CASCADE;

-- Criar tabela sem FOREIGN KEYS (evitar erros)
CREATE TABLE public.auction_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  is_winning boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_auction_bids_listing ON public.auction_bids(listing_id);
CREATE INDEX idx_auction_bids_user ON public.auction_bids(user_id);

-- RLS
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bids_select_all" ON public.auction_bids FOR SELECT USING (true);
CREATE POLICY "bids_insert_own" ON public.auction_bids FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════
-- PASSO 2: Criar função place_auction_bid
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_listing_id uuid,
  p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_listing record;
  v_bid_id uuid;
  v_user_id uuid := auth.uid();
  v_current_bid_cents integer;
  v_min_increment_cents integer;
BEGIN
  SELECT * INTO v_listing
  FROM public.auction_listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não está ativo');
  END IF;

  IF v_listing.ends_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão encerrado');
  END IF;

  v_current_bid_cents := COALESCE((v_listing.current_bid * 100)::integer, 0);
  v_min_increment_cents := COALESCE((v_listing.minimum_increment * 100)::integer, 100);

  IF p_amount_cents < (v_current_bid_cents + v_min_increment_cents) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Lance abaixo do mínimo');
  END IF;

  UPDATE public.auction_bids
  SET is_winning = false
  WHERE listing_id = p_listing_id AND is_winning = true;

  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning)
  VALUES (p_listing_id, v_user_id, p_amount_cents, true)
  RETURNING id INTO v_bid_id;

  UPDATE public.auction_listings SET
    current_bid = (p_amount_cents::numeric / 100),
    total_bids = COALESCE(total_bids, 0) + 1,
    updated_at = now()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount_cents', p_amount_cents);
END;
$fn$;
