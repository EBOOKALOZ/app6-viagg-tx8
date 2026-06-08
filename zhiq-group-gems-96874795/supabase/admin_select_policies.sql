-- ============================================================
-- ADMIN: libera SELECT em tabelas financeiras para admins.
-- Necessário para o painel /admin/multi-perfil/lojistas ver
-- saldos de TODAS as lojas (não só do dono autenticado).
--
-- Critério de admin (mesma regra do RPC admin_store_finances):
--   profiles.is_admin = true
--   OU user_roles.role = 'admin'
-- ============================================================
-- Execute no Supabase SQL Editor.

-- Helper: função IMMUTABLE que checa se o usuário corrente é admin.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- 1) merchant_credit_balances ---------------------------------
DROP POLICY IF EXISTS "admin_select_all_balances" ON public.merchant_credit_balances;
CREATE POLICY "admin_select_all_balances"
ON public.merchant_credit_balances
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

-- 2) merchant_credit_ledger -----------------------------------
DROP POLICY IF EXISTS "admin_select_all_ledger" ON public.merchant_credit_ledger;
CREATE POLICY "admin_select_all_ledger"
ON public.merchant_credit_ledger
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

-- 3) financial_accounts ---------------------------------------
DROP POLICY IF EXISTS "admin_select_all_financial_accounts" ON public.financial_accounts;
CREATE POLICY "admin_select_all_financial_accounts"
ON public.financial_accounts
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

-- Conferência: verifica se o usuário corrente é admin
SELECT public.is_current_user_admin() AS sou_admin;

-- Conferência: contagens visíveis depois das policies
SELECT 'merchant_credit_balances' AS tabela, COUNT(*) FROM public.merchant_credit_balances
UNION ALL
SELECT 'merchant_credit_ledger',           COUNT(*) FROM public.merchant_credit_ledger
UNION ALL
SELECT 'financial_accounts',               COUNT(*) FROM public.financial_accounts;
