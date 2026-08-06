-- ═══════════════════════════════════════════════════════════════════════════
-- ORION-QA 001 · FASE 1 — CENTRAL DE PROBLEMAS
--
-- Sistema oficial de registro, acompanhamento, correção e homologação de
-- problemas da plataforma. Fase 1 = fundação (banco + painel admin).
-- Integrações (SHC, Máquina Virtual, Sentry, logs automáticos) ficam p/ Fase 2.
--
--   1) qa_issues            — problema com ciclo de vida completo
--   2) qa_issue_comments    — comentários internos
--   3) qa_issue_history     — timeline automática (criação/edição/status/
--                             atribuição/fechamento/reabertura + IP/User-Agent)
--   4) qa_issue_attachments — anexos (png/jpg/pdf/txt/json/zip) no bucket
--                             privado qa-attachments
--   5) qa_audit_log         — auditoria imutável (quem/quando/IP/origem/ação/
--                             valor antigo/valor novo) de TODAS as tabelas
--
-- SEGURANÇA: RLS admin-only via gate canônico public.is_admin() (JWT OU
-- user_roles OU profiles.is_admin — nunca comparação direta de auth.uid()
-- com PK surrogate). anon sem nenhum privilégio. História e auditoria são
-- SELECT-only para admins: escrita exclusiva dos triggers SECURITY DEFINER
-- (blindagem contra adulteração — lição do P1 do convenio_audit_log).
--
-- Projeto: broifhfqmnzqoongtokm — idempotente; aplicar via SQL Editor ou
-- supabase db query --file — NUNCA supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. qa_issues — registro central de problemas
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_issues (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number       BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title              TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  description        TEXT NOT NULL DEFAULT '',
  module             TEXT NOT NULL DEFAULT 'geral' CHECK (char_length(btrim(module)) BETWEEN 2 AND 80),
  environment        TEXT NOT NULL DEFAULT 'producao' CHECK (environment IN (
                       'local', 'vm_testes', 'homologacao', 'producao'
                     )),
  severity           TEXT NOT NULL DEFAULT 'medio' CHECK (severity IN (
                       'critico', 'alto', 'medio', 'baixo', 'melhoria'
                     )),
  status             TEXT NOT NULL DEFAULT 'novo' CHECK (status IN (
                       'novo', 'em_analise', 'em_desenvolvimento', 'aguardando_teste',
                       'em_homologacao', 'homologado', 'fechado', 'reaberto'
                     )),
  priority           TEXT NOT NULL DEFAULT 'media' CHECK (priority IN (
                       'baixa', 'media', 'alta', 'urgente'
                     )),
  origin             TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN (
                       'manual', 'shc', 'maquina_virtual', 'frontend', 'backend',
                       'supabase', 'banco', 'api', 'ia', 'deploy', 'performance', 'seguranca'
                     )),
  current_version    TEXT,
  fixed_version      TEXT,
  commit_hash        TEXT CHECK (commit_hash IS NULL OR commit_hash ~ '^[0-9a-fA-F]{7,40}$'),
  build_number       TEXT,
  browser            TEXT,
  device             TEXT,
  operating_system   TEXT,
  error_message      TEXT,
  stack_trace        TEXT,
  steps_to_reproduce TEXT,
  expected_behavior  TEXT,
  actual_behavior    TEXT,
  resolution_notes   TEXT,
  resolved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.qa_issues IS
'ORION-QA Fase 1: Central de Problemas. Todo problema da plataforma com ciclo de vida Novo → Em análise → Em desenvolvimento → Aguardando teste → Em homologação → Homologado → Fechado (⇄ Reaberto). Admin-only via is_admin().';

CREATE INDEX IF NOT EXISTS idx_qa_issues_status      ON public.qa_issues (status);
CREATE INDEX IF NOT EXISTS idx_qa_issues_severity    ON public.qa_issues (severity);
CREATE INDEX IF NOT EXISTS idx_qa_issues_module      ON public.qa_issues (module);
CREATE INDEX IF NOT EXISTS idx_qa_issues_origin      ON public.qa_issues (origin);
CREATE INDEX IF NOT EXISTS idx_qa_issues_environment ON public.qa_issues (environment);
CREATE INDEX IF NOT EXISTS idx_qa_issues_assigned_to ON public.qa_issues (assigned_to);
CREATE INDEX IF NOT EXISTS idx_qa_issues_created_at  ON public.qa_issues (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. qa_issue_comments — comentários internos
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_issue_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   UUID NOT NULL REFERENCES public.qa_issues(id) ON DELETE CASCADE,
  comment    TEXT NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 1 AND 5000),
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_issue_comments IS
'ORION-QA Fase 1: comentários internos (admin-only) de um problema.';

CREATE INDEX IF NOT EXISTS idx_qa_issue_comments_issue ON public.qa_issue_comments (issue_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. qa_issue_history — timeline automática do ciclo de vida
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_issue_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   UUID NOT NULL REFERENCES public.qa_issues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
               'criacao', 'edicao', 'mudanca_status', 'atribuicao',
               'fechamento', 'reabertura'
             )),
  old_value  TEXT,
  new_value  TEXT,
  actor_id   UUID,
  ip         TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_issue_history IS
'ORION-QA Fase 1: timeline automática (criação/edição/mudança de status/atribuição/fechamento/reabertura) com autor, data, IP e User-Agent. Escrita EXCLUSIVA do trigger SECURITY DEFINER — sem policy de INSERT/UPDATE/DELETE.';

CREATE INDEX IF NOT EXISTS idx_qa_issue_history_issue ON public.qa_issue_history (issue_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. qa_issue_attachments — anexos (metadados; arquivo no Storage)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_issue_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    UUID NOT NULL REFERENCES public.qa_issues(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  file_path   TEXT NOT NULL UNIQUE,
  mime_type   TEXT NOT NULL CHECK (mime_type IN (
                'image/png', 'image/jpeg', 'application/pdf', 'text/plain',
                'application/json', 'application/zip', 'application/x-zip-compressed'
              )),
  size_bytes  BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400), -- 25 MB
  uploaded_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_issue_attachments IS
'ORION-QA Fase 1: metadados dos anexos (png/jpg/pdf/txt/json/zip, máx. 25 MB). Arquivo físico no bucket privado qa-attachments.';

CREATE INDEX IF NOT EXISTS idx_qa_issue_attachments_issue ON public.qa_issue_attachments (issue_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. qa_audit_log — auditoria imutável de todas as tabelas do módulo
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID,
  action       TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id    UUID,
  old_value    JSONB,
  new_value    JSONB,
  ip           TEXT,
  origin       TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_audit_log IS
'ORION-QA Fase 1: auditoria de toda alteração do módulo — quem (actor_id), quando (created_at), IP, origem, ação, valor antigo e valor novo. Escrita EXCLUSIVA do trigger SECURITY DEFINER — sem policy de INSERT/UPDATE/DELETE (não adulterável).';

CREATE INDEX IF NOT EXISTS idx_qa_audit_log_entity  ON public.qa_audit_log (entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_qa_audit_log_created ON public.qa_audit_log (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Funções utilitárias e triggers
-- ─────────────────────────────────────────────────────────────────────────

-- Headers da requisição PostgREST (NULL fora desse contexto, ex.: SQL Editor).
CREATE OR REPLACE FUNCTION public.qa_request_meta()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers JSONB;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ip',         NULLIF(btrim(split_part(COALESCE(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1)), ''),
    'origin',     v_headers->>'origin',
    'referer',    v_headers->>'referer',
    'user_agent', v_headers->>'user-agent'
  ));
END;
$$;

COMMENT ON FUNCTION public.qa_request_meta() IS
'ORION-QA Fase 1: extrai ip/origin/referer/user-agent dos headers da requisição PostgREST. NULL quando não há contexto de requisição.';

-- updated_at automático
CREATE OR REPLACE FUNCTION public.qa_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_issues_updated_at ON public.qa_issues;
CREATE TRIGGER trg_qa_issues_updated_at
  BEFORE UPDATE ON public.qa_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_set_updated_at();

-- Ciclo de vida: resolved_at/closed_at coerentes com o status (server-side,
-- não dependem do frontend enviar as datas).
CREATE OR REPLACE FUNCTION public.qa_issue_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'homologado' AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;
  IF NEW.status = 'fechado' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'fechado' AND NEW.status <> 'fechado' THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_issues_lifecycle ON public.qa_issues;
CREATE TRIGGER trg_qa_issues_lifecycle
  BEFORE INSERT OR UPDATE ON public.qa_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_issue_lifecycle();

-- Timeline automática (qa_issue_history). SECURITY DEFINER: única via de
-- escrita na tabela de histórico.
CREATE OR REPLACE FUNCTION public.qa_issue_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_meta JSONB;
  v_ip TEXT;
  v_ua TEXT;
BEGIN
  v_meta := public.qa_request_meta();
  v_ip := v_meta->>'ip';
  v_ua := v_meta->>'user_agent';

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.qa_issue_history (issue_id, event_type, old_value, new_value, actor_id, ip, user_agent)
    VALUES (NEW.id, 'criacao', NULL, NEW.status, auth.uid(), v_ip, v_ua);
    RETURN NEW;
  END IF;

  -- UPDATE: um evento por aspecto alterado
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.qa_issue_history (issue_id, event_type, old_value, new_value, actor_id, ip, user_agent)
    VALUES (
      NEW.id,
      CASE
        WHEN NEW.status = 'fechado' THEN 'fechamento'
        WHEN OLD.status IN ('fechado', 'homologado') AND NEW.status = 'reaberto' THEN 'reabertura'
        ELSE 'mudanca_status'
      END,
      OLD.status, NEW.status, auth.uid(), v_ip, v_ua
    );
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.qa_issue_history (issue_id, event_type, old_value, new_value, actor_id, ip, user_agent)
    VALUES (NEW.id, 'atribuicao', OLD.assigned_to::text, NEW.assigned_to::text, auth.uid(), v_ip, v_ua);
  END IF;

  -- Demais campos = edição genérica (sem duplicar eventos já registrados)
  IF (to_jsonb(NEW) - 'updated_at' - 'status' - 'assigned_to' - 'resolved_at' - 'closed_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'updated_at' - 'status' - 'assigned_to' - 'resolved_at' - 'closed_at') THEN
    INSERT INTO public.qa_issue_history (issue_id, event_type, old_value, new_value, actor_id, ip, user_agent)
    VALUES (NEW.id, 'edicao', NULL, NULL, auth.uid(), v_ip, v_ua);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_issues_history ON public.qa_issues;
CREATE TRIGGER trg_qa_issues_history
  AFTER INSERT OR UPDATE ON public.qa_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_issue_history_trigger();

-- Auditoria universal do módulo (qa_audit_log). SECURITY DEFINER: única via
-- de escrita na tabela de auditoria.
CREATE OR REPLACE FUNCTION public.qa_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_meta JSONB;
BEGIN
  v_meta := public.qa_request_meta();

  INSERT INTO public.qa_audit_log (actor_id, action, entity_table, entity_id, old_value, new_value, ip, origin, user_agent)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || ':' || lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    v_meta->>'ip',
    v_meta->>'origin',
    v_meta->>'user_agent'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['qa_issues', 'qa_issue_comments', 'qa_issue_attachments']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_qa_audit ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_qa_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.qa_audit_trigger();',
      t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RLS — somente administradores (gate canônico public.is_admin())
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.qa_issues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_issue_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_issue_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_issue_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_audit_log         ENABLE ROW LEVEL SECURITY;

-- CRUD completo para admin nas tabelas operacionais
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['qa_issues', 'qa_issue_comments', 'qa_issue_attachments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());',
      t || '_admin_all', t
    );
  END LOOP;
END $$;

-- Histórico e auditoria: admin só LÊ; escrita apenas via trigger SECURITY DEFINER
DROP POLICY IF EXISTS qa_issue_history_admin_select ON public.qa_issue_history;
CREATE POLICY qa_issue_history_admin_select ON public.qa_issue_history
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS qa_audit_log_admin_select ON public.qa_audit_log;
CREATE POLICY qa_audit_log_admin_select ON public.qa_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 8. GRANTs — defesa em profundidade contra a default ACL do schema public
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.qa_issues            FROM anon;
REVOKE ALL ON public.qa_issue_comments    FROM anon;
REVOKE ALL ON public.qa_issue_history     FROM anon;
REVOKE ALL ON public.qa_issue_attachments FROM anon;
REVOKE ALL ON public.qa_audit_log         FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_issues            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_issue_comments    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_issue_attachments TO authenticated;

-- História/auditoria: nem GRANT de escrita (imutáveis fora dos triggers)
REVOKE INSERT, UPDATE, DELETE ON public.qa_issue_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.qa_audit_log     FROM authenticated;
GRANT SELECT ON public.qa_issue_history TO authenticated;
GRANT SELECT ON public.qa_audit_log     TO authenticated;

-- A default ACL concede ALL (incl. TRUNCATE, que IGNORA RLS) a authenticated
-- em tabela nova — sem este REVOKE, qualquer autenticado não-admin poderia
-- esvaziar as tabelas do módulo, inclusive a auditoria.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_issues            FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_issue_comments    FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_issue_attachments FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_issue_history     FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.qa_audit_log         FROM authenticated;

-- Sequência do issue_number (identity)
DO $$
DECLARE
  v_seq TEXT;
BEGIN
  v_seq := pg_get_serial_sequence('public.qa_issues', 'issue_number');
  IF v_seq IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated;', v_seq);
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon;', v_seq);
  END IF;
END $$;

-- Funções auxiliares: EXECUTE só p/ authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.qa_request_meta() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.qa_request_meta() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. Storage — bucket privado qa-attachments (admin-only)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) VALUES ('qa-attachments', 'qa-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS qa_attachments_sel ON storage.objects;
CREATE POLICY qa_attachments_sel ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'qa-attachments' AND public.is_admin());

DROP POLICY IF EXISTS qa_attachments_ins ON storage.objects;
CREATE POLICY qa_attachments_ins ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'qa-attachments' AND public.is_admin());

DROP POLICY IF EXISTS qa_attachments_del ON storage.objects;
CREATE POLICY qa_attachments_del ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'qa-attachments' AND public.is_admin());

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ ORION-QA Fase 1 — qa_issues, qa_issue_comments, qa_issue_history, qa_issue_attachments, qa_audit_log criadas; RLS admin-only (is_admin); história/auditoria imutáveis via trigger; bucket qa-attachments privado.';
END $$;
