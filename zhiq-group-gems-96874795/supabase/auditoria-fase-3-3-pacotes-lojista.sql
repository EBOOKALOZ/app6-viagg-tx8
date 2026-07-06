-- ============================================================
-- AUDITORIA FASE 3.3 — Pacotes para Lojistas × arquitetura oficial
-- Projeto: broifhfqmnzqoongtokm · SQL Editor · SOMENTE LEITURA
--
-- Reaproveita o padrão homologado na 3.1/3.2:
--   R$  → pay_payment_orders / pay_ledger_entries / platform_main
--   créditos → merchant_credit_balances / merchant_credit_ledger
--
-- Rode UM BLOCO POR VEZ. Ajuste nomes conforme o BLOCO 0.
-- ============================================================

-- BLOCO 0: tabelas do circuito de lojista que existem
SELECT t.tbl AS tabela, (to_regclass('public.'||t.tbl) IS NOT NULL) AS existe
FROM (VALUES
  ('credit_purchases'),
  ('merchant_credit_balances'),
  ('merchant_credit_ledger'),
  ('merchant_credit_subscriptions'),
  ('merchant_credit_packages'),
  ('pay_payment_orders'),
  ('pay_ledger_entries'),
  ('pay_financial_accounts')
) AS t(tbl) ORDER BY 1;

-- BLOCO 1: RLS das tabelas de crédito do lojista (procurar USING(true))
-- SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
-- FROM pg_policies
-- WHERE schemaname='public'
--   AND tablename IN ('credit_purchases','merchant_credit_balances',
--                     'merchant_credit_ledger','merchant_credit_subscriptions')
-- ORDER BY tablename, cmd;

-- BLOCO 2: GRANTs das RPCs de compra/consumo/concessão do lojista
-- (procurar anon/authenticated em funções que concedem/debitam crédito)
-- SELECT p.proname, r.rolname AS pode_executar
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
-- CROSS JOIN LATERAL aclexplode(p.proacl) a
-- JOIN pg_roles r ON r.oid=a.grantee
-- WHERE a.privilege_type='EXECUTE'
--   AND p.proname IN ('confirm_credit_purchase','ensure_merchant_credit_balance',
--     'consume_cart_add_credit','consume_product_view_credit',
--     'consume_purchase_intention_credit','unlock_whatsapp_contact',
--     'accept_offer_with_credits')
-- ORDER BY 1,2;

-- BLOCO 3: CRÉDITO SEM LANÇAMENTO — saldo vs ledger de créditos
-- Soma dos créditos concedidos/consumidos no ledger deve conciliar
-- com o saldo. Divergência = alteração de saldo sem registro.
-- SELECT b.store_id,
--        b.available_credits,
--        COALESCE(SUM(CASE WHEN l.entry_type ILIKE '%purchase%' OR l.amount>0 THEN l.amount ELSE 0 END),0) AS creditado,
--        COALESCE(SUM(CASE WHEN l.amount<0 THEN -l.amount ELSE 0 END),0) AS consumido
-- FROM public.merchant_credit_balances b
-- LEFT JOIN public.merchant_credit_ledger l ON l.store_id = b.store_id
-- GROUP BY b.store_id, b.available_credits
-- HAVING b.available_credits <> COALESCE(SUM(l.amount),0)   -- ajustar sinal conforme schema real
-- ORDER BY 1;

-- BLOCO 4: COMPRAS DE PACOTE PAGAS SEM LEDGER FINANCEIRO (R$)
-- (mesmo teste da 3.2, restrito a grant_kind=merchant)
-- SELECT o.id AS order_id, o.amount, o.status, o.created_at
-- FROM public.pay_payment_orders o
-- WHERE o.status='paid'
--   AND o.metadata->>'grant_kind' = 'merchant'
--   AND NOT EXISTS (SELECT 1 FROM public.pay_ledger_entries le
--                   WHERE le.reference_type='payment_order' AND le.reference_id=o.id)
-- ORDER BY o.created_at DESC;

-- BLOCO 5: CRÉDITO DE PACOTE CONCEDIDO SEM PAGAMENTO
-- (credit_purchases paid sem ordem paga correspondente)
-- SELECT cp.id, cp.store_id, cp.amount, cp.status, cp.created_at
-- FROM public.credit_purchases cp
-- WHERE cp.status='paid'
--   AND NOT EXISTS (SELECT 1 FROM public.pay_payment_orders o
--                   WHERE o.status='paid'
--                     AND (o.metadata->>'credit_purchase_id') = cp.id::text)
-- ORDER BY cp.created_at DESC;

-- BLOCO 6: assinaturas vencidas ainda ativas (higiene de ciclo de vida)
-- SELECT id, store_id, status, current_period_end
-- FROM public.merchant_credit_subscriptions
-- WHERE status IN ('active','trialing')
--   AND current_period_end < now()
-- ORDER BY current_period_end;
