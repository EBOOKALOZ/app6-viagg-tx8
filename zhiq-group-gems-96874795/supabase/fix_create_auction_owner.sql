-- =====================================================
-- FIX: create_auction_listing — salvar owner_user_id
-- Problema: o RPC antigo não salvava owner_user_id,
-- impossibilitando a query do dashboard por usuário.
-- =====================================================

-- 1. Adicionar coluna owner_user_id se não existir
ALTER TABLE public.auction_listings
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_auction_listings_owner_user_id
  ON public.auction_listings(owner_user_id);

-- 2. Backfill: preencher owner_user_id via store_id
UPDATE public.auction_listings al
SET owner_user_id = ms.user_id
FROM public.merchant_stores ms
WHERE al.store_id = ms.id
  AND al.owner_user_id IS NULL;

-- 3. Atualizar o RPC para salvar owner_user_id = auth.uid()
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
  p_ends_at timestamptz DEFAULT NULL
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
BEGIN
  v_type := CASE WHEN p_listing_type IN ('auction', 'arremate') THEN p_listing_type ELSE 'auction' END;
  v_starts_at := COALESCE(p_starts_at, now());
  v_ends_at   := COALESCE(p_ends_at, v_starts_at + (p_duration_hours || ' hours')::interval);

  INSERT INTO public.auction_listings (
    store_id, owner_user_id, product_id, title, description, product_image_url,
    starting_bid, current_bid, buy_now_price, reserve_price,
    minimum_increment, city, neighborhood, state,
    starts_at, ends_at, status, listing_type
  ) VALUES (
    p_store_id, auth.uid(), p_product_id, p_title, p_description, p_product_image_url,
    p_starting_bid, p_starting_bid, p_buy_now_price, p_reserve_price,
    p_minimum_increment, p_city, p_neighborhood, p_state,
    v_starts_at, v_ends_at, 'active', v_type
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'listing_id', v_id,
    'starts_at', v_starts_at,
    'ends_at', v_ends_at,
    'listing_type', v_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_auction_listing TO authenticated;
