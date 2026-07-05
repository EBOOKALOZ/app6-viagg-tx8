-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 PRÉ-2.3 · M29: Dashboard de Saúde do Motor Universal
--
-- Cria motor_health_summary: view que agrega todos os sinais de saúde do
-- Motor Universal em um único SELECT.
--
-- Inclui:
--   workers_online / offline / busy
--   lots_available / processing / posted_total
--   campaigns_active / paused / error / completed_today
--   dlq_failed
--   active_locks (distributed_locks com expires_at > now())
--   errors_last_hour (posting_event_log)
--   avg_post_ms (posting_metrics_daily, últimos 7 dias)
--   health_score (0-100, calculado)
--   health_status ('excellent' | 'good' | 'warning' | 'critical')
--
-- Também cria get_motor_health() RPC que retorna o mesmo dado como JSONB.
--
-- Depende de: M07(workers) M17(lots) M08(campaigns) M09(dlq) M10(locks) M13(events) M14(metrics)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. View: motor_health_summary
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.motor_health_summary AS
WITH
  worker_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('idle','busy','starting'))
                       AS workers_online,
      COUNT(*) FILTER (WHERE status = 'dead'
                          OR (last_heartbeat IS NOT NULL
                              AND last_heartbeat < now() - INTERVAL '2 minutes'))
                       AS workers_offline,
      COUNT(*) FILTER (WHERE status = 'busy')
                       AS workers_busy,
      MAX(last_heartbeat) AS last_heartbeat
    FROM public.posting_workers
  ),
  queue_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'available')  AS lots_available,
      COUNT(*) FILTER (WHERE status = 'processing') AS lots_processing,
      COUNT(*) FILTER (WHERE status = 'posted')     AS lots_posted_total
    FROM public.posting_lots
  ),
  campaign_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('queued','generating','posting','waiting'))
                       AS campaigns_active,
      COUNT(*) FILTER (WHERE status = 'paused')     AS campaigns_paused,
      COUNT(*) FILTER (WHERE status = 'error')      AS campaigns_error,
      COUNT(*) FILTER (WHERE status = 'completed'
                         AND updated_at >= now() - INTERVAL '24 hours')
                       AS completed_today
    FROM public.posting_campaigns
  ),
  dlq_stats AS (
    SELECT COUNT(*) FILTER (WHERE status = 'failed') AS dlq_failed
    FROM public.posting_dead_letter_queue
  ),
  lock_stats AS (
    SELECT COUNT(*) FILTER (WHERE expires_at > now()) AS active_locks
    FROM public.distributed_locks
  ),
  error_rate AS (
    SELECT COUNT(*) FILTER (WHERE NOT success
                              AND timestamp >= now() - INTERVAL '1 hour')
                     AS errors_last_hour
    FROM public.posting_event_log
  ),
  perf_stats AS (
    SELECT COALESCE(ROUND(AVG(avg_post_time_ms))::INT, 0) AS avg_post_ms
    FROM public.posting_metrics_daily
    WHERE date >= CURRENT_DATE - 7
  ),
  computed AS (
    SELECT
      ws.workers_online,
      ws.workers_offline,
      ws.workers_busy,
      ws.last_heartbeat,
      qs.lots_available,
      qs.lots_processing,
      qs.lots_posted_total,
      cs.campaigns_active,
      cs.campaigns_paused,
      cs.campaigns_error,
      cs.completed_today,
      ds.dlq_failed,
      ls.active_locks,
      er.errors_last_hour,
      ps.avg_post_ms,
      -- Health score: começa em 100 e perde pontos por sinais de problema
      GREATEST(0, LEAST(100,
        100
        - (ws.workers_offline * 20)                        -- -20 por worker morto
        - (LEAST(cs.campaigns_error, 5) * 4)               -- -4 por campanha em erro (max -20)
        - (LEAST(ds.dlq_failed, 5) * 4)                    -- -4 por item na DLQ (max -20)
        - (LEAST(er.errors_last_hour::INT, 10) * 2)        -- -2 por erro/hora (max -20)
      )) AS health_score
    FROM worker_stats ws, queue_stats qs, campaign_stats cs,
         dlq_stats ds, lock_stats ls, error_rate er, perf_stats ps
  )
SELECT
  c.*,
  CASE
    WHEN c.health_score >= 90 THEN 'excellent'
    WHEN c.health_score >= 70 THEN 'good'
    WHEN c.health_score >= 50 THEN 'warning'
    ELSE 'critical'
  END AS health_status,
  now() AS checked_at
FROM computed c;

COMMENT ON VIEW public.motor_health_summary IS
'Tier 2.2 PRÉ-2.3: Agregação de todos os sinais de saúde do Motor Universal. health_score 0-100. Usado no Health Dashboard do Admin.';

GRANT SELECT ON public.motor_health_summary TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RPC: get_motor_health() — retorna health como JSONB (para Admin Panel)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_motor_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT row_to_json(h)::jsonb
  FROM   public.motor_health_summary h
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.get_motor_health() TO authenticated;
COMMENT ON FUNCTION public.get_motor_health() IS
'Tier 2.2 PRÉ-2.3: Retorna snapshot de saúde do Motor Universal como JSONB.';

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M29 — motor_health_summary view criada (workers, queue, campaigns, DLQ, locks, errors, health_score, health_status). RPC get_motor_health() disponível.';
END $$;
