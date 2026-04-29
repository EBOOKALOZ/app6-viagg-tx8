-- ============================================
-- DISCOUNT REQUEST SYSTEM
-- Migration: 20260312_discount_requests
-- ============================================

-- Consumer discount proposals to stores
CREATE TABLE IF NOT EXISTS discount_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL,
    store_id UUID,
    product_price TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    requested_price NUMERIC NOT NULL,
    message TEXT,
    customer_ip TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'countered', 'rejected', 'expired')),
    store_response TEXT,
    counter_price NUMERIC,
    responded_at TIMESTAMPTZ,
    city TEXT,
    neighborhood TEXT,
    source TEXT DEFAULT 'marketplace',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column adds
ALTER TABLE discount_requests ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE discount_requests ADD COLUMN IF NOT EXISTS customer_ip TEXT;
ALTER TABLE discount_requests ADD COLUMN IF NOT EXISTS counter_price NUMERIC;
ALTER TABLE discount_requests ADD COLUMN IF NOT EXISTS store_response TEXT;
ALTER TABLE discount_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dr_product_id ON discount_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_dr_store_id ON discount_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_dr_status ON discount_requests(status);
CREATE INDEX IF NOT EXISTS idx_dr_created_at ON discount_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dr_customer_phone ON discount_requests(customer_phone);

-- RLS
ALTER TABLE discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_insert_discount_requests" ON discount_requests;
CREATE POLICY "allow_insert_discount_requests" ON discount_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow_read_discount_requests" ON discount_requests;
CREATE POLICY "allow_read_discount_requests" ON discount_requests FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "allow_update_discount_requests" ON discount_requests;
CREATE POLICY "allow_update_discount_requests" ON discount_requests FOR UPDATE USING (auth.uid() IS NOT NULL);
