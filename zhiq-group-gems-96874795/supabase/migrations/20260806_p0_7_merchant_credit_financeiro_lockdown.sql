-- ============================================================================
-- P0-7 — merchant_credit_balances/ledger/orders: remover leitura financeira
--        pública irrestrita
-- ============================================================================
-- Causa raiz:
--   Cada tabela tem uma policy legada ..._select_all com SELECT USING(true)
--   para {public}, que anula (OR permissivo) as policies corretas por-dono:
--     - balances/ledger: mcbal/mcledger_select_owner_or_admin
--       (store_id do lojista OU is_platform_admin());
--     - orders: NÃO tinha policy owner — só a _select_all irrestrita.
--   anon tem grant SELECT. Resultado: qualquer visitante lê saldos de crédito,
--   a razão financeira completa (amount, balance_before/after) e os pedidos
--   (amount_cents, pix_code, pix_qr_base64, boleto_url) de TODOS os lojistas.
--   (Tabelas hoje vazias — vulnerabilidade latente de exposição financeira.)
--
-- Uso legítimo (verificado no código): 100% autenticado — admin
--   (useAdminCredits) e lojista dono filtrando por store_id
--   (useMerchantCredits/useCreditCatalog/useMerchantPayWallet). Nenhum
--   fluxo anon lê estas tabelas.
--
-- Correção (fail-closed, menor privilégio):
--   1) DROP das três policies ..._select_all (USING(true)).
--   2) Criar a policy owner-or-admin faltante em merchant_credit_orders.
--      (balances e ledger já têm; preservadas.)
--   3) REVOKE SELECT do anon nas três tabelas.
--   4) Guards fail-closed.
--
-- Idempotente: DROP/CREATE guardado + REVOKE no-op + guards.
-- ============================================================================

BEGIN;

-- 1) Remover leitura pública irrestrita --------------------------------------
DROP POLICY IF EXISTS "mcbal_select_all"   ON public.merchant_credit_balances;
DROP POLICY IF EXISTS "mcledger_select_all" ON public.merchant_credit_ledger;
DROP POLICY IF EXISTS "mco_select_all"     ON public.merchant_credit_orders;

-- 2) merchant_credit_orders: adicionar policy owner-or-admin (faltava) --------
DROP POLICY IF EXISTS "mco_select_owner_or_admin" ON public.merchant_credit_orders;
CREATE POLICY "mco_select_owner_or_admin"
  ON public.merchant_credit_orders
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT ms.id FROM public.merchant_stores ms WHERE ms.user_id = auth.uid())
    OR public.is_platform_admin()
  );

-- 3) Menor privilégio: anon não lê dados financeiros -------------------------
REVOKE SELECT ON public.merchant_credit_balances FROM anon;
REVOKE SELECT ON public.merchant_credit_ledger   FROM anon;
REVOKE SELECT ON public.merchant_credit_orders   FROM anon;

-- ---------------------------------------------------------------------------
-- Guards fail-closed
-- ---------------------------------------------------------------------------
-- A) Nenhuma policy SELECT USING(true) para anon/public nas 3 tabelas.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT tablename || '.' || policyname INTO v_offender
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('merchant_credit_balances','merchant_credit_ledger','merchant_credit_orders')
    AND cmd='SELECT' AND qual='true'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-7: ainda existe leitura financeira irrestrita: %', v_offender;
  END IF;
END $$;

-- B) anon não retém SELECT em nenhuma das 3 tabelas.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT table_name INTO v_offender
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('merchant_credit_balances','merchant_credit_ledger','merchant_credit_orders')
    AND grantee='anon' AND privilege_type='SELECT'
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-7: anon ainda tem SELECT em %', v_offender;
  END IF;
END $$;

COMMIT;
