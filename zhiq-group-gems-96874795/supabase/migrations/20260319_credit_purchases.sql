-- ═══════════════════════════════════════════════════════════════
-- CREDIT PURCHASES — Tabela oficial de compras de créditos
-- Viagg-TX8 Platform
--
-- Se a tabela já existir, apenas adiciona colunas faltantes.
-- Se não existir, cria do zero com schema completo.
-- ═══════════════════════════════════════════════════════════════

-- 1. Criar tabela se não existir
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  product_name text,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  credits_granted integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  provider_name text,
  provider_payment_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Garantir que todas as colunas necessárias existem
--    (idempotente — ADD COLUMN IF NOT EXISTS)
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) DEFAULT 0;
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS credits_granted integer DEFAULT 0;
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS provider_name text;
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE public.credit_purchases ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_cp_store ON public.credit_purchases(store_id);
CREATE INDEX IF NOT EXISTS idx_cp_status ON public.credit_purchases(status);
CREATE INDEX IF NOT EXISTS idx_cp_created ON public.credit_purchases(created_at DESC);

-- 4. RLS
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cp_select_all" ON public.credit_purchases FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "cp_insert_all" ON public.credit_purchases FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "cp_update_all" ON public.credit_purchases FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- RPC: confirm_credit_purchase
-- Admin confirma pagamento → muda status para 'paid' → libera créditos
--
-- SEGURANÇA:
--   - Só status 'pending' ou 'awaiting_payment' pode ser confirmado
--   - Se já 'paid', retorna erro (idempotência)
--   - Créditos liberados SOMENTE aqui, nunca no frontend
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.confirm_credit_purchase(uuid);

CREATE OR REPLACE FUNCTION public.confirm_credit_purchase(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase record;
  v_current_balance integer;
  v_new_balance integer;
  v_product_type text;
BEGIN
  -- 1. Buscar compra
  SELECT * INTO v_purchase FROM public.credit_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Compra não encontrada');
  END IF;

  -- 2. Validar status — IDEMPOTÊNCIA
  IF v_purchase.status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Compra já foi paga');
  END IF;
  IF v_purchase.status NOT IN ('pending', 'awaiting_payment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status inválido: ' || v_purchase.status);
  END IF;

  -- 3. Marcar como pago
  UPDATE public.credit_purchases
  SET status = 'paid'
  WHERE id = p_purchase_id;

  -- 4. Buscar saldo atual
  SELECT available_credits INTO v_current_balance
  FROM public.merchant_credit_balances
  WHERE store_id = v_purchase.store_id;

  IF NOT FOUND THEN
    v_current_balance := 0;
    INSERT INTO public.merchant_credit_balances (store_id, available_credits, reserved_credits, consumed_credits)
    VALUES (v_purchase.store_id, 0, 0, 0);
  END IF;

  v_new_balance := v_current_balance + v_purchase.credits_granted;

  -- 5. Atualizar saldo
  UPDATE public.merchant_credit_balances
  SET available_credits = v_new_balance, updated_at = now()
  WHERE store_id = v_purchase.store_id;

  -- 6. Registrar no ledger
  v_product_type := COALESCE(v_purchase.metadata->>'product_type', 'pacote');

  INSERT INTO public.merchant_credit_ledger (
    store_id, entry_type, amount, balance_before, balance_after,
    reason_code, description, metadata
  ) VALUES (
    v_purchase.store_id,
    'credit',
    v_purchase.credits_granted,
    v_current_balance,
    v_new_balance,
    CASE WHEN v_product_type IN ('mensal','semestral','anual')
         THEN 'subscription_activation' ELSE 'package_purchase' END,
    'Pagamento confirmado: ' || COALESCE(v_purchase.product_name, 'Produto') ||
    ' (' || v_purchase.credits_granted || ' créditos)',
    jsonb_build_object(
      'purchase_id', p_purchase_id,
      'provider_name', v_purchase.provider_name,
      'amount_paid', v_purchase.amount_paid
    )
  );

  -- 7. Se assinatura, criar/renovar subscription
  IF v_product_type IN ('mensal','semestral','anual') THEN
    UPDATE public.merchant_credit_subscriptions
    SET status = 'cancelled', cancelled_at = now()
    WHERE store_id = v_purchase.store_id AND status = 'active';

    INSERT INTO public.merchant_credit_subscriptions (
      store_id, product_id, status, current_period_end, next_renewal_at
    ) VALUES (
      v_purchase.store_id,
      COALESCE((v_purchase.metadata->>'product_id')::uuid, gen_random_uuid()),
      'active',
      now() + CASE v_product_type
        WHEN 'anual' THEN interval '12 months'
        WHEN 'semestral' THEN interval '6 months'
        ELSE interval '1 month'
      END,
      now() + CASE v_product_type
        WHEN 'anual' THEN interval '12 months'
        WHEN 'semestral' THEN interval '6 months'
        ELSE interval '1 month'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'credits_added', v_purchase.credits_granted,
    'new_balance', v_new_balance,
    'purchase_id', p_purchase_id
  );
END;
$$;

-- ═══ VERIFICAÇÃO ═══
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'credit_purchases' ORDER BY ordinal_position;
