-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M39: Backup Lógico — Snapshots do Motor Universal
--
-- Mecanismo para captura periódica (ou manual via Admin) do estado dos
-- principais módulos. Permite restauração seletiva sem restaurar o banco inteiro.
--
-- Módulos cobertos no snapshot:
--   motor_config   — motor_universal_config (todos os parâmetros)
--   profile_config — profile_engine_config (overrides por perfil)
--   feature_flags  — estado de todas as flags
--   rbac           — roles + permissions + assignments
--   tenant_config  — tenant_registry
--   rate_limits    — rate_limit_config
--   versions       — motor_version_registry
--
-- Tabelas:
--   motor_snapshots       — metadata de cada snapshot
--   motor_snapshot_data   — dados JSONB por módulo por snapshot
--
-- RPCs (SECURITY DEFINER):
--   create_motor_snapshot(label, modules[])        → JSONB
--   list_motor_snapshots(limit)                    → JSONB
--   get_motor_snapshot(snapshot_id)                → JSONB
--   restore_motor_config_from_snapshot(snapshot_id) → JSONB (apenas motor_config)
--   delete_motor_snapshot(snapshot_id)             → JSONB
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: motor_snapshots
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.motor_snapshots (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT        NOT NULL,
  trigger      TEXT        NOT NULL DEFAULT 'manual',  -- 'manual' | 'scheduled' | 'pre_deploy' | 'post_deploy'
  modules      TEXT[]      NOT NULL,                   -- módulos capturados
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT,
  is_pinned    BOOLEAN     NOT NULL DEFAULT false       -- impede deleção automática
);

COMMENT ON TABLE public.motor_snapshots IS
'Tier 2.2.5: Metadata de cada snapshot lógico do Motor Universal.';

DO $$ BEGIN
  ALTER TABLE public.motor_snapshots
    ADD CONSTRAINT ms_trigger_check
    CHECK (trigger IN ('manual','scheduled','pre_deploy','post_deploy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ms_created_at ON public.motor_snapshots (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Tabela: motor_snapshot_data
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.motor_snapshot_data (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID        NOT NULL REFERENCES public.motor_snapshots(id) ON DELETE CASCADE,
  module      TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  row_count   INT
);

COMMENT ON TABLE public.motor_snapshot_data IS
'Tier 2.2.5: Dados JSONB por módulo de cada snapshot. Referencia motor_snapshots.';

CREATE INDEX IF NOT EXISTS idx_msd_snapshot_module ON public.motor_snapshot_data (snapshot_id, module);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.motor_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_snapshot_data ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_snapshots' AND policyname='ms_select_admin') THEN
    CREATE POLICY "ms_select_admin" ON public.motor_snapshots FOR SELECT TO authenticated USING (public.is_admin() OR public.has_permission('audit:read'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_snapshots' AND policyname='ms_write_admin') THEN
    CREATE POLICY "ms_write_admin" ON public.motor_snapshots FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_snapshot_data' AND policyname='msd_select_admin') THEN
    CREATE POLICY "msd_select_admin" ON public.motor_snapshot_data FOR SELECT TO authenticated USING (public.is_admin() OR public.has_permission('audit:read'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_snapshot_data' AND policyname='msd_write_admin') THEN
    CREATE POLICY "msd_write_admin" ON public.motor_snapshot_data FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: create_motor_snapshot
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_motor_snapshot(
  p_label   TEXT,
  p_trigger TEXT    DEFAULT 'manual',
  p_modules TEXT[]  DEFAULT ARRAY['motor_config','profile_config','feature_flags','rbac','rate_limits','versions']
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id UUID;
  v_data        JSONB;
  v_count       INT;
  v_mod         TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  IF char_length(COALESCE(p_label,'')) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Label deve ter ao menos 3 caracteres');
  END IF;

  -- Criar registro do snapshot
  INSERT INTO public.motor_snapshots (label, trigger, modules, created_by)
  VALUES (p_label, p_trigger, p_modules, auth.uid())
  RETURNING id INTO v_snapshot_id;

  -- Capturar cada módulo solicitado
  FOREACH v_mod IN ARRAY p_modules
  LOOP
    v_data  := NULL;
    v_count := 0;

    IF v_mod = 'motor_config' THEN
      SELECT jsonb_agg(row_to_json(t.*)), COUNT(*) INTO v_data, v_count
      FROM public.motor_universal_config t;

    ELSIF v_mod = 'profile_config' THEN
      SELECT jsonb_agg(row_to_json(t.*)), COUNT(*) INTO v_data, v_count
      FROM public.profile_engine_config t;

    ELSIF v_mod = 'feature_flags' THEN
      SELECT jsonb_agg(row_to_json(t.*)), COUNT(*) INTO v_data, v_count
      FROM public.feature_flags t;

    ELSIF v_mod = 'rbac' THEN
      SELECT jsonb_build_object(
        'roles',            (SELECT jsonb_agg(row_to_json(r.*)) FROM public.system_roles r),
        'permissions',      (SELECT jsonb_agg(row_to_json(p.*)) FROM public.system_permissions p),
        'role_permissions', (SELECT jsonb_agg(row_to_json(rp.*)) FROM public.role_permissions rp),
        'user_assignments', (SELECT COUNT(*) FROM public.user_role_assignments)
      ) INTO v_data;
      v_count := (SELECT COUNT(*) FROM public.system_roles);

    ELSIF v_mod = 'rate_limits' THEN
      SELECT jsonb_agg(row_to_json(t.*)), COUNT(*) INTO v_data, v_count
      FROM public.rate_limit_config t;

    ELSIF v_mod = 'versions' THEN
      SELECT public.get_motor_versions() INTO v_data;
      v_count := (SELECT COUNT(*) FROM public.motor_version_registry WHERE is_current = true);

    ELSIF v_mod = 'tenant_config' THEN
      SELECT jsonb_agg(row_to_json(t.*)), COUNT(*) INTO v_data, v_count
      FROM public.tenant_registry t;
    END IF;

    IF v_data IS NOT NULL THEN
      INSERT INTO public.motor_snapshot_data (snapshot_id, module, data, row_count)
      VALUES (v_snapshot_id, v_mod, v_data, COALESCE(v_count, 0));
    END IF;
  END LOOP;

  PERFORM public.log_posting_event(
    'SnapshotCreated', auth.uid(), NULL, NULL, NULL, NULL, NULL, NULL, 'admin',
    jsonb_build_object('snapshot_id', v_snapshot_id, 'label', p_label, 'modules', p_modules),
    true, NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot_id', v_snapshot_id,
    'label', p_label,
    'modules', p_modules,
    'created_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_motor_snapshot(TEXT, TEXT, TEXT[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC: list_motor_snapshots
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_motor_snapshots(p_limit INT DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'id',         ms.id,
    'label',      ms.label,
    'trigger',    ms.trigger,
    'modules',    ms.modules,
    'is_pinned',  ms.is_pinned,
    'created_at', ms.created_at,
    'notes',      ms.notes,
    'module_count', (SELECT COUNT(*) FROM public.motor_snapshot_data WHERE snapshot_id = ms.id)
  ) ORDER BY ms.created_at DESC)
  FROM (
    SELECT * FROM public.motor_snapshots
    ORDER BY created_at DESC
    LIMIT LEAST(p_limit, 100)
  ) ms
$$;

GRANT EXECUTE ON FUNCTION public.list_motor_snapshots(INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RPC: get_motor_snapshot (dados completos)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_motor_snapshot(p_snapshot_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_meta RECORD;
  v_data JSONB;
BEGIN
  SELECT * INTO v_meta FROM public.motor_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Snapshot não encontrado');
  END IF;

  SELECT jsonb_object_agg(module, data) INTO v_data
  FROM public.motor_snapshot_data
  WHERE snapshot_id = p_snapshot_id;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot', row_to_json(v_meta),
    'data', COALESCE(v_data, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_motor_snapshot(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RPC: restore_motor_config_from_snapshot (APENAS motor_config)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_motor_config_from_snapshot(
  p_snapshot_id UUID,
  p_dry_run     BOOLEAN DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config_data JSONB;
  v_item        JSONB;
  v_count       INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  SELECT data INTO v_config_data
  FROM public.motor_snapshot_data
  WHERE snapshot_id = p_snapshot_id AND module = 'motor_config';

  IF v_config_data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Snapshot não contém módulo motor_config');
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'config_count', jsonb_array_length(v_config_data),
      'preview', v_config_data
    );
  END IF;

  -- Restaurar (apenas valores editáveis)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_config_data)
  LOOP
    IF (v_item->>'is_editable_admin')::boolean = true THEN
      UPDATE public.motor_universal_config
      SET value = v_item->>'value', updated_by = auth.uid(), updated_at = now()
      WHERE key = v_item->>'key';
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'restored_count', v_count, 'snapshot_id', p_snapshot_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_motor_config_from_snapshot(UUID, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RPC: delete_motor_snapshot
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_motor_snapshot(p_snapshot_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_snap RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  SELECT * INTO v_snap FROM public.motor_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Snapshot não encontrado');
  END IF;

  IF v_snap.is_pinned THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Snapshot está fixado (pinned). Desafixe primeiro.');
  END IF;

  DELETE FROM public.motor_snapshots WHERE id = p_snapshot_id;
  RETURN jsonb_build_object('ok', true, 'deleted', true, 'label', v_snap.label);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_motor_snapshot(UUID) TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M39 — motor_snapshots + motor_snapshot_data criadas (RLS admin+audit). RPCs: create_motor_snapshot() (6 módulos: motor_config, profile_config, feature_flags, rbac, rate_limits, versions), list_motor_snapshots(), get_motor_snapshot(), restore_motor_config_from_snapshot() (dry_run seguro), delete_motor_snapshot().';
END $$;
