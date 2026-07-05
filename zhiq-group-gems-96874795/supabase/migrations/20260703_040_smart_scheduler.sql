-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M40: Scheduler Inteligente
--
-- Evolui o Scheduler existente com decisões baseadas em histórico.
-- Não altera o Motor Universal — adiciona uma camada de dados de apoio.
--
-- O Scheduler atual pode consultar estas tabelas para:
--   • escolher horários com maior taxa de sucesso por perfil/cidade/categoria
--   • evitar horários de pico de erros
--   • selecionar workers com melhor desempenho para um tipo de campanha
--   • aprender com o histórico de retries e falhas
--
-- Tabelas:
--   scheduler_performance_log    — snapshot diário de desempenho por slot de hora
--   scheduler_time_preferences   — preferências computadas (melhor hora por contexto)
--
-- Views:
--   scheduler_best_hours_by_profile — top 5 melhores horários por perfil
--   scheduler_best_hours_by_city    — top 5 melhores horários por cidade
--   scheduler_worker_rankings       — workers ordenados por taxa de sucesso
--
-- RPCs (SECURITY DEFINER):
--   get_scheduler_recommendations(profile_type, city, state) → JSONB
--   log_scheduler_performance(hour_slot, profile, success, duration_ms) → void
--   refresh_scheduler_preferences()                          → JSONB
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: scheduler_performance_log
-- Snapshot agregado por dia + hora + perfil + cidade
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scheduler_performance_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  hour_of_day     INT         NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week     INT         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Domingo, 6=Sábado
  profile_type    TEXT,
  city            TEXT,
  state_code      TEXT,
  region_code     TEXT,
  -- Métricas do slot
  total_attempts  INT         NOT NULL DEFAULT 0,
  successes       INT         NOT NULL DEFAULT 0,
  failures        INT         NOT NULL DEFAULT 0,
  retries         INT         NOT NULL DEFAULT 0,
  avg_duration_ms INT,                                -- tempo médio de postagem
  p95_duration_ms INT,                                -- p95 do tempo
  -- Contexto
  sample_size     INT         NOT NULL DEFAULT 0,     -- quantas campanhas amostradas
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (log_date, hour_of_day, profile_type, city, state_code)
);

COMMENT ON TABLE public.scheduler_performance_log IS
'Tier 2.2.5: Histórico de desempenho por slot de hora/dia/perfil/cidade. Alimenta o Scheduler Inteligente.';

CREATE INDEX IF NOT EXISTS idx_spl_profile_hour ON public.scheduler_performance_log (profile_type, hour_of_day, day_of_week, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_spl_city_hour    ON public.scheduler_performance_log (city, hour_of_day, log_date DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Tabela: scheduler_time_preferences
-- Preferências computadas (melhor hora por contexto)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scheduler_time_preferences (
  id               UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type     TEXT,
  city             TEXT,
  state_code       TEXT,
  category         TEXT,                           -- categoria do produto/serviço
  preferred_hours  INT[]    NOT NULL DEFAULT '{}', -- horas recomendadas (0-23)
  avoid_hours      INT[]    NOT NULL DEFAULT '{}', -- horas a evitar
  success_rate_avg NUMERIC(5,2),                   -- taxa de sucesso média histórica
  sample_days      INT      NOT NULL DEFAULT 0,    -- quantos dias de dado
  confidence       TEXT     NOT NULL DEFAULT 'low', -- 'low'|'medium'|'high'
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT,
  UNIQUE (profile_type, city, state_code, category)
);

COMMENT ON TABLE public.scheduler_time_preferences IS
'Tier 2.2.5: Preferências de horário computadas pelo Scheduler Inteligente. Confiança cresce com o volume de dados.';

DO $$ BEGIN
  ALTER TABLE public.scheduler_time_preferences
    ADD CONSTRAINT stp_confidence_check
    CHECK (confidence IN ('low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.scheduler_performance_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_time_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scheduler_performance_log' AND policyname='spl_select_admin') THEN
    CREATE POLICY "spl_select_admin" ON public.scheduler_performance_log FOR SELECT TO authenticated USING (public.is_admin() OR public.is_supervisor());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scheduler_performance_log' AND policyname='spl_write_rpc') THEN
    -- Workers/RPCs gravam via SECURITY DEFINER — não precisam de policy própria
    -- Admin pode inserir/atualizar
    CREATE POLICY "spl_write_admin" ON public.scheduler_performance_log FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scheduler_time_preferences' AND policyname='stp_select_admin') THEN
    CREATE POLICY "stp_select_admin" ON public.scheduler_time_preferences FOR SELECT TO authenticated USING (public.is_admin() OR public.is_supervisor());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scheduler_time_preferences' AND policyname='stp_write_admin') THEN
    CREATE POLICY "stp_write_admin" ON public.scheduler_time_preferences FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. View: scheduler_best_hours_by_profile
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.scheduler_best_hours_by_profile AS
WITH ranked AS (
  SELECT
    profile_type,
    hour_of_day,
    SUM(total_attempts) AS total,
    SUM(successes)      AS ok,
    SUM(failures)       AS fail,
    ROUND(100.0 * SUM(successes) / NULLIF(SUM(total_attempts), 0), 1) AS success_rate_pct,
    COUNT(DISTINCT log_date) AS data_days,
    ROW_NUMBER() OVER (
      PARTITION BY profile_type
      ORDER BY ROUND(100.0 * SUM(successes) / NULLIF(SUM(total_attempts), 0), 1) DESC,
               SUM(total_attempts) DESC
    ) AS rank
  FROM public.scheduler_performance_log
  WHERE log_date >= CURRENT_DATE - 30
    AND profile_type IS NOT NULL
  GROUP BY profile_type, hour_of_day
)
SELECT
  profile_type,
  hour_of_day,
  total,
  ok AS successes,
  fail AS failures,
  success_rate_pct,
  data_days,
  rank,
  CASE WHEN data_days >= 14 THEN 'high' WHEN data_days >= 7 THEN 'medium' ELSE 'low' END AS confidence
FROM ranked
WHERE rank <= 5
ORDER BY profile_type, rank;

GRANT SELECT ON public.scheduler_best_hours_by_profile TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. View: scheduler_best_hours_by_city
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.scheduler_best_hours_by_city AS
WITH ranked AS (
  SELECT
    city,
    state_code,
    hour_of_day,
    SUM(total_attempts) AS total,
    SUM(successes)      AS ok,
    ROUND(100.0 * SUM(successes) / NULLIF(SUM(total_attempts), 0), 1) AS success_rate_pct,
    COUNT(DISTINCT log_date) AS data_days,
    ROW_NUMBER() OVER (
      PARTITION BY city, state_code
      ORDER BY ROUND(100.0 * SUM(successes) / NULLIF(SUM(total_attempts), 0), 1) DESC
    ) AS rank
  FROM public.scheduler_performance_log
  WHERE log_date >= CURRENT_DATE - 30
    AND city IS NOT NULL
  GROUP BY city, state_code, hour_of_day
)
SELECT city, state_code, hour_of_day, total, ok AS successes, success_rate_pct, data_days, rank
FROM ranked WHERE rank <= 5
ORDER BY city, state_code, rank;

GRANT SELECT ON public.scheduler_best_hours_by_city TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. View: scheduler_worker_rankings
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.scheduler_worker_rankings AS
SELECT
  pw.id AS worker_id,
  pw.name AS worker_name,
  pw.status,
  pw.profile_type,
  COUNT(pel.id) AS total_events_30d,
  COUNT(pel.id) FILTER (WHERE pel.success) AS successes_30d,
  ROUND(
    100.0 * COUNT(pel.id) FILTER (WHERE pel.success) / NULLIF(COUNT(pel.id), 0),
    1
  ) AS success_rate_pct,
  AVG(CASE WHEN pel.success THEN 1 ELSE 0 END) AS avg_success_ratio,
  -- Ranking dentro do perfil
  RANK() OVER (
    PARTITION BY pw.profile_type
    ORDER BY ROUND(
      100.0 * COUNT(pel.id) FILTER (WHERE pel.success) / NULLIF(COUNT(pel.id), 0),
      1
    ) DESC
  ) AS rank_in_profile
FROM public.posting_workers pw
LEFT JOIN public.posting_event_log pel
  ON pel.worker_id = pw.id
  AND pel.timestamp >= now() - INTERVAL '30 days'
GROUP BY pw.id, pw.name, pw.status, pw.profile_type;

GRANT SELECT ON public.scheduler_worker_rankings TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RPC: get_scheduler_recommendations
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_scheduler_recommendations(
  p_profile_type TEXT    DEFAULT NULL,
  p_city         TEXT    DEFAULT NULL,
  p_state        TEXT    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_best_hours_profile JSONB;
  v_best_hours_city    JSONB;
  v_best_workers       JSONB;
  v_preferences        JSONB;
  v_current_hour       INT := EXTRACT(HOUR FROM now())::INT;
  v_current_dow        INT := EXTRACT(DOW FROM now())::INT;
BEGIN
  -- Melhores horários por perfil
  SELECT jsonb_agg(row_to_json(h.*))
  INTO v_best_hours_profile
  FROM (
    SELECT * FROM public.scheduler_best_hours_by_profile
    WHERE (p_profile_type IS NULL OR profile_type = p_profile_type)
    ORDER BY success_rate_pct DESC
    LIMIT 10
  ) h;

  -- Melhores horários por cidade
  SELECT jsonb_agg(row_to_json(c.*))
  INTO v_best_hours_city
  FROM (
    SELECT * FROM public.scheduler_best_hours_by_city
    WHERE (p_city IS NULL OR city = p_city)
      AND (p_state IS NULL OR state_code = p_state)
    ORDER BY success_rate_pct DESC
    LIMIT 10
  ) c;

  -- Top workers para o perfil
  SELECT jsonb_agg(row_to_json(w.*))
  INTO v_best_workers
  FROM (
    SELECT worker_id, worker_name, status, profile_type, success_rate_pct, rank_in_profile
    FROM public.scheduler_worker_rankings
    WHERE (p_profile_type IS NULL OR profile_type = p_profile_type)
      AND status IN ('idle','busy')
    ORDER BY rank_in_profile
    LIMIT 5
  ) w;

  -- Preferências salvas
  SELECT jsonb_agg(row_to_json(sp.*))
  INTO v_preferences
  FROM public.scheduler_time_preferences sp
  WHERE (p_profile_type IS NULL OR profile_type = p_profile_type)
    AND (p_city IS NULL OR city = p_city)
    AND (p_state IS NULL OR state_code = p_state)
  LIMIT 5;

  RETURN jsonb_build_object(
    'best_hours_by_profile', COALESCE(v_best_hours_profile, '[]'::jsonb),
    'best_hours_by_city',    COALESCE(v_best_hours_city, '[]'::jsonb),
    'top_workers',           COALESCE(v_best_workers, '[]'::jsonb),
    'saved_preferences',     COALESCE(v_preferences, '[]'::jsonb),
    'current_hour',          v_current_hour,
    'current_day_of_week',   v_current_dow,
    'profile_type',          p_profile_type,
    'city',                  p_city,
    'note',                  CASE
      WHEN (SELECT COUNT(*) FROM public.scheduler_performance_log) = 0
      THEN 'Ainda sem dados históricos. As recomendações ficam disponíveis após o Motor processar campanhas.'
      ELSE NULL
    END,
    'computed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scheduler_recommendations(TEXT, TEXT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.get_scheduler_recommendations IS
'Tier 2.2.5: Recomendações de horário e worker baseadas em histórico. Retorna dados das views de preferências.';

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RPC: log_scheduler_performance (chamada pelo Worker após postagem)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_scheduler_performance(
  p_hour_slot    INT,
  p_profile_type TEXT    DEFAULT NULL,
  p_success      BOOLEAN DEFAULT true,
  p_duration_ms  INT     DEFAULT NULL,
  p_city         TEXT    DEFAULT NULL,
  p_state_code   TEXT    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.scheduler_performance_log (
    log_date, hour_of_day, day_of_week,
    profile_type, city, state_code,
    total_attempts, successes, failures,
    avg_duration_ms, sample_size
  ) VALUES (
    CURRENT_DATE, p_hour_slot, EXTRACT(DOW FROM now())::INT,
    p_profile_type, p_city, p_state_code,
    1,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    p_duration_ms, 1
  )
  ON CONFLICT (log_date, hour_of_day, profile_type, city, state_code) DO UPDATE SET
    total_attempts  = scheduler_performance_log.total_attempts + 1,
    successes       = scheduler_performance_log.successes + CASE WHEN p_success THEN 1 ELSE 0 END,
    failures        = scheduler_performance_log.failures  + CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    avg_duration_ms = CASE
      WHEN p_duration_ms IS NOT NULL THEN
        ((scheduler_performance_log.avg_duration_ms * scheduler_performance_log.sample_size) + p_duration_ms)
        / (scheduler_performance_log.sample_size + 1)
      ELSE scheduler_performance_log.avg_duration_ms
    END,
    sample_size     = scheduler_performance_log.sample_size + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_scheduler_performance(INT, TEXT, BOOLEAN, INT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. RPC: refresh_scheduler_preferences (recalcula preferências computadas)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_scheduler_preferences()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted INT := 0;
  v_profile  RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  -- Recomputar preferências para cada perfil com dados suficientes (>= 3 dias)
  FOR v_profile IN
    SELECT profile_type,
           ARRAY_AGG(hour_of_day ORDER BY success_rate_pct DESC) FILTER (WHERE success_rate_pct >= 80) AS preferred,
           ARRAY_AGG(hour_of_day ORDER BY success_rate_pct ASC)  FILTER (WHERE success_rate_pct < 60)  AS avoid,
           AVG(success_rate_pct) AS avg_rate,
           MAX(data_days) AS days
    FROM public.scheduler_best_hours_by_profile
    GROUP BY profile_type
  LOOP
    INSERT INTO public.scheduler_time_preferences
      (profile_type, preferred_hours, avoid_hours, success_rate_avg, sample_days, confidence, computed_at)
    VALUES (
      v_profile.profile_type,
      COALESCE(v_profile.preferred[1:5], '{}'),
      COALESCE(v_profile.avoid[1:3], '{}'),
      ROUND(v_profile.avg_rate::numeric, 2),
      v_profile.days,
      CASE
        WHEN v_profile.days >= 14 THEN 'high'
        WHEN v_profile.days >= 7  THEN 'medium'
        ELSE 'low'
      END,
      now()
    )
    ON CONFLICT (profile_type, city, state_code, category) DO UPDATE SET
      preferred_hours  = EXCLUDED.preferred_hours,
      avoid_hours      = EXCLUDED.avoid_hours,
      success_rate_avg = EXCLUDED.success_rate_avg,
      sample_days      = EXCLUDED.sample_days,
      confidence       = EXCLUDED.confidence,
      computed_at      = now();

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'profiles_updated', v_inserted, 'computed_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_scheduler_preferences() TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M40 — scheduler_performance_log + scheduler_time_preferences criadas (RLS admin/supervisor). Views: scheduler_best_hours_by_profile, scheduler_best_hours_by_city, scheduler_worker_rankings. RPCs: get_scheduler_recommendations(), log_scheduler_performance(), refresh_scheduler_preferences(). Dados históricos preenchidos a cada postagem via log_scheduler_performance().';
END $$;
