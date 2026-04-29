-- ─────────────────────────────────────────────────────────────────
-- promoted_listing_slots
-- Stores which listings each advertiser has promoted.
-- Denormalized display fields so the motoboy card only needs
-- one query instead of three cross-table joins.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promoted_listing_slots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_type  text        NOT NULL CHECK (listing_type IN ('produto', 'imovel', 'veiculo')),
  listing_id    text        NOT NULL,
  listing_title text,
  listing_price numeric,
  listing_image text,   -- fully-resolved public URL stored at save time
  listing_city  text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

ALTER TABLE promoted_listing_slots ENABLE ROW LEVEL SECURITY;

-- Motoboys and public pages can read all promoted slots
CREATE POLICY "promoted_slots_select_all"
  ON promoted_listing_slots FOR SELECT USING (true);

-- Each advertiser manages only their own slots
CREATE POLICY "promoted_slots_manage_own"
  ON promoted_listing_slots FOR ALL USING (auth.uid() = user_id);
