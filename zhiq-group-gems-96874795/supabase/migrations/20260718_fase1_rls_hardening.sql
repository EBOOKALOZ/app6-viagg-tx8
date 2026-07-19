-- ============================================================
-- ORION-HARDENING FASE 1 · P0-1: RLS nas 104 tabelas expostas · 2026-07-18
-- Contexto: ORION-AUDIT v1.0 achou 104 tabelas public sem RLS, TODAS com
-- GRANT FULL para anon/authenticated (leitura+escrita+delete via PostgREST).
-- Decisões:
--  · 86 tabelas sem uso direto no front → RLS ON + deny-all (acesso só via
--    RPC SECURITY DEFINER / service_role — comprovado por varredura do repo).
--  · 16 tabelas com uso direto no front → RLS ON + policies owner/admin.
--  · 11 trigger-functions INVOKER que escrevem nessas tabelas → SECURITY DEFINER
--    (senão o DML de usuário comum quebraria o trigger pós-RLS).
--  · 30 funções INVOKER de escrita não chamadas pelo front → REVOKE de clientes.
--  · teste_exemplo (0 linhas, 0 refs) → DROP. spatial_ref_sys (PostGIS,
--    dona supabase_admin) → só tentativa de revoke, tolerante a falha.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ETAPA 0 · trigger-functions INVOKER → SECURITY DEFINER (antes do RLS)
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.update_city_growth() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): update_city_growth';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.trg_audit_whatsapp_group_status() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): trg_audit_whatsapp_group_status';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.update_product_demand() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): update_product_demand';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public._dispatch_stats_on_offer_accept() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): _dispatch_stats_on_offer_accept';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public._dispatch_stats_on_offer_insert() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): _dispatch_stats_on_offer_insert';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.update_accept_stats() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): update_accept_stats';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.update_offer_stats() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): update_offer_stats';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.ensure_profile_wallet() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): ensure_profile_wallet';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.tg_log_realtime_offer_event() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): tg_log_realtime_offer_event';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.tg_log_service_order_status() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): tg_log_service_order_status';
END $$;
DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.trg_log_service_order_status_change() SECURITY DEFINER SET search_path TO public, extensions';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'fn ausente (drift): trg_log_service_order_status_change';
END $$;

-- ETAPA 1 · tabela de teste morta
DROP TABLE IF EXISTS public.teste_exemplo;

-- ETAPA 2 · deny-all: RLS ON + revogação total de anon/authenticated
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_market_events',
    'admin_profit_events',
    'bank_webhook_events',
    'campaign_batch_clicks',
    'campaign_batch_items',
    'campaign_batches',
    'campaign_queue_events',
    'cities_sc',
    'click_tracking',
    'commissions_local',
    'configuracoes_postador',
    'courier_bank_accounts',
    'courier_wallet_accounts',
    'courier_wallet_ledger',
    'credit_package_purchases',
    'credit_pricing_settings',
    'credit_subscription_grants',
    'credit_subscription_plans',
    'delivery_order_items',
    'delivery_pricing_config',
    'delivery_splits',
    'dispatch_queue',
    'dispatch_rounds',
    'dispatch_state',
    'escrow_accounts',
    'escrow_holds',
    'financial_reversals',
    'financial_transactions',
    'group_audit_logs',
    'group_hunter_rewards',
    'group_members',
    'group_quality_scores',
    'group_status_audit',
    'lead_distribution',
    'lead_pricing_rules',
    'local_growth_actions',
    'local_growth_events',
    'm1_pricing_rules',
    'migration_checkpoints',
    'moto_taxi_historico',
    'motoboy_campaign_inbox',
    'motoboy_neighborhoods',
    'motoboy_stats',
    'motoboy_terms_acceptance',
    'motoboy_terms_versions',
    'neighborhood_group_capacity',
    'notificacoes_admin',
    'notification_events',
    'orders_local',
    'pay_merchant_credit_purchases',
    'pay_motoboy_earnings',
    'pay_payment_events',
    'pay_payout_events',
    'pay_payout_requests',
    'pay_split_rules',
    'pay_split_transactions',
    'payment_intents',
    'platform_accounts',
    'postador_batch_history',
    'postador_batch_runtime',
    'postador_referrals',
    'posting_candidate_batches',
    'posting_candidate_items',
    'product_cards',
    'professional_dispatch_stats',
    'professional_metrics',
    'professional_wallet_ledger',
    'professional_withdrawal_requests',
    'real_estate_listing_images',
    'reconciliation_items',
    'reconciliation_runs',
    'referral_rewards',
    'regioes',
    'service_cities',
    'service_h3_cells',
    'service_neighborhoods',
    'service_states',
    'settlement_log',
    'store_credit_subscriptions',
    'support_ai_knowledge',
    'support_categories',
    'system_events_log',
    'system_financial_events',
    'territories',
    'ticket_attachments',
    'v_store_id']
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      RAISE WARNING 'tabela ausente (drift): %', t; CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

-- ETAPA 3 · tabelas com uso direto no front: RLS ON + policies mínimas

-- city_growth_metrics: painéis/skills admin
ALTER TABLE public.city_growth_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_growth_metrics FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_all ON public.city_growth_metrics;
CREATE POLICY fase1_admin_all ON public.city_growth_metrics FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.city_growth_metrics TO authenticated;

-- city_zones: painéis/skills admin
ALTER TABLE public.city_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_zones FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_all ON public.city_zones;
CREATE POLICY fase1_admin_all ON public.city_zones FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.city_zones TO authenticated;

-- zone_neighborhoods: painéis/skills admin
ALTER TABLE public.zone_neighborhoods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zone_neighborhoods FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_all ON public.zone_neighborhoods;
CREATE POLICY fase1_admin_all ON public.zone_neighborhoods FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zone_neighborhoods TO authenticated;

-- zone_dominance_metrics: painéis/skills admin
ALTER TABLE public.zone_dominance_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zone_dominance_metrics FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_all ON public.zone_dominance_metrics;
CREATE POLICY fase1_admin_all ON public.zone_dominance_metrics FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zone_dominance_metrics TO authenticated;

-- neighborhood_product_demand: painéis/skills admin
ALTER TABLE public.neighborhood_product_demand ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.neighborhood_product_demand FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_all ON public.neighborhood_product_demand;
CREATE POLICY fase1_admin_all ON public.neighborhood_product_demand FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neighborhood_product_demand TO authenticated;

-- sc_cities_control: painéis/skills admin
ALTER TABLE public.sc_cities_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sc_cities_control FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_all ON public.sc_cities_control;
CREATE POLICY fase1_admin_all ON public.sc_cities_control FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sc_cities_control TO authenticated;

-- external_bank_accounts: painéis/skills admin
ALTER TABLE public.external_bank_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_bank_accounts FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_all ON public.external_bank_accounts;
CREATE POLICY fase1_admin_all ON public.external_bank_accounts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_bank_accounts TO authenticated;

-- payment_splits: leitura admin (useAdminFinancials)
ALTER TABLE public.payment_splits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_splits FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_admin_select ON public.payment_splits;
CREATE POLICY fase1_admin_select ON public.payment_splits FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.payment_splits TO authenticated;

-- ledger_entries (ledger legado): leitura dono/admin, ajuste manual só admin
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ledger_entries FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_owner_admin_select ON public.ledger_entries;
CREATE POLICY fase1_owner_admin_select ON public.ledger_entries FOR SELECT TO authenticated USING (account_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS fase1_admin_insert ON public.ledger_entries;
CREATE POLICY fase1_admin_insert ON public.ledger_entries FOR INSERT TO authenticated WITH CHECK (public.is_admin());
GRANT SELECT, INSERT ON public.ledger_entries TO authenticated;

-- profile_wallets (carteira legada): leitura do próprio dono/admin
ALTER TABLE public.profile_wallets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_wallets FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_owner_admin_select ON public.profile_wallets;
CREATE POLICY fase1_owner_admin_select ON public.profile_wallets FOR SELECT TO authenticated USING (account_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.profile_wallets TO authenticated;

-- store_credit_wallet: dono da loja (merchant_stores.user_id) ou admin
ALTER TABLE public.store_credit_wallet ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_credit_wallet FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_store_owner_all ON public.store_credit_wallet;
CREATE POLICY fase1_store_owner_all ON public.store_credit_wallet FOR ALL TO authenticated USING ((public.is_admin() OR store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()))) WITH CHECK ((public.is_admin() OR store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())));
GRANT SELECT, INSERT, UPDATE ON public.store_credit_wallet TO authenticated;

-- credit_transactions: dono da loja ou admin (extrato de créditos M1)
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_transactions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_store_owner_all ON public.credit_transactions;
CREATE POLICY fase1_store_owner_all ON public.credit_transactions FOR ALL TO authenticated USING ((public.is_admin() OR store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()))) WITH CHECK ((public.is_admin() OR store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())));
GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;

-- product_leads (tem telefone do comprador — PII): dono da loja ou admin
ALTER TABLE public.product_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_leads FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_store_owner_select ON public.product_leads;
CREATE POLICY fase1_store_owner_select ON public.product_leads FOR SELECT TO authenticated USING ((public.is_admin() OR store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())));
DROP POLICY IF EXISTS fase1_store_owner_update ON public.product_leads;
CREATE POLICY fase1_store_owner_update ON public.product_leads FOR UPDATE TO authenticated USING ((public.is_admin() OR store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()))) WITH CHECK ((public.is_admin() OR store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())));
GRANT SELECT, UPDATE ON public.product_leads TO authenticated;

-- media_library: leitura p/ logados (postador/operador), escrita admin
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_library FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_auth_select ON public.media_library;
CREATE POLICY fase1_auth_select ON public.media_library FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS fase1_admin_insert ON public.media_library;
CREATE POLICY fase1_admin_insert ON public.media_library FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS fase1_admin_update ON public.media_library;
CREATE POLICY fase1_admin_update ON public.media_library FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS fase1_admin_delete ON public.media_library;
CREATE POLICY fase1_admin_delete ON public.media_library FOR DELETE TO authenticated USING (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_library TO authenticated;

-- whatsapp_groups: mantém as 4 policies owner_user_id já existentes;
-- adiciona leitura p/ logados (feed postador/comissão motoboy) e admin ALL
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_groups FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_auth_select ON public.whatsapp_groups;
CREATE POLICY fase1_auth_select ON public.whatsapp_groups FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS fase1_admin_all ON public.whatsapp_groups;
CREATE POLICY fase1_admin_all ON public.whatsapp_groups FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_groups TO authenticated;

-- product_categories: referência pública (nome/slug), escrita admin
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_categories FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS fase1_public_select ON public.product_categories;
CREATE POLICY fase1_public_select ON public.product_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS fase1_admin_write ON public.product_categories;
CREATE POLICY fase1_admin_write ON public.product_categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.product_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;

-- ETAPA 4 · spatial_ref_sys (PostGIS, dona supabase_admin): melhor esforço
DO $$ BEGIN
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.spatial_ref_sys FROM PUBLIC, anon, authenticated';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'spatial_ref_sys: revoke não permitido (%) — leitura pública é inofensiva', SQLERRM;
END $$;

-- ETAPA 5 · funções INVOKER de escrita não usadas pelo front: fora do alcance de clientes
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT p.prosecdef
       AND p.proname = ANY(ARRAY[
    'activate_city_when_ready',
    'activate_discovered_group',
    'activate_h3_cells',
    'activate_neighborhood',
    'activate_neighborhood_when_ready',
    'approve_payout',
    'calculate_delivery_split',
    'change_whatsapp_group_status',
    'check_neighborhood_coverage',
    'create_delivery_escrow',
    'create_h3_cell_if_not_exists',
    'detect_local_opportunities',
    'dispatch_start',
    'distribute_lead',
    'ensure_motoboy_wallet',
    'ensure_neighborhood',
    'ensure_profile_wallet',
    'evaluate_city_stage',
    'evaluate_zone_dominance',
    'execute_local_actions',
    'register_product_click',
    'register_referral',
    'register_tracking_click',
    'release_lead_contact',
    'sc_eval_city_status',
    'settle_delivery',
    'settle_delivery_payment',
    'track_product_click',
    'trg_log_delivery_offer_insert',
    'request_payout'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- refresh_whatsapp_group_validity (usada pelo AdminGroupFinder): só logados
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure sig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='refresh_whatsapp_group_validity'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- ============================================================
-- VERIFICAÇÃO (deve retornar: sem_rls=1 [só spatial_ref_sys],
-- policies_fase1>=24, grants_anon_escrita=0)
-- ============================================================
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity) AS sem_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND policyname LIKE 'fase1%') AS policies_fase1,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon'
      AND privilege_type IN ('INSERT','UPDATE','DELETE')
      AND table_name IN (SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r')) AS grants_anon_escrita;
