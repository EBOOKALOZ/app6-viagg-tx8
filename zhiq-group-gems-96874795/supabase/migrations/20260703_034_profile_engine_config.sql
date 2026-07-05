-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M34: Configuração Específica por Perfil
--
-- Expande motor_universal_config (M28) com overrides por perfil.
-- Cada perfil pode ter parâmetros próprios que substituem os globais.
-- NULL em qualquer coluna = usar valor global do motor_universal_config.
--
-- Tabela:
--   profile_engine_config — overrides por perfil
--
-- RPCs (SECURITY DEFINER):
--   get_effective_engine_config(profile_type) → JSONB (merge global + perfil)
--   update_profile_engine_config(profile_type, config JSONB) → JSONB
--   reset_profile_engine_config(profile_type) → JSONB (volta ao global)
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: profile_engine_config
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_engine_config (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type         TEXT        NOT NULL UNIQUE,      -- 'lojista'|'driver'|'motoboy'|'mototaxi'
  -- Rate limits (NULL = usar global)
  max_per_minute       INT,
  max_per_hour         INT,
  max_per_day          INT,
  cooldown_seconds     INT,
  -- Retry (NULL = usar global)
  max_retries          INT,
  base_delay_seconds   INT,
  max_delay_seconds    INT,
  backoff_multiplier   NUMERIC(4,2),
  -- Worker (NULL = usar global)
  timeout_seconds      INT,
  max_lot_size         INT,
  -- Campaign (NULL = usar global)
  default_priority     TEXT,                            -- 'low'|'normal'|'high'|'urgent'
  max_active_campaigns INT,
  -- Balanceamento (NULL = usar padrão)
  balancing_strategy   TEXT        DEFAULT 'round_robin', -- 'round_robin'|'least_loaded'|'random'|'priority'
  -- Flags
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  -- Audit
  updated_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_engine_config IS
'Tier 2.2.5: Overrides do Motor Universal por perfil. NULL = herdar configuração global de motor_universal_config.';

-- CHECK constraints
DO $$ BEGIN
  ALTER TABLE public.profile_engine_config
    ADD CONSTRAINT pec_profile_type_check
    CHECK (profile_type IN ('lojista','driver','motoboy','mototaxi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profile_engine_config
    ADD CONSTRAINT pec_priority_check
    CHECK (default_priority IS NULL OR default_priority IN ('low','normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profile_engine_config
    ADD CONSTRAINT pec_balancing_check
    CHECK (balancing_strategy IN ('round_robin','least_loaded','random','priority'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.trg_fn_pec_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pec_updated_at ON public.profile_engine_config;
CREATE TRIGGER trg_pec_updated_at
  BEFORE UPDATE ON public.profile_engine_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_pec_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profile_engine_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_engine_config' AND policyname='pec_select_authenticated') THEN
    CREATE POLICY "pec_select_authenticated"
      ON public.profile_engine_config FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_engine_config' AND policyname='pec_write_admin') THEN
    CREATE POLICY "pec_write_admin"
      ON public.profile_engine_config FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Seeds — configurações padrão (todos os overrides NULL = herda global)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.profile_engine_config
  (profile_type, balancing_strategy, is_active, notes)
VALUES
  ('lojista',  'round_robin',  true, 'Lojistas: configuração padrão. Cooldown menor para maior frequência.'),
  ('driver',   'priority',     true, 'Motoristas: prioridade alta para alertas de corridas em tempo real.'),
  ('mototaxi', 'priority',     true, 'Moto Táxi: mesma prioridade que Driver.'),
  ('motoboy',  'least_loaded', true, 'Motoboy: balanceamento por menor carga (entregas distribuídas).')
ON CONFLICT (profile_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: get_effective_engine_config — merge global + override por perfil
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_effective_engine_config(
  p_profile_type TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_global  JSONB;
  v_profile JSONB;
  v_merged  JSONB;
BEGIN
  -- Config global do motor_universal_config (M28)
  SELECT jsonb_object_agg(key, value) INTO v_global
  FROM public.motor_universal_config;

  v_merged := COALESCE(v_global, '{}'::jsonb);

  IF p_profile_type IS NOT NULL THEN
    -- Override específico do perfil
    SELECT row_to_json(pec)::jsonb INTO v_profile
    FROM public.profile_engine_config pec
    WHERE pec.profile_type = p_profile_type AND pec.is_active = true;

    IF v_profile IS NOT NULL THEN
      -- Sobrescrever apenas campos não-nulos do perfil
      IF (v_profile->>'max_per_minute')     IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('max_per_minute_default', v_profile->>'max_per_minute'); END IF;
      IF (v_profile->>'max_per_hour')       IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('max_per_hour_default', v_profile->>'max_per_hour'); END IF;
      IF (v_profile->>'max_per_day')        IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('max_per_day_default', v_profile->>'max_per_day'); END IF;
      IF (v_profile->>'cooldown_seconds')   IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('cooldown_seconds_default', v_profile->>'cooldown_seconds'); END IF;
      IF (v_profile->>'max_retries')        IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('max_retries', v_profile->>'max_retries'); END IF;
      IF (v_profile->>'base_delay_seconds') IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('base_delay_seconds', v_profile->>'base_delay_seconds'); END IF;
      IF (v_profile->>'max_delay_seconds')  IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('max_delay_seconds', v_profile->>'max_delay_seconds'); END IF;
      IF (v_profile->>'timeout_seconds')    IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('timeout_seconds', v_profile->>'timeout_seconds'); END IF;
      IF (v_profile->>'max_lot_size')       IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('max_lot_size', v_profile->>'max_lot_size'); END IF;
      IF (v_profile->>'default_priority')   IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('default_priority', v_profile->>'default_priority'); END IF;
      IF (v_profile->>'max_active_campaigns') IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('max_active_per_user', v_profile->>'max_active_campaigns'); END IF;
      IF (v_profile->>'balancing_strategy') IS NOT NULL THEN v_merged := v_merged || jsonb_build_object('balancing_strategy', v_profile->>'balancing_strategy'); END IF;

      v_merged := v_merged || jsonb_build_object('profile_type', p_profile_type, 'profile_override_active', true);
    ELSE
      v_merged := v_merged || jsonb_build_object('profile_type', p_profile_type, 'profile_override_active', false);
    END IF;
  END IF;

  RETURN v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_engine_config(TEXT) TO authenticated;
COMMENT ON FUNCTION public.get_effective_engine_config IS
'Tier 2.2.5: Retorna config efetiva do Motor = global + overrides do perfil. NULL = somente global.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC: update_profile_engine_config
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_profile_engine_config(
  p_profile_type TEXT,
  p_config       JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  IF p_profile_type NOT IN ('lojista','driver','motoboy','mototaxi') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_type inválido: ' || p_profile_type);
  END IF;

  UPDATE public.profile_engine_config
  SET
    max_per_minute       = COALESCE((p_config->>'max_per_minute')::int,       max_per_minute),
    max_per_hour         = COALESCE((p_config->>'max_per_hour')::int,         max_per_hour),
    max_per_day          = COALESCE((p_config->>'max_per_day')::int,          max_per_day),
    cooldown_seconds     = COALESCE((p_config->>'cooldown_seconds')::int,     cooldown_seconds),
    max_retries          = COALESCE((p_config->>'max_retries')::int,          max_retries),
    base_delay_seconds   = COALESCE((p_config->>'base_delay_seconds')::int,   base_delay_seconds),
    max_delay_seconds    = COALESCE((p_config->>'max_delay_seconds')::int,    max_delay_seconds),
    timeout_seconds      = COALESCE((p_config->>'timeout_seconds')::int,      timeout_seconds),
    max_lot_size         = COALESCE((p_config->>'max_lot_size')::int,         max_lot_size),
    default_priority     = COALESCE(p_config->>'default_priority',            default_priority),
    max_active_campaigns = COALESCE((p_config->>'max_active_campaigns')::int, max_active_campaigns),
    balancing_strategy   = COALESCE(p_config->>'balancing_strategy',          balancing_strategy),
    notes                = COALESCE(p_config->>'notes',                       notes),
    updated_by           = auth.uid()
  WHERE profile_type = p_profile_type;

  PERFORM public.log_posting_event(
    'ProfileConfigUpdated', auth.uid(), NULL, NULL, NULL, NULL,
    p_profile_type, NULL, 'admin',
    jsonb_build_object('profile_type', p_profile_type, 'config', p_config),
    true, NULL
  );

  RETURN jsonb_build_object('ok', true, 'profile_type', p_profile_type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile_engine_config(TEXT, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RPC: reset_profile_engine_config (volta tudo para NULL = global)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_profile_engine_config(p_profile_type TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  UPDATE public.profile_engine_config
  SET
    max_per_minute = NULL, max_per_hour = NULL, max_per_day = NULL,
    cooldown_seconds = NULL, max_retries = NULL, base_delay_seconds = NULL,
    max_delay_seconds = NULL, timeout_seconds = NULL, max_lot_size = NULL,
    default_priority = NULL, max_active_campaigns = NULL,
    balancing_strategy = 'round_robin', updated_by = auth.uid(),
    notes = 'Reset para configuração global em ' || now()::text
  WHERE profile_type = p_profile_type;

  RETURN jsonb_build_object('ok', true, 'profile_type', p_profile_type, 'reset', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_profile_engine_config(TEXT) TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M34 — profile_engine_config criada (4 perfis seed, todos herdando global). RPCs: get_effective_engine_config(), update_profile_engine_config(), reset_profile_engine_config(). Config efetiva = global (M28) + overrides por perfil.';
END $$;
