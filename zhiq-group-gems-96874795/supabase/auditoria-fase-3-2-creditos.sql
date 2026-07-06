-- ============================================================
-- AUDITORIA FASE 3.2 — Compra de créditos × tesouraria oficial
-- Projeto: broifhfqmnzqoongtokm · SQL Editor · SOMENTE LEITURA
--
-- Fluxo real (confirmado por leitura de código):
--   checkout → pay_create_payment_order (pay_payment_orders, pending)
--   → MP → pay_webhook_apply_event:
--        · pay_create_ledger_entry(target=platform_main)  [R$ → pay_ledger_entries]
--        · pay_grant_legacy(order_id)  [pontos → *_credit_balances/*_credit_ledger]
--   Idempotência: pay_payment_events UNIQUE(provider,event_id) + order idempotency_key
--
-- Objetivo: medir as pendências reais. Rode UM BLOCO POR VEZ.
-- ============================================================

-- BLOCO 0: tabelas do circuito que existem neste banco
SELECT t.tbl AS tabela, (to_regclass('public.'||t.tbl) IS NOT NULL) AS existe
FROM (VALUES
  ('pay_payment_orders'), ('pay_payment_events'), ('pay_ledger_entries'),
  ('pay_financial_accounts'),
  ('credit_purchases'),
  ('real_estate_credit_purchases'), ('vehicle_credit_purchases'),
  ('service_credit_purchases'), ('freight_credit_purchases'),
  ('travel_credit_purchases'), ('advertiser_credit_purchases'),
  ('merchant_credit_balances'), ('merchant_credit_ledger')
) AS t(tbl) ORDER BY 1;

-- BLOCO 1: a tesouraria oficial existe e qual o saldo?
-- SELECT id, available_balance, reserved_balance, pending_balance
-- FROM public.pay_financial_accounts
-- WHERE owner_type='platform' AND account_type='platform_main';

-- BLOCO 2: ordens de pagamento por status e destino de conta
-- (grant_kind = módulo; account_type revela se o R$ foi p/ platform_main)
-- SELECT o.status,
--        (o.metadata->>'grant_kind')       AS grant_kind,
--        fa.account_type                    AS conta_destino,
--        COUNT(*)                           AS qtd,
--        ROUND(SUM(o.amount),2)             AS total_reais
-- FROM public.pay_payment_orders o
-- LEFT JOIN public.pay_financial_accounts fa ON fa.id = o.target_account_id
-- GROUP BY 1,2,3 ORDER BY 4 DESC;

-- BLOCO 3 (CRÍTICO): ordens PAGAS SEM lançamento no ledger financeiro
-- Deve retornar ZERO. Qualquer linha = R$ confirmado mas não contabilizado.
-- SELECT o.id AS order_id, o.status, o.amount, o.metadata->>'grant_kind' AS modulo, o.created_at
-- FROM public.pay_payment_orders o
-- WHERE o.status = 'paid'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.pay_ledger_entries le
--     WHERE le.reference_type = 'payment_order' AND le.reference_id = o.id
--   )
-- ORDER BY o.created_at DESC;

-- BLOCO 4 (CRÍTICO): ordens pagas cujo R$ NÃO caiu em platform_main
-- (foi p/ merchant_wallet por account_type ausente no checkout).
-- Deve retornar ZERO para compras de crédito de módulo.
-- SELECT o.id, o.metadata->>'grant_kind' AS modulo, fa.owner_type, fa.account_type,
--        o.amount, o.created_at
-- FROM public.pay_payment_orders o
-- JOIN public.pay_financial_accounts fa ON fa.id = o.target_account_id
-- WHERE o.status='paid'
--   AND o.metadata->>'grant_kind' IN ('merchant','advertiser','advertiser_credit',
--       'real_estate','vehicle','service','freight','travel')
--   AND NOT (fa.owner_type='platform' AND fa.account_type='platform_main')
-- ORDER BY o.created_at DESC;

-- BLOCO 5: CRÉDITO CONCEDIDO SEM PAGAMENTO (bypass do webhook)
-- Compras marcadas 'paid' cujo grant NÃO tem ordem paga correspondente.
-- Troque a tabela pela vertical desejada (repita p/ cada uma que existir no B0).
-- Exemplo travel:
-- SELECT tcp.id, tcp.amount_brl, tcp.paid_at
-- FROM public.travel_credit_purchases tcp
-- WHERE tcp.payment_status = 'paid'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.pay_payment_orders o
--     WHERE o.status='paid'
--       AND (o.metadata->>'travel_purchase_id') = tcp.id::text
--   );
-- Merchant legado (credit_purchases):
-- SELECT cp.id, cp.amount_cents, cp.created_at
-- FROM public.credit_purchases cp
-- WHERE cp.status='paid'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.pay_payment_orders o
--     WHERE o.status='paid' AND (o.metadata->>'credit_purchase_id') = cp.id::text
--   );

-- BLOCO 6: IDEMPOTÊNCIA — mesma ordem gerando 2+ créditos financeiros
-- Deve retornar ZERO (recharge:<id>:in é único por ordem).
-- SELECT le.reference_id, COUNT(*) AS lancamentos_in
-- FROM public.pay_ledger_entries le
-- WHERE le.reference_type='payment_order' AND le.entry_type='payment_in'
-- GROUP BY le.reference_id HAVING COUNT(*) > 1
-- ORDER BY 2 DESC;

-- BLOCO 7: SEGURANÇA — quem pode executar confirm_credit_purchase?
-- (risco: authenticated concede crédito + marca paid sem R$)
-- SELECT p.proname, r.rolname AS pode_executar
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
-- CROSS JOIN LATERAL aclexplode(p.proacl) a
-- JOIN pg_roles r ON r.oid = a.grantee
-- WHERE p.proname IN ('confirm_credit_purchase','pay_grant_legacy','pay_process_credit_purchase')
--   AND a.privilege_type='EXECUTE'
-- ORDER BY 1,2;
