-- ============================================================================
-- SHC v2.0 — LOCKDOWN DE SEGURANÇA DAS TABELAS shc_* (BUG-02 · P0)
-- Auditoria 2026-07-26: shc_runs/shc_tests/shc_certificates/shc_logs estavam
-- com RLS DESLIGADO e anon com INSERT/UPDATE/DELETE/TRUNCATE — qualquer
-- visitante podia forjar/apagar o histórico de certificação.
--
-- Contrato pós-migration:
--   • RLS habilitado nas 6 tabelas shc_*.
--   • anon: SELECT apenas em shc_modules e shc_runs (o gate verify-shc.mjs
--     em CI lê essas duas com a anon key). Nenhuma escrita.
--   • authenticated: SELECT em todas; escrita SOMENTE via is_admin().
--   • service_role: bypassa RLS (comportamento padrão do Supabase).
-- Idempotente: pode ser reaplicada sem efeito colateral.
-- ============================================================================

-- 1) RLS ON em todas as tabelas SHC -----------------------------------------
ALTER TABLE public.shc_modules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_corrections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_tests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_logs         ENABLE ROW LEVEL SECURITY;

-- 2) Revogar TODA escrita de anon e authenticated (escrita volta só por policy
--    + grant mínimo). TRUNCATE/REFERENCES/TRIGGER nunca são necessários a client.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.shc_modules, public.shc_corrections, public.shc_runs,
     public.shc_tests, public.shc_certificates, public.shc_logs
  FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.shc_modules, public.shc_corrections, public.shc_runs,
     public.shc_tests, public.shc_certificates, public.shc_logs
  FROM authenticated;

-- anon não lê tabelas de evidência interna (só modules/runs, exigidos pelo gate)
REVOKE SELECT ON public.shc_tests, public.shc_certificates,
                 public.shc_logs, public.shc_corrections FROM anon;

-- 3) Policies de leitura -----------------------------------------------------
-- shc_modules já possui "Public read access for SHC tables" (SELECT public).
-- shc_runs: leitura pública (gate CI usa anon key).
DROP POLICY IF EXISTS shc_runs_read ON public.shc_runs;
CREATE POLICY shc_runs_read ON public.shc_runs
  FOR SELECT USING (true);

-- Demais tabelas: leitura apenas autenticada.
DROP POLICY IF EXISTS shc_tests_read ON public.shc_tests;
CREATE POLICY shc_tests_read ON public.shc_tests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS shc_certificates_read ON public.shc_certificates;
CREATE POLICY shc_certificates_read ON public.shc_certificates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS shc_logs_read ON public.shc_logs;
CREATE POLICY shc_logs_read ON public.shc_logs
  FOR SELECT TO authenticated USING (true);

-- 4) Policies de escrita — SOMENTE admin (is_admin() é SECURITY DEFINER) -----
DROP POLICY IF EXISTS shc_modules_admin_write ON public.shc_modules;
CREATE POLICY shc_modules_admin_write ON public.shc_modules
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_corrections_admin_write ON public.shc_corrections;
CREATE POLICY shc_corrections_admin_write ON public.shc_corrections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_runs_admin_write ON public.shc_runs;
CREATE POLICY shc_runs_admin_write ON public.shc_runs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_tests_admin_write ON public.shc_tests;
CREATE POLICY shc_tests_admin_write ON public.shc_tests
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_certificates_admin_write ON public.shc_certificates;
CREATE POLICY shc_certificates_admin_write ON public.shc_certificates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_logs_admin_write ON public.shc_logs;
CREATE POLICY shc_logs_admin_write ON public.shc_logs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5) Higiene de dados: encerra runs zumbis (travadas em 'running' há mais de
--    1 hora) para o gate e os dashboards refletirem a realidade.
UPDATE public.shc_runs
   SET status = 'error',
       result = 'error'
 WHERE status = 'running'
   AND created_at < now() - interval '1 hour';
