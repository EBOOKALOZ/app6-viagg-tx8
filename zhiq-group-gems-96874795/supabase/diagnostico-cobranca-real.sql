-- ============================================================
-- DIAGNÓSTICO — Caminho REAL da cobrança de comissão em produção
-- Projeto: broifhfqmnzqoongtokm · SQL Editor · SOMENTE LEITURA
--
-- O SQL Editor mostra apenas o resultado do ÚLTIMO comando:
-- rode UM BLOCO POR VEZ e cole as 4 saídas.
-- ============================================================

-- BLOCO 1: funções que movimentam dinheiro / usam comissão
SELECT p.proname AS funcao,
       CASE
         WHEN p.prosrc ILIKE '%percentual_comissao%' THEN 'usa comissão'
         WHEN p.prosrc ILIKE '%ledger_entries%'      THEN 'movimenta ledger'
         WHEN p.prosrc ILIKE '%financial_accounts%'  THEN 'mexe em contas'
         ELSE 'net_value'
       END AS pista
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.prosrc ILIKE '%ledger_entries%'
    OR p.prosrc ILIKE '%percentual_comissao%'
    OR p.prosrc ILIKE '%net_value%'
    OR p.prosrc ILIKE '%financial_accounts%')
ORDER BY 1;

-- BLOCO 2: triggers nas tabelas de pedidos/corridas
-- SELECT c.relname AS tabela, t.tgname AS trigger, p.proname AS funcao
-- FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- JOIN pg_proc  p ON p.oid = t.tgfoid
-- WHERE NOT t.tgisinternal
--   AND c.relname IN ('delivery_orders','delivery_offers','rides',
--                     'ride_requests','mototaxi_rides','service_orders')
-- ORDER BY 1, 2;

-- BLOCO 3: colunas reais das tabelas de pedidos (p/ ligar o escrow certo)
-- SELECT table_name,
--        string_agg(column_name, ', ' ORDER BY ordinal_position) AS colunas
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('delivery_orders','delivery_offers','rides',
--                      'ride_requests','service_orders')
-- GROUP BY table_name;

-- BLOCO 4: quais estruturas financeiras existem de verdade
-- SELECT to_regclass('public.ledger_entries')          AS ledger_entries,
--        to_regclass('public.financial_accounts')      AS financial_accounts,
--        to_regclass('public.pay_ledger_entries')      AS pay_ledger_entries,
--        to_regclass('public.pay_financial_accounts')  AS pay_financial_accounts,
--        to_regclass('public.pay_state_transitions')   AS pay_state_transitions;

-- BLOCO 5: código-fonte da cadeia de liquidação (onde o escrow será ligado)
-- SELECT p.proname AS funcao, pg_get_functiondef(p.oid) AS definicao
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'settle_delivery',
--     'settle_delivery_payment',
--     'release_delivery_payment',
--     'process_delivery_financial_split',
--     'complete_service_order',
--     'tg_service_order_reserve_escrow',
--     'credit_pay_motoboy_earning',
--     'calculate_and_set_commission_on_acceptance'
--   )
-- ORDER BY 1;
