-- ============================================================
-- TESTE ETAPA 2 (Fase 3.3-fix) — harness de evidência do lojista
-- Projeto: broifhfqmnzqoongtokm · SQL Editor · SOMENTE LEITURA
--
-- Uso: pegue o store_id da loja de teste (BLOCO 0), depois rode o
-- SNAPSHOT (BLOCO 1) ANTES e DEPOIS de cada ação no app (compra,
-- consumo). Compare os números. O BLOCO 2 confere a consistência
-- saldo × ledger. Nada aqui altera dados.
-- ============================================================

-- BLOCO 0: achar a loja de teste (troque o filtro conforme seu caso)
SELECT ms.id AS store_id, ms.nome_loja, ms.user_id, p.email
FROM public.merchant_stores ms
LEFT JOIN public.profiles p ON p.id = ms.user_id
ORDER BY ms.created_at DESC
LIMIT 10;

-- BLOCO 1: SNAPSHOT do saldo + últimos lançamentos (rode antes/depois)
-- Substitua :STORE por um store_id do BLOCO 0.
-- SELECT
--   b.available_credits, b.consumed_credits, b.reserved_credits, b.updated_at,
--   (SELECT COUNT(*) FROM public.merchant_credit_ledger l WHERE l.store_id = b.store_id) AS ledger_rows,
--   (SELECT jsonb_agg(x) FROM (
--       SELECT entry_type, amount, balance_before, balance_after, reason_code, created_at
--       FROM public.merchant_credit_ledger l
--       WHERE l.store_id = b.store_id
--       ORDER BY created_at DESC LIMIT 5
--    ) x) AS ultimos_5_lancamentos
-- FROM public.merchant_credit_balances b
-- WHERE b.store_id = ':STORE';

-- BLOCO 2: CONSISTÊNCIA saldo × ledger (invariante: o saldo atual deve
-- ser igual ao balance_after do último lançamento). Divergência = saldo
-- alterado sem registro no ledger (violação do invariante da 3.1/3.2).
-- SELECT
--   b.store_id, b.available_credits,
--   l.balance_after AS ultimo_ledger_balance_after,
--   (b.available_credits = l.balance_after) AS consistente
-- FROM public.merchant_credit_balances b
-- LEFT JOIN LATERAL (
--   SELECT balance_after FROM public.merchant_credit_ledger
--   WHERE store_id = b.store_id ORDER BY created_at DESC LIMIT 1
-- ) l ON true
-- WHERE b.store_id = ':STORE';

-- BLOCO 3: rastro FINANCEIRO da compra (R$ → platform_main)
-- Substitua :ORDER pelo id da pay_payment_orders gerada na compra.
-- SELECT o.id AS order_id, o.status, o.amount, o.metadata->>'grant_kind' AS modulo,
--        le.entry_type, le.amount AS ledger_amount, fa.owner_type, fa.account_type
-- FROM public.pay_payment_orders o
-- LEFT JOIN public.pay_ledger_entries le
--        ON le.reference_type='payment_order' AND le.reference_id = o.id
-- LEFT JOIN public.pay_financial_accounts fa ON fa.id = o.target_account_id
-- WHERE o.id = ':ORDER';

-- BLOCO 4 (ETAPA 5 — CASO NEGATIVO): pagamento NÃO aprovado não pode
-- ter concedido crédito nem lançado R$. Substitua :ORDER pela ordem
-- do pagamento cancelado/expirado/rejeitado. Todas as contagens = 0.
-- SELECT
--   o.id AS order_id, o.status AS order_status, o.metadata->>'mp_status' AS mp_status,
--   (SELECT COUNT(*) FROM public.pay_ledger_entries le
--      WHERE le.reference_type='payment_order' AND le.reference_id=o.id) AS ledger_financeiro,
--   (SELECT COUNT(*) FROM public.credit_purchases cp
--      WHERE (o.metadata->>'credit_purchase_id') = cp.id::text AND cp.status='paid') AS compra_marcada_paga,
--   (SELECT COUNT(*) FROM public.merchant_credit_ledger l
--      WHERE l.metadata->>'order_id' = o.id::text) AS ledger_credito
-- FROM public.pay_payment_orders o
-- WHERE o.id = ':ORDER';
-- Esperado p/ pagamento não aprovado: ledger_financeiro=0, compra_marcada_paga=0, ledger_credito=0.
