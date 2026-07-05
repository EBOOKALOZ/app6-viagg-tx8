-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M36: Registro de Versões do Motor Universal
--
-- Rastreia qual versão de cada componente está em execução.
-- Essencial para diagnóstico, rollback planejado e auditoria de deploy.
--
-- Tabela:
--   motor_version_registry — histórico de versões por componente
--
-- RPCs (SECURITY DEFINER):
--   get_motor_versions()                                     → JSONB
--   register_motor_version(component, version, description)  → JSONB
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: motor_version_registry
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.motor_version_registry (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  component        TEXT        NOT NULL,      -- 'motor_universal'|'migrations'|'rpcs'|'scheduler'|'workers'|'admin_panel'
  version          TEXT        NOT NULL,      -- ex: '2.2.5', '2025-07-03', 'M40'
  description      TEXT,
  migration_number INT,                       -- ex: 40 para M40
  changelog        TEXT,                      -- resumo do que mudou nesta versão
  is_current       BOOLEAN     NOT NULL DEFAULT true,   -- apenas o mais recente é true
  deployed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deployed_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.motor_version_registry IS
'Tier 2.2.5: Registro de versões de todos os componentes do Motor Universal. Usado para diagnóstico e rastreamento de deploys.';

DO $$ BEGIN
  ALTER TABLE public.motor_version_registry
    ADD CONSTRAINT mvr_component_check
    CHECK (component IN ('motor_universal','migrations','rpcs','scheduler','workers','admin_panel','edge_functions','feature_flags','rbac','webhooks'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_mvr_component_current ON public.motor_version_registry (component, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_mvr_deployed_at       ON public.motor_version_registry (deployed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.motor_version_registry ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_version_registry' AND policyname='mvr_select_authenticated') THEN
    CREATE POLICY "mvr_select_authenticated"
      ON public.motor_version_registry FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_version_registry' AND policyname='mvr_write_admin') THEN
    CREATE POLICY "mvr_write_admin"
      ON public.motor_version_registry FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RPC: register_motor_version
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_motor_version(
  p_component        TEXT,
  p_version          TEXT,
  p_description      TEXT    DEFAULT NULL,
  p_migration_number INT     DEFAULT NULL,
  p_changelog        TEXT    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  -- Marcar versão anterior como não-atual
  UPDATE public.motor_version_registry
  SET is_current = false
  WHERE component = p_component AND is_current = true;

  -- Registrar nova versão
  INSERT INTO public.motor_version_registry
    (component, version, description, migration_number, changelog, is_current, deployed_by)
  VALUES
    (p_component, p_version, p_description, p_migration_number, p_changelog, true, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'component', p_component,
    'version', p_version,
    'deployed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_motor_version(TEXT, TEXT, TEXT, INT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: get_motor_versions (versões atuais de todos os componentes)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_motor_versions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_object_agg(component, jsonb_build_object(
    'version',          version,
    'description',      description,
    'migration_number', migration_number,
    'deployed_at',      deployed_at,
    'changelog',        changelog
  ))
  FROM public.motor_version_registry
  WHERE is_current = true
  ORDER BY component
$$;

GRANT EXECUTE ON FUNCTION public.get_motor_versions() TO authenticated;
COMMENT ON FUNCTION public.get_motor_versions IS
'Tier 2.2.5: Retorna versão atual de cada componente do Motor Universal como mapa JSONB.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Seeds — versões iniciais
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.motor_version_registry (component, version, description, migration_number, changelog, is_current) VALUES
  ('motor_universal', '2.2.5', 'Tier 2.2.5 — Consolidação Final: Feature Flags, Webhooks, Observabilidade Avançada, Cache, Backup Lógico, Scheduler Inteligente', 40, 'M33-M40: Feature Flags (M33), Profile Config (M34), Webhooks (M35), Version Registry (M36), Observabilidade (M37), Cache (M38), Backup (M39), Scheduler (M40)', true),
  ('migrations',      'M40',   'Migrations M01–M40 aplicadas', 40, 'Completo Tier 1 + Tier 2.1 + Tier 2.2 + Tier 2.2.5', true),
  ('rpcs',            '2.2.5', 'RPCs da plataforma Viagg — Motor Universal 2.2.5', NULL, 'Adicionados: is_feature_enabled, get_feature_flags, toggle_feature_flag, upsert_feature_flag, get_effective_engine_config, update_profile_engine_config, emit_webhook_event, get_motor_versions, get_advanced_observability, refresh_motor_cache, create_motor_snapshot, get_scheduler_recommendations', true),
  ('scheduler',       '2.2.5', 'Scheduler com suporte a histórico de desempenho e preferências por perfil', NULL, 'Tier 2.2.5: scheduler_performance_log, scheduler_time_preferences, get_scheduler_recommendations()', true),
  ('workers',         '2.2',   'Workers com suporte multi-perfil, rate limit 3-camadas e DLQ', NULL, 'Tier 2.2: suporte driver, mototaxi, motoboy + lojista. Rate limit por perfil.', true),
  ('admin_panel',     '2.2.5', 'PostingEngineAdmin.tsx — 22 abas: Dashboard → Scheduler Inteligente', NULL, 'Tier 2.2.5: Feature Flags, Webhooks, APIs, Cache, Versões, Backup, Scheduler Inteligente adicionados', true),
  ('rbac',            '2.2.5', 'RBAC completo: 8 papéis, 15 permissões, helper functions', NULL, 'M27: system_roles, system_permissions, role_permissions, user_role_assignments', true),
  ('webhooks',        '2.2.5', 'Infraestrutura de webhooks — entrega HTTP via Edge Function (Tier 2.3)', 35, 'M35: webhook_endpoints, webhook_deliveries, emit_webhook_event()', true),
  ('feature_flags',   '2.2.5', 'Sistema de feature flags com targeting multi-dimensional', 33, 'M33: feature_flags, is_feature_enabled() com rollout percentual determinístico', true)
ON CONFLICT DO NOTHING;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M36 — motor_version_registry criada (9 componentes seed). RPCs: register_motor_version(), get_motor_versions(). Versão atual: Motor Universal 2.2.5 / Migrations M40.';
END $$;
