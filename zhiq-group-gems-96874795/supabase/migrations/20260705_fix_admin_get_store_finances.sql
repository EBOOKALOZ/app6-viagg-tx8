-- ============================================================
-- FIX — admin_get_store_finances tolerante a schema
--
-- A versão original referenciava merchant_wallets /
-- merchant_wallet_transactions / merchant_credit_* diretamente;
-- neste banco algumas dessas tabelas não existem (42P01
-- "relation public.merchant_wallets does not exist").
--
-- Esta versão acessa CADA tabela opcional só se to_regclass()
-- confirmar que ela existe (via EXECUTE dinâmico). As tabelas
-- core (pay_financial_accounts, pay_ledger_entries,
-- merchant_stores) são usadas direto — já comprovadas em prod.
--
-- Rodar no SQL Editor (broifhfqmnzqoongtokm). Idempotente.
-- ============================================================

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
  -- Auth: precisa ser admin (reaproveita is_platform_admin quando existir)
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  BEGIN
    v_is_admin := public.is_platform_admin();
  EXCEPTION WHEN undefined_function THEN
    SELECT (COALESCE(p.is_admin, false)
            OR EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = v_uid AND ur.role = 'admin'))
      INTO v_is_admin
      FROM public.profiles p
     WHERE p.id = v_uid;
  END;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT user_id INTO v_user_id FROM public.merchant_stores WHERE id = p_store_id;

  -- ─── Carteira pay_* (R$) — tabelas core, acesso direto ───
  SELECT
    COALESCE(SUM(fa.available_balance), 0),
    COALESCE(SUM(fa.reserved_balance), 0),
    COALESCE(SUM(fa.pending_balance), 0)
  INTO v_pay_available, v_pay_reserved, v_pay_pending
  FROM public.pay_financial_accounts fa
  WHERE fa.owner_type = 'merchant_store'
    AND fa.account_type = 'merchant_wallet'
    AND fa.owner_id = p_store_id;

  IF to_regclass('public.pay_ledger_entries') IS NOT NULL THEN
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
  END IF;

  -- ─── Legacy merchant_wallets (R$) — SÓ se as tabelas existirem ───
  IF v_user_id IS NOT NULL AND to_regclass('public.merchant_wallets') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(saldo_atual, 0) FROM public.merchant_wallets WHERE merchant_id = $1'
      INTO v_legacy_saldo USING v_user_id;
  END IF;

  IF v_user_id IS NOT NULL AND to_regclass('public.merchant_wallet_transactions') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, tipo, valor, descricao, referencia_id, created_at
          FROM public.merchant_wallet_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50
      ) t
    $q$ INTO v_legacy_txs USING v_user_id;
  END IF;

  -- ─── Créditos — SÓ se as tabelas existirem ───
  IF to_regclass('public.merchant_credit_balances') IS NOT NULL THEN
    EXECUTE $q$
      SELECT jsonb_build_object(
               'available_credits', COALESCE(available_credits, 0),
               'reserved_credits',  COALESCE(reserved_credits, 0),
               'consumed_credits',  COALESCE(consumed_credits, 0)
             )
        FROM public.merchant_credit_balances
       WHERE store_id = $1
    $q$ INTO v_credit_bal USING p_store_id;
    v_credit_bal := COALESCE(v_credit_bal, jsonb_build_object('available_credits', 0, 'reserved_credits', 0, 'consumed_credits', 0));
  END IF;

  IF to_regclass('public.merchant_credit_ledger') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, entry_type, amount, reason_code, description,
               balance_after, created_at
          FROM public.merchant_credit_ledger
         WHERE store_id = $1
         ORDER BY created_at DESC
         LIMIT 50
      ) t
    $q$ INTO v_credit_ledger USING p_store_id;
  END IF;

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
      'balance', v_credit_bal,
      'ledger',  v_credit_ledger
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_store_finances(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_store_finances(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
