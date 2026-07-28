-- ============================================================================
-- ASHC — HARDENING PÓS-AUDITORIA TÉCNICA COMPLETA (2026-07-27)
-- Correções P1/P2 de banco identificadas na auditoria ASHC:
--   1) Índices ausentes em TODAS as FKs shc_* e filtros frequentes
--   2) Triggers de updated_at (colunas existiam mas nunca eram atualizadas)
--   3) Higiene: 40 runs legados com result preso em 'running' (status já final)
--   4) CHECK de domínio para shc_runs.status / shc_tests.status (colunas TEXT
--      sem origem versionada e sem constraint)
--   5) RLS: remove policies legadas redundantes "Public read access ..." e
--      fecha SELECT anônimo em shc_decision_history (não há consumidor anon;
--      o gate de build usa apenas shc_modules + shc_runs, que permanecem
--      legíveis por anon por design)
--   6) Realtime: adiciona as 5 tabelas assinadas pelo painel à publication
--      supabase_realtime (antes só shc_decision_history publicava — nenhum
--      evento chegava ao front)
-- Idempotente: pode ser reexecutada sem efeito colateral.
-- ============================================================================

BEGIN;

-- ── 1) Índices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shc_runs_module_id        ON public.shc_runs (module_id);
CREATE INDEX IF NOT EXISTS idx_shc_runs_status           ON public.shc_runs (status);
CREATE INDEX IF NOT EXISTS idx_shc_runs_created_at       ON public.shc_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shc_tests_run_id          ON public.shc_tests (run_id);
CREATE INDEX IF NOT EXISTS idx_shc_logs_run_id           ON public.shc_logs (run_id);
CREATE INDEX IF NOT EXISTS idx_shc_logs_module_id        ON public.shc_logs (module_id);
CREATE INDEX IF NOT EXISTS idx_shc_corrections_run_id    ON public.shc_corrections (run_id);
CREATE INDEX IF NOT EXISTS idx_shc_corrections_test_id   ON public.shc_corrections (test_id);
CREATE INDEX IF NOT EXISTS idx_shc_corrections_module_id ON public.shc_corrections (module_id);
CREATE INDEX IF NOT EXISTS idx_shc_corrections_status    ON public.shc_corrections (status);
CREATE INDEX IF NOT EXISTS idx_shc_certificates_run_id   ON public.shc_certificates (run_id);
CREATE INDEX IF NOT EXISTS idx_shc_certificates_module_id ON public.shc_certificates (module_id);
CREATE INDEX IF NOT EXISTS idx_shc_modules_status        ON public.shc_modules (status);

-- ── 2) Trigger updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shc_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shc_modules_touch     ON public.shc_modules;
DROP TRIGGER IF EXISTS trg_shc_runs_touch        ON public.shc_runs;
DROP TRIGGER IF EXISTS trg_shc_corrections_touch ON public.shc_corrections;

CREATE TRIGGER trg_shc_modules_touch     BEFORE UPDATE ON public.shc_modules     FOR EACH ROW EXECUTE FUNCTION public.shc_touch_updated_at();
CREATE TRIGGER trg_shc_runs_touch        BEFORE UPDATE ON public.shc_runs        FOR EACH ROW EXECUTE FUNCTION public.shc_touch_updated_at();
CREATE TRIGGER trg_shc_corrections_touch BEFORE UPDATE ON public.shc_corrections FOR EACH ROW EXECUTE FUNCTION public.shc_touch_updated_at();

-- ── 3) Higiene: runs legados do engine client-side com result órfão ─────────
-- 40 linhas (26/07 e antes) ficaram com result='running' apesar de status
-- final ('passed'/'failed'/'error'): o engine antigo atualizava só `status`.
-- Restrito por data para não tocar execuções concorrentes recentes.
UPDATE public.shc_runs
   SET result = status::public.shc_status
 WHERE result = 'running'::public.shc_status
   AND status IN ('passed', 'failed', 'error')
   AND created_at < '2026-07-27T00:00:00Z';

-- ── 4) CHECK de domínio (colunas TEXT sem constraint) ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shc_runs_status_domain') THEN
    ALTER TABLE public.shc_runs
      ADD CONSTRAINT shc_runs_status_domain
      CHECK (status IN ('pending', 'running', 'passed', 'failed', 'error')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shc_tests_status_domain') THEN
    ALTER TABLE public.shc_tests
      ADD CONSTRAINT shc_tests_status_domain
      CHECK (status IS NULL OR status IN ('pending', 'running', 'passed', 'failed', 'warning')) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.shc_runs  VALIDATE CONSTRAINT shc_runs_status_domain;
ALTER TABLE public.shc_tests VALIDATE CONSTRAINT shc_tests_status_domain;

-- ── 5) RLS: remove duplicatas legadas e fecha anon onde não há consumidor ───
-- Tabelas SEM leitura anônima legítima (o anon nem tem GRANT — policies eram
-- letra morta, mas confundem auditoria):
DROP POLICY IF EXISTS "Public read access for SHC certs"       ON public.shc_certificates;
DROP POLICY IF EXISTS "Public read access for SHC corrections" ON public.shc_corrections;
DROP POLICY IF EXISTS "Public read access for SHC audits"      ON public.shc_logs;
DROP POLICY IF EXISTS "Public read access for SHC results"     ON public.shc_tests;

-- shc_runs: mantém UMA policy de leitura pública (gate de build usa anon key)
DROP POLICY IF EXISTS "Public read access for SHC runs" ON public.shc_runs;
-- (shc_runs_read permanece: SELECT USING (true) — exigida pelo verify-shc.mjs)

-- shc_modules: normaliza o nome da policy de leitura (gate também lê)
DROP POLICY IF EXISTS "Public read access for SHC tables" ON public.shc_modules;
DROP POLICY IF EXISTS shc_modules_read ON public.shc_modules;
CREATE POLICY shc_modules_read ON public.shc_modules FOR SELECT USING (true);

-- shc_decision_history: histórico de decisão não é dado público
REVOKE SELECT ON public.shc_decision_history FROM anon;
DROP POLICY IF EXISTS shc_decision_history_read ON public.shc_decision_history;
CREATE POLICY shc_decision_history_read ON public.shc_decision_history
  FOR SELECT TO authenticated USING (true);

-- ── 6) Realtime: publica as tabelas que o painel assina ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shc_modules','shc_runs','shc_tests','shc_corrections','shc_certificates'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
