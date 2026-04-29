-- Migration: adicionar modalidade de anúncio em vehicle_listings
-- Extensão mínima — reutiliza auction_listings e hooks já existentes

ALTER TABLE public.vehicle_listings
  ADD COLUMN IF NOT EXISTS listing_mode TEXT DEFAULT 'normal'
    CHECK (listing_mode IN ('normal', 'auction', 'arremate')),
  ADD COLUMN IF NOT EXISTS auction_listing_id UUID
    REFERENCES public.auction_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_listings_auction_listing_id
  ON public.vehicle_listings(auction_listing_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_listings_listing_mode
  ON public.vehicle_listings(listing_mode);
