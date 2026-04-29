-- Script para atualizar a função RPC de desbloqueio de lead (Contact Intention)
-- e aceitar o valor variável (neste caso, 9 créditos).

DROP FUNCTION IF EXISTS public.unlock_contact_intention(uuid);
DROP FUNCTION IF EXISTS public.unlock_contact_intention(uuid, integer);

CREATE OR REPLACE FUNCTION public.unlock_contact_intention(
  p_intention_id uuid,
  p_amount integer DEFAULT 9
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intention           record;
  v_advertiser_account  record;
  v_current_balance     integer;
  v_new_balance         integer;
BEGIN
  -- ── Verificar autenticação ────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  -- ── Buscar intenção ───────────────────────────────────────────────────────
  SELECT * INTO v_intention
  FROM public.advertiser_contact_intentions
  WHERE id = p_intention_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'intention_not_found');
  END IF;

  -- Garantir que o caller é o dono
  IF v_intention.advertiser_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- ── IDEMPOTÊNCIA — já desbloqueado ────────────────────────────────────────
  IF v_intention.status = 'unlocked' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_unlocked', true,
      'intention_id', p_intention_id
    );
  END IF;

  IF v_intention.status NOT IN ('pending_unlock') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status:' || v_intention.status);
  END IF;

  -- ── Buscar conta de anunciante ────────────────────────────────────────────
  SELECT id INTO v_advertiser_account
  FROM public.advertiser_accounts
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'advertiser_account_not_found');
  END IF;

  -- ── Verificar saldo ───────────────────────────────────────────────────────
  SELECT available_credits INTO v_current_balance
  FROM public.advertiser_credit_balances
  WHERE advertiser_account_id = v_advertiser_account.id;

  v_current_balance := COALESCE(v_current_balance, 0);

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'buy_credits_cta', true,
      'required', p_amount,
      'available', v_current_balance
    );
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- ── Débito no saldo (ATÔMICO) ─────────────────────────────────────────────
  UPDATE public.advertiser_credit_balances
  SET
    available_credits = v_new_balance,
    consumed_credits  = COALESCE(consumed_credits, 0) + p_amount,
    updated_at        = now()
  WHERE advertiser_account_id = v_advertiser_account.id;

  -- ── Registrar no ledger (append-only) ────────────────────────────────────
  INSERT INTO public.advertiser_credit_ledger (
    advertiser_account_id,
    entry_type,
    amount,
    balance_before,
    balance_after,
    reason_code,
    description
  ) VALUES (
    v_advertiser_account.id,
    'contact_unlock',
    p_amount,
    v_current_balance,
    v_new_balance,
    'contact_intention_unlock',
    'Desbloqueio de Contato: ' || COALESCE(v_intention.visitor_name, 'Anônimo')
  );

  -- ── Atualizar Intenção ────────────────────────────────────────────────────
  UPDATE public.advertiser_contact_intentions
  SET
    status = 'unlocked',
    unlock_paid_at = now()
  WHERE id = p_intention_id;

  RETURN jsonb_build_object(
    'success', true,
    'credits_charged', p_amount
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Permitir que qualquer pessoa (autenticada ou anônima) chame o RPC
GRANT EXECUTE ON FUNCTION public.unlock_contact_intention TO anon, authenticated;
