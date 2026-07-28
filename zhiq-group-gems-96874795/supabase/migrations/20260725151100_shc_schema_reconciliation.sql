-- ============================================================================
-- SHC — RECONCILIAÇÃO DE SCHEMA (ASHC FASE 2 · ETAPA 6 · 2026-07-27)
--
-- PROBLEMA (auditoria ASHC 2026-07-27): o schema vivo das tabelas shc_* não
-- tinha origem versionada — nasceu de `20260725151059_shc_module.sql` (nomes
-- legados shc_test_runs/shc_test_results/shc_certifications/shc_audit_logs),
-- renomeado por um arquivo solto (`rename_tables.sql`, raiz, fora do git) e
-- alterado por SQL manual (colunas shc_runs.status, shc_tests.status,
-- shc_tests.order_index sem nenhum ALTER versionado). Um `supabase db reset`
-- não reproduzia o banco real.
--
-- Esta migration é o elo canônico: converge QUALQUER um dos dois estados
-- (fresh reset pós-151059 ou banco vivo) para o shape real de produção.
-- 100% idempotente; no banco vivo é integralmente no-op.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1) Enums (a 20260727005900 expande shc_status; aqui só garantia base) ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shc_severity') THEN
    CREATE TYPE public.shc_severity AS ENUM ('critical', 'high', 'medium', 'low');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shc_status') THEN
    CREATE TYPE public.shc_status AS ENUM ('pending', 'running', 'passed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shc_correction_status') THEN
    CREATE TYPE public.shc_correction_status AS ENUM ('pending', 'fixing', 'fixed', 'validated');
  END IF;
END $$;

-- ── 2) Renomeações canônicas (histórico do rename_tables.sql, agora versionado)
DO $$
BEGIN
  IF to_regclass('public.shc_test_runs') IS NOT NULL AND to_regclass('public.shc_runs') IS NULL THEN
    ALTER TABLE public.shc_test_runs RENAME TO shc_runs;
  END IF;
  IF to_regclass('public.shc_test_results') IS NOT NULL AND to_regclass('public.shc_tests') IS NULL THEN
    ALTER TABLE public.shc_test_results RENAME TO shc_tests;
  END IF;
  IF to_regclass('public.shc_certifications') IS NOT NULL AND to_regclass('public.shc_certificates') IS NULL THEN
    ALTER TABLE public.shc_certifications RENAME TO shc_certificates;
  END IF;
  IF to_regclass('public.shc_audit_logs') IS NOT NULL AND to_regclass('public.shc_logs') IS NULL THEN
    ALTER TABLE public.shc_audit_logs RENAME TO shc_logs;
  END IF;
END $$;

-- ── 3) Tabelas no shape real de produção (no-op quando já existem) ──────────
CREATE TABLE IF NOT EXISTS public.shc_modules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  status           public.shc_status DEFAULT 'pending',
  quality_score    numeric(5,2),
  last_run_at      timestamptz,
  last_duration_ms integer,
  coordinator_ai   text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  slug             text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shc_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          uuid REFERENCES public.shc_modules(id) ON DELETE CASCADE,
  version            text,
  branch             text,
  commit_hash        text,
  files_changed      integer,
  total_duration_ms  integer,
  result             public.shc_status DEFAULT 'running',
  coordinator_ai     text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  status             text,
  executed_by        uuid,
  report_json        jsonb,
  decision_id        uuid,
  decision           text,
  deploy_allowed     boolean,
  certificate_allowed boolean,
  blocking           boolean,
  warnings           integer,
  critical           integer,
  decision_reason    text,
  decision_timestamp timestamptz,
  decision_version   text,
  decision_hash      text,
  ia_solver          text
);

CREATE TABLE IF NOT EXISTS public.shc_tests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid REFERENCES public.shc_runs(id) ON DELETE CASCADE,
  name           text NOT NULL,
  result         public.shc_status NOT NULL,
  duration_ms    integer,
  responsible_ai text,
  evidence       text,
  created_at     timestamptz DEFAULT now(),
  status         text,
  order_index    integer
);

CREATE TABLE IF NOT EXISTS public.shc_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid REFERENCES public.shc_runs(id) ON DELETE SET NULL,
  module_id    uuid REFERENCES public.shc_modules(id) ON DELETE SET NULL,
  executed_by  text NOT NULL,
  result       public.shc_status NOT NULL,
  total_tests  integer,
  passed_tests integer,
  failed_tests integer,
  duration_ms  integer,
  logs         text,
  evidence     text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shc_corrections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid REFERENCES public.shc_runs(id) ON DELETE CASCADE,
  test_id               uuid REFERENCES public.shc_tests(id) ON DELETE CASCADE,
  module_id             uuid REFERENCES public.shc_modules(id) ON DELETE CASCADE,
  failure_description   text NOT NULL,
  severity              public.shc_severity NOT NULL,
  technical_description text,
  affected_file         text,
  affected_line         integer,
  responsible_ai        text,
  auto_suggestion       text,
  status                public.shc_correction_status DEFAULT 'pending',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shc_certificates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      uuid REFERENCES public.shc_modules(id) ON DELETE CASCADE,
  run_id         uuid REFERENCES public.shc_runs(id) ON DELETE CASCADE,
  version        text NOT NULL,
  quality_score  numeric NOT NULL,
  total_tests    integer NOT NULL,
  duration_ms    integer NOT NULL,
  coordinator_ai text NOT NULL,
  issued_at      timestamptz DEFAULT now()
);

-- ── 4) Colunas de drift (caminho fresh: legadas renomeadas sem essas colunas)
ALTER TABLE public.shc_modules ADD COLUMN IF NOT EXISTS slug text;
UPDATE public.shc_modules SET slug = lower(regexp_replace(name, '\s+', '-', 'g')) WHERE slug IS NULL;
ALTER TABLE public.shc_modules ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.shc_runs
  ADD COLUMN IF NOT EXISTS files_changed integer,
  ADD COLUMN IF NOT EXISTS total_duration_ms integer,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS executed_by uuid,
  ADD COLUMN IF NOT EXISTS report_json jsonb,
  ADD COLUMN IF NOT EXISTS ia_solver text;

ALTER TABLE public.shc_tests
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS order_index integer;

ALTER TABLE public.shc_certificates
  ADD COLUMN IF NOT EXISTS version text,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS total_tests integer,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS coordinator_ai text,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz DEFAULT now();

-- ── 5) Índices/constraints estruturais próprios do shape real ───────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_shc_modules_slug ON public.shc_modules (slug);

-- ── 6) RLS ligado desde a base (policies vêm das migrations de 27/07) ───────
ALTER TABLE public.shc_modules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_tests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_corrections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_certificates ENABLE ROW LEVEL SECURITY;

COMMIT;
