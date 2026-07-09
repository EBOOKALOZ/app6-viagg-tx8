-- ════════════════════════════════════════════════════════════════════════
-- AUDITORIA PGRST202 — professional_request_payout
-- SQL Editor (broifhfqmnzqoongtokm). Rodar na ordem.
-- ════════════════════════════════════════════════════════════════════════

-- ─── P1. A função EXISTE? Assinatura EXATA registrada no banco ────────────
-- Esperado (se a migration rodou):
--   schema  = public
--   nome    = professional_request_payout
--   args    = p_amount numeric, p_environment text DEFAULT 'sandbox'::text,
--             p_profile_hint text DEFAULT NULL::text,
--             p_metadata jsonb DEFAULT '{}'::jsonb
--   retorno = jsonb
-- Se vier VAZIO → a função NÃO existe → migration não foi aplicada (ver P3).
SELECT n.nspname                                   AS schema,
       p.proname                                   AS nome,
       pg_get_function_identity_arguments(p.oid)   AS parametros,
       pg_get_function_arguments(p.oid)            AS parametros_com_defaults,
       pg_get_function_result(p.oid)               AS retorno
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.proname = 'professional_request_payout';

-- ─── P1b. Detalhes de segurança da função (OWNER / SECURITY / GRANTs) ─────
-- Esperado: security = SECURITY DEFINER; acl contendo authenticated e
-- service_role com EXECUTE (=X); sem 'anon'.
SELECT p.proname                                        AS nome,
       pg_get_userbyid(p.proowner)                      AS owner,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
       p.proacl::text                                   AS grants_acl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'professional_request_payout';

-- ─── P2. Se P1 retornou a função: forçar reload do schema cache ───────────
-- (No Supabase o cache do PostgREST recarrega em DDL, mas pode atrasar.
--  Este NOTIFY força o reload imediato. Depois, teste o Sacar de novo.)
NOTIFY pgrst, 'reload schema';

-- ─── P3. Se P1 veio VAZIO: a migration 20260708_professional_request_payout
--         .sql NÃO foi aplicada neste banco. Causa típica: o arquivo é novo
--         no repositório e precisa ser colado/rodado MANUALMENTE no SQL
--         Editor (nunca db push). Correção definitiva: rodar o arquivo
--         INTEIRO agora e então repetir P1 (deve retornar a assinatura) e
--         P2 (reload).
--
-- Conferência auxiliar: quais funções 'payout' existem hoje no banco?
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname ILIKE '%payout%'
 ORDER BY p.proname;
