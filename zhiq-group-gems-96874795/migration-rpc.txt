-- ============================================================
-- ORION-HARDENING FASE 1 · P0-2: revogar anon/authenticated de RPCs financeiras · 2026-07-18
-- Contexto: 118 funções SECURITY DEFINER de nome financeiro eram EXECUTÁVEIS por
-- `anon` (GRANT ... TO PUBLIC/anon explícito — o v1-audit só checou proacl NULL e
-- não viu isto). 25 são triggers (não expostas pelo PostgREST). Das 93 restantes,
-- várias SEM guarda auth.uid()/is_admin() (ex.: admin_wallet_credit, append_ledger_entry,
-- credit/debit_merchant_credits, pay_settle_delivery, approve_professional_withdrawal)
-- → anon podia cunhar créditos/aprovar saques via REST. PROVA: chamada REST anon
-- retornava erro de ASSINATURA (não 42501) = função alcançável.
-- Decisão:
--  · 93 funções (não-trigger): REVOKE anon SEMPRE (nenhum fluxo anônimo toca dinheiro).
--  · 78 helpers internos (não chamados por front nem Edge via .rpc): REVOKE authenticated
--    também — só alcançáveis como OWNER (triggers/chamadas aninhadas de DEFINER), que
--    não dependem do grant. service_role/owner mantidos.
--  · 15 RPCs chamadas pelo front/Edge autenticado: mantêm authenticated (revoga só anon).
-- Reversível. Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ETAPA A · 15 RPCs financeiras chamadas pelo front autenticado: revoga só anon
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.accept_offer_with_credits(uuid,uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.accept_offer_with_credits(uuid,uuid) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: accept_offer_with_credits(uuid,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_grant_credits(uuid,integer,text,text,text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid,integer,text,text,text) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_grant_credits(uuid,integer,text,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.consume_product_view_credit(uuid,uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.consume_product_view_credit(uuid,uuid) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: consume_product_view_credit(uuid,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.credit_merchant_credits(uuid,integer,text,text,uuid,text,jsonb) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.credit_merchant_credits(uuid,integer,text,text,uuid,text,jsonb) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: credit_merchant_credits(uuid,integer,text,text,uuid,text,jsonb)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.credit_merchant_credits(uuid,numeric,text,text,text,jsonb,uuid,uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.credit_merchant_credits(uuid,numeric,text,text,text,jsonb,uuid,uuid) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: credit_merchant_credits(uuid,numeric,text,text,text,jsonb,uuid,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.credit_pay_motoboy_earning(uuid,text,uuid,numeric,numeric,jsonb,text,uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.credit_pay_motoboy_earning(uuid,text,uuid,numeric,numeric,jsonb,text,uuid) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: credit_pay_motoboy_earning(uuid,text,uuid,numeric,numeric,jsonb,text,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.debit_merchant_credits(uuid,integer,text,text,uuid,text,jsonb) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.debit_merchant_credits(uuid,integer,text,text,uuid,text,jsonb) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: debit_merchant_credits(uuid,integer,text,text,uuid,text,jsonb)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.debit_merchant_credits(uuid,numeric,text,text,text,jsonb,uuid,uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.debit_merchant_credits(uuid,numeric,text,text,text,jsonb,uuid,uuid) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: debit_merchant_credits(uuid,numeric,text,text,text,jsonb,uuid,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.deduct_store_product_view_credit(uuid,uuid,text,text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.deduct_store_product_view_credit(uuid,uuid,text,text) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: deduct_store_product_view_credit(uuid,uuid,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_base_profile_and_wallet() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_base_profile_and_wallet() TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_base_profile_and_wallet()'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_motoboy_commission_rate(uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_motoboy_commission_rate(uuid) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: get_motoboy_commission_rate(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_motoboy_wallet_balance(uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_motoboy_wallet_balance(uuid) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: get_motoboy_wallet_balance(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_my_merchant_pay_wallet() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_my_merchant_pay_wallet() TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: get_my_merchant_pay_wallet()'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.request_payout(integer) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_payout(integer) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: request_payout(integer)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.request_payout(uuid,numeric,text,numeric) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_payout(uuid,numeric,text,numeric) TO authenticated, service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: request_payout(uuid,numeric,text,numeric)'; END $$;

-- ETAPA B · 78 helpers financeiros internos: revoga anon E authenticated (só owner/service_role)
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_commission_finance(integer) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_commission_finance(integer) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_commission_finance(integer)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_commission_history(integer) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_commission_history(integer) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_commission_history(integer)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_commission_overview() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_commission_overview() TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_commission_overview()'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_delete_credit_package(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_delete_credit_package(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_delete_credit_package(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_get_credit_overview(date,date) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_get_credit_overview(date,date) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_get_credit_overview(date,date)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_get_credit_overview(timestamp with time zone,timestamp with time zone) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_get_credit_overview(timestamp with time zone,timestamp with time zone) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_get_credit_overview(timestamp with time zone,timestamp with time zone)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_get_credit_overview(timestamp without time zone,timestamp without time zone) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_get_credit_overview(timestamp without time zone,timestamp without time zone) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_get_credit_overview(timestamp without time zone,timestamp without time zone)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_toggle_credit_package(uuid,boolean) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_toggle_credit_package(uuid,boolean) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_toggle_credit_package(uuid,boolean)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_toggle_credit_product(uuid,boolean) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_toggle_credit_product(uuid,boolean) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_toggle_credit_product(uuid,boolean)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_update_credit_product(uuid,jsonb) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_update_credit_product(uuid,jsonb) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_update_credit_product(uuid,jsonb)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_upsert_credit_package(uuid,text,text,text,integer,integer,numeric,text,text,jsonb,boolean,boolean,integer) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_upsert_credit_package(uuid,text,text,text,integer,integer,numeric,text,text,jsonb,boolean,boolean,integer) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_upsert_credit_package(uuid,text,text,text,integer,integer,numeric,text,text,jsonb,boolean,boolean,integer)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_wallet_credit(uuid,bigint,text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_wallet_credit(uuid,bigint,text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: admin_wallet_credit(uuid,bigint,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.append_ledger_entry(uuid,text,ledger_direction,numeric,text,uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.append_ledger_entry(uuid,text,ledger_direction,numeric,text,uuid,text,text,text,jsonb) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: append_ledger_entry(uuid,text,ledger_direction,numeric,text,uuid,text,text,text,jsonb)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.append_ledger_entry_cents(text,uuid,text,bigint,text,uuid,text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.append_ledger_entry_cents(text,uuid,text,bigint,text,uuid,text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: append_ledger_entry_cents(text,uuid,text,bigint,text,uuid,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.approve_platform_payout_request(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.approve_platform_payout_request(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: approve_platform_payout_request(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.approve_platform_payout_request(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.approve_platform_payout_request(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: approve_platform_payout_request(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.approve_professional_withdrawal(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.approve_professional_withdrawal(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: approve_professional_withdrawal(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.calculate_purchase_intention_credit_cost(uuid,numeric,integer) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.calculate_purchase_intention_credit_cost(uuid,numeric,integer) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: calculate_purchase_intention_credit_cost(uuid,numeric,integer)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cancel_professional_withdrawal(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.cancel_professional_withdrawal(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: cancel_professional_withdrawal(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.complete_motoboy_split_and_credit_wallet(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.complete_motoboy_split_and_credit_wallet(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: complete_motoboy_split_and_credit_wallet(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.confirm_advertiser_credit_purchase(uuid,text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.confirm_advertiser_credit_purchase(uuid,text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: confirm_advertiser_credit_purchase(uuid,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.confirm_credit_order(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.confirm_credit_order(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: confirm_credit_order(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.confirm_credit_purchase_transaction(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.confirm_credit_purchase_transaction(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: confirm_credit_purchase_transaction(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.confirm_pay_merchant_credit_purchase(uuid,text,text,text,text,jsonb,jsonb,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.confirm_pay_merchant_credit_purchase(uuid,text,text,text,text,jsonb,jsonb,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: confirm_pay_merchant_credit_purchase(uuid,text,text,text,text,jsonb,jsonb,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.confirm_store_credit_purchase_transaction(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.confirm_store_credit_purchase_transaction(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: confirm_store_credit_purchase_transaction(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.consume_purchase_intention_credit(uuid,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.consume_purchase_intention_credit(uuid,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: consume_purchase_intention_credit(uuid,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_advertiser_credit_purchase(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_advertiser_credit_purchase(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: create_advertiser_credit_purchase(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_credit_purchase_transaction(uuid,bigint,uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_credit_purchase_transaction(uuid,bigint,uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: create_credit_purchase_transaction(uuid,bigint,uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_credit_purchase_transaction(uuid,numeric,uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_credit_purchase_transaction(uuid,numeric,uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: create_credit_purchase_transaction(uuid,numeric,uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_pay_merchant_credit_purchase(uuid,numeric,numeric,text,uuid,text,jsonb,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_pay_merchant_credit_purchase(uuid,numeric,numeric,text,uuid,text,jsonb,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: create_pay_merchant_credit_purchase(uuid,numeric,numeric,text,uuid,text,jsonb,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_platform_payout_request(uuid,uuid,numeric,numeric,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_platform_payout_request(uuid,uuid,numeric,numeric,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: create_platform_payout_request(uuid,uuid,numeric,numeric,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_platform_payout_request(numeric,uuid,numeric,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_platform_payout_request(numeric,uuid,numeric,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: create_platform_payout_request(numeric,uuid,numeric,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_store_credit_purchase_transaction(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_store_credit_purchase_transaction(uuid,uuid,uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: create_store_credit_purchase_transaction(uuid,uuid,uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.detect_merchant_credit_entry_type_credit() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.detect_merchant_credit_entry_type_credit() TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: detect_merchant_credit_entry_type_credit()'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.detect_merchant_credit_entry_type_debit() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.detect_merchant_credit_entry_type_debit() TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: detect_merchant_credit_entry_type_debit()'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_courier_wallet_account(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_courier_wallet_account(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_courier_wallet_account(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_merchant_credit_balance(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_merchant_credit_balance(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_merchant_credit_balance(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_merchant_store_and_wallet(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_merchant_store_and_wallet(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_merchant_store_and_wallet(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_pay_motoboy_account(uuid,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_pay_motoboy_account(uuid,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_pay_motoboy_account(uuid,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_pay_platform_account(pay_account_type) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_pay_platform_account(pay_account_type) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_pay_platform_account(pay_account_type)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_real_estate_credit_balance(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_real_estate_credit_balance(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_real_estate_credit_balance(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_user_wallet_account(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_user_wallet_account(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_user_wallet_account(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ensure_wallet(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_wallet(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: ensure_wallet(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.expire_inactive_credit_wallets() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.expire_inactive_credit_wallets() TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: expire_inactive_credit_wallets()'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fail_professional_withdrawal(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.fail_professional_withdrawal(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: fail_professional_withdrawal(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_pay_motoboy_balance(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_pay_motoboy_balance(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: get_pay_motoboy_balance(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.grant_merchant_credits_from_payment(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.grant_merchant_credits_from_payment(uuid,uuid,uuid,uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: grant_merchant_credits_from_payment(uuid,uuid,uuid,uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_payout_paid(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_payout_paid(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_payout_paid(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_platform_payout_failed(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_platform_payout_failed(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_platform_payout_failed(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_platform_payout_failed(uuid,text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_platform_payout_failed(uuid,text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_platform_payout_failed(uuid,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_platform_payout_paid(uuid,text,text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_platform_payout_paid(uuid,text,text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_platform_payout_paid(uuid,text,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_platform_payout_processing(uuid,text,text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_platform_payout_processing(uuid,text,text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_platform_payout_processing(uuid,text,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_professional_withdrawal_paid(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_professional_withdrawal_paid(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_professional_withdrawal_paid(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_professional_withdrawal_processing(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_professional_withdrawal_processing(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_professional_withdrawal_processing(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_split_as_completed_and_credit_wallet(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_split_as_completed_and_credit_wallet(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: mark_split_as_completed_and_credit_wallet(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.pay_create_ledger_entry(uuid,pay_ledger_direction,pay_ledger_entry_type,numeric,text,uuid,text,text,jsonb,text,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.pay_create_ledger_entry(uuid,pay_ledger_direction,pay_ledger_entry_type,numeric,text,uuid,text,text,jsonb,text,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: pay_create_ledger_entry(uuid,pay_ledger_direction,pay_ledger_entry_type,numeric,text,uuid,text,text,jsonb,text,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.pay_get_active_gateway() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.pay_get_active_gateway() TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: pay_get_active_gateway()'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.pay_settle_delivery(uuid,numeric) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.pay_settle_delivery(uuid,numeric) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: pay_settle_delivery(uuid,numeric)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.post_ledger_entry(text,text,uuid,text,integer,boolean) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_ledger_entry(text,text,uuid,text,integer,boolean) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: post_ledger_entry(text,text,uuid,text,integer,boolean)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.process_payout_webhook_event(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.process_payout_webhook_event(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: process_payout_webhook_event(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.queue_platform_payout_request(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.queue_platform_payout_request(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: queue_platform_payout_request(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.queue_platform_payout_request(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.queue_platform_payout_request(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: queue_platform_payout_request(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.recalc_user_commission(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.recalc_user_commission(uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: recalc_user_commission(uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.register_payout_webhook_event(text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.register_payout_webhook_event(text,text,text,text,text,text,jsonb,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: register_payout_webhook_event(text,text,text,text,text,text,jsonb,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.request_pay_motoboy_payout(uuid,numeric,numeric,jsonb,text,jsonb,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_pay_motoboy_payout(uuid,numeric,numeric,jsonb,text,jsonb,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: request_pay_motoboy_payout(uuid,numeric,numeric,jsonb,text,jsonb,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.request_payout_cents(uuid,bigint,text,bigint,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_payout_cents(uuid,bigint,text,bigint,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: request_payout_cents(uuid,bigint,text,bigint,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.request_payout_cents_sandbox(uuid,bigint,text,bigint,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_payout_cents_sandbox(uuid,bigint,text,bigint,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: request_payout_cents_sandbox(uuid,bigint,text,bigint,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.request_payout_v2(bigint,text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_payout_v2(bigint,text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: request_payout_v2(bigint,text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.request_professional_withdrawal(uuid,text,numeric,numeric,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_professional_withdrawal(uuid,text,numeric,numeric,text,text,text,text,jsonb) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: request_professional_withdrawal(uuid,text,numeric,numeric,text,text,text,text,jsonb)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.reserve_service_payment_in_escrow(uuid,text,uuid,numeric,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.reserve_service_payment_in_escrow(uuid,text,uuid,numeric,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: reserve_service_payment_in_escrow(uuid,text,uuid,numeric,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.resolve_payout_request_by_provider_refs(text,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_payout_request_by_provider_refs(text,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: resolve_payout_request_by_provider_refs(text,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.sandbox_credit(integer,uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.sandbox_credit(integer,uuid) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: sandbox_credit(integer,uuid)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.sandbox_post_ledger_entry(uuid,text,text,uuid,text,integer) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.sandbox_post_ledger_entry(uuid,text,text,uuid,text,integer) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: sandbox_post_ledger_entry(uuid,text,text,uuid,text,integer)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.sandbox_request_payout(uuid,integer) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.sandbox_request_payout(uuid,integer) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: sandbox_request_payout(uuid,integer)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wallet_cancel(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.wallet_cancel(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: wallet_cancel(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wallet_confirm(uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.wallet_confirm(uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: wallet_confirm(uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wallet_credit(uuid,bigint,text,text,uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.wallet_credit(uuid,bigint,text,text,uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: wallet_credit(uuid,bigint,text,text,uuid,text)'; END $$;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wallet_reserve(uuid,bigint,text,text,uuid,text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.wallet_reserve(uuid,bigint,text,text,uuid,text) TO service_role';
EXCEPTION WHEN undefined_function OR undefined_object THEN RAISE WARNING 'ausente: wallet_reserve(uuid,bigint,text,text,uuid,text)'; END $$;

-- ============================================================
-- VERIFICAÇÃO (esperado: anon_fin_exec=0; auth_internos_exec=0)
-- ============================================================
SELECT
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef AND p.prorettype<>'trigger'::regtype
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND (p.proname ~* 'pay_|wallet|ledger|escrow|payout|commission|credit|settle|withdraw')) AS anon_fin_exec,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND p.oid::regprocedure::text = ANY(ARRAY['admin_commission_finance(integer)'])) AS service_role_ok_sample;
