-- ════════════════════════════════════════════════════════════════════════════
-- LEILÕES — Tipo de Entrega (fulfillment_type) de verdade no banco
-- ----------------------------------------------------------------------------
-- Problema: o front (cards + modais) exibe/edita "Tipo de Entrega"
-- (A Retirar / Entrega Grátis / Ambos), mas a tabela auction_listings NÃO tem
-- a coluna e o RPC create_auction_listing não recebe o valor — tudo ficava
-- implicitamente "pickup".
--
-- Esta migration:
--   1) adiciona a coluna fulfillment_type (pickup | delivery | both);
--   2) recria o RPC canônico (16-arg → 17-arg) aceitando p_fulfillment_type.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Coluna ──────────────────────────────────────────────────────────────
ALTER TABLE public.auction_listings
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'pickup';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'auction_listings_fulfillment_type_check'
  ) THEN
    ALTER TABLE public.auction_listings
      ADD CONSTRAINT auction_listings_fulfillment_type_check
      CHECK (fulfillment_type IN ('pickup', 'delivery', 'both'));
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 2. RPC canônico com p_fulfillment_type ────────────────────────────────
-- Drop da assinatura antiga (16-arg) para evitar overload ambíguo (PGRST203).
DROP FUNCTION IF EXISTS public.create_auction_listing(
  uuid, text, text, text, numeric, numeric, numeric, numeric,
  text, text, text, integer, uuid, text, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.create_auction_listing(
  p_store_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_product_image_url text DEFAULT NULL,
  p_starting_bid numeric DEFAULT 0,
  p_buy_now_price numeric DEFAULT NULL,
  p_reserve_price numeric DEFAULT NULL,
  p_minimum_increment numeric DEFAULT 1,
  p_city text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_state text DEFAULT 'TX',
  p_duration_hours integer DEFAULT 24,
  p_product_id uuid DEFAULT NULL,
  p_listing_type text DEFAULT 'auction',
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL,
  p_fulfillment_type text DEFAULT 'pickup'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_starts_at timestamptz;
  v_ends_at   timestamptz;
  v_type text;
  v_fulfillment text;
BEGIN
  v_type := CASE WHEN p_listing_type IN ('auction', 'arremate') THEN p_listing_type ELSE 'auction' END;
  v_fulfillment := CASE WHEN p_fulfillment_type IN ('pickup', 'delivery', 'both') THEN p_fulfillment_type ELSE 'pickup' END;
  v_starts_at := COALESCE(p_starts_at, now());
  v_ends_at   := COALESCE(p_ends_at, v_starts_at + (p_duration_hours || ' hours')::interval);

  INSERT INTO public.auction_listings (
    store_id, owner_user_id, product_id, title, description, product_image_url,
    starting_bid, current_bid, buy_now_price, reserve_price,
    minimum_increment, city, neighborhood, state,
    starts_at, ends_at, status, listing_type, fulfillment_type
  ) VALUES (
    p_store_id, auth.uid(), p_product_id, p_title, p_description, p_product_image_url,
    p_starting_bid, p_starting_bid, p_buy_now_price, p_reserve_price,
    p_minimum_increment, p_city, p_neighborhood, p_state,
    v_starts_at, v_ends_at, 'active', v_type, v_fulfillment
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'listing_id', v_id,
    'starts_at', v_starts_at,
    'ends_at', v_ends_at,
    'listing_type', v_type,
    'fulfillment_type', v_fulfillment
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_auction_listing TO authenticated;

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND table_name='auction_listings' AND column_name='fulfillment_type') AS coluna_ok,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_auction_listing') AS overloads_restantes;
