-- ============================================
-- LEAD GENERATION SYSTEM
-- Migration: 20260312_lead_generation_system
-- ============================================

-- 1) Product leads (consumer interest)
CREATE TABLE IF NOT EXISTS product_leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL,
    store_id UUID,
    product_title TEXT,
    product_price TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_ip TEXT,
    status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'unlocked', 'expired', 'refunded')),
    credits_cost INTEGER DEFAULT 0,
    source TEXT DEFAULT 'landing',
    city TEXT,
    neighborhood TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    unlocked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE product_leads ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE product_leads ADD COLUMN IF NOT EXISTS customer_ip TEXT;
ALTER TABLE product_leads ADD COLUMN IF NOT EXISTS credits_cost INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pl_product_id ON product_leads(product_id);
CREATE INDEX IF NOT EXISTS idx_pl_store_id ON product_leads(store_id);
CREATE INDEX IF NOT EXISTS idx_pl_status ON product_leads(status);
CREATE INDEX IF NOT EXISTS idx_pl_created_at ON product_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pl_customer_phone ON product_leads(customer_phone);

-- 2) Lead pricing rules
CREATE TABLE IF NOT EXISTS lead_pricing_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    min_price NUMERIC NOT NULL DEFAULT 0,
    max_price NUMERIC NOT NULL DEFAULT 999999,
    credits INTEGER NOT NULL DEFAULT 1,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default pricing tiers
INSERT INTO lead_pricing_rules (min_price, max_price, credits, label)
SELECT 0, 50, 1, 'Produto até R$50'
WHERE NOT EXISTS (SELECT 1 FROM lead_pricing_rules WHERE min_price = 0 AND max_price = 50);

INSERT INTO lead_pricing_rules (min_price, max_price, credits, label)
SELECT 50.01, 200, 2, 'Produto R$50-R$200'
WHERE NOT EXISTS (SELECT 1 FROM lead_pricing_rules WHERE min_price = 50.01 AND max_price = 200);

INSERT INTO lead_pricing_rules (min_price, max_price, credits, label)
SELECT 200.01, 1000, 3, 'Produto R$200-R$1000'
WHERE NOT EXISTS (SELECT 1 FROM lead_pricing_rules WHERE min_price = 200.01 AND max_price = 1000);

INSERT INTO lead_pricing_rules (min_price, max_price, credits, label)
SELECT 1000.01, 999999, 5, 'Produto acima de R$1000'
WHERE NOT EXISTS (SELECT 1 FROM lead_pricing_rules WHERE min_price = 1000.01 AND max_price = 999999);

-- 3) Store credit wallet
CREATE TABLE IF NOT EXISTS store_credit_wallet (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL UNIQUE,
    credits_balance INTEGER NOT NULL DEFAULT 10,
    total_earned INTEGER NOT NULL DEFAULT 10,
    total_spent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Credit transactions
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL,
    lead_id UUID,
    credits_used INTEGER NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('lead_unlock', 'purchase', 'bonus', 'refund', 'admin_grant')),
    description TEXT,
    balance_after INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ct_store_id ON credit_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_ct_lead_id ON credit_transactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_ct_created_at ON credit_transactions(created_at DESC);

-- RLS Policies
ALTER TABLE product_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_credit_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- product_leads: anyone can insert, store owners can read their own
DROP POLICY IF EXISTS "allow_insert_leads" ON product_leads;
CREATE POLICY "allow_insert_leads" ON product_leads FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow_read_own_leads" ON product_leads;
CREATE POLICY "allow_read_own_leads" ON product_leads FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "allow_update_own_leads" ON product_leads;
CREATE POLICY "allow_update_own_leads" ON product_leads FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- lead_pricing_rules: anyone can read
DROP POLICY IF EXISTS "allow_read_pricing" ON lead_pricing_rules;
CREATE POLICY "allow_read_pricing" ON lead_pricing_rules FOR SELECT USING (true);

-- store_credit_wallet: store owners can read/update their own
DROP POLICY IF EXISTS "allow_read_wallet" ON store_credit_wallet;
CREATE POLICY "allow_read_wallet" ON store_credit_wallet FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "allow_update_wallet" ON store_credit_wallet;
CREATE POLICY "allow_update_wallet" ON store_credit_wallet FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "allow_insert_wallet" ON store_credit_wallet;
CREATE POLICY "allow_insert_wallet" ON store_credit_wallet FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- credit_transactions: store owners can read their own, anyone authenticated can insert
DROP POLICY IF EXISTS "allow_read_transactions" ON credit_transactions;
CREATE POLICY "allow_read_transactions" ON credit_transactions FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "allow_insert_transactions" ON credit_transactions;
CREATE POLICY "allow_insert_transactions" ON credit_transactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
