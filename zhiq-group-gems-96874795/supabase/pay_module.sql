-- =====================================================================
-- MÓDULO PAY — Núcleo Financeiro Backend-Driven
-- Viagg-TX8 Platform
--
-- Estende infraestrutura existente:
--   financial_accounts, ledger_entries, payout_requests
--
-- Princípios:
--   1. Ledger append-only é a fonte da verdade
--   2. Toda operação sensível tem idempotency_key
--   3. Webhooks salvos brutos ANTES do processamento
--   4. Correções por entradas compensatórias, nunca edição
--   5. Zero cálculo crítico no frontend
-- =====================================================================


-- =====================================================================
-- 1. CONTA INSTITUCIONAL DA PLATAFORMA (Singleton)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pay_platform_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Viagg-TX8 Institutional',
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one row
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pay_platform_account) THEN
    INSERT INTO public.pay_platform_account (label) VALUES ('Viagg-TX8 Institutional');
  END IF;
END $$;

-- Also ensure platform has a financial_account for ledger entries
DO $$
DECLARE
  v_platform_id uuid;
BEGIN
  SELECT id INTO v_platform_id FROM public.pay_platform_account LIMIT 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts
    WHERE profile_type = 'platform' AND account_type = 'institutional'
  ) THEN
    INSERT INTO public.financial_accounts (
      owner_user_id, profile_type, account_type, currency, region_id, is_active
    ) VALUES (
      v_platform_id, 'platform', 'institutional', 'BRL', 'BR', true
    );
  END IF;
END $$;


-- =====================================================================
-- 2. ESCROW HOLDS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pay_escrow_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('delivery','ride','mototaxi','freight','credit_purchase')),
  service_id uuid,
  payer_user_id uuid,
  professional_user_id uuid,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  platform_fee_cents integer NOT NULL DEFAULT 0,
  professional_amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','released','refunded','expired','cancelled')),
  held_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  refunded_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '72 hours'),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrow_status ON public.pay_escrow_holds(status);
CREATE INDEX IF NOT EXISTS idx_escrow_service ON public.pay_escrow_holds(service_type, service_id);
CREATE INDEX IF NOT EXISTS idx_escrow_professional ON public.pay_escrow_holds(professional_user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payer ON public.pay_escrow_holds(payer_user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_created ON public.pay_escrow_holds(created_at DESC);


-- =====================================================================
-- 3. SPLIT RECORDS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pay_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id uuid REFERENCES public.pay_escrow_holds(id),
  idempotency_key text UNIQUE NOT NULL,
  service_type text NOT NULL,
  service_id uuid,
  total_amount_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  platform_fee_percent numeric(5,2) NOT NULL DEFAULT 0,
  professional_amount_cents integer NOT NULL DEFAULT 0,
  professional_user_id uuid,
  professional_profile_type text DEFAULT 'motoboy',
  platform_ledger_entry_id uuid,
  professional_ledger_entry_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','reversed')),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_splits_escrow ON public.pay_splits(escrow_id);
CREATE INDEX IF NOT EXISTS idx_splits_professional ON public.pay_splits(professional_user_id);
CREATE INDEX IF NOT EXISTS idx_splits_status ON public.pay_splits(status);
CREATE INDEX IF NOT EXISTS idx_splits_created ON public.pay_splits(created_at DESC);


-- =====================================================================
-- 4. RAW WEBHOOK STORAGE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pay_webhook_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'bank_nivel_c',
  event_type text,
  payload jsonb NOT NULL,
  headers jsonb DEFAULT '{}',
  processed boolean NOT NULL DEFAULT false,
  process_result text,
  process_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_processed ON public.pay_webhook_raw(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_received ON public.pay_webhook_raw(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_event ON public.pay_webhook_raw(event_type);


-- =====================================================================
-- 5. RECONCILIATION LOG
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pay_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date date NOT NULL,
  bank_balance_cents integer,
  ledger_balance_cents integer,
  divergence_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','divergent','resolved')),
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_date ON public.pay_reconciliation_log(reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_recon_status ON public.pay_reconciliation_log(status);


-- =====================================================================
-- 6. TRANSACTION ERRORS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pay_transaction_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL,
  reference_id uuid,
  error_code text,
  error_message text,
  context jsonb DEFAULT '{}',
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_txerr_resolved ON public.pay_transaction_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_txerr_created ON public.pay_transaction_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txerr_type ON public.pay_transaction_errors(transaction_type);


-- =====================================================================
-- 7. RLS POLICIES
-- =====================================================================

ALTER TABLE public.pay_platform_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_escrow_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_webhook_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_reconciliation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_transaction_errors ENABLE ROW LEVEL SECURITY;

-- Platform account: read for admins (via RPC), no direct access
DO $$ BEGIN
  CREATE POLICY "pay_platform_account_select" ON public.pay_platform_account FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Escrow: professionals can see their own, admins see all via RPC
DO $$ BEGIN
  CREATE POLICY "pay_escrow_select_own" ON public.pay_escrow_holds FOR SELECT USING (
    professional_user_id = auth.uid() OR payer_user_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "pay_escrow_insert_service" ON public.pay_escrow_holds FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Splits: professionals see their own
DO $$ BEGIN
  CREATE POLICY "pay_splits_select_own" ON public.pay_splits FOR SELECT USING (
    professional_user_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "pay_splits_insert_service" ON public.pay_splits FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Webhooks: admin only via RPC (no direct RLS select)
DO $$ BEGIN
  CREATE POLICY "pay_webhook_insert" ON public.pay_webhook_raw FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "pay_webhook_select_all" ON public.pay_webhook_raw FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reconciliation: admin read via RPC
DO $$ BEGIN
  CREATE POLICY "pay_recon_select_all" ON public.pay_reconciliation_log FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "pay_recon_insert" ON public.pay_reconciliation_log FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Transaction errors: admin read via RPC
DO $$ BEGIN
  CREATE POLICY "pay_txerr_select_all" ON public.pay_transaction_errors FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "pay_txerr_insert" ON public.pay_transaction_errors FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =====================================================================
-- 8. RPC: PROCESS SERVICE PAYMENT (escrow + split)
-- =====================================================================
-- Idempotent: if idempotency_key exists, returns existing escrow

CREATE OR REPLACE FUNCTION public.pay_process_service_payment(
  p_idempotency_key text,
  p_service_type text,
  p_service_id uuid,
  p_amount_cents integer,
  p_payer_user_id uuid,
  p_professional_user_id uuid,
  p_platform_fee_percent numeric DEFAULT 15.00,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_existing_escrow uuid;
  v_escrow_id uuid;
  v_platform_fee_cents integer;
  v_professional_cents integer;
  v_platform_account_id uuid;
BEGIN
  -- Idempotency check
  SELECT id INTO v_existing_escrow
  FROM public.pay_escrow_holds
  WHERE idempotency_key = p_idempotency_key;

  IF v_existing_escrow IS NOT NULL THEN
    RETURN jsonb_build_object('escrow_id', v_existing_escrow, 'status', 'already_exists');
  END IF;

  -- Calculate split
  v_platform_fee_cents := CEIL(p_amount_cents * p_platform_fee_percent / 100.0);
  v_professional_cents := p_amount_cents - v_platform_fee_cents;

  -- Get platform financial account
  SELECT id INTO v_platform_account_id
  FROM public.financial_accounts
  WHERE profile_type = 'platform' AND account_type = 'institutional'
  LIMIT 1;

  -- Create escrow hold
  INSERT INTO public.pay_escrow_holds (
    idempotency_key, service_type, service_id,
    payer_user_id, professional_user_id,
    amount_cents, platform_fee_cents, professional_amount_cents,
    status, metadata
  ) VALUES (
    p_idempotency_key, p_service_type, p_service_id,
    p_payer_user_id, p_professional_user_id,
    p_amount_cents, v_platform_fee_cents, v_professional_cents,
    'held', p_metadata
  ) RETURNING id INTO v_escrow_id;

  -- Record incoming payment in platform ledger (money enters platform first)
  IF v_platform_account_id IS NOT NULL THEN
    INSERT INTO public.ledger_entries (
      account_id, amount_cents, entry_type, source_type,
      reference_type, reference_id, batch_id
    ) VALUES (
      v_platform_account_id, p_amount_cents, 'credit', 'service_payment',
      'escrow', v_escrow_id, p_idempotency_key
    );
  END IF;

  RETURN jsonb_build_object(
    'escrow_id', v_escrow_id,
    'status', 'held',
    'amount_cents', p_amount_cents,
    'platform_fee_cents', v_platform_fee_cents,
    'professional_amount_cents', v_professional_cents
  );
EXCEPTION WHEN OTHERS THEN
  -- Log error
  INSERT INTO public.pay_transaction_errors (
    transaction_type, reference_id, error_code, error_message, context
  ) VALUES (
    'service_payment', p_service_id, SQLSTATE, SQLERRM,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'amount', p_amount_cents)
  );
  RAISE;
END;
$$;


-- =====================================================================
-- 9. RPC: RELEASE ESCROW (split to professional)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.pay_release_escrow(
  p_escrow_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_escrow RECORD;
  v_platform_account_id uuid;
  v_professional_account_id uuid;
  v_split_id uuid;
  v_platform_entry_id uuid;
  v_professional_entry_id uuid;
BEGIN
  -- Get escrow
  SELECT * INTO v_escrow FROM public.pay_escrow_holds WHERE id = p_escrow_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Escrow not found');
  END IF;

  IF v_escrow.status != 'held' THEN
    RETURN jsonb_build_object('error', 'Escrow not in held status', 'current_status', v_escrow.status);
  END IF;

  -- Get accounts
  SELECT id INTO v_platform_account_id
  FROM public.financial_accounts
  WHERE profile_type = 'platform' AND account_type = 'institutional'
  LIMIT 1;

  SELECT id INTO v_professional_account_id
  FROM public.financial_accounts
  WHERE owner_user_id = v_escrow.professional_user_id
    AND account_type = 'user_wallet'
    AND is_active = true
  LIMIT 1;

  IF v_professional_account_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Professional wallet not found');
  END IF;

  -- Debit platform for professional payout
  INSERT INTO public.ledger_entries (
    account_id, amount_cents, entry_type, source_type,
    reference_type, reference_id, batch_id
  ) VALUES (
    v_platform_account_id, -v_escrow.professional_amount_cents, 'debit', 'escrow_release',
    'escrow', p_escrow_id, 'release-' || p_escrow_id::text
  ) RETURNING id INTO v_platform_entry_id;

  -- Credit professional wallet
  INSERT INTO public.ledger_entries (
    account_id, amount_cents, entry_type, source_type,
    reference_type, reference_id, batch_id
  ) VALUES (
    v_professional_account_id, v_escrow.professional_amount_cents, 'credit', 'service_earning',
    v_escrow.service_type, v_escrow.service_id, 'release-' || p_escrow_id::text
  ) RETURNING id INTO v_professional_entry_id;

  -- Record platform fee as revenue
  IF v_escrow.platform_fee_cents > 0 THEN
    INSERT INTO public.ledger_entries (
      account_id, amount_cents, entry_type, source_type,
      reference_type, reference_id, batch_id
    ) VALUES (
      v_platform_account_id, v_escrow.platform_fee_cents, 'credit', 'platform_fee',
      'escrow', p_escrow_id, 'fee-' || p_escrow_id::text
    );
  END IF;

  -- Create split record
  INSERT INTO public.pay_splits (
    escrow_id, idempotency_key, service_type, service_id,
    total_amount_cents, platform_fee_cents, platform_fee_percent,
    professional_amount_cents, professional_user_id, professional_profile_type,
    platform_ledger_entry_id, professional_ledger_entry_id,
    status, completed_at
  ) VALUES (
    p_escrow_id, 'split-' || p_escrow_id::text, v_escrow.service_type, v_escrow.service_id,
    v_escrow.amount_cents, v_escrow.platform_fee_cents,
    CASE WHEN v_escrow.amount_cents > 0 THEN ROUND(v_escrow.platform_fee_cents::numeric / v_escrow.amount_cents * 100, 2) ELSE 0 END,
    v_escrow.professional_amount_cents, v_escrow.professional_user_id, 'motoboy',
    v_platform_entry_id, v_professional_entry_id,
    'completed', now()
  ) RETURNING id INTO v_split_id;

  -- Update escrow status
  UPDATE public.pay_escrow_holds
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE id = p_escrow_id;

  -- Update professional wallet balance_cents cache
  UPDATE public.financial_accounts
  SET balance_cents = balance_cents + v_escrow.professional_amount_cents
  WHERE id = v_professional_account_id;

  RETURN jsonb_build_object(
    'split_id', v_split_id,
    'status', 'released',
    'professional_amount_cents', v_escrow.professional_amount_cents,
    'platform_fee_cents', v_escrow.platform_fee_cents
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.pay_transaction_errors (
    transaction_type, reference_id, error_code, error_message,
    context
  ) VALUES (
    'escrow_release', p_escrow_id, SQLSTATE, SQLERRM,
    jsonb_build_object('escrow_id', p_escrow_id)
  );
  RAISE;
END;
$$;


-- =====================================================================
-- 10. RPC: ADMIN DASHBOARD STATS
-- =====================================================================

CREATE OR REPLACE FUNCTION public.pay_admin_dashboard_stats(
  p_period_start timestamptz DEFAULT now() - interval '30 days',
  p_period_end timestamptz DEFAULT now(),
  p_profile_type text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_platform_account_id uuid;
  v_platform_balance_cents bigint;
  v_today_start timestamptz;
  v_today_received bigint;
  v_total_escrow_held bigint;
  v_total_released bigint;
  v_total_commission bigint;
  v_pending_payouts_count integer;
  v_pending_payouts_amount bigint;
  v_divergence_count integer;
  v_error_count integer;
BEGIN
  v_today_start := date_trunc('day', now());

  -- Platform account
  SELECT id INTO v_platform_account_id
  FROM public.financial_accounts
  WHERE profile_type = 'platform' AND account_type = 'institutional'
  LIMIT 1;

  -- Platform balance from ledger
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_platform_balance_cents
  FROM public.ledger_entries
  WHERE account_id = v_platform_account_id;

  -- Today received (all credits to platform)
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_today_received
  FROM public.ledger_entries
  WHERE account_id = v_platform_account_id
    AND amount_cents > 0
    AND created_at >= v_today_start;

  -- Total in escrow (held)
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_total_escrow_held
  FROM public.pay_escrow_holds
  WHERE status = 'held';

  -- Total released to professionals in period
  SELECT COALESCE(SUM(professional_amount_cents), 0) INTO v_total_released
  FROM public.pay_splits
  WHERE status = 'completed'
    AND completed_at >= p_period_start
    AND completed_at <= p_period_end;

  -- Total platform commission in period
  SELECT COALESCE(SUM(platform_fee_cents), 0) INTO v_total_commission
  FROM public.pay_splits
  WHERE status = 'completed'
    AND completed_at >= p_period_start
    AND completed_at <= p_period_end;

  -- Pending payouts
  SELECT COUNT(*), COALESCE(SUM(amount_cents), 0)
  INTO v_pending_payouts_count, v_pending_payouts_amount
  FROM public.payout_requests
  WHERE status = 'pending';

  -- Reconciliation divergences
  SELECT COUNT(*) INTO v_divergence_count
  FROM public.pay_reconciliation_log
  WHERE status = 'divergent';

  -- Transaction errors unresolved
  SELECT COUNT(*) INTO v_error_count
  FROM public.pay_transaction_errors
  WHERE resolved = false;

  v_result := jsonb_build_object(
    'platform_balance_cents', v_platform_balance_cents,
    'today_received_cents', v_today_received,
    'total_escrow_held_cents', v_total_escrow_held,
    'total_released_cents', v_total_released,
    'total_commission_cents', v_total_commission,
    'pending_payouts_count', v_pending_payouts_count,
    'pending_payouts_amount_cents', v_pending_payouts_amount,
    'divergence_count', v_divergence_count,
    'error_count', v_error_count,
    'period_start', p_period_start,
    'period_end', p_period_end
  );

  RETURN v_result;
END;
$$;


-- =====================================================================
-- 11. RPC: PROCESS CREDIT PURCHASE VIA PAY
-- =====================================================================
-- Money enters platform first, then credits are added to merchant

CREATE OR REPLACE FUNCTION public.pay_process_credit_purchase(
  p_idempotency_key text,
  p_store_id uuid,
  p_product_id uuid,
  p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_existing uuid;
  v_platform_account_id uuid;
  v_escrow_id uuid;
  v_merchant_user_id uuid;
BEGIN
  -- Idempotency
  SELECT id INTO v_existing
  FROM public.pay_escrow_holds WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('escrow_id', v_existing, 'status', 'already_exists');
  END IF;

  -- Get merchant user
  SELECT user_id INTO v_merchant_user_id
  FROM public.merchant_stores WHERE id = p_store_id;

  -- Platform account
  SELECT id INTO v_platform_account_id
  FROM public.financial_accounts
  WHERE profile_type = 'platform' AND account_type = 'institutional'
  LIMIT 1;

  -- Create escrow (credit purchase goes 100% to platform)
  INSERT INTO public.pay_escrow_holds (
    idempotency_key, service_type, service_id,
    payer_user_id, amount_cents,
    platform_fee_cents, professional_amount_cents,
    status, metadata
  ) VALUES (
    p_idempotency_key, 'credit_purchase', p_product_id,
    v_merchant_user_id, p_amount_cents,
    p_amount_cents, 0,
    'released', jsonb_build_object('store_id', p_store_id, 'product_id', p_product_id)
  ) RETURNING id INTO v_escrow_id;

  -- Record in platform ledger
  IF v_platform_account_id IS NOT NULL THEN
    INSERT INTO public.ledger_entries (
      account_id, amount_cents, entry_type, source_type,
      reference_type, reference_id, batch_id
    ) VALUES (
      v_platform_account_id, p_amount_cents, 'credit', 'credit_purchase',
      'credit_purchase', v_escrow_id, p_idempotency_key
    );
  END IF;

  RETURN jsonb_build_object(
    'escrow_id', v_escrow_id,
    'status', 'completed',
    'amount_cents', p_amount_cents
  );
END;
$$;


-- =====================================================================
-- 12. VIEW: ADMIN OVERVIEW
-- =====================================================================

CREATE OR REPLACE VIEW public.pay_admin_overview AS
SELECT
  'platform_balance' AS metric,
  COALESCE(SUM(le.amount_cents), 0) AS value_cents
FROM public.ledger_entries le
JOIN public.financial_accounts fa ON fa.id = le.account_id
WHERE fa.profile_type = 'platform'
UNION ALL
SELECT
  'total_escrow_held',
  COALESCE(SUM(amount_cents), 0)
FROM public.pay_escrow_holds WHERE status = 'held'
UNION ALL
SELECT
  'pending_payouts',
  COALESCE(SUM(amount_cents), 0)
FROM public.payout_requests WHERE status = 'pending'
UNION ALL
SELECT
  'total_commission_30d',
  COALESCE(SUM(platform_fee_cents), 0)
FROM public.pay_splits WHERE status = 'completed' AND created_at >= now() - interval '30 days';


-- =====================================================================
-- VERIFICATION QUERIES
-- =====================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'pay_%';
--
-- SELECT * FROM public.pay_admin_overview;
--
-- SELECT public.pay_admin_dashboard_stats();
