-- ═══════════════════════════════════════════════════════════════════════════
-- ORION-QA 003 · FASE 3 — INTEGRAÇÃO DO ECOSSISTEMA ORION
--
-- INCREMENTAL sobre as Fases 1 e 2 (20260804_orion_qa_central_problemas.sql e
-- 20260805_orion_qa_fase2_enriched_view.sql): NÃO altera nenhuma tabela,
-- trigger, policy ou grant existente. Apenas ADICIONA:
--
--   1) qa_integration_runs — registro normalizado de execuções de qualquer
--      integração (SHC, ORION Local Test Lab, Playwright, QA Wolf,
--      BrowserStack, Sentry, Pipeline). Fonte plugável: `source` é validado
--      por formato, não por lista fechada — integrações futuras não exigem
--      migration.
--   2) qa_events — Event Bus persistido (append-only). Todo módulo emite
--      eventos sem conhecer a Central de Problemas; correlação nativa com
--      issue (FK), run (FK), release (versão), commit, branch e PR.
--   3) qa_alerts — Central de Alertas. Escrita EXCLUSIVA do trigger
--      SECURITY DEFINER sobre qa_events (alerta nasce do evento, nunca da
--      mão do usuário); admin apenas lê e reconhece (ack).
--   4) qa_releases — visão de releases (versão, status, data, notas).
--      Correlação com problemas via qa_issues.fixed_version/current_version
--      (nenhum ALTER em qa_issues).
--
--   Triggers server-side (assíncronos p/ o frontend):
--     · qa_issue_event_trigger  — qa_issues → qa_events (issue.created/
--       issue.updated/issue.closed/issue.reopened) automático.
--     · qa_event_alert_trigger  — qa_events → qa_alerts automático para:
--       erro crítico, deploy com falha, rollback, migration com erro,
--       build quebrado, teste reprovado, performance degradada, segurança.
--
-- SEGURANÇA: RLS admin-only via gate canônico public.is_admin(); anon sem
-- nenhum privilégio; REVOKE TRUNCATE/TRIGGER/REFERENCES em TODA tabela nova
-- (a default ACL concede ALL a authenticated — TRUNCATE ignora RLS);
-- qa_events append-only (sem UPDATE/DELETE nem via GRANT); qa_alerts com
-- UPDATE column-level restrito a acknowledged_at/acknowledged_by.
--
-- Projeto: broifhfqmnzqoongtokm — idempotente; aplicar via SQL Editor ou
-- supabase db query --file — NUNCA supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. qa_integration_runs — execuções normalizadas de qualquer integração
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_integration_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number      BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  source          TEXT NOT NULL CHECK (source ~ '^[a-z0-9_]{2,40}$'),
  kind            TEXT NOT NULL DEFAULT 'execucao' CHECK (kind ~ '^[a-z0-9_]{2,40}$'),
  status          TEXT NOT NULL DEFAULT 'executando' CHECK (status IN (
                    'executando', 'aprovado', 'aprovado_com_ressalvas',
                    'reprovado', 'erro', 'cancelado'
                  )),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ CHECK (finished_at IS NULL OR finished_at >= started_at),
  duration_ms     BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  total           INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  passed          INTEGER NOT NULL DEFAULT 0 CHECK (passed >= 0),
  failed          INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
  warnings        INTEGER NOT NULL DEFAULT 0 CHECK (warnings >= 0),
  score           NUMERIC(6,2),
  module          TEXT,
  environment     TEXT NOT NULL DEFAULT 'producao' CHECK (environment IN (
                    'local', 'vm_testes', 'homologacao', 'producao'
                  )),
  commit_hash     TEXT CHECK (commit_hash IS NULL OR commit_hash ~ '^[0-9a-fA-F]{7,40}$'),
  branch          TEXT,
  build_number    TEXT,
  author          TEXT,
  release_version TEXT,
  external_ref    TEXT,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_integration_runs IS
'ORION-QA Fase 3: execuções de integrações (shc, testlab, playwright, qawolf, browserstack, sentry, pipeline, …). details guarda o payload específico da fonte (arquivos analisados, capturas, vídeos, device/os/browser/resolução, suites/casos, logs). Admin-only via is_admin().';

CREATE INDEX IF NOT EXISTS idx_qa_runs_source     ON public.qa_integration_runs (source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_runs_status     ON public.qa_integration_runs (status);
CREATE INDEX IF NOT EXISTS idx_qa_runs_module     ON public.qa_integration_runs (module);
CREATE INDEX IF NOT EXISTS idx_qa_runs_commit     ON public.qa_integration_runs (commit_hash);
CREATE INDEX IF NOT EXISTS idx_qa_runs_release    ON public.qa_integration_runs (release_version);
CREATE INDEX IF NOT EXISTS idx_qa_runs_created_at ON public.qa_integration_runs (created_at DESC);

DROP TRIGGER IF EXISTS trg_qa_runs_updated_at ON public.qa_integration_runs;
CREATE TRIGGER trg_qa_runs_updated_at
  BEFORE UPDATE ON public.qa_integration_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. qa_events — Event Bus persistido (append-only)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_number    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_type      TEXT NOT NULL CHECK (
                    event_type ~ '^[a-z0-9_]+\.[a-z0-9_]+$'
                    AND char_length(event_type) <= 80
                  ),
  source          TEXT NOT NULL DEFAULT 'central' CHECK (source ~ '^[a-z0-9_]{2,40}$'),
  severity        TEXT NOT NULL DEFAULT 'info' CHECK (severity IN (
                    'info', 'warning', 'error', 'critical'
                  )),
  title           TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  module          TEXT,
  environment     TEXT NOT NULL DEFAULT 'producao' CHECK (environment IN (
                    'local', 'vm_testes', 'homologacao', 'producao'
                  )),
  issue_id        UUID REFERENCES public.qa_issues(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES public.qa_integration_runs(id) ON DELETE SET NULL,
  release_version TEXT,
  commit_hash     TEXT CHECK (commit_hash IS NULL OR commit_hash ~ '^[0-9a-fA-F]{7,40}$'),
  branch          TEXT,
  pull_request    TEXT,
  author          TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_events IS
'ORION-QA Fase 3: Event Bus persistido. event_type canônico "dominio.acao" (issue.created, deploy.finished, build.failed, shc.failed, testlab.failed, sentry.exception, …) validado por formato — integrações futuras não exigem migration. APPEND-ONLY: sem policy nem GRANT de UPDATE/DELETE; o id pode ser fornecido pelo cliente para entrega idempotente (retry seguro).';

CREATE INDEX IF NOT EXISTS idx_qa_events_created_at ON public.qa_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_events_type       ON public.qa_events (event_type);
CREATE INDEX IF NOT EXISTS idx_qa_events_source     ON public.qa_events (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_events_severity   ON public.qa_events (severity);
CREATE INDEX IF NOT EXISTS idx_qa_events_issue      ON public.qa_events (issue_id);
CREATE INDEX IF NOT EXISTS idx_qa_events_run        ON public.qa_events (run_id);
CREATE INDEX IF NOT EXISTS idx_qa_events_commit     ON public.qa_events (commit_hash);
CREATE INDEX IF NOT EXISTS idx_qa_events_release    ON public.qa_events (release_version);
CREATE INDEX IF NOT EXISTS idx_qa_events_module     ON public.qa_events (module);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. qa_alerts — Central de Alertas (escrita exclusiva do trigger)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type      TEXT NOT NULL CHECK (alert_type IN (
                    'erro_critico', 'deploy_falha', 'rollback', 'migration_erro',
                    'build_quebrado', 'teste_reprovado', 'performance_degradada',
                    'seguranca'
                  )),
  severity        TEXT NOT NULL DEFAULT 'error' CHECK (severity IN (
                    'warning', 'error', 'critical'
                  )),
  title           TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  message         TEXT,
  source          TEXT NOT NULL DEFAULT 'central' CHECK (source ~ '^[a-z0-9_]{2,40}$'),
  event_id        UUID REFERENCES public.qa_events(id) ON DELETE SET NULL,
  issue_id        UUID REFERENCES public.qa_issues(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES public.qa_integration_runs(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_alerts IS
'ORION-QA Fase 3: Central de Alertas. Linhas nascem EXCLUSIVAMENTE do trigger SECURITY DEFINER sobre qa_events (erro crítico, deploy com falha, rollback, migration com erro, build quebrado, teste reprovado, performance degradada, segurança). Admin lê e reconhece (UPDATE column-level em acknowledged_at/acknowledged_by).';

CREATE INDEX IF NOT EXISTS idx_qa_alerts_created_at ON public.qa_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_alerts_open       ON public.qa_alerts (created_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qa_alerts_type       ON public.qa_alerts (alert_type);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. qa_releases — visão de releases
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_releases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL UNIQUE CHECK (char_length(btrim(version)) BETWEEN 1 AND 60),
  name        TEXT,
  status      TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN (
                'planejada', 'em_homologacao', 'publicada', 'rollback'
              )),
  released_at TIMESTAMPTZ,
  notes       TEXT,
  created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_releases IS
'ORION-QA Fase 3: releases da plataforma. Correlação com problemas via qa_issues.fixed_version (corrigidos) e qa_issues.current_version (conhecidos) — sem ALTER em qa_issues. Admin-only via is_admin().';

CREATE INDEX IF NOT EXISTS idx_qa_releases_status ON public.qa_releases (status);

DROP TRIGGER IF EXISTS trg_qa_releases_updated_at ON public.qa_releases;
CREATE TRIGGER trg_qa_releases_updated_at
  BEFORE UPDATE ON public.qa_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. qa_issues → qa_events (emissão automática server-side)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.qa_issue_event_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_type TEXT;
  v_severity TEXT;
  v_title TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := 'issue.created';
    v_severity := CASE WHEN NEW.severity = 'critico' THEN 'critical'
                       WHEN NEW.severity = 'alto'    THEN 'warning'
                       ELSE 'info' END;
    v_title := format('Problema #%s criado: %s', NEW.issue_number, NEW.title);
  ELSIF NEW.status = 'fechado' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_type := 'issue.closed';
    v_severity := 'info';
    v_title := format('Problema #%s fechado: %s', NEW.issue_number, NEW.title);
  ELSIF NEW.status = 'reaberto' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_type := 'issue.reopened';
    v_severity := 'warning';
    v_title := format('Problema #%s reaberto: %s', NEW.issue_number, NEW.title);
  ELSIF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    v_type := 'issue.updated';
    v_severity := 'info';
    v_title := format('Problema #%s atualizado: %s', NEW.issue_number, NEW.title);
  ELSE
    RETURN NEW; -- UPDATE sem mudança real (só updated_at) não vira evento
  END IF;

  INSERT INTO public.qa_events (
    event_type, source, severity, title, module, environment,
    issue_id, release_version, commit_hash, payload, created_by
  ) VALUES (
    v_type, 'central', v_severity, left(v_title, 300), NEW.module, NEW.environment,
    NEW.id, COALESCE(NEW.fixed_version, NEW.current_version), NEW.commit_hash,
    jsonb_build_object(
      'issue_number', NEW.issue_number,
      'status',       NEW.status,
      'severity',     NEW.severity,
      'priority',     NEW.priority,
      'origin',       NEW.origin,
      'old_status',   CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END
    ),
    auth.uid()
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.qa_issue_event_trigger() IS
'ORION-QA Fase 3: emite issue.created/issue.updated/issue.closed/issue.reopened em qa_events a cada mudança real em qa_issues. Server-side: nenhum módulo precisa conhecer o Event Bus para o ciclo de vida ser rastreado.';

DROP TRIGGER IF EXISTS trg_qa_issues_event ON public.qa_issues;
CREATE TRIGGER trg_qa_issues_event
  AFTER INSERT OR UPDATE ON public.qa_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_issue_event_trigger();

-- ─────────────────────────────────────────────────────────────────────────
-- 6. qa_events → qa_alerts (Central de Alertas automática)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.qa_event_alert_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_alert_type TEXT;
  v_result TEXT;
BEGIN
  v_result := lower(COALESCE(NEW.payload->>'result', ''));

  v_alert_type := CASE
    WHEN NEW.event_type = 'build.failed' THEN 'build_quebrado'
    WHEN NEW.event_type IN ('pipeline.rollback', 'deploy.rollback') THEN 'rollback'
    WHEN NEW.event_type = 'deploy.failed'
      OR (NEW.event_type = 'deploy.finished' AND v_result IN ('falha', 'failed', 'erro', 'error'))
      THEN 'deploy_falha'
    WHEN NEW.event_type = 'migration.failed'
      OR (NEW.event_type = 'migration.executed' AND v_result IN ('falha', 'failed', 'erro', 'error'))
      THEN 'migration_erro'
    WHEN NEW.event_type LIKE '%.failed'
      AND NEW.source IN ('shc', 'testlab', 'playwright', 'qawolf', 'browserstack')
      THEN 'teste_reprovado'
    WHEN NEW.event_type = 'performance.alert' THEN 'performance_degradada'
    WHEN NEW.event_type = 'security.alert' THEN 'seguranca'
    WHEN NEW.severity = 'critical' THEN 'erro_critico'
    ELSE NULL
  END;

  IF v_alert_type IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.qa_alerts (
    alert_type, severity, title, message, source, event_id, issue_id, run_id
  ) VALUES (
    v_alert_type,
    CASE
      WHEN NEW.severity = 'critical' THEN 'critical'
      WHEN NEW.severity = 'warning'  THEN 'warning'
      ELSE 'error'
    END,
    left(NEW.title, 300),
    COALESCE(NEW.payload->>'message', NEW.payload->>'error', NEW.payload->>'reason'),
    NEW.source,
    NEW.id,
    NEW.issue_id,
    NEW.run_id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.qa_event_alert_trigger() IS
'ORION-QA Fase 3: gera alertas automáticos a partir de qa_events — erro crítico, deploy com falha, rollback, migration com erro, build quebrado, teste reprovado, performance degradada e segurança. Única via de escrita em qa_alerts.';

DROP TRIGGER IF EXISTS trg_qa_events_alert ON public.qa_events;
CREATE TRIGGER trg_qa_events_alert
  AFTER INSERT ON public.qa_events
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_event_alert_trigger();

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Auditoria — reaproveita o trigger universal da Fase 1 nas tabelas
--    mutáveis novas. qa_events fica de fora: é append-only e é, ele próprio,
--    um log — auditar cada evento dobraria o volume sem ganho de segurança.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['qa_integration_runs', 'qa_releases', 'qa_alerts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_qa_audit ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_qa_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.qa_audit_trigger();',
      t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RLS — somente administradores (gate canônico public.is_admin())
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.qa_integration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_releases         ENABLE ROW LEVEL SECURITY;

-- Runs e releases: CRUD completo para admin (tudo auditado)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['qa_integration_runs', 'qa_releases']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());',
      t || '_admin_all', t
    );
  END LOOP;
END $$;

-- Eventos: admin lê e insere; NINGUÉM atualiza/apaga (append-only)
DROP POLICY IF EXISTS qa_events_admin_select ON public.qa_events;
CREATE POLICY qa_events_admin_select ON public.qa_events
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS qa_events_admin_insert ON public.qa_events;
CREATE POLICY qa_events_admin_insert ON public.qa_events
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Alertas: admin lê e reconhece; INSERT/DELETE exclusivos do trigger
DROP POLICY IF EXISTS qa_alerts_admin_select ON public.qa_alerts;
CREATE POLICY qa_alerts_admin_select ON public.qa_alerts
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS qa_alerts_admin_ack ON public.qa_alerts;
CREATE POLICY qa_alerts_admin_ack ON public.qa_alerts
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 9. GRANTs — defesa em profundidade contra a default ACL do schema public
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.qa_integration_runs FROM anon;
REVOKE ALL ON public.qa_events           FROM anon;
REVOKE ALL ON public.qa_alerts           FROM anon;
REVOKE ALL ON public.qa_releases         FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_integration_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_releases         TO authenticated;

-- Eventos: append-only também na camada de GRANT
REVOKE INSERT, UPDATE, DELETE ON public.qa_events FROM authenticated;
GRANT SELECT, INSERT ON public.qa_events TO authenticated;

-- Alertas: leitura + ack (UPDATE column-level); escrita nasce só do trigger
REVOKE INSERT, UPDATE, DELETE ON public.qa_alerts FROM authenticated;
GRANT SELECT ON public.qa_alerts TO authenticated;
GRANT UPDATE (acknowledged_at, acknowledged_by) ON public.qa_alerts TO authenticated;

-- A default ACL concede ALL (incl. TRUNCATE, que IGNORA RLS) a authenticated
-- em tabela nova — sem este REVOKE, qualquer autenticado não-admin poderia
-- esvaziar as tabelas do módulo, inclusive o log de eventos.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_integration_runs FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_events           FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_alerts           FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_releases         FROM authenticated;

-- Sequências das colunas identity
DO $$
DECLARE
  v_seq TEXT;
  t TEXT;
  c TEXT;
BEGIN
  FOR t, c IN
    SELECT * FROM (VALUES
      ('public.qa_integration_runs', 'run_number'),
      ('public.qa_events', 'event_number')
    ) AS pairs(tbl, col)
  LOOP
    v_seq := pg_get_serial_sequence(t, c);
    IF v_seq IS NOT NULL THEN
      EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated;', v_seq);
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon;', v_seq);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. Realtime — eventos e alertas ao vivo no painel de observabilidade
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'qa_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_events;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'qa_alerts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_alerts;
    END IF;
  END IF;
END $$;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ ORION-QA Fase 3 — qa_integration_runs, qa_events (append-only), qa_alerts (trigger-only) e qa_releases criadas; eventos automáticos de issues; alertas automáticos de eventos; RLS admin-only; realtime em eventos/alertas.';
END $$;
