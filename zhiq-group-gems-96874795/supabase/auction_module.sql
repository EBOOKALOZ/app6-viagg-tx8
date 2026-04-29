-- ════════════════════════════════════════════════════════════════
-- MÓDULO LEILÃO & ARREMATE — Viagg-TX8
-- Criação: 2026-03-15
-- ════════════════════════════════════════════════════════════════

-- ─── 1. TABELAS ──────────────────────────────────────────────

-- 1.1 Listings (leilão ou arremate)
CREATE TABLE IF NOT EXISTS public.auction_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Produto
  title text NOT NULL,
  description text,
  image_url text,
  category text DEFAULT 'geral',
  condition text DEFAULT 'novo', -- novo, seminovo, usado

  -- Tipo
  listing_type text NOT NULL CHECK (listing_type IN ('auction', 'arremate')),

  -- Preços
  starting_price_cents integer NOT NULL DEFAULT 0,
  current_price_cents integer NOT NULL DEFAULT 0,
  buy_now_price_cents integer, -- arrematar agora (leilão) ou preço normal (arremate)
  opportunity_price_cents integer, -- preço oportunidade (arremate)
  min_bid_increment_cents integer DEFAULT 500, -- incremento mínimo por lance (R$5)
  original_price_cents integer, -- preço normal de referência

  -- Leilão
  bid_count integer DEFAULT 0,
  highest_bidder_id uuid,

  -- Arremate
  stock_quantity integer DEFAULT 1,
  offer_count integer DEFAULT 0,
  response_deadline_hours integer DEFAULT 24,

  -- Logística
  fulfillment_type text DEFAULT 'pickup', -- pickup, delivery, both
  city text,
  neighborhood text,
  state text DEFAULT 'TX',

  -- Timing
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  ended_early boolean DEFAULT false,

  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'ended', 'cancelled', 'sold')),
  winner_id uuid,
  winner_price_cents integer,

  -- Meta
  watchers_count integer DEFAULT 0,
  views_count integer DEFAULT 0,
  credits_spent integer DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auction_listings_store ON public.auction_listings(store_id);
CREATE INDEX IF NOT EXISTS idx_auction_listings_status ON public.auction_listings(status);
CREATE INDEX IF NOT EXISTS idx_auction_listings_type ON public.auction_listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_auction_listings_ends ON public.auction_listings(ends_at);
CREATE INDEX IF NOT EXISTS idx_auction_listings_city ON public.auction_listings(city);


-- 1.2 Bids (lances)
CREATE TABLE IF NOT EXISTS public.auction_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  is_winning boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auction_bids_listing ON public.auction_bids(listing_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_bidder ON public.auction_bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_amount ON public.auction_bids(listing_id, amount_cents DESC);


-- 1.3 Offers (ofertas arremate)
CREATE TABLE IF NOT EXISTS public.arremate_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
  offerer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  responded_at timestamptz,
  response_message text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arremate_offers_listing ON public.arremate_offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_arremate_offers_offerer ON public.arremate_offers(offerer_id);
CREATE INDEX IF NOT EXISTS idx_arremate_offers_status ON public.arremate_offers(status);


-- 1.4 Watchers (acompanhando)
CREATE TABLE IF NOT EXISTS public.auction_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_watchers_listing ON public.auction_watchers(listing_id);


-- 1.5 Events (log)
CREATE TABLE IF NOT EXISTS public.auction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- bid_placed, offer_sent, offer_accepted, listing_ended, buy_now, watcher_added
  actor_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auction_events_listing ON public.auction_events(listing_id);
CREATE INDEX IF NOT EXISTS idx_auction_events_type ON public.auction_events(event_type);


-- ─── 2. RLS POLICIES ────────────────────────────────────────

ALTER TABLE public.auction_listings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auction_listings_select" ON public.auction_listings FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auction_listings_insert" ON public.auction_listings FOR INSERT WITH CHECK (auth.uid() = merchant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auction_listings_update" ON public.auction_listings FOR UPDATE USING (auth.uid() = merchant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auction_bids_select" ON public.auction_bids FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auction_bids_insert" ON public.auction_bids FOR INSERT WITH CHECK (auth.uid() = bidder_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.arremate_offers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "arremate_offers_select" ON public.arremate_offers FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "arremate_offers_insert" ON public.arremate_offers FOR INSERT WITH CHECK (auth.uid() = offerer_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "arremate_offers_update" ON public.arremate_offers FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.auction_watchers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auction_watchers_select" ON public.auction_watchers FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auction_watchers_insert" ON public.auction_watchers FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auction_watchers_delete" ON public.auction_watchers FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.auction_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auction_events_select" ON public.auction_events FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auction_events_insert" ON public.auction_events FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 3. FUNÇÕES RPC ─────────────────────────────────────────

-- 3.1 place_auction_bid
CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_listing_id uuid,
  p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing record;
  v_bid_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Buscar listing
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não está ativo');
  END IF;

  IF v_listing.ends_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão encerrado');
  END IF;

  IF v_listing.merchant_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não pode dar lance no próprio leilão');
  END IF;

  -- Verificar lance mínimo
  IF p_amount_cents < (v_listing.current_price_cents + v_listing.min_bid_increment_cents) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lance abaixo do mínimo');
  END IF;

  -- Marcar lances anteriores como não-vencedores
  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;

  -- Inserir lance
  INSERT INTO public.auction_bids (listing_id, bidder_id, amount_cents, is_winning)
  VALUES (p_listing_id, v_user_id, p_amount_cents, true)
  RETURNING id INTO v_bid_id;

  -- Atualizar listing
  UPDATE public.auction_listings SET
    current_price_cents = p_amount_cents,
    highest_bidder_id = v_user_id,
    bid_count = bid_count + 1,
    updated_at = now()
  WHERE id = p_listing_id;

  -- Registrar evento
  INSERT INTO public.auction_events (listing_id, event_type, actor_id, metadata)
  VALUES (p_listing_id, 'bid_placed', v_user_id, jsonb_build_object('amount_cents', p_amount_cents, 'bid_id', v_bid_id));

  RETURN jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount_cents', p_amount_cents);
END;
$$;


-- 3.2 end_auction_listing
CREATE OR REPLACE FUNCTION public.end_auction_listing(
  p_listing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing record;
  v_user_id uuid := auth.uid();
BEGIN
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  END IF;

  IF v_listing.merchant_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não está ativo');
  END IF;

  -- Atualizar status
  UPDATE public.auction_listings SET
    status = CASE WHEN v_listing.highest_bidder_id IS NOT NULL THEN 'sold' ELSE 'ended' END,
    winner_id = v_listing.highest_bidder_id,
    winner_price_cents = v_listing.current_price_cents,
    ended_early = true,
    updated_at = now()
  WHERE id = p_listing_id;

  -- Evento
  INSERT INTO public.auction_events (listing_id, event_type, actor_id, metadata)
  VALUES (p_listing_id, 'listing_ended', v_user_id, jsonb_build_object(
    'winner_id', v_listing.highest_bidder_id,
    'final_price_cents', v_listing.current_price_cents,
    'ended_early', true
  ));

  RETURN jsonb_build_object('success', true, 'winner_id', v_listing.highest_bidder_id);
END;
$$;


-- 3.3 submit_arremate_offer
CREATE OR REPLACE FUNCTION public.submit_arremate_offer(
  p_listing_id uuid,
  p_amount_cents integer,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing record;
  v_offer_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id;

  IF v_listing IS NULL OR v_listing.listing_type != 'arremate' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Arremate não encontrado');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Arremate não está ativo');
  END IF;

  IF v_listing.merchant_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não pode enviar oferta no próprio arremate');
  END IF;

  INSERT INTO public.arremate_offers (listing_id, offerer_id, amount_cents, message, expires_at)
  VALUES (p_listing_id, v_user_id, p_amount_cents, p_message,
    now() + (v_listing.response_deadline_hours || ' hours')::interval)
  RETURNING id INTO v_offer_id;

  -- Atualizar contagem
  UPDATE public.auction_listings SET offer_count = offer_count + 1, updated_at = now() WHERE id = p_listing_id;

  -- Evento
  INSERT INTO public.auction_events (listing_id, event_type, actor_id, metadata)
  VALUES (p_listing_id, 'offer_sent', v_user_id, jsonb_build_object('offer_id', v_offer_id, 'amount_cents', p_amount_cents));

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id);
END;
$$;


-- 3.4 respond_arremate_offer
CREATE OR REPLACE FUNCTION public.respond_arremate_offer(
  p_offer_id uuid,
  p_accept boolean,
  p_response_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer record;
  v_listing record;
  v_user_id uuid := auth.uid();
BEGIN
  SELECT * INTO v_offer FROM public.arremate_offers WHERE id = p_offer_id;
  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta não encontrada');
  END IF;

  SELECT * INTO v_listing FROM public.auction_listings WHERE id = v_offer.listing_id;
  IF v_listing.merchant_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada');
  END IF;

  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta já respondida');
  END IF;

  -- Atualizar oferta
  UPDATE public.arremate_offers SET
    status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
    responded_at = now(),
    response_message = p_response_message
  WHERE id = p_offer_id;

  -- Se aceita, atualizar listing
  IF p_accept THEN
    UPDATE public.auction_listings SET
      status = 'sold',
      winner_id = v_offer.offerer_id,
      winner_price_cents = v_offer.amount_cents,
      updated_at = now()
    WHERE id = v_offer.listing_id;

    -- Rejeitar outras ofertas pendentes
    UPDATE public.arremate_offers SET status = 'rejected', responded_at = now()
    WHERE listing_id = v_offer.listing_id AND id != p_offer_id AND status = 'pending';
  END IF;

  -- Evento
  INSERT INTO public.auction_events (listing_id, event_type, actor_id, metadata)
  VALUES (v_offer.listing_id,
    CASE WHEN p_accept THEN 'offer_accepted' ELSE 'offer_rejected' END,
    v_user_id,
    jsonb_build_object('offer_id', p_offer_id, 'accepted', p_accept));

  RETURN jsonb_build_object('success', true, 'accepted', p_accept);
END;
$$;


-- ─── 4. VERIFICAÇÃO ─────────────────────────────────────────
SELECT 'auction_listings' AS tabela, count(*) AS total FROM public.auction_listings
UNION ALL
SELECT 'auction_bids', count(*) FROM public.auction_bids
UNION ALL
SELECT 'arremate_offers', count(*) FROM public.arremate_offers
UNION ALL
SELECT 'auction_watchers', count(*) FROM public.auction_watchers
UNION ALL
SELECT 'auction_events', count(*) FROM public.auction_events;
