-- ============================================================================
-- P0-9 — revogar SELECT de anon em views administrativas/financeiras/internas
--        que rodam com security_invoker=off (contornam RLS)
-- ============================================================================
-- Causa raiz:
--   Dezenas de views com security_invoker=off (executam com privilégios do
--   OWNER, ignorando a RLS das tabelas base) receberam GRANT SELECT para anon.
--   Resultado: qualquer visitante anônimo lê dados administrativos, financeiros
--   e operacionais internos ignorando toda a RLS.
--   Comprovado no banco vivo: anon leu v_admin_lojistas (2 lojistas) e
--   v_support_tickets_admin (6 tickets de suporte com PII). As views
--   financeiras (v_merchant_credit_*, admin_pi2_*_withdrawal/split) retornaram
--   0 apenas porque as tabelas base estão vazias — mesma exposição latente.
--
-- Uso legítimo (verificado no código): todas as views abaixo são consumidas
--   exclusivamente por páginas/hooks ADMIN autenticados (AdminDashboard*,
--   useAdminCourierWallets, useAdminMarketplaceAnalytics, ...) ou não são
--   usadas no front. NENHUMA é consumida por sessão anônima.
--
-- Correção (fail-closed, menor privilégio):
--   REVOKE SELECT de anon nas views sensíveis. As views públicas legítimas do
--   marketplace (public_*, market_all_listings, product_cards_with_link,
--   freight_*_public, trending_products_*, v_credit_packages_active,
--   auction_performance_analytics, delivery_orders_pricing_view) NÃO são
--   tocadas. As de sistema PostGIS (geometry_columns/geography_columns) também
--   não. authenticated é mantido (gate de admin é responsabilidade da rota/UI;
--   endurecer authenticated não-admin é P1 separado).
--
-- Idempotente: REVOKE é no-op se já revogado + guard fail-closed.
-- ============================================================================

BEGIN;

REVOKE SELECT ON public.v_admin_dashboard_geral               FROM anon;
REVOKE SELECT ON public.v_admin_lojistas                      FROM anon;
REVOKE SELECT ON public.v_admin_lojistas_base                 FROM anon;
REVOKE SELECT ON public.v_admin_lojistas_metrics              FROM anon;
REVOKE SELECT ON public.v_admin_sc_cities                     FROM anon;
REVOKE SELECT ON public.admin_city_sales_ranking              FROM anon;
REVOKE SELECT ON public.admin_district_sales_ranking          FROM anon;
REVOKE SELECT ON public.admin_top_products                    FROM anon;
REVOKE SELECT ON public.admin_referral_ranking                FROM anon;
REVOKE SELECT ON public.admin_postador_ranking                FROM anon;
REVOKE SELECT ON public.admin_group_density                   FROM anon;
REVOKE SELECT ON public.admin_real_estate_image_audit         FROM anon;
REVOKE SELECT ON public.admin_campaign_dispatch_panel_view    FROM anon;
REVOKE SELECT ON public.admin_campaign_queue_view             FROM anon;
REVOKE SELECT ON public.admin_pi2_motoboy_split_details       FROM anon;
REVOKE SELECT ON public.admin_pi2_motoboy_withdrawal_details  FROM anon;
REVOKE SELECT ON public.postador_admin_targets_view           FROM anon;

REVOKE SELECT ON public.v_merchant_credit_monthly_results     FROM anon;
REVOKE SELECT ON public.v_merchant_credit_overview            FROM anon;
REVOKE SELECT ON public.v_merchant_credit_purchase_history    FROM anon;
REVOKE SELECT ON public.v_merchant_credit_statement           FROM anon;
REVOKE SELECT ON public.v_my_statement                        FROM anon;
REVOKE SELECT ON public.v_package_sales_daily                 FROM anon;
REVOKE SELECT ON public.v_package_sales_summary               FROM anon;
REVOKE SELECT ON public.merchant_conversion_events_view       FROM anon;
REVOKE SELECT ON public.merchant_purchase_intention_credit_view FROM anon;

REVOKE SELECT ON public.v_support_tickets_admin               FROM anon;

REVOKE SELECT ON public.tmp_audit_comissao                    FROM anon;
REVOKE SELECT ON public.tmp_debug_dispatch                    FROM anon;

-- Operacional interno de postador/motoboy/fila (não-público)
REVOKE SELECT ON public.postador_batch_board                  FROM anon;
REVOKE SELECT ON public.postador_history_by_operator_view     FROM anon;
REVOKE SELECT ON public.postador_history_view                 FROM anon;
REVOKE SELECT ON public.postador_kpis_view                    FROM anon;
REVOKE SELECT ON public.postador_lotes_board                  FROM anon;
REVOKE SELECT ON public.postador_operational_queue_view       FROM anon;
REVOKE SELECT ON public.postador_operator_kpis_view           FROM anon;
REVOKE SELECT ON public.postador_queue_cards_view             FROM anon;
REVOKE SELECT ON public.postador_queue_pending_view           FROM anon;
REVOKE SELECT ON public.motoboy_delivery_offers_view          FROM anon;
REVOKE SELECT ON public.motoboy_posting_candidates_view       FROM anon;
REVOKE SELECT ON public.marketing_product_candidates_view     FROM anon;
REVOKE SELECT ON public.group_hunter_ranking                  FROM anon;
REVOKE SELECT ON public.group_posting_runtime_view            FROM anon;
REVOKE SELECT ON public.territory_group_density               FROM anon;
REVOKE SELECT ON public.territory_sales_heatmap               FROM anon;
REVOKE SELECT ON public.v_campaign_queue_operational          FROM anon;
REVOKE SELECT ON public.v_dashboard_postador                  FROM anon;
REVOKE SELECT ON public.v_delivery_offer_feed                 FROM anon;
REVOKE SELECT ON public.v_fila_hoje                           FROM anon;
REVOKE SELECT ON public.v_grupos_elegiveis                    FROM anon;
REVOKE SELECT ON public.v_store_menu_notification_counts      FROM anon;
REVOKE SELECT ON public.v_produtos_urgencia                   FROM anon;

-- ---------------------------------------------------------------------------
-- Guard fail-closed: as views sensíveis acima não podem reter SELECT p/ anon.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_offender text;
BEGIN
  SELECT g.table_name INTO v_offender
  FROM information_schema.role_table_grants g
  WHERE g.table_schema='public' AND g.grantee='anon' AND g.privilege_type='SELECT'
    AND g.table_name IN (
      'v_admin_dashboard_geral','v_admin_lojistas','v_admin_lojistas_base','v_admin_lojistas_metrics',
      'v_admin_sc_cities','admin_city_sales_ranking','admin_district_sales_ranking','admin_top_products',
      'admin_referral_ranking','admin_postador_ranking','admin_group_density','admin_real_estate_image_audit',
      'admin_campaign_dispatch_panel_view','admin_campaign_queue_view','admin_pi2_motoboy_split_details',
      'admin_pi2_motoboy_withdrawal_details','postador_admin_targets_view','v_merchant_credit_monthly_results',
      'v_merchant_credit_overview','v_merchant_credit_purchase_history','v_merchant_credit_statement',
      'v_my_statement','v_package_sales_daily','v_package_sales_summary','merchant_conversion_events_view',
      'merchant_purchase_intention_credit_view','v_support_tickets_admin','tmp_audit_comissao','tmp_debug_dispatch',
      'postador_batch_board','postador_history_by_operator_view','postador_history_view','postador_kpis_view',
      'postador_lotes_board','postador_operational_queue_view','postador_operator_kpis_view','postador_queue_cards_view',
      'postador_queue_pending_view','motoboy_delivery_offers_view','motoboy_posting_candidates_view',
      'marketing_product_candidates_view','group_hunter_ranking','group_posting_runtime_view',
      'territory_group_density','territory_sales_heatmap','v_campaign_queue_operational','v_dashboard_postador',
      'v_delivery_offer_feed','v_fila_hoje','v_grupos_elegiveis','v_store_menu_notification_counts','v_produtos_urgencia'
    )
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-9: view sensível ainda concede SELECT a anon: %', v_offender;
  END IF;
END $$;

COMMIT;
