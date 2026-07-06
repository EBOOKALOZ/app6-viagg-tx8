-- ============================================================
-- DIAGNÓSTICO — RLS de credit_purchases (P1 parte 2/2)
-- SOMENTE LEITURA. Rode UM BLOCO POR VEZ.
-- Objetivo: ver policies atuais + coluna de dono, para endurecer
-- sem quebrar o polling do checkout.
-- ============================================================

-- BLOCO 1: policies atuais (procuramos USING(true) permissivas)
SELECT policyname, cmd, permissive, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='credit_purchases'
ORDER BY cmd, policyname;

-- BLOCO 2: RLS está ligada? E qual a coluna de dono?
-- SELECT
--   (SELECT relrowsecurity FROM pg_class WHERE oid='public.credit_purchases'::regclass) AS rls_ligada,
--   string_agg(column_name, ', ') FILTER (
--     WHERE column_name IN ('user_id','owner_user_id','buyer_user_id','merchant_id')
--   ) AS colunas_de_dono
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='credit_purchases';

-- BLOCO 3: grants de tabela (anon/authenticated podem UPDATE direto?)
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='credit_purchases'
--   AND grantee IN ('anon','authenticated')
-- ORDER BY 1,2;
