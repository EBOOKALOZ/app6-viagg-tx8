-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M38: Camada de Cache Inteligente
--
-- Reduz consultas repetitivas ao Motor Universal.
-- Implementação: tabela motor_cache_store (key → JSONB + TTL).
-- Invalidação: manual (RPC) ou automática via triggers nos dados-fonte.
--
-- Prioridades de cache:
--   dashboard     — stats principais do painel
--   health        — saúde do motor (get_motor_health)
--   configs       — motor_universal_config
--   profile_config — profile_engine_config por perfil
--   metrics       — posting_metrics_daily (últimos 7 dias)
--   workers       — status dos workers
--   sla           — SLA por perfil
--   commissions   — commission_summary_by_profile
--
-- RPCs (SECURITY DEFINER):
--   cache_get(key)                           → JSONB | NULL (se expirado)
--   cache_set(key, value, ttl_seconds)       → void
--   cache_invalidate(key)                    → void
--   refresh_motor_cache()                    → JSONB (recalcula todos os buckets)
--   get_cache_status()                       → JSONB (quais buckets estão frescos)
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: motor_cache_store
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.motor_cache_store (
  key          TEXT        PRIMARY KEY,
  value        JSONB       NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count    INT         NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.motor_cache_store IS
'Tier 2.2.5: Cache key-value com TTL para consultas repetitivas do Motor Universal. Substituir por Redis no Tier 2.3.';

CREATE INDEX IF NOT EXISTS idx_cache_expires ON public.motor_cache_store (expires_at);

ALTER TABLE public.motor_cache_store ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_cache_store' AND policyname='cache_select_admin') THEN
    CREATE POLICY "cache_select_admin" ON public.motor_cache_store FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RPC: cache_get (retorna valor se não expirado)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cache_get(p_key TEXT)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  UPDATE public.motor_cache_store
  SET hit_count = hit_count + 1
  WHERE key = p_key AND expires_at > now()
  RETURNING value;
$$;

GRANT EXECUTE ON FUNCTION public.cache_get(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RPC: cache_set
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cache_set(
  p_key         TEXT,
  p_value       JSONB,
  p_ttl_seconds INT DEFAULT 60
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.motor_cache_store (key, value, expires_at, refreshed_at, hit_count)
  VALUES (p_key, p_value, now() + (p_ttl_seconds || ' seconds')::interval, now(), 0)
  ON CONFLICT (key) DO UPDATE SET
    value        = EXCLUDED.value,
    expires_at   = EXCLUDED.expires_at,
    refreshed_at = now(),
    hit_count    = 0
$$;

GRANT EXECUTE ON FUNCTION public.cache_set(TEXT, JSONB, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: cache_invalidate
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cache_invalidate(p_key TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.motor_cache_store WHERE key = p_key
$$;

GRANT EXECUTE ON FUNCTION public.cache_invalidate(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC: refresh_motor_cache — recalcula todos os buckets
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_motor_cache()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health      JSONB;
  v_observ      JSONB;
  v_configs     JSONB;
  v_versions    JSONB;
  v_commissions JSONB;
  v_summary     JSONB;
BEGIN
  -- health (TTL: 30s)
  SELECT public.get_motor_health() INTO v_health;
  PERFORM public.cache_set('health', COALESCE(v_health, '{}'::jsonb), 30);

  -- observabilidade avançada (TTL: 60s)
  SELECT public.get_advanced_observability() INTO v_observ;
  PERFORM public.cache_set('observability', COALESCE(v_observ, '{}'::jsonb), 60);

  -- configs do motor (TTL: 300s — muda raramente)
  SELECT jsonb_object_agg(key, value) INTO v_configs
  FROM public.motor_universal_config;
  PERFORM public.cache_set('motor_config', COALESCE(v_configs, '{}'::jsonb), 300);

  -- versões (TTL: 3600s — muda só em deploy)
  SELECT public.get_motor_versions() INTO v_versions;
  PERFORM public.cache_set('versions', COALESCE(v_versions, '{}'::jsonb), 3600);

  -- comissões por perfil (TTL: 120s)
  SELECT jsonb_agg(row_to_json(c.*)) INTO v_commissions
  FROM public.commission_summary_by_profile c;
  PERFORM public.cache_set('commissions', COALESCE(v_commissions, '[]'::jsonb), 120);

  -- Limpar entradas expiradas (housekeeping)
  DELETE FROM public.motor_cache_store WHERE expires_at < now() - INTERVAL '1 hour';

  v_summary := jsonb_build_object(
    'ok', true,
    'buckets_refreshed', jsonb_build_array('health', 'observability', 'motor_config', 'versions', 'commissions'),
    'refreshed_at', now()
  );

  RETURN v_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_motor_cache() TO authenticated;
COMMENT ON FUNCTION public.refresh_motor_cache IS
'Tier 2.2.5: Recalcula e armazena todos os buckets de cache do Motor Universal. Deve ser chamado periodicamente (pg_cron ou admin manual).';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RPC: get_cache_status — quais buckets existem e se estão frescos
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cache_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'key',          key,
    'fresh',        expires_at > now(),
    'expires_at',   expires_at,
    'refreshed_at', refreshed_at,
    'hit_count',    hit_count,
    'ttl_remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (expires_at - now()))::INT)
  ) ORDER BY key)
  FROM public.motor_cache_store
$$;

GRANT EXECUTE ON FUNCTION public.get_cache_status() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Trigger de invalidação automática ao alterar motor_universal_config
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_invalidate_config_cache()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.cache_invalidate('motor_config');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_invalidate_config_cache ON public.motor_universal_config;
CREATE TRIGGER trg_invalidate_config_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.motor_universal_config
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_invalidate_config_cache();

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M38 — motor_cache_store criada (TTL por bucket). RPCs: cache_get(), cache_set(), cache_invalidate(), refresh_motor_cache() (5 buckets: health, observability, motor_config, versions, commissions), get_cache_status(). Trigger de invalidação automática em motor_universal_config.';
END $$;
