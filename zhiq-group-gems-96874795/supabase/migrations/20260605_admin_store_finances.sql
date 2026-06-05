-- ═══════════════════════════════════════════════════════════════
-- ADMIN — Dados financeiros consolidados por loja
--
-- RLS das tabelas merchant_credit_*, pay_financial_accounts,
-- pay_ledger_entries e merchant_wallet_* só permite leitura ao
-- próprio dono. Para a tela /admin/lojas/:id, precisamos de uma
-- visão consolidada que o admin possa consultar.
--
-- Esta RPC é SECURITY DEFINER, valida admin via:
--   - profiles.is_admin = true, OU
--   - user_roles.role = 'admin'
-- e retorna jsonb com tudo que a tela precisa.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_get_store_finances(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_is_admin      boolean := false;
  v_user_id       uuid;
  v_pay_available numeric := 0;
  v_pay_reserved  numeric := 0;
  v_pay_pending   numeric := 0;
  v_pay_txs       jsonb := '[]'::jsonb;
  v_legacy_saldo  numeric := 0;
  v_legacy_txs    jsonb := '[]'::jsonb;
  v_credit_bal    jsonb := jsonb_build_object('available_credits', 0, 'reserved_credits', 0, 'consumed_credits', 0);
  v_credit_ledger jsonb := '[]'::jsonb;
BEGIN
  -- Auth: precisa ser admin
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  SELECT (COALESCE(p.is_admin, false)
          OR EXISTS (SELECT 1 FROM public.user_roles ur
                     WHERE ur.user_id = v_uid AND ur.role = 'admin'))
    INTO v_is_admin
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT user_id INTO v_user_id FROM public.merchant_stores WHERE id = p_store_id;

  -- ─── Carteira pay_* (R$) ───
  SELECT
    COALESCE(SUM(fa.available_balance), 0),
    COALESCE(SUM(fa.reserved_balance), 0),
    COALESCE(SUM(fa.pending_balance), 0)
  INTO v_pay_available, v_pay_reserved, v_pay_pending
  FROM public.pay_financial_accounts fa
  WHERE fa.owner_type = 'merchant_store'
    AND fa.account_type = 'merchant_wallet'
    AND fa.owner_id = p_store_id;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_pay_txs
  FROM (
    SELECT le.id, le.created_at, le.entry_type::text AS entry_type,
           le.direction::text AS direction, le.amount,
           le.reference_id, le.description, le.metadata
      FROM public.pay_ledger_entries le
      JOIN public.pay_financial_accounts fa ON fa.id = le.account_id
     WHERE fa.owner_type = 'merchant_store'
       AND fa.account_type = 'merchant_wallet'
       AND fa.owner_id = p_store_id
     ORDER BY le.created_at DESC
     LIMIT 50
  ) t;

  -- ─── Legacy merchant_wallets (R$) ───
  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(saldo_atual, 0) INTO v_legacy_saldo
      FROM public.merchant_wallets WHERE merchant_id = v_user_id;

    SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_legacy_txs
    FROM (
      SELECT id, tipo, valor, descricao, referencia_id, created_at
        FROM public.merchant_wallet_transactions
       WHERE user_id = v_user_id
       ORDER BY created_at DESC
       LIMIT 50
    ) t;
  END IF;

  -- ─── Créditos ───
  SELECT jsonb_build_object(
           'available_credits', COALESCE(available_credits, 0),
           'reserved_credits',  COALESCE(reserved_credits, 0),
           'consumed_credits',  COALESCE(consumed_credits, 0)
         )
    INTO v_credit_bal
    FROM public.merchant_credit_balances
   WHERE store_id = p_store_id;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_credit_ledger
  FROM (
    SELECT id, entry_type, amount, reason_code, description,
           balance_after, created_at
      FROM public.merchant_credit_ledger
     WHERE store_id = p_store_id
     ORDER BY created_at DESC
     LIMIT 50
  ) t;

  RETURN jsonb_build_object(
    'wallet', jsonb_build_object(
      'pay_available', v_pay_available,
      'pay_reserved',  v_pay_reserved,
      'pay_pending',   v_pay_pending,
      'pay_txs',       v_pay_txs,
      'legacy_saldo',  v_legacy_saldo,
      'legacy_txs',    v_legacy_txs,
      'saldo_total',   v_pay_available + v_legacy_saldo
    ),
    'credits', jsonb_build_object(
      'balance', COALESCE(v_credit_bal, jsonb_build_object('available_credits', 0, 'reserved_credits', 0, 'consumed_credits', 0)),
      'ledger',  v_credit_ledger
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_store_finances(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_store_finances(uuid) TO authenticated, service_role;
