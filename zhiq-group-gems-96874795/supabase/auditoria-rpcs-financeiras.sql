-- ============================================================
-- AUDITORIA — RPCs financeiras × tabelas legadas
-- Projeto: broifhfqmnzqoongtokm · SQL Editor · SOMENTE LEITURA
--
-- Surface real de risco de "relation ... does not exist":
-- uma função só quebra se referencia uma tabela que NÃO existe.
-- Rode UM BLOCO POR VEZ (o editor mostra só o último resultado).
-- ============================================================

-- BLOCO A: as 4 tabelas legadas existem neste banco?
-- (se existe=true, nenhuma função que a usa precisa de correção)
SELECT t.tbl AS tabela_legada,
       (to_regclass('public.'||t.tbl) IS NOT NULL) AS existe_no_banco
FROM (VALUES
  ('merchant_wallets'),
  ('merchant_wallet_transactions'),
  ('merchant_credit_balances'),
  ('merchant_credit_ledger')
) AS t(tbl)
ORDER BY 1;

-- BLOCO B: matriz função × tabela legada × existência × RISCO
-- risco = a função referencia a tabela E a tabela não existe.
-- SELECT p.proname AS funcao,
--        l.tbl     AS tabela_legada,
--        (to_regclass('public.'||l.tbl) IS NOT NULL) AS tabela_existe,
--        (to_regclass('public.'||l.tbl) IS NULL)     AS QUEBRA
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
-- JOIN (VALUES
--   ('merchant_wallets'),
--   ('merchant_wallet_transactions'),
--   ('merchant_credit_balances'),
--   ('merchant_credit_ledger')
-- ) AS l(tbl) ON p.prosrc ILIKE '%'||l.tbl||'%'
-- ORDER BY QUEBRA DESC, p.proname, l.tbl;

-- BLOCO C: SÓ o que realmente quebra (referencia tabela inexistente)
-- Se retornar VAZIO → módulo financeiro 100% imune a esse erro.
-- SELECT DISTINCT p.proname AS funcao_que_precisa_correcao,
--        l.tbl AS tabela_inexistente
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
-- JOIN (VALUES
--   ('merchant_wallets'),
--   ('merchant_wallet_transactions'),
--   ('merchant_credit_balances'),
--   ('merchant_credit_ledger')
-- ) AS l(tbl) ON p.prosrc ILIKE '%'||l.tbl||'%'
-- WHERE to_regclass('public.'||l.tbl) IS NULL
-- ORDER BY 1, 2;

-- BLOCO D: código-fonte das funções sinalizadas no BLOCO C
-- (troque a lista pelos nomes que o C retornar; cole aqui p/ eu blindar)
-- SELECT p.proname, pg_get_functiondef(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('admin_get_global_finances','admin_list_merchant_balances')
-- ORDER BY 1;
