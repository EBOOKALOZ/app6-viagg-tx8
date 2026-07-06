-- ============================================================
-- LOTE B — passo 1/3 (Fase 3.3-fix) — RPC de débito server-side
-- Corrige V2: hoje o débito do lojista é UPDATE client-side direto
-- em merchant_credit_balances (useMerchantCredits.ts:450-464) — sem
-- lock, sem atomicidade, manipulável no navegador.
--
-- Esta RPC replica EXATAMENTE a lógica atual (mesmas colunas), mas:
--   · valida ownership da loja (auth.uid())
--   · trava a linha de saldo com FOR UPDATE (sem corrida)
--   · debita saldo + grava ledger na MESMA transação
--
-- ADITIVO E SEGURO: só cria a função; não altera RLS nem remove nada.
-- Pode ser aplicado a qualquer momento sem quebrar o fluxo atual.
-- O passo 2 (trocar o hook para chamar esta RPC) e o passo 3 (lockdown
-- de RLS) vêm depois.
--
-- ⚠️ NÃO APLICAR AUTOMATICAMENTE. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.merchant_debit_credits(
  p_store_id uuid,
  p_amount int,
  p_reason_code text,
  p_description text DEFAULT NULL,
  p_purchase_intention_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_before   int;
  v_consumed int;
  v_after    int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Ownership: a loja tem de pertencer ao chamador
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_stores
    WHERE id = p_store_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Trava a linha de saldo (garante atomicidade contra corrida)
  SELECT available_credits, consumed_credits
    INTO v_before, v_consumed
  FROM public.merchant_credit_balances
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_balance');
  END IF;

  IF v_before < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_credits',
                              'available', v_before, 'needed', p_amount);
  END IF;

  v_after := v_before - p_amount;

  UPDATE public.merchant_credit_balances
     SET available_credits = v_after,
         consumed_credits  = COALESCE(v_consumed, 0) + p_amount,
         updated_at        = now()
   WHERE store_id = p_store_id;

  INSERT INTO public.merchant_credit_ledger (
    store_id, purchase_intention_id, entry_type, amount,
    balance_before, balance_after, reason_code, description, metadata
  ) VALUES (
    p_store_id, p_purchase_intention_id, 'debit', p_amount,
    v_before, v_after, p_reason_code, p_description, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true, 'balance_after', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_debit_credits(uuid, int, text, text, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merchant_debit_credits(uuid, int, text, text, uuid, jsonb) TO authenticated, service_role;
