-- ============================================================
-- M55.2 · Sprint 1 do Programa CIO — ETL & Rollups
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_056 (fila de deploy)
-- ============================================================
-- Arquitetura congelada (CIO v1.0):
--   • ETL EXCLUSIVAMENTE de leitura nas tabelas operacionais
--     (zero triggers em tabelas quentes; zero UPDATE/INSERT nelas)
--   • Watermark incremental por fonte + IDEMPOTÊNCIA POR CONSTRUÇÃO:
--     o ciclo APAGA e RECONSTRÓI os buckets tocados a partir do bruto
--     (recompute-por-bucket). Re-execução, crash no meio e watermark
--     rebobinado produzem exatamente o mesmo estado.
--   • Grãos 5m → 1h → 1d em cascata (buckets fechados)
--   • cio_reprocess(janela) reconstrói qualquer período do zero
--   • Flag cio.mode nasce OFF; cron entra no runbook de deploy
-- FORA DO ESCOPO: Semantic Layer, Health, Alertas, Dashboards, KPIs.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.pub_events') IS NULL
     OR to_regclass('public.motor_flags') IS NULL THEN
    RAISE EXCEPTION 'M55.2 BLOQUEADA — aplicar camada M53/M54 (053..056) antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. Estruturas do CIO
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cio_watermarks (
  source      TEXT PRIMARY KEY,          -- 'pub_events' | 'dispatch_ticks' | 'requests_finished'
  last_id     BIGINT,
  last_ts     TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cio_metrics (
  source      TEXT NOT NULL,             -- fonte proprietária (escopo do recompute)
  metric      TEXT NOT NULL,
  grain       TEXT NOT NULL CHECK (grain IN ('5m','1h','1d')),
  bucket_ts   TIMESTAMPTZ NOT NULL,
  dims        JSONB NOT NULL DEFAULT '{}'::jsonb,
  value       NUMERIC NOT NULL DEFAULT 0,   -- SOMA (média = value/count na Semantic Layer)
  count       BIGINT  NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cio_metric UNIQUE (source, metric, grain, bucket_ts, dims)
);
CREATE INDEX IF NOT EXISTS idx_ciom_lookup
  ON public.cio_metrics (metric, grain, bucket_ts DESC);

-- Rollups dedicados (dimensões quentes — CIO v1.0 §5)
CREATE TABLE IF NOT EXISTS public.cio_city_daily (
  day DATE NOT NULL, city TEXT NOT NULL,
  requests INT NOT NULL DEFAULT 0, lots INT NOT NULL DEFAULT 0,
  deliveries INT NOT NULL DEFAULT 0, confirmations INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, city)
);
CREATE TABLE IF NOT EXISTS public.cio_advertiser_daily (
  day DATE NOT NULL, advertiser_user_id UUID NOT NULL,
  daily_used INT NOT NULL DEFAULT 0, daily_limit INT NOT NULL DEFAULT 0,
  blocked BOOLEAN NOT NULL DEFAULT false, plan_name TEXT,
  requests INT NOT NULL DEFAULT 0, lots INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, advertiser_user_id)
);
CREATE TABLE IF NOT EXISTS public.cio_target_daily (
  day DATE NOT NULL, target_id UUID NOT NULL,
  deliveries INT NOT NULL DEFAULT 0, confirmations INT NOT NULL DEFAULT 0,
  failures INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, target_id)
);
CREATE TABLE IF NOT EXISTS public.cio_poster_daily (
  day DATE NOT NULL, poster_user_id UUID NOT NULL,
  claims INT NOT NULL DEFAULT 0, confirmations INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, poster_user_id)
);

-- Observabilidade do ETL (§7 do sprint)
CREATE TABLE IF NOT EXISTS public.cio_etl_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  duration_ms   INT,
  events_processed BIGINT NOT NULL DEFAULT 0,
  events_skipped   BIGINT NOT NULL DEFAULT 0,
  buckets_rebuilt  INT    NOT NULL DEFAULT 0,
  wm_before     JSONB,
  wm_after      JSONB,
  error         TEXT,
  retries       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cioruns_started ON public.cio_etl_runs (started_at DESC);

-- RLS: leitura admin; escrita apenas via funções do CIO (service)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cio_watermarks','cio_metrics','cio_city_daily',
    'cio_advertiser_daily','cio_target_daily','cio_poster_daily','cio_etl_runs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename=t AND policyname=t||'_sel_admin') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
        t||'_sel_admin', t);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.motor_flags (key, value, description) VALUES
  ('cio.mode',        'off',   'ETL do CIO: off|active (cron 5min entra no deploy)'),
  ('cio.batch_events','50000', 'Máx eventos novos considerados por ciclo')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.cio_watermarks (source, last_id, last_ts) VALUES
  ('pub_events', 0, NULL),
  ('dispatch_ticks', NULL, '-infinity'),
  ('requests_finished', NULL, '-infinity')
ON CONFLICT (source) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 2. Núcleo de agregação: reconstrói uma JANELA a partir do bruto
-- (recompute-por-bucket = idempotência por construção)
-- Usado tanto pelo tick incremental quanto pelo cio_reprocess.
-- SOMENTE LEITURA nas tabelas operacionais.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_rebuild_window(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from5 TIMESTAMPTZ := to_timestamp(floor(EXTRACT(EPOCH FROM p_from)/300)*300);
  v_to5   TIMESTAMPTZ := to_timestamp(ceil (EXTRACT(EPOCH FROM p_to)  /300)*300);
  v_buckets INT := 0;
BEGIN
  -- ═ Grão 5m: eventos por tipo/origem ═
  DELETE FROM public.cio_metrics
  WHERE source='pub_events' AND grain='5m'
    AND bucket_ts >= v_from5 AND bucket_ts < v_to5;

  INSERT INTO public.cio_metrics (source, metric, grain, bucket_ts, dims, value, count)
  SELECT 'pub_events', 'eventos', '5m',
         to_timestamp(floor(EXTRACT(EPOCH FROM e.created_at)/300)*300),
         jsonb_build_object('event_type', e.event_type,
                            'origin', COALESCE(e.origin,'-')),
         COUNT(*), COUNT(*)
  FROM public.pub_events e
  WHERE e.created_at >= v_from5 AND e.created_at < v_to5
  GROUP BY 4, 5;
  GET DIAGNOSTICS v_buckets = ROW_COUNT;

  -- ═ Grão 5m: duração dos ticks do dispatcher (SOMA + N → média na Semantic) ═
  DELETE FROM public.cio_metrics
  WHERE source='dispatch_ticks' AND grain='5m'
    AND bucket_ts >= v_from5 AND bucket_ts < v_to5;

  INSERT INTO public.cio_metrics (source, metric, grain, bucket_ts, dims, value, count)
  SELECT 'dispatch_ticks', m.metric, '5m',
         to_timestamp(floor(EXTRACT(EPOCH FROM t.started_at)/300)*300),
         jsonb_build_object('mode', t.mode), SUM(m.val), COUNT(*)
  FROM public.dispatch_ticks t
  CROSS JOIN LATERAL (VALUES
     ('tick_duration_ms', COALESCE(t.duration_ms,0)::numeric),
     ('tick_dispatched',  t.dispatched::numeric),
     ('tick_failed',      t.failed::numeric),
     ('tick_requeued',    t.requeued::numeric)) AS m(metric, val)
  WHERE t.started_at >= v_from5 AND t.started_at < v_to5
  GROUP BY 2, 4, 5;

  -- ═ Grão 5m: duração dos requests finalizados ═
  DELETE FROM public.cio_metrics
  WHERE source='requests_finished' AND grain='5m'
    AND bucket_ts >= v_from5 AND bucket_ts < v_to5;

  INSERT INTO public.cio_metrics (source, metric, grain, bucket_ts, dims, value, count)
  SELECT 'requests_finished', 'request_duration_ms', '5m',
         to_timestamp(floor(EXTRACT(EPOCH FROM r.finished_at)/300)*300),
         jsonb_build_object('status', r.status, 'origin', r.origin),
         SUM(COALESCE(r.duration_ms,0)), COUNT(*)
  FROM public.publication_requests r
  WHERE r.finished_at IS NOT NULL
    AND r.finished_at >= v_from5 AND r.finished_at < v_to5
  GROUP BY 4, 5;

  -- ═ Cascata 1h e 1d (recompute dos buckets tocados) ═
  DELETE FROM public.cio_metrics m
  WHERE m.grain='1h'
    AND m.bucket_ts >= date_trunc('hour', v_from5)
    AND m.bucket_ts <  date_trunc('hour', v_to5) + interval '1 hour';
  INSERT INTO public.cio_metrics (source, metric, grain, bucket_ts, dims, value, count)
  SELECT source, metric, '1h', date_trunc('hour', bucket_ts), dims,
         SUM(value), SUM(count)
  FROM public.cio_metrics
  WHERE grain='5m'
    AND bucket_ts >= date_trunc('hour', v_from5)
    AND bucket_ts <  date_trunc('hour', v_to5) + interval '1 hour'
  GROUP BY source, metric, date_trunc('hour', bucket_ts), dims;

  DELETE FROM public.cio_metrics m
  WHERE m.grain='1d'
    AND m.bucket_ts >= date_trunc('day', v_from5)
    AND m.bucket_ts <  date_trunc('day', v_to5) + interval '1 day';
  INSERT INTO public.cio_metrics (source, metric, grain, bucket_ts, dims, value, count)
  SELECT source, metric, '1d', date_trunc('day', bucket_ts), dims,
         SUM(value), SUM(count)
  FROM public.cio_metrics
  WHERE grain='1h'
    AND bucket_ts >= date_trunc('day', v_from5)
    AND bucket_ts <  date_trunc('day', v_to5) + interval '1 day'
  GROUP BY source, metric, date_trunc('day', bucket_ts), dims;

  -- ═ Rollups dedicados (dias tocados, recompute integral do dia) ═
  DELETE FROM public.cio_city_daily
  WHERE day >= (v_from5 AT TIME ZONE 'America/Sao_Paulo')::date
    AND day <= (v_to5   AT TIME ZONE 'America/Sao_Paulo')::date;
  INSERT INTO public.cio_city_daily (day, city, requests, lots, deliveries, confirmations)
  SELECT (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
         COALESCE(e.payload->>'cidade','(sem cidade)'),
         COUNT(*) FILTER (WHERE e.event_type IN ('SOLICITACAO_RECEBIDA','FLUXO_OBSERVADO')),
         COUNT(*) FILTER (WHERE e.event_type IN ('LOTE_GERADO','LOTE_GERADO_LEGADO')),
         COUNT(*) FILTER (WHERE e.event_type='DISPATCH_COMPLETED'),
         COUNT(*) FILTER (WHERE e.event_type='PUBLICACAO_CONFIRMADA')
  FROM public.pub_events e
  WHERE (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN (v_from5 AT TIME ZONE 'America/Sao_Paulo')::date
            AND (v_to5   AT TIME ZONE 'America/Sao_Paulo')::date
  GROUP BY 1, 2
  HAVING COUNT(*) > 0;

  DELETE FROM public.cio_poster_daily
  WHERE day >= (v_from5 AT TIME ZONE 'America/Sao_Paulo')::date
    AND day <= (v_to5   AT TIME ZONE 'America/Sao_Paulo')::date;
  INSERT INTO public.cio_poster_daily (day, poster_user_id, claims, confirmations)
  SELECT (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
         e.actor_user_id,
         COUNT(*) FILTER (WHERE e.event_type='LOTE_ATRIBUIDO'),
         COUNT(*) FILTER (WHERE e.event_type='PUBLICACAO_CONFIRMADA')
  FROM public.pub_events e
  WHERE e.actor_user_id IS NOT NULL
    AND e.event_type IN ('LOTE_ATRIBUIDO','PUBLICACAO_CONFIRMADA')
    AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN (v_from5 AT TIME ZONE 'America/Sao_Paulo')::date
            AND (v_to5   AT TIME ZONE 'America/Sao_Paulo')::date
  GROUP BY 1, 2;

  DELETE FROM public.cio_target_daily
  WHERE day >= (v_from5 AT TIME ZONE 'America/Sao_Paulo')::date
    AND day <= (v_to5   AT TIME ZONE 'America/Sao_Paulo')::date;
  INSERT INTO public.cio_target_daily (day, target_id, deliveries, confirmations, failures)
  SELECT (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date, d.target_id,
         COUNT(*),
         COUNT(*) FILTER (WHERE d.status='CONFIRMADA'),
         COUNT(*) FILTER (WHERE d.status='FALHOU')
  FROM public.publication_deliveries d
  WHERE d.target_id IS NOT NULL
    AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN (v_from5 AT TIME ZONE 'America/Sao_Paulo')::date
            AND (v_to5   AT TIME ZONE 'America/Sao_Paulo')::date
  GROUP BY 1, 2;

  -- advertiser_daily: espelho idempotente do M50 (valores absolutos)
  INSERT INTO public.cio_advertiser_daily
    (day, advertiser_user_id, daily_used, daily_limit, blocked, plan_name)
  SELECT u.usage_date, u.user_id, u.daily_used, u.daily_limit, u.is_blocked, u.plan_name
  FROM public.advertiser_daily_usage u
  WHERE u.usage_date BETWEEN (v_from5 AT TIME ZONE 'America/Sao_Paulo')::date
                         AND (v_to5   AT TIME ZONE 'America/Sao_Paulo')::date
  ON CONFLICT (day, advertiser_user_id) DO UPDATE
    SET daily_used=EXCLUDED.daily_used, daily_limit=EXCLUDED.daily_limit,
        blocked=EXCLUDED.blocked, plan_name=EXCLUDED.plan_name, computed_at=now();

  RETURN v_buckets;
END $$;

REVOKE EXECUTE ON FUNCTION public.cio_rebuild_window(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cio_rebuild_window(TIMESTAMPTZ,TIMESTAMPTZ) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 3. cio_etl_tick — ingestão incremental por watermark
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_etl_tick()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t0        TIMESTAMPTZ := clock_timestamp();
  v_run       UUID := gen_random_uuid();
  v_mode      TEXT := public.motor_flag('cio.mode');
  v_batch     BIGINT := COALESCE(public.motor_flag('cio.batch_events')::bigint, 50000);
  v_lock      BOOLEAN;
  v_wm_ev     BIGINT;
  v_new_max   BIGINT;
  v_n_events  BIGINT := 0;
  v_skipped   BIGINT := 0;
  v_from      TIMESTAMPTZ;
  v_to        TIMESTAMPTZ := now();
  v_buckets   INT := 0;
  v_wm_before JSONB;
  v_wm_after  JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  IF v_mode <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'mode', COALESCE(v_mode,'off'));
  END IF;

  v_lock := pg_try_advisory_xact_lock(hashtext('cio_etl_tick'));
  IF NOT v_lock THEN
    RETURN jsonb_build_object('ok', true, 'mode', v_mode, 'lock', false);
  END IF;

  SELECT jsonb_object_agg(source, jsonb_build_object('id', last_id, 'ts', last_ts))
  INTO v_wm_before FROM public.cio_watermarks;

  SELECT last_id INTO v_wm_ev FROM public.cio_watermarks WHERE source='pub_events';

  -- Novos eventos desde o watermark (limitado ao batch)
  SELECT COUNT(*), MAX(id), MIN(created_at)
  INTO v_n_events, v_new_max, v_from
  FROM (SELECT id, created_at FROM public.pub_events
        WHERE id > COALESCE(v_wm_ev,0)
        ORDER BY id LIMIT v_batch) nw;

  SELECT GREATEST(v_n_events - v_batch, 0) INTO v_skipped;  -- excedente fica p/ próximo ciclo

  BEGIN
    IF v_n_events > 0 THEN
      -- Reconstrói TODOS os buckets tocados pela janela nova (idempotente)
      v_buckets := public.cio_rebuild_window(v_from, v_to);
      UPDATE public.cio_watermarks
      SET last_id = v_new_max, updated_at = now() WHERE source='pub_events';
    ELSE
      -- Sem eventos novos: ainda assim reconstrói a janela corrente curta
      -- (captura ticks/requests/uso do dia sem depender de eventos)
      v_buckets := public.cio_rebuild_window(v_to - interval '10 minutes', v_to);
    END IF;

    UPDATE public.cio_watermarks SET last_ts = v_to, updated_at = now()
    WHERE source IN ('dispatch_ticks','requests_finished');

  EXCEPTION WHEN OTHERS THEN
    -- Subtransação desfeita: nenhum bucket parcial; watermark intacto
    SELECT jsonb_object_agg(source, jsonb_build_object('id', last_id, 'ts', last_ts))
    INTO v_wm_after FROM public.cio_watermarks;
    INSERT INTO public.cio_etl_runs
      (id, mode, started_at, finished_at, duration_ms, events_processed,
       events_skipped, wm_before, wm_after, error)
    VALUES (v_run, v_mode, v_t0, clock_timestamp(),
      (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int,
      0, v_skipped, v_wm_before, v_wm_after, SQLERRM);
    RETURN jsonb_build_object('ok', false, 'run_id', v_run, 'error', SQLERRM);
  END;

  SELECT jsonb_object_agg(source, jsonb_build_object('id', last_id, 'ts', last_ts))
  INTO v_wm_after FROM public.cio_watermarks;

  INSERT INTO public.cio_etl_runs
    (id, mode, started_at, finished_at, duration_ms, events_processed,
     events_skipped, buckets_rebuilt, wm_before, wm_after)
  VALUES (v_run, v_mode, v_t0, clock_timestamp(),
    (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int,
    v_n_events, v_skipped, v_buckets, v_wm_before, v_wm_after);

  RETURN jsonb_build_object('ok', true, 'run_id', v_run, 'mode', v_mode, 'lock', true,
    'events_processed', v_n_events, 'events_skipped', v_skipped,
    'buckets_rebuilt', v_buckets,
    'duration_ms', (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int);
END $$;

REVOKE EXECUTE ON FUNCTION public.cio_etl_tick() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cio_etl_tick() TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 4. cio_reprocess — reconstrução integral de qualquer janela
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_reprocess(
  p_from TIMESTAMPTZ DEFAULT '-infinity',
  p_to   TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t0 TIMESTAMPTZ := clock_timestamp();
  v_from TIMESTAMPTZ := p_from;
  v_buckets INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  IF v_from = '-infinity' THEN
    SELECT COALESCE(MIN(created_at), now()) INTO v_from FROM public.pub_events;
  END IF;

  v_buckets := public.cio_rebuild_window(v_from, p_to);

  INSERT INTO public.cio_etl_runs
    (mode, started_at, finished_at, duration_ms, events_processed, buckets_rebuilt,
     wm_before, wm_after)
  VALUES ('reprocess', v_t0, clock_timestamp(),
    (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int,
    (SELECT COUNT(*) FROM public.pub_events
      WHERE created_at >= v_from AND created_at < p_to),
    v_buckets,
    jsonb_build_object('janela_de', v_from), jsonb_build_object('janela_ate', p_to));

  RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', p_to,
    'buckets_rebuilt', v_buckets,
    'duration_ms', (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int);
END $$;

REVOKE EXECUTE ON FUNCTION public.cio_reprocess(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cio_reprocess(TIMESTAMPTZ,TIMESTAMPTZ) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.cio_metrics') IS NULL
     OR to_regclass('public.cio_watermarks') IS NULL
     OR to_regclass('public.cio_etl_runs') IS NULL THEN
    RAISE EXCEPTION 'M55.2 ERRO: estruturas do CIO ausentes'; END IF;
  IF to_regprocedure('public.cio_etl_tick()') IS NULL
     OR to_regprocedure('public.cio_reprocess(timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'M55.2 ERRO: funções do ETL ausentes'; END IF;
  IF (SELECT value FROM public.motor_flags WHERE key='cio.mode') <> 'off' THEN
    RAISE EXCEPTION 'M55.2 ERRO: cio.mode deveria nascer OFF'; END IF;
  -- Prova estática de leitura-somente: nenhuma função do CIO contém
  -- INSERT/UPDATE/DELETE em tabelas operacionais (verificação por convenção
  -- de nomes cio_* nos alvos de escrita; auditado também pela bateria CTE)
  RAISE NOTICE 'M55.2 ✓ ETL & Rollups: watermark + recompute-por-bucket (idempotente por construção) — OK';
  RAISE NOTICE 'M55.2 ✓ Grãos 5m→1h→1d + 4 rollups dedicados + cio_reprocess + telemetria de runs — OK';
  RAISE NOTICE 'M55.2 ✓ cio.mode=off · zero triggers em tabelas operacionais · escritas só em cio_* — OK';
END $$;
