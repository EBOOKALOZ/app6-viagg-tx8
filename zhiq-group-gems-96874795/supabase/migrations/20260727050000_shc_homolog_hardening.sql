-- ============================================================================
-- SHC v2.0 — HOMOLOGAÇÃO GERAL: fecha P0s residuais apontados pelo Decision
-- Engine (runs de 2026-07-27 11:00) que ainda existiam no banco.
--
-- CONTEXTO (estado do banco em 2026-07-27, verificado antes desta migration):
--   • A maioria dos grants de escrita do anon flagados pelo engine
--     (freight_*, real_estate_*, vehicle_*, travel_*, service_*, pay_*,
--     platform_events, shc_decision_history, user_notifications, user_roles)
--     JÁ havia sido revogada após a run das 11:00.
--   • Restavam 7 tabelas com grant de escrita p/ anon. Destas:
--       - 5 têm policies exclusivamente identity-gated (auth.uid()) → anon
--         jamais passa; o grant é peso morto → REVOKE seguro (abaixo).
--       - store_carts/store_cart_items têm fluxo INTENCIONAL de cesta anônima
--         (session_token) → NÃO revogar; registrado como ressalva na
--         homologação com recomendação de scoping por sessão.
--   • get_feature_flags/toggle_feature_flag/consume_cart_add_credit já
--     existem no banco. Faltava get_motor_health() — a view original
--     (20260703_029) depende de 6 tabelas que NÃO existem no banco real
--     (posting_workers, posting_campaigns, posting_dead_letter_queue,
--     distributed_locks, posting_event_log, posting_metrics_daily) →
--     versão defensiva abaixo, computada só com sinais existentes.
-- Idempotente.
-- ============================================================================

-- 1) REVOKE escrita anon — tabelas com policies 100% identity-gated ----------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.advertiser_credit_balances,
     public.advertiser_credit_ledger,
     public.merchant_products,
     public.merchant_stores,
     public.products
  FROM anon;

-- 2) get_motor_health() — versão compatível com o schema real ----------------
--    Sinais disponíveis: posting_lots (fila), campaign_queue/campaign_batches
--    (campanhas), client_errors (erros última hora). Sinais sem tabela no
--    banco retornam NULL e são listados em signals_unavailable.
CREATE OR REPLACE FUNCTION public.get_motor_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  v_lots_available int;
  v_lots_processing int;
  v_lots_posted int;
  v_campaigns_active int;
  v_errors_last_hour int;
  v_score int := 100;
  v_missing text[] := '{}';
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  IF to_regclass('public.posting_lots') IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE status = 'available'),
           count(*) FILTER (WHERE status = 'processing'),
           count(*) FILTER (WHERE status = 'posted')
      INTO v_lots_available, v_lots_processing, v_lots_posted
      FROM public.posting_lots;
  ELSE
    v_missing := v_missing || 'posting_lots';
  END IF;

  IF to_regclass('public.campaign_queue') IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE status IN ('queued','running','posting','waiting'))
      INTO v_campaigns_active
      FROM public.campaign_queue;
  ELSE
    v_missing := v_missing || 'campaign_queue';
  END IF;

  IF to_regclass('public.client_errors') IS NOT NULL THEN
    SELECT count(*) INTO v_errors_last_hour
      FROM public.client_errors
     WHERE created_at >= now() - interval '1 hour';
  ELSE
    v_missing := v_missing || 'client_errors';
  END IF;

  v_score := GREATEST(0, LEAST(100,
    100 - (LEAST(COALESCE(v_errors_last_hour, 0), 10) * 2)));

  v := jsonb_build_object(
    'workers_online',    NULL,
    'workers_offline',   NULL,
    'workers_busy',      NULL,
    'lots_available',    v_lots_available,
    'lots_processing',   v_lots_processing,
    'lots_posted_total', v_lots_posted,
    'campaigns_active',  v_campaigns_active,
    'dlq_failed',        NULL,
    'active_locks',      NULL,
    'errors_last_hour',  v_errors_last_hour,
    'avg_post_ms',       NULL,
    'health_score',      v_score,
    'health_status',     CASE WHEN v_score >= 90 THEN 'excellent'
                              WHEN v_score >= 70 THEN 'good'
                              WHEN v_score >= 50 THEN 'warning'
                              ELSE 'critical' END,
    'signals_unavailable',
      (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM unnest(
        ARRAY['posting_workers','posting_dead_letter_queue','distributed_locks',
              'posting_event_log','posting_metrics_daily'] || v_missing) AS x),
    'checked_at', now()
  );
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_motor_health() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_motor_health() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_motor_health() IS
'Snapshot de saúde do Motor de Postagem (versão compatível com schema real; sinais ausentes = NULL + signals_unavailable). Gate: is_admin().';

-- 3) INV2 (tests/security/db-invariants.sql): funções financeiras/sensíveis
--    SECURITY DEFINER não podem ser executáveis por anon/PUBLIC.
--    • Moderação de viagens: gate interno is_admin(); anon/PUBLIC = defesa
--      em profundidade.
--    • consume_cart_add_credit: alinha ao padrão da irmã
--      consume_product_view_credit (authenticated-only). O call site
--      (useGlobalCart.ts) é fire-and-forget com catch → visitante anônimo
--      simplesmente não gera cobrança; UI intacta.
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_moderate_travel_media(uuid, text, text) FROM PUBLIC, anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.find_travel_media_for_moderation(uuid, uuid, text) FROM PUBLIC, anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_moderate_travel_listing(uuid, text, text) FROM PUBLIC, anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.consume_cart_add_credit(uuid, uuid) FROM PUBLIC, anon';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'função ausente ao revogar (ok em ambientes parciais): %', SQLERRM;
END $$;

-- 4) INV3 (db-invariants): view financeira definer não pode ser legível por
--    anon. Contrato original (20260723/20260727013000): authenticated +
--    service_role. O SELECT de anon era resíduo de grant default.
REVOKE SELECT ON public.auction_commission_effective FROM PUBLIC, anon;

-- 5) INV4 (db-invariants): log_auction_fraud é mutante sem guarda e não tem
--    NENHUM call site no frontend — uso interno via RPCs SECURITY DEFINER
--    (rodam como owner, não precisam de grant anon). anon executável = vetor
--    de spam de alertas de fraude contra usuários arbitrários.
--    (increment_auction_view, o outro apontado, é contador benigno chamado
--    de 3 páginas públicas → vai para a allowlist do próprio invariante.)
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_auction_fraud(uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon';
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'log_auction_fraud ausente (ok em ambientes parciais)';
END $$;

-- 6) Homologação Marketplace/Financeiro — grants de escrita anon residuais.
-- 6a) Tabelas com policies 100% identity/admin-gated → anon nunca passa;
--     grant é peso morto (REVOKE sem impacto funcional).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.commission_overrides, public.credit_purchases,
     public.merchant_whatsapp_groups, public.produtos
  FROM anon;

-- 6b) P0 REAL: tabelas financeiras/config com policy de escrita ABERTA
--     (WITH CHECK true / USING true) + grant anon = visitante podia
--     reescrever saldos de crédito, ledger, pedidos e config de pagamento.
--     Escritas legítimas: RPCs SECURITY DEFINER (bypassam RLS como owner) e
--     painéis autenticados (policies preservadas p/ authenticated —
--     apontadas como ressalva P1 para scoping futuro).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.m1_billing_entries, public.m1_billing_events,
     public.merchant_credit_balances, public.merchant_credit_ledger,
     public.merchant_credit_orders, public.merchant_credit_products,
     public.store_payment_settings
  FROM anon;

-- 6c) Fluxos de visitante INTENCIONAIS (mantidos): store_carts/store_cart_items
--     (cesta anônima via session_token), product_interest_events (analytics),
--     store_followers (seguir loja com visitor_anon_id), discount_requests
--     (DiscountRequestModal é componente público) e purchase_intentions/_items
--     (intenção de compra de visitante). Nesses, revoga-se apenas o que as
--     policies já não permitem a anon (peso morto) ou o que é claramente
--     abusivo (DELETE anônimo).
REVOKE UPDATE, DELETE ON public.discount_requests FROM anon;
REVOKE DELETE ON public.purchase_intentions, public.purchase_intention_items FROM anon;

-- 6d) cart_add_click_events nasceu SEM RLS (migration 20260620). Escrita só
--     acontece dentro de consume_cart_add_credit (SECURITY DEFINER, owner
--     bypassa RLS) → clients não precisam de acesso direto.
ALTER TABLE public.cart_add_click_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cart_add_click_events FROM anon, authenticated;
DROP POLICY IF EXISTS cart_add_click_admin_read ON public.cart_add_click_events;
CREATE POLICY cart_add_click_admin_read ON public.cart_add_click_events
  FOR SELECT TO authenticated USING (public.is_admin());

-- 7) Fecha os P1 de policies de escrita ABERTAS (true) para authenticated ----
-- 7a) m1_billing_events: telemetria de visitante (trackM1Event.ts roda em
--     páginas públicas, fire-and-forget) — restaura INSERT de anon revogado
--     em excesso na seção 6b. UPDATE/DELETE continuam revogados.
GRANT INSERT ON public.m1_billing_events TO anon;

-- 7b) store_payment_settings: ÚNICA das abertas com escrita client-side real
--     (useStorePaymentSettings — painel do lojista salva PIX/banco da própria
--     loja). Substitui policies abertas por escopo dono-da-loja OU admin.
DROP POLICY IF EXISTS sps_insert_all ON public.store_payment_settings;
DROP POLICY IF EXISTS sps_update_all ON public.store_payment_settings;
DROP POLICY IF EXISTS sps_write_owner_admin ON public.store_payment_settings;
CREATE POLICY sps_write_owner_admin ON public.store_payment_settings
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
         OR public.is_admin())
  WITH CHECK (store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
              OR public.is_admin());

-- 7c) merchant_credit_{balances,ledger,orders,products}: ZERO escrita
--     client-side no front (grep 2026-07-27; useMerchantCredits só lê;
--     merchant_credit_orders nem aparece fora do types dump). Escritas
--     legítimas são RPCs SECURITY DEFINER (consume_*) e edge functions
--     (service_role) — ambas bypassam RLS. Policies de escrita viram
--     admin-only; qualquer usuário logado podia reescrever saldo de crédito
--     de qualquer loja (P1 real, agora fechado).
DROP POLICY IF EXISTS mcbal_insert_all ON public.merchant_credit_balances;
DROP POLICY IF EXISTS mcbal_update_all ON public.merchant_credit_balances;
DROP POLICY IF EXISTS mcbal_write_admin ON public.merchant_credit_balances;
CREATE POLICY mcbal_write_admin ON public.merchant_credit_balances
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mcledger_insert_all ON public.merchant_credit_ledger;
DROP POLICY IF EXISTS mcledger_write_admin ON public.merchant_credit_ledger;
CREATE POLICY mcledger_write_admin ON public.merchant_credit_ledger
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mco_insert_all ON public.merchant_credit_orders;
DROP POLICY IF EXISTS mco_update_all ON public.merchant_credit_orders;
DROP POLICY IF EXISTS mco_write_admin ON public.merchant_credit_orders;
CREATE POLICY mco_write_admin ON public.merchant_credit_orders
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mcp_update_all ON public.merchant_credit_products;
DROP POLICY IF EXISTS mcp_insert_admin ON public.merchant_credit_products;
DROP POLICY IF EXISTS mcp_update_admin ON public.merchant_credit_products;
DROP POLICY IF EXISTS mcp_write_admin ON public.merchant_credit_products;
CREATE POLICY mcp_write_admin ON public.merchant_credit_products
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7d) m1_billing_entries: nenhuma escrita client-side (entries ≠ events);
--     gravação legítima via service_role (bypassa RLS). Admin-only.
DROP POLICY IF EXISTS m1_entries_insert_service ON public.m1_billing_entries;
DROP POLICY IF EXISTS m1_entries_write_admin ON public.m1_billing_entries;
CREATE POLICY m1_entries_write_admin ON public.m1_billing_entries
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 8) Fluxos guest: substitui policies TRIVIALMENTE abertas (true) por
--    predicados reais, preservando os fluxos. Motivação: critério do motor
--    shc_run_module_audit — policy de escrita irrestrita p/ anon = P0.
--    Fatos verificados no front (2026-07-27): cesta e checkout usam RPCs
--    SECURITY DEFINER (p_session_token) que bypassam RLS; INSERTs diretos
--    de client existem só em DiscountRequestModal, trackM1Event e
--    trackProductEvent (telemetria fire-and-forget).

-- 8a) store_carts / store_cart_items — escopo por sessão/dono
DROP POLICY IF EXISTS store_carts_insert_all ON public.store_carts;
DROP POLICY IF EXISTS store_carts_guest_insert ON public.store_carts;
CREATE POLICY store_carts_guest_insert ON public.store_carts
  FOR INSERT TO anon, authenticated
  WITH CHECK (session_token IS NOT NULL OR consumer_user_id = auth.uid());
REVOKE DELETE ON public.store_carts FROM anon;

DROP POLICY IF EXISTS store_cart_items_insert_all ON public.store_cart_items;
DROP POLICY IF EXISTS store_cart_items_update_all ON public.store_cart_items;
DROP POLICY IF EXISTS store_cart_items_delete_all ON public.store_cart_items;
DROP POLICY IF EXISTS store_cart_items_session_write ON public.store_cart_items;
CREATE POLICY store_cart_items_session_write ON public.store_cart_items
  FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.store_carts sc WHERE sc.id = cart_id
                 AND (sc.session_token IS NOT NULL OR sc.consumer_user_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.store_carts sc WHERE sc.id = cart_id
                 AND (sc.session_token IS NOT NULL OR sc.consumer_user_id = auth.uid())));

-- 8b) purchase_intentions/_items — INSERT guest exige contato; UPDATE dono da
--     loja ou admin; DELETE admin-only
DROP POLICY IF EXISTS pi_all ON public.purchase_intentions;
DROP POLICY IF EXISTS pi_insert_all ON public.purchase_intentions;
DROP POLICY IF EXISTS pi_guest_insert ON public.purchase_intentions;
DROP POLICY IF EXISTS pi_store_update ON public.purchase_intentions;
DROP POLICY IF EXISTS pi_admin_delete ON public.purchase_intentions;
CREATE POLICY pi_guest_insert ON public.purchase_intentions
  FOR INSERT TO anon, authenticated
  WITH CHECK (store_id IS NOT NULL
              AND (customer_whatsapp IS NOT NULL OR customer_email IS NOT NULL
                   OR auth.uid() IS NOT NULL));
CREATE POLICY pi_store_update ON public.purchase_intentions
  FOR UPDATE TO authenticated
  USING (store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
         OR public.is_admin())
  WITH CHECK (store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
              OR public.is_admin());
CREATE POLICY pi_admin_delete ON public.purchase_intentions
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS pii_all ON public.purchase_intention_items;
DROP POLICY IF EXISTS pii_guest_insert ON public.purchase_intention_items;
DROP POLICY IF EXISTS pii_store_update ON public.purchase_intention_items;
CREATE POLICY pii_guest_insert ON public.purchase_intention_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_intentions pi WHERE pi.id = intention_id));
CREATE POLICY pii_store_update ON public.purchase_intention_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_intentions pi
                 JOIN public.merchant_stores ms ON ms.id = pi.store_id
                 WHERE pi.id = intention_id AND ms.user_id = auth.uid())
         OR public.is_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_intentions pi
                 JOIN public.merchant_stores ms ON ms.id = pi.store_id
                 WHERE pi.id = intention_id AND ms.user_id = auth.uid())
              OR public.is_admin());

-- 8c) Telemetria com INSERT anônimo por design — payload íntegro obrigatório
--     (proteção real contra abuso = rate limiting na borda; RLS garante
--     apenas integridade mínima do evento)
DROP POLICY IF EXISTS product_interest_events_insert_all ON public.product_interest_events;
DROP POLICY IF EXISTS product_interest_events_guest_insert ON public.product_interest_events;
CREATE POLICY product_interest_events_guest_insert ON public.product_interest_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (product_id IS NOT NULL AND event_type IS NOT NULL);
REVOKE UPDATE, DELETE ON public.product_interest_events FROM anon;

DROP POLICY IF EXISTS allow_insert_discount_requests ON public.discount_requests;
DROP POLICY IF EXISTS discount_requests_guest_insert ON public.discount_requests;
CREATE POLICY discount_requests_guest_insert ON public.discount_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (product_id IS NOT NULL AND store_id IS NOT NULL
              AND customer_name IS NOT NULL AND customer_phone IS NOT NULL);

DROP POLICY IF EXISTS m1_events_insert_public ON public.m1_billing_events;
DROP POLICY IF EXISTS m1_events_guest_insert ON public.m1_billing_events;
CREATE POLICY m1_events_guest_insert ON public.m1_billing_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (merchant_store_id IS NOT NULL AND event_type IS NOT NULL
              AND session_id IS NOT NULL);
