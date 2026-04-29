 -- ─────────────────────────────────────────────────────────────────
-- Migration: Add is_promoted column to all listing tables
-- Applies safe IF NOT EXISTS pattern on all 3 tables
-- ─────────────────────────────────────────────────────────────────

-- 1. advertiser_listings
ALTER TABLE advertiser_listings
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_advertiser_listings_is_promoted
  ON advertiser_listings (is_promoted)
  WHERE is_promoted = true;

-- 2. real_estate_listings
ALTER TABLE real_estate_listings
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_real_estate_listings_is_promoted
  ON real_estate_listings (is_promoted)
  WHERE is_promoted = true;

-- 3. vehicle_listings
ALTER TABLE vehicle_listings
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vehicle_listings_is_promoted
  ON vehicle_listings (is_promoted)
  WHERE is_promoted = true;

DO $$
BEGIN
  RAISE NOTICE 'is_promoted added to advertiser_listings, real_estate_listings and vehicle_listings.';
END $$;
