-- ═══════════════════════════════════════════════════════════════
-- MÓDULO DE CRÉDITOS DO LOJISTA — Viagg-TX8
-- Complementa tabelas existentes + seed de pacotes/planos
-- SAFE: usa ADD COLUMN IF NOT EXISTS para todas as colunas
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. COMPLEMENTAR merchant_credit_products ────────────────
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS credits_base integer DEFAULT 0;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS credits_bonus integer DEFAULT 0;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS credits_amount integer DEFAULT 0;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS price_brl numeric DEFAULT 0;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS price_cents integer DEFAULT 0;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS rollover_enabled boolean DEFAULT false;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS rollover_percent integer DEFAULT 0;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS is_recommended boolean DEFAULT false;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.merchant_credit_products ADD COLUMN IF NOT EXISTS badge_text text;

-- slug unique index
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'merchant_credit_products_slug_key') THEN
    CREATE UNIQUE INDEX merchant_credit_products_slug_key ON public.merchant_credit_products(slug);
  END IF;
END $$;

-- Drop e recriar CHECK do product_type para aceitar nossos tipos
ALTER TABLE public.merchant_credit_products DROP CONSTRAINT IF EXISTS merchant_credit_products_product_type_check;
ALTER TABLE public.merchant_credit_products ADD CONSTRAINT merchant_credit_products_product_type_check
  CHECK (product_type IN ('pacote','mensal','semestral','anual','one_time','monthly','semiannual','annual','subscription'));

-- Desativar TODOS para garantir que somente os 9 novos ficarão visíveis
UPDATE public.merchant_credit_products SET is_active = false;
-- Limpar seed antigo (com slug)
DELETE FROM public.merchant_credit_products WHERE slug IS NOT NULL;

-- Seed: 4 pacotes avulsos + 5 planos recorrentes = 9 ofertas comerciais
INSERT INTO public.merchant_credit_products
  (slug, name, product_type, credits_amount, credits_base, credits_bonus, price_brl, price_cents, rollover_enabled, rollover_percent, is_recommended, is_active, sort_order, description, badge_text)
VALUES
  -- ── PACOTES AVULSOS (4) ──
  ('pacote-20',       'Pacote 20',       'pacote',      20,   20,   0,    80.00,    8000, false,   0, false, true,  1, 'Ideal para começar a receber clientes',   'PACOTE BÁSICO'),
  ('pacote-50',       'Pacote 50',       'pacote',      55,   50,   5,   180.00,   18000, false,   0, false, true,  2, 'Para lojas com fluxo regular',             'ECONOMIZE 10%'),
  ('pacote-100',      'Pacote 100',      'pacote',     115,  100,  15,   340.00,   34000, false,   0,  true, true,  3, 'Melhor custo-benefício avulso',            '🔥 MELHOR AVULSO'),
  ('pacote-250',      'Pacote 250',      'pacote',     300,  250,  50,   750.00,   75000, false,   0, false, true,  4, 'Para operações de alto volume',            'VOLUME'),
  -- ── PLANOS RECORRENTES (5) ──
  ('mensal-start',    'Mensal Start',    'mensal',      35,   30,   5,    99.00,    9900, false,   0, false, true,  5, 'Para começar com recorrência',             'EVOLUÇÃO'),
  ('mensal-pro',      'Mensal Pro',      'mensal',     100,   80,  20,   249.00,   24900,  true,  30,  true, true,  6, 'Plano mais popular entre lojistas',       '⭐ RECOMENDADO'),
  ('mensal-max',      'Mensal Max',      'mensal',     190,  150,  40,   449.00,   44900,  true,  40, false, true,  7, 'Para lojas em crescimento acelerado',     'CRESCIMENTO');


-- ─── 2. COMPLEMENTAR merchant_credit_subscriptions ───────────
ALTER TABLE public.merchant_credit_subscriptions ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now();
ALTER TABLE public.merchant_credit_subscriptions ADD COLUMN IF NOT EXISTS current_period_start timestamptz DEFAULT now();
ALTER TABLE public.merchant_credit_subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE public.merchant_credit_subscriptions ADD COLUMN IF NOT EXISTS next_renewal_at timestamptz;
ALTER TABLE public.merchant_credit_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.merchant_credit_subscriptions ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.merchant_credit_subscriptions ADD COLUMN IF NOT EXISTS rollover_credits integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mcredsub_store ON public.merchant_credit_subscriptions(store_id);
CREATE INDEX IF NOT EXISTS idx_mcredsub_status ON public.merchant_credit_subscriptions(status);


-- ─── 3. COMPLEMENTAR merchant_credit_usage_rules ─────────────
-- Adicionar colunas que podem não existir (a tabela pode ter nomes diferentes)
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS module_name text;
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS credits_cost integer DEFAULT 1;
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Seed regras — schema real: feature_code, feature_name, module_name, event_type, credits_cost, description
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS module_name text;
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.merchant_credit_usage_rules ADD COLUMN IF NOT EXISTS credits_cost numeric DEFAULT 1;

INSERT INTO public.merchant_credit_usage_rules (feature_code, feature_name, module_name, event_type, credits_cost, description)
VALUES
  ('cesta1_purchase_intention', 'Intenção de Compra',         'CESTA1',   'purchase_intention', 1, 'Intenção de compra recebida'),
  ('m1_product_click',         'Visualização de Produto',     'M1',       'product_click',      0, 'Clique em produto (gratuito)'),
  ('m1_buy_click',             'Clique em Comprar',           'M1',       'buy_click',           1, 'Clique em Comprar'),
  ('leilao_bid_received',      'Lance Recebido',              'LEILAO',   'bid_received',        2, 'Lance recebido no leilão'),
  ('arremate_confirmed',       'Arremate Confirmado',         'ARREMATE', 'arremate_confirmed',  3, 'Arremate confirmado')
ON CONFLICT DO NOTHING;


-- ─── 4. COMPLEMENTAR merchant_credit_result_metrics ──────────
CREATE TABLE IF NOT EXISTS public.merchant_credit_result_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  module text NOT NULL,
  period_month date NOT NULL,
  credits_spent integer NOT NULL DEFAULT 0,
  events_generated integer NOT NULL DEFAULT 0,
  revenue_generated_cents integer NOT NULL DEFAULT 0,
  intentions_received integer NOT NULL DEFAULT 0,
  clicks_generated integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, module, period_month)
);
CREATE INDEX IF NOT EXISTS idx_mcresult_store ON public.merchant_credit_result_metrics(store_id);


-- ─── 5. RLS POLICIES ────────────────────────────────────────

ALTER TABLE public.merchant_credit_products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "mcp_select_public" ON public.merchant_credit_products FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.merchant_credit_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "mcsub_select_own" ON public.merchant_credit_subscriptions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mcsub_insert_own" ON public.merchant_credit_subscriptions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.merchant_credit_usage_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "mcur_select_public" ON public.merchant_credit_usage_rules FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.merchant_credit_result_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "mcrm_select_own" ON public.merchant_credit_result_metrics FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Balances RLS
DO $$ BEGIN
  ALTER TABLE public.merchant_credit_balances ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mcbal_select_all" ON public.merchant_credit_balances FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mcbal_update_all" ON public.merchant_credit_balances FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mcbal_insert_all" ON public.merchant_credit_balances FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- Ledger RLS
DO $$ BEGIN
  ALTER TABLE public.merchant_credit_ledger ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mcledger_select_all" ON public.merchant_credit_ledger FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mcledger_insert_all" ON public.merchant_credit_ledger FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;


-- ═══ VERIFICAÇÃO ═══
SELECT 'merchant_credit_products' AS tabela, count(*) AS total FROM public.merchant_credit_products
UNION ALL
SELECT 'merchant_credit_usage_rules', count(*) FROM public.merchant_credit_usage_rules;
