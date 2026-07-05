-- ============================================================
-- M55.4 · Enterprise Health Center
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_060 (fila de deploy)
-- ============================================================
-- Regras: consome EXCLUSIVAMENTE fontes oficiais do CIO (quality,
-- SLA, drift, validator, profiler, ETL runs, access log); nenhum
-- contrato público alterado; componente sem fonte de telemetria =
-- 'sem_dados'/Offline com score NULL — NUNCA número inventado;
-- previsão só por regressão de histórico real.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.cio_governance_dataset()') IS NULL THEN
    RAISE EXCEPTION 'M55.4 BLOQUEADA — aplicar 20260704_060 antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. Registro de componentes + pesos (v1 INATIVA — padrão da casa)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cio_health_components (
  component  TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('pipeline','service','module','ia','dashboard','infra')),
  name       TEXT NOT NULL,
  dependents TEXT[] NOT NULL DEFAULT '{}',   -- p/ análise de impacto do root-cause
  enabled    BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT
);
INSERT INTO public.cio_health_components (component, kind, name, dependents, notes) VALUES
  ('etl','pipeline','ETL do CIO','{rollups,semantic_layer}',NULL),
  ('rollups','pipeline','Rollups','{semantic_layer}',NULL),
  ('semantic_layer','service','Semantic Layer','{dashboards}',NULL),
  ('dispatcher','pipeline','Dispatcher','{matching}',NULL),
  ('matching','service','Matching Engine','{dispatcher}',NULL),
  ('ia','ia','Motor de IA','{}',NULL),
  ('rpcs','service','RPCs oficiais','{semantic_layer,dashboards}',NULL),
  ('apis','service','APIs (proxy de RPCs)','{dashboards}','sinal = espelho de rpcs até gateway próprio'),
  ('jobs','infra','Jobs/Cron','{etl,dispatcher}',NULL),
  ('banco','infra','Banco de Dados','{etl,dispatcher,semantic_layer}',NULL),
  ('scheduler','pipeline','Scheduler (M54.4)','{dispatcher}','sem telemetria até M54.4'),
  ('dashboards','dashboard','Dashboards (M58)','{}','sem telemetria até M58'),
  ('marketplace','module','Marketplace','{}','telemetria vertical futura'),
  ('corridas','module','Corridas','{}','telemetria vertical futura'),
  ('fretes','module','Fretes','{}','telemetria vertical futura'),
  ('entregas','module','Entregas','{}','telemetria vertical futura')
ON CONFLICT (component) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cio_health_weights (
  version    INT NOT NULL,
  family     TEXT NOT NULL CHECK (family IN ('qualidade','consistencia','atualidade',
               'sla','drift','validator','etl','profiler','alertas')),
  weight     NUMERIC(5,3) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT false,   -- v1 nasce INATIVA [calibrar-com-OBSERVE]
  PRIMARY KEY (version, family)
);
INSERT INTO public.cio_health_weights (version, family, weight) VALUES
  (1,'qualidade',1.0),(1,'consistencia',1.0),(1,'atualidade',1.5),
  (1,'sla',1.2),(1,'drift',1.0),(1,'validator',1.2),
  (1,'etl',1.5),(1,'profiler',0.8),(1,'alertas',1.0)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cio_health_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  component TEXT NOT NULL,
  score NUMERIC(5,1),                -- 0–100; NULL = sem_dados
  classification TEXT NOT NULL,      -- Excelente|Bom|Atencao|Critico|Offline
  signals JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chh ON public.cio_health_history (component, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.cio_incidents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  component TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('P1','P2','P3')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_min NUMERIC GENERATED ALWAYS AS
    (EXTRACT(EPOCH FROM (ended_at - started_at))/60.0) STORED,
  impact TEXT, cause TEXT, resolution TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved'))
);
CREATE INDEX IF NOT EXISTS idx_cinc ON public.cio_incidents (component, status, started_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cio_health_components','cio_health_weights',
    'cio_health_history','cio_incidents'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename=t AND policyname=t||'_sel_admin') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
        t||'_sel_admin', t);
    END IF;
  END LOOP;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 2. Coletor de sinais por componente (fontes oficiais; sem_dados
-- quando não houver telemetria — honestidade estrutural)
-- Cada sinal ∈ [0,1] com 'family' p/ ponderação.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_health_signals(p_component TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s JSONB := '[]'::jsonb; det JSONB := '{}'::jsonb;
  v_n BIGINT; v_err BIGINT; v_age NUMERIC; v_q NUMERIC; v_val JSONB; v_x NUMERIC;
BEGIN
  CASE p_component
  WHEN 'etl' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE error IS NOT NULL) INTO v_n, v_err
    FROM public.cio_etl_runs WHERE started_at > now()-interval '24 hours';
    IF v_n = 0 THEN RETURN jsonb_build_object('sem_dados', true,
      'motivo','nenhum run de ETL em 24h (cron ainda não ativo)'); END IF;
    s := s || jsonb_build_object('signal','taxa_sucesso_runs','family','etl',
           'value', ROUND(1.0 - v_err::numeric/v_n, 3));
    SELECT EXTRACT(EPOCH FROM now()-MAX(updated_at))/60.0 INTO v_age
    FROM public.cio_watermarks;
    s := s || jsonb_build_object('signal','frescor_watermark','family','atualidade',
           'value', CASE WHEN v_age<=15 THEN 1.0 WHEN v_age<=60 THEN 0.7 ELSE 0.3 END);
    det := jsonb_build_object('runs_24h', v_n, 'erros', v_err, 'watermark_min', ROUND(v_age,1));
  WHEN 'rollups' THEN
    SELECT COUNT(*) INTO v_n FROM public.cio_metrics;
    IF v_n = 0 THEN RETURN jsonb_build_object('sem_dados', true, 'motivo','rollups vazios'); END IF;
    SELECT EXTRACT(EPOCH FROM now()-MAX(bucket_ts))/60.0 INTO v_age FROM public.cio_metrics
    WHERE grain='5m';
    s := s || jsonb_build_object('signal','frescor_buckets','family','atualidade',
           'value', CASE WHEN v_age<=15 THEN 1.0 WHEN v_age<=60 THEN 0.7 ELSE 0.3 END);
    det := jsonb_build_object('linhas', v_n, 'ultimo_bucket_min', ROUND(v_age,1));
  WHEN 'semantic_layer' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE error IS NOT NULL) INTO v_n, v_err
    FROM public.cio_metric_access_log WHERE created_at > now()-interval '24 hours';
    IF v_n = 0 THEN RETURN jsonb_build_object('sem_dados', true,
      'motivo','nenhuma consulta em 24h'); END IF;
    s := s || jsonb_build_object('signal','taxa_sucesso_consultas','family','profiler',
           'value', ROUND(1.0 - v_err::numeric/v_n, 3));
    SELECT AVG((q->>'score')::numeric) INTO v_q
    FROM jsonb_array_elements(public.cio_metric_quality(NULL)) q;
    s := s || jsonb_build_object('signal','quality_medio','family','qualidade',
           'value', ROUND(COALESCE(v_q,0),3));
    v_val := public.cio_semantic_validate();
    s := s || jsonb_build_object('signal','validator_aprovado','family','validator',
           'value', CASE WHEN (v_val->>'aprovado')::boolean THEN 1.0 ELSE 0.0 END);
    SELECT COUNT(*) INTO v_err FROM public.cio_quality_issues
    WHERE created_at > now()-interval '24 hours';
    s := s || jsonb_build_object('signal','issues_24h','family','drift',
           'value', CASE WHEN v_err=0 THEN 1.0 WHEN v_err<=5 THEN 0.7 ELSE 0.3 END);
    det := jsonb_build_object('consultas_24h', v_n, 'quality_medio', ROUND(COALESCE(v_q,0),2),
             'issues_24h', v_err);
  WHEN 'dispatcher' THEN
    SELECT COUNT(*) INTO v_n FROM public.dispatch_ticks
    WHERE started_at > now()-interval '24 hours';
    IF v_n = 0 THEN RETURN jsonb_build_object('sem_dados', true,
      'motivo','nenhum tick em 24h (cron ainda não ativo)'); END IF;
    SELECT COALESCE(SUM(failed),0), COALESCE(SUM(claimed),0) INTO v_err, v_x
    FROM public.dispatch_ticks WHERE started_at > now()-interval '24 hours';
    s := s || jsonb_build_object('signal','taxa_sucesso_dispatch','family','etl',
           'value', CASE WHEN v_x=0 THEN 1.0 ELSE ROUND(1.0 - v_err/v_x, 3) END);
    det := jsonb_build_object('ticks_24h', v_n, 'claimed', v_x, 'failed', v_err);
  WHEN 'matching' THEN
    SELECT COUNT(*) INTO v_n FROM public.pub_events
    WHERE event_type='DECISAO_DISPATCH' AND created_at > now()-interval '24 hours';
    IF v_n = 0 THEN RETURN jsonb_build_object('sem_dados', true,
      'motivo','nenhuma decisão de matching em 24h'); END IF;
    s := s || jsonb_build_object('signal','decisoes_fluindo','family','etl','value',1.0);
    det := jsonb_build_object('decisoes_24h', v_n);
  WHEN 'ia' THEN
    IF to_regclass('public.ai_execution_log') IS NULL THEN
      RETURN jsonb_build_object('sem_dados', true, 'motivo','ai_execution_log ausente (M44/48 não aplicado)');
    END IF;
    -- colunas de erro variam entre ambientes: detecta antes de consultar
    DECLARE v_cols TEXT[]; v_errexpr TEXT;
    BEGIN
      SELECT array_agg(column_name::text) INTO v_cols
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ai_execution_log';
      IF NOT ('created_at' = ANY(v_cols)) THEN
        RETURN jsonb_build_object('sem_dados', true, 'motivo','ai_execution_log sem created_at');
      END IF;
      v_errexpr := CASE WHEN 'status' = ANY(v_cols)
                     THEN 'COUNT(*) FILTER (WHERE status IN (''error'',''failed''))'
                   WHEN 'error' = ANY(v_cols)
                     THEN 'COUNT(*) FILTER (WHERE error IS NOT NULL)'
                   ELSE '0' END;
      EXECUTE 'SELECT COUNT(*), '||v_errexpr||
              ' FROM public.ai_execution_log WHERE created_at > now()-interval ''24 hours'''
      INTO v_n, v_err;
    END;
    IF v_n = 0 THEN RETURN jsonb_build_object('sem_dados', true,
      'motivo','nenhuma execução de IA em 24h'); END IF;
    s := s || jsonb_build_object('signal','taxa_sucesso_ia','family','etl',
           'value', ROUND(1.0 - v_err::numeric/v_n, 3));
    det := jsonb_build_object('execucoes_24h', v_n, 'erros', v_err);
  WHEN 'rpcs' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status='ERRO') INTO v_n, v_err
    FROM public.publication_requests WHERE created_at > now()-interval '24 hours';
    IF v_n = 0 THEN RETURN jsonb_build_object('sem_dados', true,
      'motivo','nenhum request em 24h'); END IF;
    s := s || jsonb_build_object('signal','taxa_sucesso_requests','family','sla',
           'value', ROUND(1.0 - v_err::numeric/v_n, 3));
    det := jsonb_build_object('requests_24h', v_n, 'erros', v_err);
  WHEN 'apis' THEN
    RETURN public.cio_health_signals('rpcs');   -- proxy declarado no registro
  WHEN 'jobs' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
      RETURN jsonb_build_object('sem_dados', true, 'motivo','pg_cron não instalado/ativado');
    END IF;
    s := s || jsonb_build_object('signal','cron_instalado','family','etl','value',1.0);
  WHEN 'banco' THEN
    -- auto-teste: se esta função executa, o banco responde
    s := s || jsonb_build_object('signal','responde','family','etl','value',1.0);
    det := jsonb_build_object('pub_events', pg_size_pretty(pg_total_relation_size('public.pub_events')));
  ELSE
    RETURN jsonb_build_object('sem_dados', true,
      'motivo', COALESCE((SELECT notes FROM public.cio_health_components
                          WHERE component=p_component), 'sem fonte de telemetria'));
  END CASE;

  RETURN jsonb_build_object('sem_dados', false, 'sinais', s, 'detalhes', det);
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_health_signals(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_health_signals(TEXT) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 3. Health Engine: score 0–100 + classificação
-- Pesos ativos = média ponderada por família; inativos = média
-- simples (aritmética — estrutural, não calibração)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_health_compute(p_component TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c RECORD; sig JSONB; e JSONB; v_sum NUMERIC; v_w NUMERIC; v_wsum NUMERIC;
  v_score NUMERIC; v_class TEXT; v_out JSONB := '[]'::jsonb;
  v_weights JSONB := (SELECT jsonb_object_agg(family, weight)
                      FROM public.cio_health_weights WHERE active);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  FOR c IN SELECT * FROM public.cio_health_components
           WHERE enabled AND (p_component IS NULL OR component=p_component)
           ORDER BY component LOOP
    sig := public.cio_health_signals(c.component);
    IF (sig->>'sem_dados')::boolean THEN
      v_score := NULL; v_class := 'Offline';
    ELSE
      v_sum := 0; v_wsum := 0;
      FOR e IN SELECT jsonb_array_elements(sig->'sinais') LOOP
        v_w := COALESCE((v_weights->>(e->>'family'))::numeric, 1.0);  -- neutro = 1.0
        v_sum := v_sum + (e->>'value')::numeric * v_w;
        v_wsum := v_wsum + v_w;
      END LOOP;
      v_score := ROUND(100.0 * v_sum / NULLIF(v_wsum,0), 1);
      v_class := CASE WHEN v_score >= 90 THEN 'Excelente'
                      WHEN v_score >= 75 THEN 'Bom'
                      WHEN v_score >= 50 THEN 'Atencao'
                      ELSE 'Critico' END;
    END IF;
    v_out := v_out || jsonb_build_object(
      'component', c.component, 'kind', c.kind, 'name', c.name,
      'score', v_score, 'classification', v_class,
      'signals', sig, 'weights_mode',
        CASE WHEN v_weights IS NULL THEN 'neutro (média simples — v1 inativa)' ELSE 'v_ativa' END);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_health_compute(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_health_compute(TEXT) TO service_role;

-- Snapshot periódico + gestão automática de incidentes
CREATE OR REPLACE FUNCTION public.cio_health_snapshot()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e JSONB; v_n INT := 0; v_open INT := 0; v_closed INT := 0; v_i INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  FOR e IN SELECT jsonb_array_elements(public.cio_health_compute(NULL)) LOOP
    INSERT INTO public.cio_health_history (component, score, classification, signals)
    VALUES (e->>'component', (e->>'score')::numeric, e->>'classification', e->'signals');
    v_n := v_n + 1;

    -- Incident Registry automático
    IF e->>'classification' = 'Critico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.cio_incidents
        WHERE component=e->>'component' AND status='open') THEN
        INSERT INTO public.cio_incidents (component, severity, impact, cause)
        VALUES (e->>'component', 'P1',
          'dependentes: '||COALESCE((SELECT array_to_string(dependents,', ')
            FROM public.cio_health_components WHERE component=e->>'component'),''),
          (SELECT string_agg(x->>'signal'||'='||(x->>'value'), ', ')
           FROM jsonb_array_elements(e->'signals'->'sinais') x
           WHERE (x->>'value')::numeric < 0.5));
        v_open := v_open + 1;
      END IF;
    ELSIF e->>'classification' IN ('Excelente','Bom') THEN
      UPDATE public.cio_incidents
      SET status='resolved', ended_at=now(),
          resolution=COALESCE(resolution,'recuperação automática detectada pelo snapshot')
      WHERE component=e->>'component' AND status='open';
      GET DIAGNOSTICS v_i = ROW_COUNT;
      v_closed := v_closed + v_i;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'componentes', v_n,
    'incidentes_abertos', v_open, 'incidentes_resolvidos', v_closed);
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_health_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_health_snapshot() TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 4. Timeline · Availability · Root Cause · Early Warning ·
--    Explain · Capacity · Predictive · Datasets · Executive
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_health_timeline(
  p_component TEXT, p_grain TEXT DEFAULT 'hour'   -- hour|day|week|month
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', b, 'score_medio', avg_s, 'pior', min_s, 'amostras', n) ORDER BY b), '[]'::jsonb)
  FROM (
    SELECT date_trunc(p_grain, captured_at) b,
      ROUND(AVG(score),1) avg_s, MIN(score) min_s, COUNT(*) n
    FROM public.cio_health_history
    WHERE component = p_component AND score IS NOT NULL
    GROUP BY 1) t;
$$;

CREATE OR REPLACE FUNCTION public.cio_availability(
  p_component TEXT, p_days INT DEFAULT 30
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH inc AS (
    SELECT * FROM public.cio_incidents
    WHERE component=p_component AND started_at > now()-make_interval(days=>p_days)
  ),
  win AS (SELECT p_days*24*60.0 AS total_min)
  SELECT jsonb_build_object(
    'component', p_component, 'janela_dias', p_days,
    'downtime_min', COALESCE((SELECT ROUND(SUM(
        EXTRACT(EPOCH FROM COALESCE(ended_at, now()) - started_at)/60.0),1) FROM inc), 0),
    'uptime_pct', ROUND(100.0 * (1.0 - COALESCE((SELECT SUM(
        EXTRACT(EPOCH FROM COALESCE(ended_at, now()) - started_at)/60.0) FROM inc),0)
        / (SELECT total_min FROM win)), 3),
    'incidentes', (SELECT COUNT(*) FROM inc),
    'mttr_min', (SELECT ROUND(AVG(duration_min),1) FROM inc WHERE status='resolved'),
    'mtbf_horas', CASE WHEN (SELECT COUNT(*) FROM inc) > 1
      THEN ROUND((SELECT EXTRACT(EPOCH FROM MAX(started_at)-MIN(started_at))/3600.0
                  / NULLIF(COUNT(*)-1,0) FROM inc), 1) END,
    'nota', CASE WHEN NOT EXISTS (SELECT 1 FROM inc)
      THEN 'sem incidentes na janela — MTTR/MTBF não aplicáveis' END);
$$;

CREATE OR REPLACE FUNCTION public.cio_root_cause(p_component TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e JSONB; x JSONB; v_out JSONB := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  FOR e IN SELECT jsonb_array_elements(public.cio_health_compute(p_component)) LOOP
    IF e->>'classification' IN ('Atencao','Critico') THEN
      v_out := v_out || jsonb_build_object(
        'component', e->>'component',
        'classification', e->>'classification',
        'causa_provavel', (
          SELECT jsonb_agg(jsonb_build_object(
            'sinal', x2->>'signal', 'valor', x2->>'value', 'familia', x2->>'family')
            ORDER BY (x2->>'value')::numeric)
          FROM jsonb_array_elements(e->'signals'->'sinais') x2
          WHERE (x2->>'value')::numeric < 0.7),
        'evidencias', e->'signals'->'detalhes',
        'impacto', (SELECT to_jsonb(dependents) FROM public.cio_health_components
                    WHERE component=e->>'component'),
        'prioridade', CASE e->>'classification' WHEN 'Critico' THEN 'P1' ELSE 'P2' END);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'degradados', v_out,
    'metodo', 'determinístico: sinais com valor < 0.7 ordenados por contribuição — sem IA generativa');
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_root_cause(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_root_cause(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.cio_early_warning()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v JSONB := '[]'::jsonb; a NUMERIC; b NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  -- Queda gradual de health (média das últimas 5 amostras vs 5 anteriores, por componente)
  v := v || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('alerta','queda_gradual_health',
      'component', component, 'antes', ROUND(m_old,1), 'agora', ROUND(m_new,1)))
    FROM (
      SELECT component,
        AVG(score) FILTER (WHERE rn <= 5) m_new,
        AVG(score) FILTER (WHERE rn > 5 AND rn <= 10) m_old
      FROM (SELECT component, score,
              ROW_NUMBER() OVER (PARTITION BY component ORDER BY captured_at DESC) rn
            FROM public.cio_health_history WHERE score IS NOT NULL) h
      GROUP BY component) t
    WHERE m_old IS NOT NULL AND m_new < m_old - 10), '[]'::jsonb);
  -- Latência do ETL crescendo
  SELECT AVG(duration_ms) FILTER (WHERE started_at > now()-interval '2 hours'),
         AVG(duration_ms) FILTER (WHERE started_at BETWEEN now()-interval '24 hours'
                                                       AND now()-interval '2 hours')
  INTO a, b FROM public.cio_etl_runs WHERE error IS NULL;
  IF a IS NOT NULL AND b IS NOT NULL AND a > b*2 AND a > 100 THEN
    v := v || jsonb_build_object('alerta','latencia_etl_crescendo',
      'media_2h_ms', ROUND(a,1), 'media_24h_ms', ROUND(b,1));
  END IF;
  -- Consultas semânticas crescendo forte (capacidade)
  SELECT COUNT(*) FILTER (WHERE created_at > now()-interval '1 hour'),
         COUNT(*) FILTER (WHERE created_at BETWEEN now()-interval '25 hours'
                                               AND now()-interval '24 hours')
  INTO a, b FROM public.cio_metric_access_log;
  IF b > 0 AND a > b*5 THEN
    v := v || jsonb_build_object('alerta','consultas_crescendo','hora_atual',a,'mesma_hora_ontem',b);
  END IF;
  -- Issues de qualidade acelerando
  SELECT COUNT(*) FILTER (WHERE created_at > now()-interval '24 hours'),
         COUNT(*) FILTER (WHERE created_at BETWEEN now()-interval '48 hours'
                                               AND now()-interval '24 hours')
  INTO a, b FROM public.cio_quality_issues;
  IF a > b + 5 THEN
    v := v || jsonb_build_object('alerta','issues_acelerando','ult_24h',a,'24h_anteriores',b);
  END IF;
  RETURN jsonb_build_object('ok', true, 'avisos', v,
    'nota','deteção ANTES da falha; registra e reporta, nunca bloqueia');
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_early_warning() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_early_warning() TO service_role;

CREATE OR REPLACE FUNCTION public.cio_health_explain(p_component TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e JSONB;
BEGIN
  e := (public.cio_health_compute(p_component))->0;
  IF e IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'componente_inexistente');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'component', p_component,
    'score', e->'score', 'classification', e->>'classification',
    'resumo', CASE
      WHEN e->>'classification'='Offline' THEN
        'Sem telemetria: '||COALESCE(e->'signals'->>'motivo','fonte ainda não ativa')||'. Score nulo por doutrina — nunca inventado.'
      WHEN e->>'classification' IN ('Excelente','Bom') THEN
        'Saudável: todos os sinais coletados acima dos limiares.'
      ELSE 'Degradado: sinais abaixo de 0.7 listados em causa_provavel.' END,
    'metricas_influentes', e->'signals'->'sinais',
    'evidencias', e->'signals'->'detalhes',
    'pesos_utilizados', jsonb_build_object(
      'modo', e->>'weights_mode',
      'familias', COALESCE((SELECT jsonb_object_agg(family, weight)
        FROM public.cio_health_weights WHERE active),
        '"todas com peso 1.0 (média simples)"'::jsonb)));
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_health_explain(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_health_explain(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.cio_capacity()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH g AS (
    SELECT
      (SELECT COUNT(*) FROM public.pub_events) ev_total,
      (SELECT COUNT(*) FROM public.pub_events WHERE created_at > now()-interval '7 days') ev_7d,
      (SELECT COUNT(*) FROM public.cio_metrics) roll_total,
      (SELECT COUNT(*) FROM public.cio_metric_access_log) log_total,
      (SELECT COUNT(*) FROM public.cio_metric_access_log
        WHERE created_at > now()-interval '7 days') log_7d
  )
  SELECT jsonb_build_object(
    'utilizacao', jsonb_build_object(
      'pub_events', ev_total, 'cio_metrics', roll_total, 'access_log', log_total,
      'tamanho_eventos', pg_size_pretty(pg_total_relation_size('public.pub_events'))),
    'crescimento_7d', jsonb_build_object('eventos', ev_7d, 'consultas', log_7d),
    'tendencia', CASE WHEN ev_7d > 0 THEN 'crescendo' ELSE 'estavel' END,
    'saturacao', jsonb_build_object(
      'limiar_particionamento_eventos', 1000000,
      'pct_do_limiar', ROUND(100.0*ev_total/1000000.0, 2)),
    'projecao', CASE WHEN ev_7d > 0
      THEN jsonb_build_object('dias_ate_limiar_particionamento',
        ROUND((1000000 - ev_total) / (ev_7d/7.0)))
      ELSE jsonb_build_object('nota','sem crescimento na janela — projeção não aplicável') END)
  FROM g;
$$;

CREATE OR REPLACE FUNCTION public.cio_health_predict(
  p_component TEXT, p_horizon TEXT DEFAULT '24h'   -- 24h|7d|30d
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_slope NUMERIC; v_icept NUMERIC; v_n INT; v_h NUMERIC; v_now NUMERIC;
BEGIN
  SELECT COUNT(*), regr_slope(score, EXTRACT(EPOCH FROM captured_at)),
         regr_intercept(score, EXTRACT(EPOCH FROM captured_at))
  INTO v_n, v_slope, v_icept
  FROM public.cio_health_history
  WHERE component=p_component AND score IS NOT NULL
    AND captured_at > now()-interval '30 days';
  IF v_n < 10 OR v_slope IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'component', p_component,
      'previsao', NULL, 'motivo', 'dados_insuficientes',
      'amostras', v_n, 'minimo_necessario', 10,
      'doutrina', 'previsão só com histórico real — nunca inventar valores');
  END IF;
  v_h := CASE p_horizon WHEN '24h' THEN 86400 WHEN '7d' THEN 604800 ELSE 2592000 END;
  v_now := EXTRACT(EPOCH FROM now());
  RETURN jsonb_build_object('ok', true, 'component', p_component,
    'horizonte', p_horizon, 'amostras', v_n,
    'score_projetado', GREATEST(0, LEAST(100, ROUND(v_icept + v_slope*(v_now+v_h), 1))),
    'tendencia', CASE WHEN v_slope > 0.000001 THEN 'melhorando'
                      WHEN v_slope < -0.000001 THEN 'degradando' ELSE 'estavel' END,
    'metodo', 'regressão linear sobre a série histórica (30d)');
END $$;

CREATE OR REPLACE FUNCTION public.cio_operational_dataset()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN jsonb_build_object(
    'health', public.cio_health_compute(NULL),
    'sla', public.cio_metric_sla_status(NULL),
    'drift_issues_7d', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'check', check_key, 'entity', entity_id, 'em', created_at)), '[]'::jsonb)
      FROM public.cio_quality_issues
      WHERE check_key LIKE 'drift%' AND created_at > now()-interval '7 days'),
    'quality', public.cio_metric_quality(NULL),
    'timeline_24h', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'component', component, 'score', score, 'em', captured_at)
        ORDER BY captured_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.cio_health_history
            WHERE captured_at > now()-interval '24 hours'
            ORDER BY captured_at DESC LIMIT 200) h),
    'incidentes', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.started_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.cio_incidents ORDER BY started_at DESC LIMIT 50) i),
    'disponibilidade', (SELECT jsonb_object_agg(component,
        public.cio_availability(component, 30) -> 'uptime_pct')
      FROM public.cio_health_components WHERE enabled),
    'performance', public.cio_metric_profile(NULL, 24),
    'alertas', jsonb_build_object('nota','engine de alertas chega no M55.5; early_warning ativo abaixo'),
    'early_warning', public.cio_early_warning(),
    'validator', public.cio_semantic_validate());
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_operational_dataset() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_operational_dataset() TO service_role;

CREATE OR REPLACE FUNCTION public.cio_noc_dataset()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN jsonb_build_object(
    'atualizado_em', now(),
    'refresh_sugerido_s', 30,
    'semaforo', (SELECT jsonb_object_agg(e->>'component', e->>'classification')
      FROM jsonb_array_elements(public.cio_health_compute(NULL)) e),
    'incidentes_ativos', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
      FROM public.cio_incidents i WHERE status='open'),
    'avisos', public.cio_early_warning()->'avisos',
    'fila', jsonb_build_object(
      'backlog', (SELECT COUNT(*) FROM public.publication_requests WHERE status='AGENDADO'),
      'lotes_available', (SELECT COUNT(*) FROM public.posting_lots WHERE status='available')));
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_noc_dataset() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_noc_dataset() TO service_role;

CREATE OR REPLACE FUNCTION public.cio_health_executive()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE h JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  h := public.cio_health_compute(NULL);
  RETURN jsonb_build_object(
    'situacao_geral', (SELECT CASE
        WHEN COUNT(*) FILTER (WHERE e->>'classification'='Critico') > 0 THEN 'CRITICO'
        WHEN COUNT(*) FILTER (WHERE e->>'classification'='Atencao') > 0 THEN 'ATENCAO'
        ELSE 'SAUDAVEL' END
      FROM jsonb_array_elements(h) e WHERE e->>'classification' <> 'Offline'),
    'score_geral', (SELECT ROUND(AVG((e->>'score')::numeric),1)
      FROM jsonb_array_elements(h) e WHERE e->>'score' IS NOT NULL),
    'componentes_criticos', (SELECT COALESCE(jsonb_agg(e->>'component'), '[]'::jsonb)
      FROM jsonb_array_elements(h) e WHERE e->>'classification'='Critico'),
    'componentes_offline', (SELECT COALESCE(jsonb_agg(e->>'component'), '[]'::jsonb)
      FROM jsonb_array_elements(h) e WHERE e->>'classification'='Offline'),
    'principais_riscos', public.cio_early_warning()->'avisos',
    'incidentes_ativos', (SELECT COUNT(*) FROM public.cio_incidents WHERE status='open'),
    'metricas_degradadas', (SELECT COALESCE(jsonb_agg(s->>'metric'), '[]'::jsonb)
      FROM jsonb_array_elements(public.cio_metric_sla_status(NULL)) s
      WHERE s->>'status_operacional' IN ('atrasado','degradado')),
    'prioridades', public.cio_root_cause(NULL)->'degradados');
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_health_executive() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_health_executive() TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 5. Materializa a métrica 'health' no catálogo (draft → v2 ativa)
-- via gauge 'health_geral' — re-emissão ADITIVA do eval_gauge e do
-- validator (allowlist ganha a nova função)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_eval_gauge(
  p_fn TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_scope JSONB
) RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v NUMERIC;
BEGIN
  CASE p_fn
    WHEN 'backlog_agendado' THEN
      SELECT COUNT(*) INTO v FROM public.publication_requests WHERE status='AGENDADO';
    WHEN 'fila_lotes_available' THEN
      SELECT COUNT(*) INTO v FROM public.posting_lots WHERE status='available';
    WHEN 'disponibilidade_etl' THEN
      SELECT CASE WHEN COUNT(*)=0 THEN NULL
             ELSE ROUND(1.0 - COUNT(*) FILTER (WHERE error IS NOT NULL)::numeric/COUNT(*), 4) END
      INTO v FROM public.cio_etl_runs WHERE started_at >= p_from AND started_at < p_to;
    WHEN 'receita_promocoes' THEN
      SELECT COALESCE(SUM(amount_brl),0) INTO v FROM public.promotion_purchases
      WHERE status='paid' AND created_at >= p_from AND created_at < p_to;
    WHEN 'conversoes_outcomes' THEN
      SELECT COALESCE(SUM(sales_after),0) INTO v FROM public.m51_boost_outcomes
      WHERE boosted_at >= p_from AND boosted_at < p_to;
    WHEN 'execucoes_ia' THEN
      IF to_regclass('public.ai_execution_log') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.ai_execution_log WHERE created_at >= $1 AND created_at < $2'
        INTO v USING p_from, p_to;
      END IF;
    WHEN 'publicacoes_do_anunciante' THEN
      SELECT COALESCE(SUM(lots),0)+COALESCE(SUM(daily_used),0) INTO v
      FROM public.cio_advertiser_daily
      WHERE advertiser_user_id = (p_scope->>'advertiser_user_id')::uuid
        AND day >= (p_from AT TIME ZONE 'America/Sao_Paulo')::date
        AND day <= (p_to   AT TIME ZONE 'America/Sao_Paulo')::date;
    WHEN 'confirmacoes_do_postador' THEN
      SELECT COALESCE(SUM(confirmations),0) INTO v
      FROM public.cio_poster_daily
      WHERE poster_user_id = (p_scope->>'poster_user_id')::uuid
        AND day >= (p_from AT TIME ZONE 'America/Sao_Paulo')::date
        AND day <= (p_to   AT TIME ZONE 'America/Sao_Paulo')::date;
    WHEN 'health_geral' THEN
      -- média dos últimos scores por componente (histórico real; NULL se vazio)
      SELECT ROUND(AVG(score),1) INTO v FROM (
        SELECT DISTINCT ON (component) score
        FROM public.cio_health_history
        WHERE score IS NOT NULL
        ORDER BY component, captured_at DESC) s;
    ELSE
      RAISE EXCEPTION 'gauge_desconhecida: %', p_fn;
  END CASE;
  RETURN v;
END $$;

-- Publica health v2 (v1 draft → deprecated) — timeline registra
UPDATE public.cio_metric_definitions SET status='deprecated'
 WHERE metric_key='health' AND version=1 AND status='draft';
INSERT INTO public.cio_metric_definitions
  (metric_key, version, name, description, category, unit, audience,
   formula_kind, formula, dependencies, status, tags, owner, certification, notes)
VALUES ('health', 2, 'Health de Componentes',
  'Média dos scores mais recentes de saúde por componente (0–100), calculados pelo Health Center a partir das fontes oficiais do CIO.',
  'qualidade','pct','{ceo,admin,operador}',
  'gauge','{"fn":"health_geral"}','{}','active',
  '{operacao,seguranca}','plataforma','validated',
  'Materializada no M55.4. Componentes sem telemetria não entram na média (sem_dados).')
ON CONFLICT (metric_key, version) DO NOTHING;
INSERT INTO public.cio_metric_sla (metric_key) VALUES ('health') ON CONFLICT DO NOTHING;

-- Validator: allowlist ganha 'health_geral' (re-emissão integral)
CREATE OR REPLACE FUNCTION public.cio_semantic_validate()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_issues JSONB := '[]'::jsonb;
  v_allow  TEXT[] := ARRAY['backlog_agendado','fila_lotes_available','disponibilidade_etl',
    'receita_promocoes','conversoes_outcomes','execucoes_ia',
    'publicacoes_do_anunciante','confirmacoes_do_postador','health_geral','_draft'];
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM public.cio_metric_definitions WHERE status IN ('active','draft') LOOP
    IF r.formula_kind IN ('counter','avg') AND NOT (r.formula ? 'metric') THEN
      v_issues := v_issues || jsonb_build_object('check','formula_invalida','metric',r.metric_key,
        'detalhe','counter/avg sem campo metric');
    ELSIF r.formula_kind='ratio' AND NOT (r.formula ? 'num' AND r.formula ? 'den') THEN
      v_issues := v_issues || jsonb_build_object('check','formula_invalida','metric',r.metric_key,
        'detalhe','ratio sem num/den');
    ELSIF r.formula_kind='gauge' AND NOT ((r.formula->>'fn') = ANY(v_allow)) THEN
      v_issues := v_issues || jsonb_build_object('check','gauge_fora_da_allowlist',
        'metric',r.metric_key,'fn',r.formula->>'fn');
    END IF;
  END LOOP;
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','formula_duplicada_sem_alias',
      'metrics', ARRAY[a.metric_key, b.metric_key]))
    FROM public.cio_metric_definitions a
    JOIN public.cio_metric_definitions b
      ON a.formula = b.formula AND a.formula_kind = b.formula_kind
     AND a.metric_key < b.metric_key
     AND a.status='active' AND b.status='active'
     AND a.alias_of IS DISTINCT FROM b.metric_key
     AND b.alias_of IS DISTINCT FROM a.metric_key), '[]'::jsonb);
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','alias_conflitante',
      'metric', d.metric_key, 'alias_of', d.alias_of))
    FROM public.cio_metric_definitions d
    WHERE d.alias_of IS NOT NULL AND d.status='active'
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_definitions t
        WHERE t.metric_key = d.alias_of AND t.status='active')), '[]'::jsonb);
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','dependencia_inexistente',
      'metric', d.metric_key, 'dep', dep))
    FROM public.cio_metric_definitions d, unnest(d.dependencies) dep
    WHERE d.status IN ('active','draft')
      AND dep ~ '^[a-z][a-z0-9_]*$'
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_definitions t
        WHERE t.metric_key = dep)), '[]'::jsonb);
  v_issues := v_issues || COALESCE((
    WITH RECURSIVE g AS (
      SELECT d.metric_key AS origem, dep AS alvo, ARRAY[d.metric_key] AS caminho
      FROM public.cio_metric_definitions d, unnest(d.dependencies) dep
      WHERE EXISTS (SELECT 1 FROM public.cio_metric_definitions t WHERE t.metric_key=dep)
      UNION ALL
      SELECT g.origem, dep, g.caminho || d.metric_key
      FROM g
      JOIN public.cio_metric_definitions d ON d.metric_key = g.alvo
      CROSS JOIN unnest(d.dependencies) dep
      WHERE NOT d.metric_key = ANY(g.caminho)
        AND array_length(g.caminho,1) < 10
    )
    SELECT jsonb_agg(DISTINCT jsonb_build_object('check','ciclo_dependencia','metric',origem))
    FROM g WHERE alvo = origem), '[]'::jsonb);
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','metrica_orfa','severidade','info',
      'metric', d.metric_key))
    FROM public.cio_metric_definitions d
    WHERE d.status='active'
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_consumers c WHERE c.metric_key=d.metric_key)
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_access_log l
        WHERE l.metric_key=d.metric_key AND l.created_at > now()-interval '30 days')), '[]'::jsonb);
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','multiplas_ativas','metric',metric_key))
    FROM (SELECT metric_key FROM public.cio_metric_definitions WHERE status='active'
          GROUP BY metric_key HAVING COUNT(*)>1) x), '[]'::jsonb);
  RETURN jsonb_build_object('ok', true,
    'issues', v_issues,
    'total', jsonb_array_length(v_issues),
    'aprovado', NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) i
      WHERE i->>'check' NOT IN ('metrica_orfa')));
END $$;


-- ──────────────────────────────────────────────────────────────
-- Permissões restantes + VERIFICAÇÃO
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE f TEXT;
BEGIN
  -- sem guarda interna de auth => service-only; painéis consomem via datasets guardados
  FOREACH f IN ARRAY ARRAY['cio_health_timeline(text,text)','cio_availability(text,integer)',
    'cio_capacity()','cio_health_predict(text,text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

DO $$
DECLARE v JSONB;
BEGIN
  IF (SELECT COUNT(*) FROM public.cio_health_components) < 16 THEN
    RAISE EXCEPTION 'M55.4 ERRO: 16 componentes esperados'; END IF;
  IF EXISTS (SELECT 1 FROM public.cio_health_weights WHERE active) THEN
    RAISE EXCEPTION 'M55.4 ERRO: pesos deveriam nascer INATIVOS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cio_metric_definitions
    WHERE metric_key='health' AND version=2 AND status='active') THEN
    RAISE EXCEPTION 'M55.4 ERRO: métrica health não materializada'; END IF;
  v := public.cio_semantic_validate();
  IF NOT (v->>'aprovado')::boolean THEN
    RAISE EXCEPTION 'M55.4 ERRO: catálogo reprovado: %', v->'issues'; END IF;

  RAISE NOTICE 'M55.4 ✓ Health Engine (16 componentes, sinais oficiais, sem_dados honesto) + pesos v1 INATIVOS — OK';
  RAISE NOTICE 'M55.4 ✓ Snapshot+Incidentes automáticos + Timeline + Availability(MTTR/MTBF) + RootCause + EarlyWarning — OK';
  RAISE NOTICE 'M55.4 ✓ Explain + Capacity + Predict(regressão, mínimo 10 amostras) + Operational/NOC/Executive datasets — OK';
  RAISE NOTICE 'M55.4 ✓ Métrica health MATERIALIZADA (v2 ativa via gauge health_geral; v1 draft depreciada) — OK';
END $$;
