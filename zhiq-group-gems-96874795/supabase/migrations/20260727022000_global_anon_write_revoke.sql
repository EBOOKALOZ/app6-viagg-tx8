-- ============================================================================
-- PLATAFORMA — VARREDURA GLOBAL: revogação de escrita anônima (SHC v2.0)
-- Achado da rodada de homologação 2026-07-27: ~50 tabelas de negócio com
-- grants default INSERT/UPDATE/DELETE para anon (RLS como única barreira).
-- Contrato SHC: anon nunca tem privilégio de escrita, salvo quando existe
-- policy de escrita explícita para anon/public (fluxos de lead de visitante),
-- que esta varredura PRESERVA automaticamente.
-- TRUNCATE/REFERENCES/TRIGGER são revogados de anon SEM exceção.
-- Também endurece os default privileges para tabelas futuras.
-- Idempotente.
-- ============================================================================

-- 1) Revoga INSERT/UPDATE/DELETE de anon onde NÃO há policy de escrita anon/public
DO $$
DECLARE r record; v_cnt int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                    WHERE g.table_schema='public' AND g.table_name=c.relname
                      AND g.grantee='anon'
                      AND g.privilege_type IN ('INSERT','UPDATE','DELETE'))
       AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname='public' AND p.tablename=c.relname
                          AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
                          AND (p.roles && ARRAY['anon','public']::name[]))
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', r.relname);
    v_cnt := v_cnt + 1;
  END LOOP;
  RAISE NOTICE 'Tabelas com escrita anon revogada: %', v_cnt;
END $$;

-- 2) TRUNCATE/REFERENCES/TRIGGER: nunca legítimos para anon — revoga em tudo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT g.table_name
      FROM information_schema.role_table_grants g
     WHERE g.table_schema='public' AND g.grantee='anon'
       AND g.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', r.table_name);
  END LOOP;
END $$;

-- 3) Tabelas futuras nascem sem escrita anon (role atual do deploy)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;
