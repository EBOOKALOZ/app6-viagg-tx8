ALTER TABLE "public"."advertiser_listings"
ADD COLUMN IF NOT EXISTS "is_digital" BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS "download_url" TEXT;
