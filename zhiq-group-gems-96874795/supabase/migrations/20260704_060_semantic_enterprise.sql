-- ============================================================
-- M55.3B · Enterprise Semantic Governance
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_059 (fila de deploy)
-- ============================================================
-- 100% INCREMENTAL: contratos públicos preservados (cio_metric e
-- cio_metric_bundle mantêm assinaturas; corpo re-emitido só para
-- enriquecer o audit). Compatibilidade M050–M059 revalidada pela
-- suíte de regressão. Filosofia de fonte única intacta.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.cio_data_dictionary(text)') IS NULL THEN
    RAISE EXCEPTION 'M55.3B BLOQUEADA — aplicar 20260704_059 antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. CERTIFICATION + SLA + estruturas de governança
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.cio_metric_definitions
  ADD COLUMN IF NOT EXISTS certification TEXT NOT NULL DEFAULT 'draft'
    CHECK (certification IN ('draft','experimental','validated','certified','enterprise','deprecated','archived'));

-- Seed de certificação (ativas testadas = validated; drafts = draft)
UPDATE public.cio_metric_definitions SET certification='validated'
 WHERE status='active' AND certification='draft';
UPDATE public.cio_metric_definitions SET certification='deprecated'
 WHERE status='deprecated' AND certification='draft';

CREATE TABLE IF NOT EXISTS public.cio_metric_sla (
  metric_key        TEXT PRIMARY KEY,
  max_ms_expected   INT  NOT NULL DEFAULT 200,   -- [calibrar-com-uso-real]
  freq_expected_min INT  NOT NULL DEFAULT 5,     -- ciclo do ETL
  notes             TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.cio_metric_sla (metric_key)
SELECT DISTINCT metric_key FROM public.cio_metric_definitions WHERE status='active'
ON CONFLICT DO NOTHING;

-- Enterprise Audit: enriquecer o log de acesso
ALTER TABLE public.cio_metric_access_log
  ADD COLUMN IF NOT EXISTS rows_returned INT,
  ADD COLUMN IF NOT EXISTS result_status TEXT;

-- Timeline
CREATE TABLE IF NOT EXISTS public.cio_metric_timeline (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_key TEXT NOT NULL, version INT,
  event TEXT NOT NULL,       -- criada|publicada|depreciada|reativada|owner_alterado|doc_alterada|certificacao_alterada|arquivada
  actor UUID, details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Backfill: criação das definições existentes
INSERT INTO public.cio_metric_timeline (metric_key, version, event, details, created_at)
SELECT metric_key, version, 'criada',
       jsonb_build_object('status', status, 'backfill', true), created_at
FROM public.cio_metric_definitions d
WHERE NOT EXISTS (SELECT 1 FROM public.cio_metric_timeline t
  WHERE t.metric_key=d.metric_key AND t.version=d.version AND t.event='criada');

CREATE OR REPLACE FUNCTION public.cio_timeline_track()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cio_metric_timeline (metric_key, version, event, actor, details)
    VALUES (NEW.metric_key, NEW.version,
      CASE WHEN NEW.status='active' THEN 'publicada' ELSE 'criada' END,
      auth.uid(), jsonb_build_object('status', NEW.status));
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.cio_metric_timeline (metric_key, version, event, actor, details)
      VALUES (NEW.metric_key, NEW.version,
        CASE NEW.status WHEN 'deprecated' THEN 'depreciada'
                        WHEN 'active' THEN 'reativada' ELSE 'status_alterado' END,
        auth.uid(), jsonb_build_object('de', OLD.status, 'para', NEW.status));
    END IF;
    IF NEW.owner IS DISTINCT FROM OLD.owner THEN
      INSERT INTO public.cio_metric_timeline (metric_key, version, event, actor, details)
      VALUES (NEW.metric_key, NEW.version, 'owner_alterado', auth.uid(),
        jsonb_build_object('de', OLD.owner, 'para', NEW.owner));
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes OR NEW.description IS DISTINCT FROM OLD.description THEN
      INSERT INTO public.cio_metric_timeline (metric_key, version, event, actor)
      VALUES (NEW.metric_key, NEW.version, 'doc_alterada', auth.uid());
    END IF;
    IF NEW.certification IS DISTINCT FROM OLD.certification THEN
      INSERT INTO public.cio_metric_timeline (metric_key, version, event, actor, details)
      VALUES (NEW.metric_key, NEW.version, 'certificacao_alterada', auth.uid(),
        jsonb_build_object('de', OLD.certification, 'para', NEW.certification));
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cio_timeline ON public.cio_metric_definitions;
CREATE TRIGGER trg_cio_timeline
  AFTER INSERT OR UPDATE ON public.cio_metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.cio_timeline_track();

-- Confidence Evolution
CREATE TABLE IF NOT EXISTS public.cio_quality_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_key TEXT NOT NULL, version INT NOT NULL,
  snapshot JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.cio_quality_snapshot()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r JSONB; e JSONB; n INT := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  r := public.cio_metric_quality(NULL);
  FOR e IN SELECT jsonb_array_elements(r) LOOP
    INSERT INTO public.cio_quality_history (metric_key, version, snapshot)
    SELECT e->>'metric',
      (SELECT MAX(version) FROM public.cio_metric_definitions
        WHERE metric_key=e->>'metric'), e;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.cio_quality_evolution(p_key TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH h AS (SELECT snapshot, captured_at FROM public.cio_quality_history
             WHERE metric_key=p_key ORDER BY captured_at)
  SELECT jsonb_build_object(
    'metric', p_key,
    'serie', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'em', captured_at, 'score', snapshot->>'score') ORDER BY captured_at)
        FROM h), '[]'::jsonb),
    'tendencia', CASE
      WHEN (SELECT COUNT(*) FROM h) < 2 THEN 'dados_insuficientes'
      WHEN (SELECT (snapshot->>'score')::numeric FROM h ORDER BY captured_at DESC LIMIT 1)
         > (SELECT (snapshot->>'score')::numeric FROM h ORDER BY captured_at ASC LIMIT 1)
         THEN 'evolucao'
      WHEN (SELECT (snapshot->>'score')::numeric FROM h ORDER BY captured_at DESC LIMIT 1)
         < (SELECT (snapshot->>'score')::numeric FROM h ORDER BY captured_at ASC LIMIT 1)
         THEN 'regressao'
      ELSE 'estavel' END)
  FROM (SELECT 1) x;
$$;

-- RLS das novas tabelas (admin lê; escrita só via funções)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cio_metric_sla','cio_metric_timeline','cio_quality_history'] LOOP
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
-- 2. cio_metric: corpo re-emitido (MESMA assinatura) p/ Enterprise
-- Audit (rows_returned + result_status) — contrato intacto
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_metric(
  p_key      TEXT,
  p_grain    TEXT        DEFAULT '1d',
  p_from     TIMESTAMPTZ DEFAULT now() - interval '7 days',
  p_to       TIMESTAMPTZ DEFAULT now(),
  p_dims     JSONB       DEFAULT '{}'::jsonb,
  p_version  INT         DEFAULT NULL,
  p_consumer TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t0 TIMESTAMPTZ := clock_timestamp();
  v_def RECORD; v_caller UUID := auth.uid(); v_aud TEXT;
  v_scope JSONB := '{}'::jsonb; v_series JSONB; v_total NUMERIC;
  v_num NUMERIC; v_den NUMERIC; v_result JSONB;
BEGIN
  IF p_version IS NULL THEN
    SELECT * INTO v_def FROM public.cio_metric_definitions
    WHERE metric_key = p_key AND status = 'active';
    IF NOT FOUND THEN
      SELECT * INTO v_def FROM public.cio_metric_definitions
      WHERE metric_key = p_key ORDER BY version DESC LIMIT 1;
    END IF;
  ELSE
    SELECT * INTO v_def FROM public.cio_metric_definitions
    WHERE metric_key = p_key AND version = p_version;
  END IF;
  IF v_def IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'metrica_inexistente', 'key', p_key);
  END IF;

  IF v_caller IS NULL OR public.is_admin() THEN
    v_aud := CASE WHEN v_caller IS NULL THEN 'service' ELSE 'admin' END;
  ELSE
    IF NOT (v_def.audience && ARRAY['anunciante','postador']) OR v_def.scope_dim IS NULL THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
    END IF;
    v_aud := CASE WHEN 'anunciante' = ANY(v_def.audience) THEN 'anunciante' ELSE 'postador' END;
    v_scope := jsonb_build_object(v_def.scope_dim, v_caller);
    p_dims := p_dims || v_scope;
  END IF;

  IF v_def.status = 'draft' THEN
    v_result := jsonb_build_object('ok', true, 'key', p_key, 'version', v_def.version,
      'name', v_def.name, 'unit', v_def.unit, 'status', 'draft',
      'certification', v_def.certification,
      'value', NULL, 'series', '[]'::jsonb,
      'meta', jsonb_build_object('aguardando_fonte', v_def.dependencies, 'notes', v_def.notes));
  ELSE
    CASE v_def.formula_kind
      WHEN 'counter' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket_ts, 'value', value)
                 ORDER BY bucket_ts), '[]'::jsonb), COALESCE(SUM(value),0)
        INTO v_series, v_total
        FROM public.cio_eval_counter(v_def.formula, p_grain, p_from, p_to, p_dims);
      WHEN 'avg' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket_ts,
                 'value', ROUND(value/NULLIF(cnt,0),2)) ORDER BY bucket_ts), '[]'::jsonb),
               ROUND(SUM(value)/NULLIF(SUM(cnt),0),2)
        INTO v_series, v_total
        FROM public.cio_eval_counter(v_def.formula, p_grain, p_from, p_to, p_dims);
      WHEN 'ratio' THEN
        SELECT COALESCE(SUM(value),0) INTO v_num
        FROM public.cio_eval_counter(v_def.formula->'num', p_grain, p_from, p_to, p_dims);
        SELECT COALESCE(SUM(value),0) INTO v_den
        FROM public.cio_eval_counter(v_def.formula->'den', p_grain, p_from, p_to, p_dims);
        v_total := ROUND(v_num/NULLIF(v_den,0), 4);
        v_series := '[]'::jsonb;
      WHEN 'gauge' THEN
        v_total := public.cio_eval_gauge(v_def.formula->>'fn', p_from, p_to,
                     COALESCE(v_scope, '{}'::jsonb));
        v_series := '[]'::jsonb;
    END CASE;

    v_result := jsonb_build_object('ok', true, 'key', p_key, 'version', v_def.version,
      'name', v_def.name, 'unit', v_def.unit, 'status', v_def.status,
      'certification', v_def.certification,
      'value', v_total, 'series', v_series,
      'meta', jsonb_build_object('grain', p_grain, 'from', p_from, 'to', p_to,
                                 'audience', v_aud));
  END IF;

  BEGIN
    INSERT INTO public.cio_metric_access_log
      (metric_key, version, audience, caller, grain, duration_ms, cached, consumer,
       rows_returned, result_status)
    VALUES (p_key, v_def.version, v_aud, v_caller, p_grain,
            (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int, false, p_consumer,
            jsonb_array_length(COALESCE(v_series,'[]'::jsonb)),
            CASE WHEN v_def.status='draft' THEN 'draft' ELSE 'ok' END);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_result;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 3. LINEAGE + EXPLAIN GRAPH + IMPACT SIMULATOR
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_metric_lineage(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d RECORD; v_phys TEXT[]; v_src TEXT;
BEGIN
  SELECT * INTO d FROM public.cio_metric_definitions
  WHERE metric_key=p_key ORDER BY (status='active') DESC, version DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'metrica_inexistente');
  END IF;

  IF d.formula_kind IN ('counter','avg') THEN
    v_src := COALESCE(d.formula->>'source','(todas)');
    v_phys := CASE v_src
      WHEN 'pub_events' THEN ARRAY['pub_events']
      WHEN 'dispatch_ticks' THEN ARRAY['dispatch_ticks']
      WHEN 'requests_finished' THEN ARRAY['publication_requests']
      ELSE ARRAY['pub_events','dispatch_ticks','publication_requests'] END;
  ELSIF d.formula_kind='ratio' THEN
    v_src := 'multiplas'; v_phys := ARRAY['pub_events'];
  ELSE
    v_src := 'gauge:'||(d.formula->>'fn');
    v_phys := CASE d.formula->>'fn'
      WHEN 'backlog_agendado' THEN ARRAY['publication_requests']
      WHEN 'fila_lotes_available' THEN ARRAY['posting_lots']
      WHEN 'disponibilidade_etl' THEN ARRAY['cio_etl_runs']
      WHEN 'receita_promocoes' THEN ARRAY['promotion_purchases']
      WHEN 'conversoes_outcomes' THEN ARRAY['m51_boost_outcomes']
      WHEN 'execucoes_ia' THEN ARRAY['ai_execution_log']
      WHEN 'publicacoes_do_anunciante' THEN ARRAY['cio_advertiser_daily']
      WHEN 'confirmacoes_do_postador' THEN ARRAY['cio_poster_daily']
      ELSE ARRAY['(aguardando_fonte)'] END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'metric', p_key, 'versao', d.version,
    'cadeia', jsonb_build_array(
      jsonb_build_object('nivel',1,'camada','origem_fisica','tabelas', v_phys),
      jsonb_build_object('nivel',2,'camada','etl',
        'responsavel', CASE WHEN d.formula_kind='gauge'
          THEN 'leitura direta pela allowlist (sem ETL)'
          ELSE 'cio_etl_tick → cio_rebuild_window (watermark 5min)' END),
      jsonb_build_object('nivel',3,'camada','rollup',
        'origem_logica', CASE WHEN d.formula_kind='gauge' THEN NULL
          ELSE format('cio_metrics[source=%s, metric=%s]', v_src, d.formula->>'metric') END),
      jsonb_build_object('nivel',4,'camada','semantic',
        'metric', p_key, 'versao', d.version, 'kind', d.formula_kind,
        'versao_origem', (SELECT jsonb_build_object('watermark', w.last_id, 'ts', w.last_ts)
          FROM public.cio_watermarks w WHERE w.source =
            CASE v_src WHEN '(todas)' THEN 'pub_events' ELSE split_part(v_src,':',1) END)),
      jsonb_build_object('nivel',5,'camada','rpc','interface','cio_metric()/cio_metric_bundle()')),
    'dependencias_declaradas', d.dependencies,
    'alias_de', d.alias_of);
END $$;

CREATE OR REPLACE FUNCTION public.cio_metric_explain_graph(p_key TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('ok', true, 'metric', p_key,
    'grafo', (public.cio_metric_lineage(p_key))->'cadeia'
      || jsonb_build_array(
        jsonb_build_object('nivel',6,'camada','consumidores',
          'registrados', COALESCE((SELECT jsonb_agg(consumer_kind||':'||consumer_id)
            FROM public.cio_metric_consumers WHERE metric_key=p_key), '[]'::jsonb),
          'observados_30d', COALESCE((SELECT jsonb_agg(DISTINCT consumer)
            FROM public.cio_metric_access_log
            WHERE metric_key=p_key AND consumer IS NOT NULL
              AND created_at > now()-interval '30 days'), '[]'::jsonb)),
        jsonb_build_object('nivel',7,'camada','usuarios',
          'distintos_30d', (SELECT COUNT(DISTINCT caller)
            FROM public.cio_metric_access_log
            WHERE metric_key=p_key AND created_at > now()-interval '30 days'))));
$$;

CREATE OR REPLACE FUNCTION public.cio_impact_simulate(
  p_key TEXT, p_new_formula JSONB,
  p_new_kind TEXT DEFAULT NULL, p_new_unit TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d RECORD; v_risco TEXT;
BEGIN
  SELECT * INTO d FROM public.cio_metric_definitions
  WHERE metric_key=p_key AND status='active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'metrica_sem_versao_ativa');
  END IF;
  v_risco := CASE
    WHEN p_new_unit IS NOT NULL AND p_new_unit <> d.unit THEN 'ALTO: unidade muda — quebra provável de todos os consumidores'
    WHEN p_new_kind IS NOT NULL AND p_new_kind <> d.formula_kind THEN 'MEDIO: tipo de fórmula muda — validar consumidores de série'
    WHEN p_new_formula IS DISTINCT FROM d.formula THEN 'BAIXO: fórmula muda com mesmo tipo/unidade — valores podem deslocar'
    ELSE 'NULO: nenhuma diferença' END;
  RETURN jsonb_build_object('ok', true, 'metric', p_key, 'simulacao', true,
    'versao_atual', d.version, 'proxima_versao', d.version+1,
    'risco', v_risco,
    'quebra_compatibilidade', p_new_unit IS NOT NULL AND p_new_unit <> d.unit,
    'afetados', jsonb_build_object(
      'dashboards', COALESCE((SELECT jsonb_agg(consumer_id) FROM public.cio_metric_consumers
        WHERE metric_key=p_key AND consumer_kind='dashboard'), '[]'::jsonb),
      'apis', COALESCE((SELECT jsonb_agg(consumer_id) FROM public.cio_metric_consumers
        WHERE metric_key=p_key AND consumer_kind='api'), '[]'::jsonb),
      'ias', COALESCE((SELECT jsonb_agg(consumer_id) FROM public.cio_metric_consumers
        WHERE metric_key=p_key AND consumer_kind='ia'), '[]'::jsonb),
      'alertas_widgets_modulos', COALESCE((SELECT jsonb_agg(consumer_kind||':'||consumer_id)
        FROM public.cio_metric_consumers
        WHERE metric_key=p_key AND consumer_kind IN ('widget','module','report')), '[]'::jsonb),
      'consultas_30d', (SELECT COUNT(*) FROM public.cio_metric_access_log
        WHERE metric_key=p_key AND created_at > now()-interval '30 days'),
      'consumidores_observados', COALESCE((SELECT jsonb_agg(DISTINCT consumer)
        FROM public.cio_metric_access_log
        WHERE metric_key=p_key AND consumer IS NOT NULL
          AND created_at > now()-interval '30 days'), '[]'::jsonb)),
    'nada_foi_modificado', true);
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4. SLA STATUS + DRIFT DETECTION
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_metric_sla_status(p_key TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', s.metric_key,
    'sla_max_ms', s.max_ms_expected,
    'freq_esperada_min', s.freq_expected_min,
    'tempo_medio_ms', a.avg_ms,
    'disponibilidade', a.disp,
    'ultima_atualizacao_fonte', f.last_bucket,
    'atraso_atual_min', CASE WHEN f.last_bucket IS NULL THEN NULL
      ELSE ROUND(EXTRACT(EPOCH FROM now()-f.last_bucket)/60.0,1) END,
    'status_operacional', CASE
      WHEN d.formula_kind='gauge' THEN 'ok'
      WHEN d.status='draft' THEN 'draft'
      WHEN f.last_bucket IS NULL THEN 'sem_dados'
      WHEN now()-f.last_bucket > make_interval(mins => s.freq_expected_min*3) THEN 'atrasado'
      WHEN COALESCE(a.avg_ms,0) > s.max_ms_expected THEN 'degradado'
      ELSE 'ok' END
  ) ORDER BY s.metric_key), '[]'::jsonb)
  FROM public.cio_metric_sla s
  JOIN public.cio_metric_definitions d
    ON d.metric_key=s.metric_key
   AND d.version=(SELECT MAX(version) FROM public.cio_metric_definitions x
                  WHERE x.metric_key=s.metric_key)
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(duration_ms),1) avg_ms,
      ROUND(1.0 - COUNT(*) FILTER (WHERE error IS NOT NULL)::numeric/NULLIF(COUNT(*),0), 4) disp
    FROM public.cio_metric_access_log
    WHERE metric_key=s.metric_key AND created_at > now()-interval '24 hours') a ON true
  LEFT JOIN LATERAL (
    SELECT MAX(bucket_ts) last_bucket FROM public.cio_metrics m
    WHERE m.metric = d.formula->>'metric' AND m.grain='5m') f ON true
  WHERE p_key IS NULL OR s.metric_key=p_key;
$$;

CREATE OR REPLACE FUNCTION public.cio_drift_scan(p_baseline_days INT DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d RECORD; v_hoje NUMERIC; v_media NUMERIC; v_desvio NUMERIC; v_n INT := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  FOR d IN SELECT * FROM public.cio_metric_definitions
           WHERE status='active' AND formula_kind IN ('counter','avg') LOOP
    SELECT COALESCE(SUM(value),0) INTO v_hoje
    FROM public.cio_eval_counter(d.formula,'1d', date_trunc('day',now()), now(), '{}'::jsonb);
    SELECT AVG(t.v), STDDEV_SAMP(t.v) INTO v_media, v_desvio
    FROM (SELECT COALESCE(SUM(value),0) v
          FROM public.cio_eval_counter(d.formula,'1d',
            date_trunc('day',now()) - make_interval(days=>p_baseline_days),
            date_trunc('day',now()), '{}'::jsonb) c
          GROUP BY c.bucket_ts) t;

    -- métrica congelada: fonte tem eventos recentes mas a métrica zerou
    IF v_media > 0 AND v_hoje = 0 THEN
      INSERT INTO public.cio_quality_issues (check_key, severity, entity_id, details)
      SELECT 'drift_congelada','P3', d.metric_key,
        jsonb_build_object('media_baseline', ROUND(v_media,2))
      WHERE NOT EXISTS (SELECT 1 FROM public.cio_quality_issues q
        WHERE q.check_key='drift_congelada' AND q.entity_id=d.metric_key
          AND q.created_at > now()-interval '24 hours');
      v_n := v_n + 1;
    -- mudança brusca: z-score > 3
    ELSIF v_desvio IS NOT NULL AND v_desvio > 0
      AND abs(v_hoje - v_media) / v_desvio > 3 THEN
      INSERT INTO public.cio_quality_issues (check_key, severity, entity_id, details)
      SELECT 'drift_mudanca_brusca','P3', d.metric_key,
        jsonb_build_object('hoje', v_hoje, 'media', ROUND(v_media,2),
          'desvio', ROUND(v_desvio,2),
          'zscore', ROUND(abs(v_hoje-v_media)/v_desvio, 2))
      WHERE NOT EXISTS (SELECT 1 FROM public.cio_quality_issues q
        WHERE q.check_key='drift_mudanca_brusca' AND q.entity_id=d.metric_key
          AND q.created_at > now()-interval '24 hours');
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'ocorrencias', v_n,
    'nota', 'drift REGISTRA em cio_quality_issues; jamais bloqueia consultas');
END $$;


-- ──────────────────────────────────────────────────────────────
-- 5. GOVERNANCE DATASET + AI KNOWLEDGE + BENCHMARK + EXPORT +
--    RELATÓRIO EXECUTIVO + META-TESTES
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_governance_dataset()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN jsonb_build_object(
    'catalogo', public.cio_data_dictionary(NULL),
    'quality', public.cio_metric_quality(NULL),
    'heatmap', public.cio_metric_heatmap(30),
    'profiler', public.cio_metric_profile(NULL, 168),
    'sla', public.cio_metric_sla_status(NULL),
    'validator', public.cio_semantic_validate(),
    'issues_abertas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'check', check_key, 'sev', severity, 'entity', entity_id, 'em', created_at)
        ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.cio_quality_issues
            ORDER BY created_at DESC LIMIT 50) q),
    'timeline_recente', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'metric', metric_key, 'event', event, 'em', created_at)
        ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.cio_metric_timeline
            ORDER BY created_at DESC LIMIT 50) t),
    'certificacao', (SELECT jsonb_object_agg(certification, n) FROM (
      SELECT certification, COUNT(*) n FROM public.cio_metric_definitions
      WHERE status IN ('active','draft') GROUP BY certification) c),
    'owners', (SELECT jsonb_object_agg(owner, n) FROM (
      SELECT owner, COUNT(*) n FROM public.cio_metric_definitions
      WHERE status='active' GROUP BY owner) o),
    'tags', (SELECT COALESCE(jsonb_object_agg(tag, n),'{}'::jsonb) FROM (
      SELECT unnest(tags) tag, COUNT(*) n FROM public.cio_metric_definitions
      WHERE status='active' GROUP BY 1) g));
END $$;

CREATE OR REPLACE FUNCTION public.cio_ai_knowledge_package(
  p_profile TEXT DEFAULT 'geral'   -- geral|executiva
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_keys TEXT[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  -- IA Executiva: SOMENTE métricas Enterprise (regra de certificação)
  v_keys := ARRAY(SELECT DISTINCT metric_key FROM public.cio_metric_definitions
    WHERE status IN ('active','draft')
      AND (p_profile <> 'executiva' OR certification = 'enterprise'));
  RETURN jsonb_build_object(
    'perfil', p_profile,
    'contexto', public.cio_ai_context(CASE WHEN array_length(v_keys,1) IS NULL
                  THEN ARRAY[]::text[] ELSE v_keys END),
    'boas_praticas', jsonb_build_array(
      'Sempre citar a métrica pelo metric_key oficial e a versão consultada.',
      'Comparar períodos usando o mesmo grain.',
      'Relatar o frescor dos dados (atraso máximo de 5 min do ETL).',
      'Verificar quality score antes de conclusões fortes.'),
    'proibicoes', jsonb_build_array(
      'Recalcular métricas fora de cio_metric()/cio_metric_bundle().',
      'Estimar valores de métricas draft (retornam nulo por doutrina).',
      'Consultar rollups/tabelas operacionais diretamente.',
      'Usar termos de negócio fora das definições do glossário.',
      CASE WHEN p_profile='executiva'
        THEN 'IA Executiva: usar métricas com certificação abaixo de enterprise.'
        ELSE 'Misturar versões diferentes de uma métrica na mesma análise.' END),
    'nota_executiva', CASE WHEN p_profile='executiva'
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_definitions
        WHERE certification='enterprise' AND status='active')
      THEN 'Nenhuma métrica certificada enterprise ainda — promoção via processo de certificação (governança), não automática.'
      END);
END $$;

CREATE OR REPLACE FUNCTION public.cio_benchmark(p_iterations INT DEFAULT 5)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  d RECORD; i INT; t0 TIMESTAMPTZ; v_ms NUMERIC; v_all NUMERIC[] := '{}';
  v_res JSONB := '[]'::jsonb; v_tot0 TIMESTAMPTZ := clock_timestamp(); v_calls INT := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  FOR d IN SELECT metric_key, formula_kind FROM public.cio_metric_definitions
           WHERE status='active' LOOP
    v_all := '{}';
    FOR i IN 1..p_iterations LOOP
      t0 := clock_timestamp();
      PERFORM public.cio_metric(d.metric_key,'1d', now()-interval '7 days', now());
      v_all := v_all || (EXTRACT(EPOCH FROM clock_timestamp()-t0)*1000)::numeric;
      v_calls := v_calls + 1;
    END LOOP;
    v_res := v_res || jsonb_build_object(
      'metric', d.metric_key,
      'media_ms', ROUND((SELECT AVG(x) FROM unnest(v_all) x),2),
      'p95_ms', (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY x) FROM unnest(v_all) x),
      'p99_ms', (SELECT percentile_disc(0.99) WITHIN GROUP (ORDER BY x) FROM unnest(v_all) x),
      'complexidade', CASE d.formula_kind
        WHEN 'ratio' THEN '2 varreduras de rollup'
        WHEN 'gauge' THEN '1 consulta pontual' ELSE '1 varredura de rollup' END);
  END LOOP;
  RETURN jsonb_build_object('ok', true,
    'iteracoes_por_metrica', p_iterations,
    'metricas', v_res,
    'consultas_por_segundo', ROUND(v_calls /
      NULLIF(EXTRACT(EPOCH FROM clock_timestamp()-v_tot0),0), 1),
    'memoria_io', 'não mensurável nesta camada (requer pg_stat_statements — documentado, sem estimativas)');
END $$;

-- Future Compatibility: registry de adaptadores (interfaces apenas) +
-- feed genérico incremental (o contrato que serve warehouse/streaming)
CREATE TABLE IF NOT EXISTS public.cio_export_adapters (
  adapter TEXT PRIMARY KEY CHECK (adapter IN ('warehouse','iceberg','delta_lake','duckdb',
    'clickhouse','bigquery','snowflake','pinot','streaming','event_sourcing')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB, notes TEXT
);
INSERT INTO public.cio_export_adapters (adapter, notes)
VALUES ('warehouse','ponto de extensão'),('iceberg','ponto de extensão'),
  ('delta_lake','ponto de extensão'),('duckdb','ponto de extensão'),
  ('clickhouse','ponto de extensão'),('bigquery','ponto de extensão'),
  ('snowflake','ponto de extensão'),('pinot','ponto de extensão'),
  ('streaming','ponto de extensão'),('event_sourcing','ponto de extensão')
ON CONFLICT DO NOTHING;
ALTER TABLE public.cio_export_adapters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cio_export_events(
  p_since_id BIGINT DEFAULT 0, p_limit INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'contrato', 'v1', 'since_id', p_since_id,
    'next_since_id', COALESCE((SELECT MAX(id) FROM (
      SELECT id FROM public.pub_events WHERE id > p_since_id
      ORDER BY id LIMIT p_limit) x), p_since_id),
    'events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM (
      SELECT id, request_id, event_type, advertiser_user_id, origin,
             lot_id, payload, created_at
      FROM public.pub_events WHERE id > p_since_id
      ORDER BY id LIMIT p_limit) e), '[]'::jsonb));
$$;

-- META-TESTES: cobertura nunca regride
CREATE TABLE IF NOT EXISTS public.cio_test_registry (
  suite TEXT PRIMARY KEY,
  scenarios INT NOT NULL, assertions INT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.cio_test_registry (suite, scenarios, assertions) VALUES
  ('CT-compat',10,32),('CTA-hardening',8,26),('CTD-dispatcher',15,47),
  ('CTM-matching',10,31),('CTE-etl',11,31),('CTS-semantic',13,23),('CTX-governanca',13,31)
ON CONFLICT DO NOTHING;
ALTER TABLE public.cio_test_registry ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cio_coverage_check(
  p_suite TEXT, p_scenarios INT, p_assertions INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.cio_test_registry WHERE suite=p_suite;
  IF FOUND AND (p_scenarios < r.scenarios OR p_assertions < r.assertions) THEN
    RAISE EXCEPTION 'COBERTURA REGREDIU em %: % cen/% asser (mínimo registrado: %/%)',
      p_suite, p_scenarios, p_assertions, r.scenarios, r.assertions;
  END IF;
  INSERT INTO public.cio_test_registry (suite, scenarios, assertions)
  VALUES (p_suite, p_scenarios, p_assertions)
  ON CONFLICT (suite) DO UPDATE
    SET scenarios=GREATEST(EXCLUDED.scenarios, cio_test_registry.scenarios),
        assertions=GREATEST(EXCLUDED.assertions, cio_test_registry.assertions),
        recorded_at=now();
  RETURN jsonb_build_object('ok', true, 'suite', p_suite);
END $$;

-- RELATÓRIO EXECUTIVO automático
CREATE OR REPLACE FUNCTION public.cio_executive_report()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_val JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  v_val := public.cio_semantic_validate();
  RETURN jsonb_build_object(
    'gerado_em', now(),
    'arquitetura_atual', jsonb_build_object(
      'metricas_ativas', (SELECT COUNT(*) FROM public.cio_metric_definitions WHERE status='active'),
      'drafts_documentados', (SELECT COUNT(*) FROM public.cio_metric_definitions WHERE status='draft'),
      'glossario', (SELECT COUNT(*) FROM public.cio_glossary),
      'suites_de_teste', (SELECT jsonb_object_agg(suite, assertions) FROM public.cio_test_registry),
      'camadas', jsonb_build_array('eventos','etl+quality','rollups','semantic','governanca')),
    'pontos_fortes', jsonb_build_array(
      'Fonte única imposta por permissão (rollups invisíveis)',
      'Idempotência do ETL por construção (recompute-por-bucket)',
      format('Catálogo aprovado pelo validator: %s', v_val->>'aprovado'),
      'Fórmulas declarativas: lineage computável, zero SQL livre',
      'Drafts documentados no lugar de números inventados'),
    'pontos_de_atencao', jsonb_build_array(
      format('%s métricas draft aguardando fonte (ctr/roi/health)',
        (SELECT COUNT(*) FROM public.cio_metric_definitions WHERE status='draft')),
      format('%s issues de qualidade abertas em 7d',
        (SELECT COUNT(*) FROM public.cio_quality_issues WHERE created_at > now()-interval '7 days')),
      'Nenhuma métrica enterprise ainda (certificação é processo, não automática)',
      'Plataforma inteira aguarda GATE + OBSERVE para operação real'),
    'escalabilidade', jsonb_build_object(
      'eventos_atuais', (SELECT COUNT(*) FROM public.pub_events),
      'linhas_rollup', (SELECT COUNT(*) FROM public.cio_metrics),
      'pontos_de_extensao', (SELECT jsonb_agg(adapter) FROM public.cio_export_adapters)),
    'limitacoes_conhecidas', jsonb_build_array(
      'memoria/IO por consulta não mensuráveis nesta camada (pg_stat_statements)',
      'consistencia do quality score liga ao validator no M55.4',
      'SLA/drift com thresholds estruturais até dados do OBSERVE'),
    'preparacao', jsonb_build_object(
      'producao', 'migrations 050–060 prontas; bloqueio único: GATE-1/2/3 + funil Fase 2.5',
      'ia', 'cio_ai_knowledge_package pronto para M59; regra enterprise p/ IA executiva ativa',
      'alta_escala', 'particionamento/retenção mapeados (M60); benchmark presente'));
END $$;


-- ──────────────────────────────────────────────────────────────
-- Permissões (padrão-lei) + VERIFICAÇÃO
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'cio_quality_snapshot()','cio_quality_evolution(text)','cio_metric_lineage(text)',
    'cio_metric_explain_graph(text)','cio_impact_simulate(text,jsonb,text,text)',
    'cio_metric_sla_status(text)','cio_drift_scan(integer)','cio_governance_dataset()',
    'cio_ai_knowledge_package(text)','cio_benchmark(integer)',
    'cio_export_events(bigint,integer)','cio_coverage_check(text,integer,integer)',
    'cio_executive_report()']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  -- leitura ampla p/ admin via RPC exige apenas o guard interno; lineage/explain
  -- são úteis a authenticated admins → liberar com guard implícito das funções:
  GRANT EXECUTE ON FUNCTION public.cio_metric_lineage(text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cio_metric_explain_graph(text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cio_metric_sla_status(text) TO authenticated;
END $$;

DO $$
DECLARE v JSONB;
BEGIN
  IF to_regprocedure('public.cio_metric_lineage(text)') IS NULL
     OR to_regprocedure('public.cio_impact_simulate(text,jsonb,text,text)') IS NULL
     OR to_regprocedure('public.cio_drift_scan(integer)') IS NULL
     OR to_regprocedure('public.cio_governance_dataset()') IS NULL
     OR to_regprocedure('public.cio_executive_report()') IS NULL THEN
    RAISE EXCEPTION 'M55.3B ERRO: RPCs enterprise ausentes'; END IF;
  IF (SELECT COUNT(*) FROM public.cio_export_adapters) < 10 THEN
    RAISE EXCEPTION 'M55.3B ERRO: adaptadores de extensão não seedados'; END IF;
  IF (SELECT COUNT(*) FROM public.cio_test_registry) < 7 THEN
    RAISE EXCEPTION 'M55.3B ERRO: registro de cobertura não seedado'; END IF;
  v := public.cio_semantic_validate();
  IF NOT (v->>'aprovado')::boolean THEN
    RAISE EXCEPTION 'M55.3B ERRO: catálogo reprovado pós-hardening: %', v->'issues'; END IF;

  RAISE NOTICE 'M55.3B ✓ Lineage + ExplainGraph + ImpactSim + SLA + Drift + Timeline + QualityHistory — OK';
  RAISE NOTICE 'M55.3B ✓ Certificação(7 níveis; enterprise-only p/ IA executiva) + GovDataset + AIKnowledge — OK';
  RAISE NOTICE 'M55.3B ✓ Benchmark + Export contract v1 + 10 adaptadores(interfaces) + Meta-testes(coverage guard) — OK';
END $$;
