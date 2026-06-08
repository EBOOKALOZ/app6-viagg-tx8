-- ============================================================
-- RESET: Zera todo o sistema de créditos / compras de pacote
-- Para iniciar testes do zero. Mantém lojas e cadastros.
-- ============================================================
-- Execute no Supabase SQL Editor (Project > SQL Editor > New query)
-- Confira os SELECTs de contagem antes e depois.

BEGIN;

-- Snapshot antes
SELECT 'credit_purchases'      AS tabela, COUNT(*) AS antes FROM credit_purchases
UNION ALL
SELECT 'merchant_credit_ledger',         COUNT(*) FROM merchant_credit_ledger
UNION ALL
SELECT 'merchant_credit_balances',       COUNT(*) FROM merchant_credit_balances;

-- 1) Histórico de compras de pacotes (dinheiro recebido)
DELETE FROM credit_purchases;

-- 2) Histórico do razão de créditos (créditos / débitos)
DELETE FROM merchant_credit_ledger;

-- 3) Saldo em carteira de todas as lojas
-- Opção A: apagar linhas (lojas voltam a ter saldo "ausente"=0)
DELETE FROM merchant_credit_balances;

-- Opção B (alternativa): manter linhas e zerar valores.
-- Comente o DELETE acima e descomente o UPDATE abaixo caso prefira:
-- UPDATE merchant_credit_balances
--   SET available_credits = 0,
--       reserved_credits  = 0,
--       last_movement_at  = NULL,
--       updated_at        = NOW();

-- Conferência depois
SELECT 'credit_purchases'      AS tabela, COUNT(*) AS depois FROM credit_purchases
UNION ALL
SELECT 'merchant_credit_ledger',         COUNT(*) FROM merchant_credit_ledger
UNION ALL
SELECT 'merchant_credit_balances',       COUNT(*) FROM merchant_credit_balances;

COMMIT;
-- Se algo parecer errado, troque COMMIT por ROLLBACK e rode de novo.
