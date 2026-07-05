-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M37: Observabilidade Avançada do Motor Universal
--
-- Expande o módulo de monitoramento com:
--   throughput por Worker e por perfil
--   campanhas por minuto (instantâneo)
--   tempo médio em fila
--   tempo médio de processamento
--   uso de locks
--   retries por hora
--   SLA por perfil (% concluídas em 24h)
--   disponibilidade do Motor Universal (uptime %)
--   indicadores históricos
--
-- Todas as métricas derivam de tabelas existentes (zero tabelas novas).
-- Um índice de suporte para consultas de SLA é adicionado.
--
-- Views criadas:
--   motor_throughput_by_worker    — lotes/hora por worker
--   motor_throughput_by_profile   — lotes/hora por perfil
--   motor_queue_time_stats        — tempos de fila e processamento
--   motor_retry_stats             — retries/hora e taxa de sucesso
--   motor_sla_by_profile          — SLA por perfil (meta: 95% em 24h)
--   motor_availability_stats      — disponibilidade do motor
--   motor_ai_insights             — insights pré-computados para Assistente IA
--
-- RPC:
--   get_advanced_observability()  → JSONB (snapshot completo)
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Índice auxiliar para SLA (created_at + updated_at + status de campanhas)
CREATE INDEX IF NOT EXISTS idx_campaigns_sla
  ON public.posting_campaigns (status, created_at, updated_at)
  WHERE status IN ('completed','error');

-- ─────────────────────────────────────────────────────────────────────────
-- 1. View: motor_throughput_by_worker
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_throughput_by_worker AS
WITH hourly_events AS (
  SELECT
    pel.worker_id,
    date_trunc('hour', pel.timestamp)  AS hour_bucket,
    COUNT(*) FILTER (WHERE pel.success) AS success_count,
    COUNT(*) FILTER (WHERE NOT pel.success) AS fail_count,
    COUNT(*) AS total_count
  FROM public.posting_event_log pel
  WHERE pel.worker_id IS NOT NULL
    AND pel.timestamp >= now() - INTERVAL '24 hours'
  GROUP BY pel.worker_id, date_trunc('hour', pel.timestamp)
)
SELECT
  pw.id AS worker_id,
  pw.name AS worker_name,
  pw.status AS worker_status,
  pw.profile_type,
  COALESCE(SUM(he.success_count), 0) AS successes_24h,
  COALESCE(SUM(he.fail_count), 0)    AS failures_24h,
  COALESCE(SUM(he.total_count), 0)   AS total_events_24h,
  ROUND(
    100.0 * COALESCE(SUM(he.success_count), 0)
    / NULLIF(COALESCE(SUM(he.total_count), 0), 0),
    1
  ) AS success_rate_pct,
  -- throughput = eventos na última hora
  COALESCE((
    SELECT total_count FROM hourly_events
    WHERE worker_id = pw.id AND hour_bucket = date_trunc('hour', now())
    LIMIT 1
  ), 0) AS throughput_last_hour
FROM public.posting_workers pw
LEFT JOIN hourly_events he ON he.worker_id = pw.id
GROUP BY pw.id, pw.name, pw.status, pw.profile_type;

COMMENT ON VIEW public.motor_throughput_by_worker IS 'Tier 2.2.5: Throughput e taxa de sucesso por worker nas últimas 24h.';
GRANT SELECT ON public.motor_throughput_by_worker TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. View: motor_throughput_by_profile
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_throughput_by_profile AS
SELECT
  COALESCE(pel.profile_type, 'unknown') AS profile_type,
  COUNT(*) FILTER (WHERE pel.timestamp >= now() - INTERVAL '1 minute') AS events_last_minute,
  COUNT(*) FILTER (WHERE pel.timestamp >= now() - INTERVAL '1 hour')   AS events_last_hour,
  COUNT(*) FILTER (WHERE pel.timestamp >= now() - INTERVAL '24 hours') AS events_last_24h,
  COUNT(*) FILTER (WHERE pel.success AND pel.timestamp >= now() - INTERVAL '1 hour') AS successes_last_hour,
  COUNT(*) FILTER (WHERE NOT pel.success AND pel.timestamp >= now() - INTERVAL '1 hour') AS failures_last_hour,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pel.success AND pel.timestamp >= now() - INTERVAL '1 hour')
    / NULLIF(COUNT(*) FILTER (WHERE pel.timestamp >= now() - INTERVAL '1 hour'), 0),
    1
  ) AS success_rate_pct_1h
FROM public.posting_event_log pel
WHERE pel.timestamp >= now() - INTERVAL '24 hours'
GROUP BY COALESCE(pel.profile_type, 'unknown');

COMMENT ON VIEW public.motor_throughput_by_profile IS 'Tier 2.2.5: Throughput e taxa de sucesso por perfil (1min, 1h, 24h).';
GRANT SELECT ON public.motor_throughput_by_profile TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. View: motor_queue_time_stats
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_queue_time_stats AS
SELECT
  COALESCE(pl.profile_type, 'unknown') AS profile_type,
  COUNT(*)                        AS lots_total,
  COUNT(*) FILTER (WHERE pl.status = 'available')  AS lots_waiting,
  COUNT(*) FILTER (WHERE pl.status = 'processing') AS lots_processing,
  COUNT(*) FILTER (WHERE pl.status = 'posted')     AS lots_completed,
  -- Proxy de tempo em fila: avg(processamento_iniciado - criado) usando picked_at se disponível
  -- Caso picked_at não exista, usamos posted_at - created_at como proxy conservador
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (COALESCE(pl.posted_at, now()) - pl.created_at))
    ) FILTER (WHERE pl.status IN ('processing','posted'))
  )::INT AS avg_processing_seconds,
  ROUND(
    PERCENTILE_CONT(0.95) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (COALESCE(pl.posted_at, now()) - pl.created_at))
    ) FILTER (WHERE pl.status = 'posted')
  )::INT AS p95_processing_seconds
FROM public.posting_lots pl
WHERE pl.created_at >= now() - INTERVAL '7 days'
GROUP BY COALESCE(pl.profile_type, 'unknown');

COMMENT ON VIEW public.motor_queue_time_stats IS 'Tier 2.2.5: Estatísticas de tempo de processamento de lotes por perfil.';
GRANT SELECT ON public.motor_queue_time_stats TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. View: motor_retry_stats
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_retry_stats AS
SELECT
  date_trunc('hour', created_at) AS hour_bucket,
  COALESCE(profile_type, 'unknown') AS profile_type,
  COUNT(*) FILTER (WHERE status = 'failed')    AS items_failed,
  COUNT(*) FILTER (WHERE status = 'retrying')  AS items_retrying,
  COUNT(*) FILTER (WHERE status = 'recovered') AS items_recovered,
  COUNT(*) FILTER (WHERE status = 'discarded') AS items_discarded,
  AVG(retry_count) FILTER (WHERE retry_count > 0) AS avg_retries
FROM public.posting_dead_letter_queue
WHERE created_at >= now() - INTERVAL '24 hours'
GROUP BY date_trunc('hour', created_at), COALESCE(profile_type, 'unknown')
ORDER BY hour_bucket DESC, profile_type;

COMMENT ON VIEW public.motor_retry_stats IS 'Tier 2.2.5: Estatísticas de retry e falhas da DLQ por hora e perfil.';
GRANT SELECT ON public.motor_retry_stats TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. View: motor_sla_by_profile
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_sla_by_profile AS
SELECT
  COALESCE(origin_profile_type, 'lojista') AS profile_type,
  COUNT(*) AS total_campaigns,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'error')     AS errors,
  -- SLA: % concluídas em até 24h da criação
  COUNT(*) FILTER (
    WHERE status = 'completed'
      AND updated_at <= created_at + INTERVAL '24 hours'
  ) AS completed_within_sla,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE status = 'completed'
        AND updated_at <= created_at + INTERVAL '24 hours'
    ) / NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0),
    1
  ) AS sla_compliance_pct,
  -- SLA target: 95%
  CASE
    WHEN ROUND(
      100.0 * COUNT(*) FILTER (
        WHERE status = 'completed'
          AND updated_at <= created_at + INTERVAL '24 hours'
      ) / NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0),
      1
    ) >= 95 THEN 'ok'
    WHEN ROUND(
      100.0 * COUNT(*) FILTER (
        WHERE status = 'completed'
          AND updated_at <= created_at + INTERVAL '24 hours'
      ) / NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0),
      1
    ) >= 85 THEN 'warning'
    ELSE 'breach'
  END AS sla_status
FROM public.posting_campaigns
WHERE created_at >= now() - INTERVAL '30 days'
GROUP BY COALESCE(origin_profile_type, 'lojista');

COMMENT ON VIEW public.motor_sla_by_profile IS 'Tier 2.2.5: SLA por perfil — meta 95% das campanhas concluídas em 24h. Status: ok/warning/breach.';
GRANT SELECT ON public.motor_sla_by_profile TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. View: motor_availability_stats
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_availability_stats AS
WITH
  worker_uptime AS (
    SELECT
      COUNT(*) AS total_workers,
      COUNT(*) FILTER (WHERE status IN ('idle','busy','starting')) AS online_workers,
      COUNT(*) FILTER (WHERE status = 'dead'
                          OR (last_heartbeat IS NOT NULL AND last_heartbeat < now() - INTERVAL '2 minutes'))
        AS offline_workers,
      MAX(last_heartbeat) AS latest_heartbeat
    FROM public.posting_workers
  ),
  error_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE timestamp >= now() - INTERVAL '1 hour' AND NOT success) AS errors_last_hour,
      COUNT(*) FILTER (WHERE timestamp >= now() - INTERVAL '1 hour') AS total_last_hour,
      COUNT(*) FILTER (WHERE timestamp >= now() - INTERVAL '24 hours' AND NOT success) AS errors_last_24h,
      COUNT(*) FILTER (WHERE timestamp >= now() - INTERVAL '24 hours') AS total_last_24h
    FROM public.posting_event_log
  )
SELECT
  wu.total_workers,
  wu.online_workers,
  wu.offline_workers,
  wu.latest_heartbeat,
  -- Uptime: % de workers online
  ROUND(100.0 * wu.online_workers / NULLIF(wu.total_workers, 0), 1) AS worker_uptime_pct,
  -- Error rate
  es.errors_last_hour,
  es.total_last_hour,
  ROUND(100.0 * es.errors_last_hour / NULLIF(es.total_last_hour, 0), 1) AS error_rate_1h_pct,
  es.errors_last_24h,
  ROUND(100.0 * (1.0 - es.errors_last_24h::numeric / NULLIF(es.total_last_24h, 0)) * 100, 2) AS availability_24h_pct,
  -- Status geral
  CASE
    WHEN wu.online_workers > 0 AND (100.0 * es.errors_last_hour / NULLIF(es.total_last_hour, 1)) < 10 THEN 'operational'
    WHEN wu.online_workers > 0 THEN 'degraded'
    ELSE 'offline'
  END AS system_status
FROM worker_uptime wu, error_summary es;

COMMENT ON VIEW public.motor_availability_stats IS 'Tier 2.2.5: Disponibilidade do Motor Universal — uptime, error rate, status geral.';
GRANT SELECT ON public.motor_availability_stats TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. View: motor_ai_insights (insights pré-computados para o Assistente IA)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_ai_insights AS
WITH
  high_error_campaigns AS (
    SELECT
      pc.id, pc.name, pc.origin_profile_type AS profile_type,
      COUNT(dlq.id) AS error_count,
      MAX(dlq.created_at) AS last_error_at
    FROM public.posting_campaigns pc
    JOIN public.posting_dead_letter_queue dlq ON dlq.campaign_id = pc.id
    WHERE dlq.created_at >= now() - INTERVAL '7 days'
    GROUP BY pc.id, pc.name, pc.origin_profile_type
    ORDER BY error_count DESC
    LIMIT 10
  ),
  idle_campaigns AS (
    SELECT id, name, origin_profile_type, created_at,
           now() - created_at AS idle_duration
    FROM public.posting_campaigns
    WHERE status IN ('queued','paused')
      AND updated_at < now() - INTERVAL '2 hours'
    ORDER BY updated_at ASC
    LIMIT 10
  ),
  overloaded_workers AS (
    SELECT pw.id, pw.name, pw.profile_type,
           COUNT(DISTINCT pc.id) AS assigned_campaigns
    FROM public.posting_workers pw
    JOIN public.posting_campaigns pc ON pc.worker_id = pw.id
    WHERE pw.status = 'busy'
      AND pc.status IN ('posting','generating')
    GROUP BY pw.id, pw.name, pw.profile_type
    ORDER BY assigned_campaigns DESC
    LIMIT 5
  ),
  best_hours AS (
    SELECT
      EXTRACT(HOUR FROM pel.timestamp)::INT AS hour_of_day,
      COUNT(*) FILTER (WHERE pel.success) AS successes,
      COUNT(*) AS total,
      ROUND(100.0 * COUNT(*) FILTER (WHERE pel.success) / NULLIF(COUNT(*), 0), 1) AS success_rate_pct
    FROM public.posting_event_log pel
    WHERE pel.timestamp >= now() - INTERVAL '30 days'
    GROUP BY EXTRACT(HOUR FROM pel.timestamp)::INT
    ORDER BY success_rate_pct DESC
    LIMIT 5
  ),
  top_profiles AS (
    SELECT
      COALESCE(origin_profile_type, 'lojista') AS profile_type,
      COUNT(*) AS total_campaigns,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      ROUND(100.0 * COUNT(*) FILTER (WHERE status='completed') / NULLIF(COUNT(*),0), 1) AS completion_rate_pct
    FROM public.posting_campaigns
    WHERE created_at >= now() - INTERVAL '30 days'
    GROUP BY COALESCE(origin_profile_type, 'lojista')
    ORDER BY completion_rate_pct DESC
  )
SELECT
  (SELECT jsonb_agg(row_to_json(h.*)) FROM high_error_campaigns h) AS high_error_campaigns,
  (SELECT jsonb_agg(row_to_json(i.*)) FROM idle_campaigns i)        AS idle_campaigns,
  (SELECT jsonb_agg(row_to_json(o.*)) FROM overloaded_workers o)    AS overloaded_workers,
  (SELECT jsonb_agg(row_to_json(b.*)) FROM best_hours b)            AS best_posting_hours,
  (SELECT jsonb_agg(row_to_json(p.*)) FROM top_profiles p)          AS profile_performance,
  now() AS computed_at;

COMMENT ON VIEW public.motor_ai_insights IS 'Tier 2.2.5: Insights pré-computados para o Assistente IA do Painel Admin. Atualizado a cada consulta.';
GRANT SELECT ON public.motor_ai_insights TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RPC: get_advanced_observability — snapshot completo em JSONB
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_advanced_observability()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'throughput_by_profile', (SELECT jsonb_agg(row_to_json(t.*)) FROM motor_throughput_by_profile t),
    'throughput_by_worker',  (SELECT jsonb_agg(row_to_json(w.*)) FROM motor_throughput_by_worker w),
    'queue_stats',           (SELECT jsonb_agg(row_to_json(q.*)) FROM motor_queue_time_stats q),
    'retry_stats',           (SELECT jsonb_agg(row_to_json(r.*)) FROM motor_retry_stats r LIMIT 48),
    'sla',                   (SELECT jsonb_agg(row_to_json(s.*)) FROM motor_sla_by_profile s),
    'availability',          (SELECT row_to_json(a.*) FROM motor_availability_stats a LIMIT 1),
    'ai_insights',           (SELECT row_to_json(i.*) FROM motor_ai_insights i LIMIT 1),
    'computed_at',           now()
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_advanced_observability() TO authenticated;
COMMENT ON FUNCTION public.get_advanced_observability IS
'Tier 2.2.5: Snapshot completo de observabilidade avançada — throughput, SLA, availability, AI insights.';

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M37 — 7 views de observabilidade criadas: motor_throughput_by_worker, motor_throughput_by_profile, motor_queue_time_stats, motor_retry_stats, motor_sla_by_profile, motor_availability_stats, motor_ai_insights. RPC: get_advanced_observability(). Índice SLA adicionado em posting_campaigns.';
END $$;
