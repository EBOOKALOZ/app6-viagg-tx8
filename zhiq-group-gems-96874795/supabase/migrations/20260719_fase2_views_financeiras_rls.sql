-- ============================================================
-- ORION-HARDENING FASE 2 · ETAPA 2 — Fechar vazamento de VIEWS financeiras · 2026-07-19
-- Achado AO VIVO: views `public` são owned por postgres e NÃO têm security_invoker →
-- executam com privilégio do dono e IGNORAM a RLS das tabelas base. PROVA: anon E
-- authenticated não-admin liam `v_pay_platform_ledger_summary` (agregado da plataforma:
-- créditos/débitos/escrow). RLS de tabela (FASE 1) não cobre views.
-- Decisão (menor privilégio, zero breakage):
--  · 25 views financeiras/sensíveis → REVOKE anon (nenhuma é usada em página pública — grep).
--  · 15 não referenciadas por NENHUM front → REVOKE authenticated também (fecha os 2 vetores).
--  · 10 usadas por páginas admin autenticadas → mantêm authenticated (fecha só anon);
--    o vazamento entre-autenticados fica como P1 (fix = policy admin nas tabelas base + security_invoker).
-- service_role mantém acesso (motor/relatórios internos). Sem DDL de dados. Idempotente.
-- ============================================================

-- BLOCO 1 · 15 views não referenciadas por front: revoke anon+authenticated
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.platform_financial_dashboard FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: platform_financial_dashboard'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.platform_payout_alerts_view FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: platform_payout_alerts_view'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.platform_payout_reconciliation_view FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: platform_payout_reconciliation_view'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.platform_payouts_admin_view FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: platform_payouts_admin_view'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.postador_commission_eligibility FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: postador_commission_eligibility'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.professional_wallet_balances FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: professional_wallet_balances'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_account_balances FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_account_balances'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_my_balance FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_my_balance'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_my_wallet_overview FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_my_wallet_overview'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_pay_motoboy_earnings FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_pay_motoboy_earnings'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_pay_platform_ledger_summary FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_pay_platform_ledger_summary'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_user_wallet_balance FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_user_wallet_balance'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_user_wallet_payouts FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_user_wallet_payouts'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_user_wallet_statement FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_user_wallet_statement'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_wallet_balance FROM PUBLIC, anon, authenticated'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_wallet_balance'; END $$;

-- BLOCO 2 · 10 views usadas por páginas admin/autenticadas: revoke só anon
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.admin_pi2_motoboy_wallet_overview FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: admin_pi2_motoboy_wallet_overview'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_merchant_credit_ledger_detailed FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_merchant_credit_ledger_detailed'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_merchant_credit_wallet_overview FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_merchant_credit_wallet_overview'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_motoboy_pay_earnings_detailed FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_motoboy_pay_earnings_detailed'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_motoboy_pay_payouts_detailed FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_motoboy_pay_payouts_detailed'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_motoboy_pay_wallet_overview FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_motoboy_pay_wallet_overview'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_pay_admin_payout_summary FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_pay_admin_payout_summary'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_pay_admin_recent_ledger FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_pay_admin_recent_ledger'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_pay_audit_motoboy_payouts_pending FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_pay_audit_motoboy_payouts_pending'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE SELECT ON public.v_pay_motoboy_payout_requests FROM PUBLIC, anon'; EXCEPTION WHEN undefined_table THEN RAISE WARNING 'view ausente: v_pay_motoboy_payout_requests'; END $$;


-- CORREÇÃO: REVOKE de PUBLIC removeu authenticated (grant era via PUBLIC). Re-garantir explicitamente.
GRANT SELECT ON public.admin_pi2_motoboy_wallet_overview TO authenticated;
GRANT SELECT ON public.v_merchant_credit_ledger_detailed TO authenticated;
GRANT SELECT ON public.v_merchant_credit_wallet_overview TO authenticated;
GRANT SELECT ON public.v_motoboy_pay_earnings_detailed TO authenticated;
GRANT SELECT ON public.v_motoboy_pay_payouts_detailed TO authenticated;
GRANT SELECT ON public.v_motoboy_pay_wallet_overview TO authenticated;
GRANT SELECT ON public.v_pay_admin_payout_summary TO authenticated;
GRANT SELECT ON public.v_pay_admin_recent_ledger TO authenticated;
GRANT SELECT ON public.v_pay_audit_motoboy_payouts_pending TO authenticated;
GRANT SELECT ON public.v_pay_motoboy_payout_requests TO authenticated;

-- NOTA: v_wallet_statement/overview/payout_history são security_invoker=true → já respeitam
-- a RLS das tabelas base (anon lê e recebe 0 linhas). NÃO precisam de revoke; mantidas intactas.

-- VERIFICAÇÃO (esperado anon_le_views_fin=0)
SELECT count(*) AS anon_le_views_fin FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v' AND has_table_privilege('anon',c.oid,'SELECT')
  AND c.relname ~* 'wallet|ledger|escrow|payout|commission|financ|payment|earning|balance|profit|revenue|settlement';

