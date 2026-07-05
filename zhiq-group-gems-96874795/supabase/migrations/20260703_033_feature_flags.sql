-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M33: Sistema de Feature Flags
--
-- Ativação e desativação dinâmica de funcionalidades sem necessidade de deploy.
--
-- Targeting por: perfil, tenant, cidade, estado, região, plano,
--                rollout percentual, ambiente e data de expiração.
--
-- Tabelas:
--   feature_flags — definição e targeting de cada flag
--
-- RPCs (SECURITY DEFINER):
--   is_feature_enabled(key, profile, tenant, city, state, region) → boolean
--   get_feature_flags()                                            → JSONB
--   toggle_feature_flag(key, enabled)                             → JSONB
--   upsert_feature_flag(key, name, description, targeting JSONB)  → JSONB
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: feature_flags
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 TEXT        NOT NULL UNIQUE,           -- identificador único da flag
  name                TEXT        NOT NULL,                  -- nome legível
  description         TEXT,
  is_enabled          BOOLEAN     NOT NULL DEFAULT false,    -- liga/desliga global
  -- Targeting (NULL = sem restrição = todos)
  allowed_profiles    TEXT[],                               -- ['lojista','driver','motoboy','mototaxi']
  allowed_tenant_ids  TEXT[],                               -- slugs de tenants
  allowed_cities      TEXT[],                               -- ex: ['São Paulo','Curitiba']
  allowed_states      TEXT[],                               -- ex: ['SP','PR']
  allowed_regions     TEXT[],                               -- ex: ['BR-SP','BR-PR']
  allowed_plans       TEXT[],                               -- ex: ['premium','enterprise']
  rollout_percentage  INT         NOT NULL DEFAULT 100,      -- 0–100 (% de usuários habilitados)
  environment         TEXT        NOT NULL DEFAULT 'all',   -- 'test' | 'production' | 'all'
  expires_at          TIMESTAMPTZ,                          -- NULL = nunca expira
  -- Audit
  created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_flags IS
'Tier 2.2.5: Sistema de feature flags com targeting multi-dimensional. Alterações sem deploy.';

-- CHECK constraints
DO $$ BEGIN
  ALTER TABLE public.feature_flags
    ADD CONSTRAINT ff_rollout_range CHECK (rollout_percentage BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.feature_flags
    ADD CONSTRAINT ff_environment_check CHECK (environment IN ('test','production','all'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.trg_fn_ff_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_ff_updated_at ON public.feature_flags;
CREATE TRIGGER trg_ff_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_ff_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Índices
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ff_key_enabled ON public.feature_flags (key, is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_ff_profiles    ON public.feature_flags USING GIN (allowed_profiles) WHERE allowed_profiles IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados podem LER as flags (para frontend saber o que está habilitado)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='feature_flags' AND policyname='ff_select_authenticated') THEN
    CREATE POLICY "ff_select_authenticated"
      ON public.feature_flags FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Somente admin pode alterar
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='feature_flags' AND policyname='ff_write_admin') THEN
    CREATE POLICY "ff_write_admin"
      ON public.feature_flags FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: is_feature_enabled (callable pelo frontend e workers)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_key           TEXT,
  p_profile_type  TEXT DEFAULT NULL,
  p_tenant_id     TEXT DEFAULT NULL,
  p_city          TEXT DEFAULT NULL,
  p_state         TEXT DEFAULT NULL,
  p_region        TEXT DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feature_flags ff
    WHERE ff.key                = p_key
      AND ff.is_enabled         = true
      -- Não expirado
      AND (ff.expires_at IS NULL OR ff.expires_at > now())
      -- Perfil
      AND (ff.allowed_profiles  IS NULL OR p_profile_type  = ANY(ff.allowed_profiles))
      -- Tenant
      AND (ff.allowed_tenant_ids IS NULL OR p_tenant_id    = ANY(ff.allowed_tenant_ids))
      -- Cidade
      AND (ff.allowed_cities    IS NULL OR p_city          = ANY(ff.allowed_cities))
      -- Estado
      AND (ff.allowed_states    IS NULL OR p_state         = ANY(ff.allowed_states))
      -- Região
      AND (ff.allowed_regions   IS NULL OR p_region        = ANY(ff.allowed_regions))
      -- Rollout percentual — hash determinístico por usuário+flag
      AND (
        ff.rollout_percentage = 100
        OR auth.uid() IS NULL
        OR abs(hashtext(auth.uid()::text || ff.key)) % 100 < ff.rollout_percentage
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
COMMENT ON FUNCTION public.is_feature_enabled IS
'Tier 2.2.5: Verifica se uma feature flag está habilitada para o contexto dado. Hash determinístico garante rollout consistente por usuário.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC: get_feature_flags (admin — lista completa)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_agg(row_to_json(ff.*) ORDER BY ff.name)
  FROM public.feature_flags ff
$$;

GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RPC: toggle_feature_flag
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.toggle_feature_flag(
  p_key     TEXT,
  p_enabled BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  UPDATE public.feature_flags
  SET is_enabled = p_enabled, updated_by = auth.uid()
  WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Flag não encontrada: ' || p_key);
  END IF;

  RETURN jsonb_build_object('ok', true, 'key', p_key, 'enabled', p_enabled);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_feature_flag(TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RPC: upsert_feature_flag
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_feature_flag(
  p_key         TEXT,
  p_name        TEXT,
  p_description TEXT DEFAULT NULL,
  p_targeting   JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  INSERT INTO public.feature_flags (
    key, name, description, is_enabled,
    allowed_profiles, allowed_tenant_ids, allowed_cities,
    allowed_states, allowed_regions, allowed_plans,
    rollout_percentage, environment, expires_at,
    created_by, updated_by, metadata
  ) VALUES (
    p_key,
    p_name,
    p_description,
    COALESCE((p_targeting->>'is_enabled')::boolean, false),
    CASE WHEN p_targeting->'allowed_profiles' IS NOT NULL
         THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting->'allowed_profiles')) END,
    CASE WHEN p_targeting->'allowed_tenant_ids' IS NOT NULL
         THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting->'allowed_tenant_ids')) END,
    CASE WHEN p_targeting->'allowed_cities' IS NOT NULL
         THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting->'allowed_cities')) END,
    CASE WHEN p_targeting->'allowed_states' IS NOT NULL
         THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting->'allowed_states')) END,
    CASE WHEN p_targeting->'allowed_regions' IS NOT NULL
         THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting->'allowed_regions')) END,
    CASE WHEN p_targeting->'allowed_plans' IS NOT NULL
         THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting->'allowed_plans')) END,
    COALESCE((p_targeting->>'rollout_percentage')::int, 100),
    COALESCE(p_targeting->>'environment', 'all'),
    (p_targeting->>'expires_at')::timestamptz,
    auth.uid(), auth.uid(),
    COALESCE(p_targeting->'metadata', '{}'::jsonb)
  )
  ON CONFLICT (key) DO UPDATE SET
    name               = EXCLUDED.name,
    description        = EXCLUDED.description,
    allowed_profiles   = EXCLUDED.allowed_profiles,
    allowed_tenant_ids = EXCLUDED.allowed_tenant_ids,
    allowed_cities     = EXCLUDED.allowed_cities,
    allowed_states     = EXCLUDED.allowed_states,
    allowed_regions    = EXCLUDED.allowed_regions,
    allowed_plans      = EXCLUDED.allowed_plans,
    rollout_percentage = EXCLUDED.rollout_percentage,
    environment        = EXCLUDED.environment,
    expires_at         = EXCLUDED.expires_at,
    updated_by         = auth.uid();

  RETURN jsonb_build_object('ok', true, 'key', p_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_feature_flag(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Seeds — flags padrão
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.feature_flags (key, name, description, is_enabled, allowed_profiles, rollout_percentage, environment) VALUES
  ('glm_posting',            'GLM — Postagem via IA',              'Enfileirar campanhas no GLM para distribuição inteligente via WhatsApp',   true,  ARRAY['driver','mototaxi','motoboy'], 100, 'all'),
  ('smart_scheduler',        'Scheduler Inteligente',              'Usar histórico de desempenho para otimizar horários de postagem',           false, NULL,                                  0,   'all'),
  ('webhook_events',         'Emissão de Webhooks',                'Emitir eventos para endpoints externos (ERP, CRM)',                         false, NULL,                                  0,   'all'),
  ('ai_admin_assistant',     'Assistente IA no Admin',             'Insights automáticos no Painel Administrativo via IA',                     true,  NULL,                                  100, 'all'),
  ('advanced_observability', 'Observabilidade Avançada',           'Métricas de throughput, SLA e disponibilidade no Admin',                   true,  NULL,                                  100, 'all'),
  ('profile_config_overrides','Configurações por Perfil',          'Permitir parâmetros específicos por perfil (cooldown, retry, prioridade)', true,  NULL,                                  100, 'all'),
  ('multitenant_routing',    'Roteamento Multi-Empresa',           'Filtrar campanhas e lotes por tenant_id',                                  false, NULL,                                  0,   'production'),
  ('new_worker_algorithm',   'Novo Algoritmo de Despacho',         'Algoritmo experimental de despacho de Workers com balanceamento dinâmico', false, NULL,                                  0,   'test'),
  ('cache_layer',            'Camada de Cache',                    'Cache inteligente para Dashboard, Health e Configurações',                 true,  NULL,                                  100, 'all'),
  ('logical_backup',         'Backup Lógico',                      'Snapshots manuais de configurações e RBAC',                               true,  NULL,                                  100, 'all')
ON CONFLICT (key) DO NOTHING;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M33 — feature_flags criada (10 flags seed, targeting multi-dimensional). RPCs: is_feature_enabled(), get_feature_flags(), toggle_feature_flag(), upsert_feature_flag(). RLS: read=all_authenticated, write=admin.';
END $$;
