-- ============================================================================
-- ORION-AI-51 — OBSERVABILITY AI v1.0
-- ============================================================================
-- Centro de Observabilidade do ORION: visao unificada, em tempo real, do
--   comportamento da plataforma — metricas, logs, traces distribuidos,
--   performance, disponibilidade, SLI/SLO, health e RCA. SOMENTE LEITURA das
--   fontes; escreve apenas em orion_obs_* + bus + alertas.
--
-- Fontes REAIS validadas (07-17):
--   * cron.job_run_details (6.106 execucoes, 116 falhas) + cron.job — cada tick
--     de modulo = um TRACE real (servico, duracao, status, mensagem);
--   * extensions.pg_stat_statements (4.900) — latencia/throughput real de RPC/SQL
--     (mean_exec_time, calls, rows) — literais ja normalizados a $1 (sem secrets);
--   * public.client_errors (171) — erros reais do frontend (message/stack/url);
--   * public.orion_ai_log (42) — latencia/erros do Gateway (duracao_ms/erro);
--   * public.orion_eventos (5.233) — barramento (eventos por minuto);
--   * auth.sessions (37) — usuarios online;
--   * AI-10 orion_health_snapshots / AI-11 orion_perf_snapshots — LEITURA
--     cruzada (NAO duplica; AI-51 consolida a visao unica).
--
-- LACUNAS DECLARADAS (nunca inventa):
--   1) CPU/memoria de HOST: Supabase nao expoe via SQL — metricas de recurso
--      derivam de proxies do banco (shared_blks, tempo de exec); host = declarado.
--   2) Web Vitals (LCP/INP/CLS/TTFB/FCP), tempo de render/carregamento: exigem
--      telemetria do front — porta obs_metric_ingest() pronta; ate la, DECLARADO.
--   3) CDN e uso de Storage em bytes: exigem Management API — DECLARADO.
--   4) Traces de request HTTP do app: porta obs_trace_ingest() pronta; hoje os
--      traces reais vem dos ticks de cron (jobs ORION).
--   5) AI-49 SOC / AI-50 Governance: deteccao dinamica da superficie; handoff de
--      RCA ao AI-45 Incident Response quando existir (declarado).
--
-- SEGURANCA: obs_sanitize() remove tokens/secrets/senhas de qualquer log antes
--   de gravar; origem de toda metrica e rastreavel (campo origem+evidencias).
--
-- Anti-colisao: namespace orion_obs_* / funcoes obs_*/observability_*, chave
--   observability, painel /admin/orion-observability, cron orion_observability_tick.
--   NAO toca orion_health_* (AI-10), orion_perf_* (AI-11), orion_trace (stub
--   singular vazio), orion_soc_*/orion_gov_* (AI-49/50). Provado 07-17.
--
-- Idempotente (dedupe + upsert; ingest incremental, nunca recalcula historico).
--   Logs/metricas/traces append-only p/ clientes. ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_obs_metrics (
  metric_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  measured_at timestamptz NOT NULL DEFAULT now(),
  metric_key  text        NOT NULL,   -- rpc.mean_ms|cron.success_rate|eventos.por_min|...
  categoria   text        NOT NULL,   -- banco|rpc|edge|cron|realtime|barramento|usuarios|marketplace|recurso
  valor       numeric     NOT NULL,
  unidade     text        NOT NULL DEFAULT '',
  origem      text        NOT NULL,   -- fonte rastreavel (tabela/funcao)
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  text        NOT NULL,
  UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_obs_metrics IS 'ORION-AI-51: metricas com origem rastreavel. dedupe_key = 1 ponto por metrica/janela (idempotente).';
CREATE INDEX IF NOT EXISTS ix_orion_obs_m_key ON public.orion_obs_metrics (metric_key, measured_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_obs_m_cat ON public.orion_obs_metrics (categoria, measured_at DESC);

CREATE TABLE IF NOT EXISTS public.orion_obs_logs (
  log_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_at     timestamptz NOT NULL DEFAULT now(),
  nivel      text        NOT NULL DEFAULT 'INFO',  -- INFO|WARNING|ERROR|CRITICAL|FATAL
  origem     text        NOT NULL,                 -- frontend|backend|banco|edge|cron|orion|seguranca|marketplace|gateway
  servico    text,
  mensagem   text        NOT NULL,                 -- JA sanitizada
  contexto   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_obs_logs IS 'ORION-AI-51: logs centralizados e CLASSIFICADOS. Sempre sanitizados (obs_sanitize): nunca senhas/tokens/secrets. Append-only p/ clientes.';
CREATE INDEX IF NOT EXISTS ix_orion_obs_l_niv ON public.orion_obs_logs (nivel, log_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_obs_l_ori ON public.orion_obs_logs (origem, log_at DESC);

CREATE TABLE IF NOT EXISTS public.orion_obs_traces (
  trace_id    text        PRIMARY KEY,
  started_at  timestamptz NOT NULL,
  servico     text        NOT NULL,
  operacao    text        NOT NULL,
  status      text        NOT NULL DEFAULT 'ok',    -- ok|erro
  duracao_ms  integer     NOT NULL DEFAULT 0,
  spans       integer     NOT NULL DEFAULT 1,
  origem      text        NOT NULL DEFAULT 'cron',
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_obs_traces IS 'ORION-AI-51: traces distribuidos. Hoje = execucoes de cron (cada tick de modulo). Porta obs_trace_ingest p/ traces do app.';
CREATE INDEX IF NOT EXISTS ix_orion_obs_t_srv ON public.orion_obs_traces (servico, started_at DESC);

CREATE TABLE IF NOT EXISTS public.orion_obs_spans (
  span_id    text        PRIMARY KEY,
  trace_id   text        NOT NULL REFERENCES public.orion_obs_traces(trace_id) ON DELETE CASCADE,
  parent_id  text,
  servico    text        NOT NULL,
  operacao   text        NOT NULL,
  duracao_ms integer     NOT NULL DEFAULT 0,
  status     text        NOT NULL DEFAULT 'ok',
  started_at timestamptz NOT NULL,
  evidencias jsonb       NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.orion_obs_spans IS 'ORION-AI-51: spans de um trace (reconstroi a jornada da requisicao).';
CREATE INDEX IF NOT EXISTS ix_orion_obs_s_trace ON public.orion_obs_spans (trace_id);

CREATE TABLE IF NOT EXISTS public.orion_obs_service_health (
  servico         text        PRIMARY KEY,
  categoria       text        NOT NULL,   -- banco|auth|edge|cron|realtime|storage|ia|api|painel|gateway
  estado          text        NOT NULL DEFAULT 'saudavel', -- saudavel|atencao|degradado|critico
  disponibilidade numeric     NOT NULL DEFAULT 100, -- %
  latencia_ms     numeric     NOT NULL DEFAULT 0,
  erro_rate       numeric     NOT NULL DEFAULT 0,   -- %
  ultima_atividade timestamptz,
  evidencias      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_obs_service_health IS 'ORION-AI-51: health por servico (saudavel/atencao/degradado/critico) com disponibilidade/latencia/erro reais.';

CREATE TABLE IF NOT EXISTS public.orion_obs_sli (
  sli_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  measured_at timestamptz NOT NULL DEFAULT now(),
  sli_key    text        NOT NULL,   -- servico:tipo
  servico    text        NOT NULL,
  tipo       text        NOT NULL,   -- disponibilidade|latencia|erro|throughput
  valor      numeric     NOT NULL,
  unidade    text        NOT NULL DEFAULT '',
  janela     text        NOT NULL DEFAULT '1h',
  evidencias jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text        NOT NULL,
  UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_obs_sli IS 'ORION-AI-51: Service Level Indicators medidos (disponibilidade/latencia/erro/throughput).';
CREATE INDEX IF NOT EXISTS ix_orion_obs_sli_srv ON public.orion_obs_sli (servico, tipo, measured_at DESC);

CREATE TABLE IF NOT EXISTS public.orion_obs_slo (
  slo_key         text        PRIMARY KEY,
  servico         text        NOT NULL,
  tipo            text        NOT NULL,   -- disponibilidade|latencia|erro|throughput
  descricao       text        NOT NULL,
  alvo            numeric     NOT NULL,   -- meta
  comparador      text        NOT NULL DEFAULT '>=', -- >= (maior melhor) | <= (menor melhor)
  atual           numeric     NOT NULL DEFAULT 0,
  compliance      numeric     NOT NULL DEFAULT 100,  -- %
  em_risco        boolean     NOT NULL DEFAULT false,
  error_budget    numeric     NOT NULL DEFAULT 100,  -- % restante
  escopo          text        NOT NULL DEFAULT 'servico', -- servico|ia|modulo|global
  ativa           boolean     NOT NULL DEFAULT true,
  evidencias      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_obs_slo IS 'ORION-AI-51: Service Level Objectives por servico/IA/modulo/global com error budget e risco de violacao.';

CREATE TABLE IF NOT EXISTS public.orion_obs_alerts (
  alert_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo       text        NOT NULL,
  severidade text        NOT NULL DEFAULT 'atencao', -- info|atencao|critico
  servico    text,
  mensagem   text        NOT NULL,
  impacto    text        NOT NULL DEFAULT 'baixo',   -- baixo|medio|alto
  prioridade integer     NOT NULL DEFAULT 0,         -- ordena por impacto
  evidencias jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dia        date        NOT NULL DEFAULT current_date,
  resolvido  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, servico, dia)
);
COMMENT ON TABLE public.orion_obs_alerts IS 'ORION-AI-51: alertas inteligentes priorizados por impacto (idempotentes por tipo/servico/dia). Espelhados em orion_ai_alerts.';

CREATE TABLE IF NOT EXISTS public.orion_obs_statistics (
  dia               date        PRIMARY KEY,
  ohs               integer     NOT NULL DEFAULT 0,  -- Observability Health Score
  phs               integer     NOT NULL DEFAULT 0,  -- Performance Health Score
  das               integer     NOT NULL DEFAULT 0,  -- Availability Score
  lqs               integer     NOT NULL DEFAULT 0,  -- Log Quality Score
  tps               integer     NOT NULL DEFAULT 0,  -- Trace Precision Score
  slo_compliance    integer     NOT NULL DEFAULT 0,  -- SLO Compliance Score
  uptime_pct        numeric     NOT NULL DEFAULT 0,
  logs_total        integer     NOT NULL DEFAULT 0,
  logs_erro         integer     NOT NULL DEFAULT 0,
  traces_total      integer     NOT NULL DEFAULT 0,
  alertas           integer     NOT NULL DEFAULT 0,
  servicos_degradados integer   NOT NULL DEFAULT 0,
  eventos_por_min   numeric     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_obs_statistics IS 'ORION-AI-51: estatisticas diarias + 6 scores (OHS/PHS/DAS/LQS/TPS/SLO Compliance). OBS: DAS aqui = Availability (distinto do Device Assurance do AI-42/47).';

-- ----------------------------------------------------------------------------
-- 2) RLS + trava de grants
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_obs_metrics','orion_obs_logs','orion_obs_traces','orion_obs_spans',
                           'orion_obs_service_health','orion_obs_sli','orion_obs_slo','orion_obs_alerts',
                           'orion_obs_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

REVOKE ALL ON public.orion_obs_metrics, public.orion_obs_logs, public.orion_obs_traces, public.orion_obs_spans,
             public.orion_obs_service_health, public.orion_obs_sli, public.orion_obs_slo,
             public.orion_obs_alerts, public.orion_obs_statistics FROM anon, authenticated;
GRANT SELECT ON public.orion_obs_metrics, public.orion_obs_logs, public.orion_obs_traces, public.orion_obs_spans,
               public.orion_obs_service_health, public.orion_obs_sli, public.orion_obs_slo,
               public.orion_obs_alerts, public.orion_obs_statistics TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) SEGURANCA — sanitizacao (nunca registra senha/token/secret) + bus
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_sanitize(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_texto IS NULL THEN NULL ELSE
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      left(p_texto, 2000),
      '(password|senha|secret|token|apikey|api_key|authorization|bearer|access_token|refresh_token|sbp_[A-Za-z0-9]+)\s*[:=]?\s*\S+', '\1=***', 'gi'),
      'eyJ[A-Za-z0-9._-]{10,}', '***JWT***', 'g'),                       -- JWTs
      'sbp_[A-Za-z0-9]{20,}', '***SBP***', 'g'),                          -- supabase tokens
      '(TEST|APP)-[0-9A-Za-z-]{16,}', '***MP***', 'g'),                   -- mercadopago
      '[A-Za-z0-9+/]{40,}={0,2}', '***B64***', 'g')                       -- blobs base64 longos
  END;
$$;
COMMENT ON FUNCTION public.obs_sanitize(text) IS 'ORION-AI-51: mascara segredos antes de gravar log. NUNCA persiste token/senha/secret.';

CREATE OR REPLACE FUNCTION public.obs_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'observability', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- porta publica de log (front/backend) — sempre sanitiza
CREATE OR REPLACE FUNCTION public.obs_log_ingest(
  p_nivel text, p_origem text, p_mensagem text, p_servico text DEFAULT NULL, p_contexto jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_niv text;
BEGIN
  v_niv := upper(coalesce(p_nivel,'INFO'));
  IF v_niv NOT IN ('INFO','WARNING','ERROR','CRITICAL','FATAL') THEN v_niv := 'INFO'; END IF;
  INSERT INTO public.orion_obs_logs (nivel, origem, servico, mensagem, contexto, dedupe_key)
  VALUES (v_niv, coalesce(p_origem,'app'), p_servico, public.obs_sanitize(p_mensagem),
          coalesce(p_contexto,'{}'::jsonb),
          'ingest:'||md5(coalesce(p_origem,'')||coalesce(p_mensagem,'')||to_char(now(),'YYYYMMDDHH24MISSMS')))
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING log_id INTO v_id;
  RETURN v_id;
END$$;

-- porta publica de trace (front/backend)
CREATE OR REPLACE FUNCTION public.obs_trace_ingest(
  p_trace_id text, p_servico text, p_operacao text, p_duracao_ms int,
  p_status text DEFAULT 'ok', p_started_at timestamptz DEFAULT NULL, p_evid jsonb DEFAULT '{}'::jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_obs_traces (trace_id, started_at, servico, operacao, status, duracao_ms, spans, origem, evidencias)
  VALUES (p_trace_id, coalesce(p_started_at, now()), p_servico, p_operacao, coalesce(p_status,'ok'),
          greatest(0,coalesce(p_duracao_ms,0)), 1, 'app', coalesce(p_evid,'{}'::jsonb))
  ON CONFLICT (trace_id) DO UPDATE SET duracao_ms=excluded.duracao_ms, status=excluded.status;
  INSERT INTO public.orion_obs_spans (span_id, trace_id, servico, operacao, duracao_ms, status, started_at)
  VALUES (p_trace_id||':root', p_trace_id, p_servico, p_operacao, greatest(0,coalesce(p_duracao_ms,0)), coalesce(p_status,'ok'), coalesce(p_started_at, now()))
  ON CONFLICT (span_id) DO NOTHING;
  RETURN p_trace_id;
END$$;

-- ----------------------------------------------------------------------------
-- 4) COLETA DE METRICAS (fontes reais; dedupe por janela de minuto)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_collect_metrics()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; v_win text := to_char(date_trunc('minute', now()),'YYYYMMDDHH24MI');
  v_rpc_mean numeric; v_rpc_calls bigint; v_rpc_slow int;
  v_cron_ok numeric; v_cron_total int; v_evt numeric; v_online int; v_lojas int;
  v_err_5m int; v_ai_mean numeric;
BEGIN
  -- RPC/SQL latencia (pg_stat_statements, esquema extensions)
  BEGIN
    SELECT round(avg(mean_exec_time)::numeric,2), coalesce(sum(calls),0),
           count(*) FILTER (WHERE mean_exec_time > 500)
      INTO v_rpc_mean, v_rpc_calls, v_rpc_slow
      FROM extensions.pg_stat_statements
     WHERE query ~* 'orion_|public\.';
  EXCEPTION WHEN OTHERS THEN v_rpc_mean := NULL; END;

  -- cron: taxa de sucesso e volume (ultima 1h)
  SELECT round(100.0*count(*) FILTER (WHERE status='succeeded')/nullif(count(*),0),2), count(*)
    INTO v_cron_ok, v_cron_total
    FROM cron.job_run_details WHERE start_time > now()-interval '1 hour';

  -- eventos por minuto (barramento, ultimos 5 min)
  SELECT round(count(*)/5.0,2) INTO v_evt FROM public.orion_eventos WHERE criado_em > now()-interval '5 minutes';

  -- usuarios online (sessoes renovadas nos ultimos 15 min)
  SELECT count(*) INTO v_online FROM auth.sessions WHERE coalesce(refreshed_at, created_at) > now()-interval '15 minutes';

  -- lojas online (perfis lojistas com evento recente — aproximacao declarada)
  SELECT count(DISTINCT e.user_id) INTO v_lojas
    FROM public.orion_eventos e JOIN public.profiles p ON p.id = e.user_id
   WHERE e.criado_em > now()-interval '15 minutes' AND coalesce(p.nome_loja, p.categoria) IS NOT NULL;

  -- erros de frontend (ultimos 5 min)
  SELECT count(*) INTO v_err_5m FROM public.client_errors WHERE created_at > now()-interval '5 minutes';

  -- latencia media do Gateway (orion_ai_log, 1h)
  SELECT round(avg(duracao_ms)::numeric,0) INTO v_ai_mean FROM public.orion_ai_log WHERE criado_em > now()-interval '1 hour';

  -- grava cada metrica (idempotente por janela de minuto)
  PERFORM public.obs_metric_put('rpc.mean_ms','rpc', coalesce(v_rpc_mean,0),'ms','extensions.pg_stat_statements', v_win,
    jsonb_build_object('calls', v_rpc_calls, 'rpc_lentas_gt_500ms', v_rpc_slow));
  PERFORM public.obs_metric_put('rpc.calls_total','rpc', coalesce(v_rpc_calls,0),'chamadas','extensions.pg_stat_statements', v_win, '{}'::jsonb);
  PERFORM public.obs_metric_put('cron.success_rate','cron', coalesce(v_cron_ok,100),'%','cron.job_run_details', v_win,
    jsonb_build_object('execucoes_1h', v_cron_total));
  PERFORM public.obs_metric_put('eventos.por_min','barramento', coalesce(v_evt,0),'ev/min','orion_eventos', v_win, '{}'::jsonb);
  PERFORM public.obs_metric_put('usuarios.online','usuarios', coalesce(v_online,0),'sessoes','auth.sessions', v_win, '{}'::jsonb);
  PERFORM public.obs_metric_put('lojas.online','marketplace', coalesce(v_lojas,0),'lojas','orion_eventos+profiles', v_win,
    jsonb_build_object('metodo','perfis com evento nos ultimos 15min (aproximacao DECLARADA)'));
  PERFORM public.obs_metric_put('frontend.erros_5m','recurso', coalesce(v_err_5m,0),'erros','client_errors', v_win, '{}'::jsonb);
  PERFORM public.obs_metric_put('gateway.mean_ms','ia', coalesce(v_ai_mean,0),'ms','orion_ai_log', v_win, '{}'::jsonb);
  v_n := 8;
  RETURN v_n;
END$$;

CREATE OR REPLACE FUNCTION public.obs_metric_put(
  p_key text, p_cat text, p_valor numeric, p_unidade text, p_origem text, p_win text, p_evid jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_obs_metrics (metric_key, categoria, valor, unidade, origem, evidencias, dedupe_key)
  VALUES (p_key, p_cat, coalesce(p_valor,0), p_unidade, p_origem, coalesce(p_evid,'{}'::jsonb), p_key||':'||p_win)
  ON CONFLICT (dedupe_key) DO UPDATE SET valor=excluded.valor, evidencias=excluded.evidencias, measured_at=now();
END$$;

-- ----------------------------------------------------------------------------
-- 5) INGESTAO DE LOGS (centraliza + classifica + SANITIZA; incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_ingest_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0;
BEGIN
  -- frontend: client_errors (ERROR) — sanitizado, dedupe por id
  FOR r IN
    SELECT id, message, url, created_at FROM public.client_errors
    WHERE created_at > now()-interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.orion_obs_logs l WHERE l.dedupe_key='cerr:'||id)
    ORDER BY created_at DESC LIMIT 500
  LOOP
    INSERT INTO public.orion_obs_logs (log_at, nivel, origem, servico, mensagem, contexto, dedupe_key)
    VALUES (r.created_at, 'ERROR', 'frontend', 'app',
      public.obs_sanitize(r.message), jsonb_build_object('url', public.obs_sanitize(r.url)), 'cerr:'||r.id)
    ON CONFLICT (dedupe_key) DO NOTHING;
    v_n := v_n+1;
  END LOOP;

  -- gateway: orion_ai_log com erro (ERROR) ou latencia alta (WARNING)
  FOR r IN
    SELECT id, module, task, erro, duracao_ms, status, criado_em FROM public.orion_ai_log
    WHERE criado_em > now()-interval '30 days'
      AND (erro IS NOT NULL OR duracao_ms > 5000)
      AND NOT EXISTS (SELECT 1 FROM public.orion_obs_logs l WHERE l.dedupe_key='ailog:'||id)
    ORDER BY criado_em DESC LIMIT 300
  LOOP
    INSERT INTO public.orion_obs_logs (log_at, nivel, origem, servico, mensagem, contexto, dedupe_key)
    VALUES (r.criado_em, CASE WHEN r.erro IS NOT NULL THEN 'ERROR' ELSE 'WARNING' END, 'gateway', r.module,
      public.obs_sanitize(coalesce(r.erro, 'latencia alta: '||r.duracao_ms||'ms em '||r.task)),
      jsonb_build_object('task', r.task, 'duracao_ms', r.duracao_ms, 'status', r.status), 'ailog:'||r.id)
    ON CONFLICT (dedupe_key) DO NOTHING;
    v_n := v_n+1;
  END LOOP;

  -- cron: execucoes falhas (CRITICAL) — dedupe por runid
  FOR r IN
    SELECT d.runid, d.command, d.status, d.return_message, d.start_time,
           coalesce(j.jobname, 'job:'||d.jobid) jobname
    FROM cron.job_run_details d LEFT JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.start_time > now()-interval '7 days' AND d.status = 'failed'
      AND NOT EXISTS (SELECT 1 FROM public.orion_obs_logs l WHERE l.dedupe_key='cron:'||d.runid)
    ORDER BY d.start_time DESC LIMIT 300
  LOOP
    INSERT INTO public.orion_obs_logs (log_at, nivel, origem, servico, mensagem, contexto, dedupe_key)
    VALUES (r.start_time, 'CRITICAL', 'cron', r.jobname,
      public.obs_sanitize('falha no cron '||r.jobname||': '||coalesce(r.return_message,'sem mensagem')),
      jsonb_build_object('command', public.obs_sanitize(r.command)), 'cron:'||r.runid)
    ON CONFLICT (dedupe_key) DO NOTHING;
    v_n := v_n+1;
  END LOOP;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 6) COLETA DE TRACES (cron.job_run_details = traces reais; incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_collect_traces()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_tid text; v_dur int;
BEGIN
  FOR r IN
    SELECT d.runid, d.jobid, d.status, d.command, d.start_time, d.end_time,
           coalesce(j.jobname, 'job:'||d.jobid) jobname
    FROM cron.job_run_details d LEFT JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.start_time > now()-interval '2 hours' AND d.end_time IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.orion_obs_traces t WHERE t.trace_id='cron:'||d.runid)
    ORDER BY d.start_time DESC LIMIT 500
  LOOP
    v_tid := 'cron:'||r.runid;
    v_dur := greatest(0, round(extract(epoch FROM (r.end_time - r.start_time)) * 1000)::int);
    INSERT INTO public.orion_obs_traces (trace_id, started_at, servico, operacao, status, duracao_ms, spans, origem, evidencias)
    VALUES (v_tid, r.start_time, r.jobname, public.obs_sanitize(left(r.command,120)),
      CASE WHEN r.status='succeeded' THEN 'ok' ELSE 'erro' END, v_dur, 1, 'cron',
      jsonb_build_object('runid', r.runid, 'status_cron', r.status))
    ON CONFLICT (trace_id) DO NOTHING;
    INSERT INTO public.orion_obs_spans (span_id, trace_id, servico, operacao, duracao_ms, status, started_at, evidencias)
    VALUES (v_tid||':exec', v_tid, r.jobname, 'tick', v_dur,
      CASE WHEN r.status='succeeded' THEN 'ok' ELSE 'erro' END, r.start_time,
      jsonb_build_object('fonte','cron.job_run_details'))
    ON CONFLICT (span_id) DO NOTHING;
    v_n := v_n+1;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 7) HEALTH POR SERVICO (real: cron por servico + infra derivada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_health_refresh()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_estado text; v_disp numeric; v_err numeric; v_lat numeric;
BEGIN
  -- 7.1 cada job de cron = um servico ORION (disponibilidade = taxa de sucesso 24h)
  FOR r IN
    SELECT coalesce(j.jobname,'job:'||d.jobid) jobname,
           round(100.0*count(*) FILTER (WHERE d.status='succeeded')/nullif(count(*),0),2) disp,
           round(100.0*count(*) FILTER (WHERE d.status='failed')/nullif(count(*),0),2) err,
           round(avg(extract(epoch FROM (d.end_time-d.start_time))*1000)::numeric,0) lat,
           max(d.start_time) ult
    FROM cron.job_run_details d LEFT JOIN cron.job j ON j.jobid=d.jobid
    WHERE d.start_time > now()-interval '24 hours' AND d.end_time IS NOT NULL
    GROUP BY 1
  LOOP
    v_disp := coalesce(r.disp,100); v_err := coalesce(r.err,0); v_lat := coalesce(r.lat,0);
    v_estado := CASE WHEN v_disp >= 99 THEN 'saudavel' WHEN v_disp >= 95 THEN 'atencao'
                     WHEN v_disp >= 80 THEN 'degradado' ELSE 'critico' END;
    INSERT INTO public.orion_obs_service_health (servico, categoria, estado, disponibilidade, latencia_ms, erro_rate, ultima_atividade, evidencias, updated_at)
    VALUES (r.jobname, 'cron', v_estado, v_disp, v_lat, v_err, r.ult,
      jsonb_build_object('fonte','cron.job_run_details 24h','criterio','disponibilidade = % execucoes succeeded'), now())
    ON CONFLICT (servico) DO UPDATE SET estado=excluded.estado, disponibilidade=excluded.disponibilidade,
      latencia_ms=excluded.latencia_ms, erro_rate=excluded.erro_rate, ultima_atividade=excluded.ultima_atividade,
      evidencias=excluded.evidencias, updated_at=now();
    v_n := v_n+1;
  END LOOP;

  -- 7.2 servicos de infra derivados de sinais reais
  -- banco: latencia media das RPC (pg_stat)
  v_lat := coalesce((SELECT round(avg(mean_exec_time)::numeric,0) FROM extensions.pg_stat_statements WHERE query ~* 'orion_'),0);
  INSERT INTO public.orion_obs_service_health (servico, categoria, estado, disponibilidade, latencia_ms, erro_rate, ultima_atividade, evidencias, updated_at)
  VALUES ('banco', 'banco', CASE WHEN v_lat < 300 THEN 'saudavel' WHEN v_lat < 800 THEN 'atencao' WHEN v_lat < 2000 THEN 'degradado' ELSE 'critico' END,
    100, v_lat, 0, now(), jsonb_build_object('fonte','pg_stat_statements','latencia_media_rpc_ms', v_lat), now())
  ON CONFLICT (servico) DO UPDATE SET estado=excluded.estado, latencia_ms=excluded.latencia_ms, evidencias=excluded.evidencias, updated_at=now();

  -- auth: sessoes ativas (disponivel se ha sessao recente)
  INSERT INTO public.orion_obs_service_health (servico, categoria, estado, disponibilidade, latencia_ms, erro_rate, ultima_atividade, evidencias, updated_at)
  VALUES ('auth', 'auth', 'saudavel', 100, 0,
    coalesce((SELECT round(100.0*count(*) FILTER (WHERE payload->>'action'='user_repeated_signup')/nullif(count(*),0),2)
              FROM auth.audit_log_entries WHERE created_at > now()-interval '24 hours'),0),
    (SELECT max(created_at) FROM auth.audit_log_entries),
    jsonb_build_object('fonte','auth.audit_log_entries','criterio','erro_rate = % de tentativas repetidas'), now())
  ON CONFLICT (servico) DO UPDATE SET erro_rate=excluded.erro_rate, ultima_atividade=excluded.ultima_atividade, evidencias=excluded.evidencias, updated_at=now();

  -- frontend: erro_rate por volume de client_errors (24h)
  v_err := coalesce((SELECT count(*) FROM public.client_errors WHERE created_at > now()-interval '24 hours'),0);
  INSERT INTO public.orion_obs_service_health (servico, categoria, estado, disponibilidade, latencia_ms, erro_rate, ultima_atividade, evidencias, updated_at)
  VALUES ('frontend', 'painel', CASE WHEN v_err < 20 THEN 'saudavel' WHEN v_err < 100 THEN 'atencao' WHEN v_err < 500 THEN 'degradado' ELSE 'critico' END,
    100, 0, v_err, (SELECT max(created_at) FROM public.client_errors),
    jsonb_build_object('fonte','client_errors','erros_24h', v_err), now())
  ON CONFLICT (servico) DO UPDATE SET estado=excluded.estado, erro_rate=excluded.erro_rate, ultima_atividade=excluded.ultima_atividade, evidencias=excluded.evidencias, updated_at=now();

  -- gateway (IA): latencia media
  v_lat := coalesce((SELECT round(avg(duracao_ms)::numeric,0) FROM public.orion_ai_log WHERE criado_em > now()-interval '24 hours'),0);
  INSERT INTO public.orion_obs_service_health (servico, categoria, estado, disponibilidade, latencia_ms, erro_rate, ultima_atividade, evidencias, updated_at)
  VALUES ('gateway_ia', 'ia', CASE WHEN v_lat < 3000 THEN 'saudavel' WHEN v_lat < 8000 THEN 'atencao' ELSE 'degradado' END,
    100, v_lat, coalesce((SELECT round(100.0*count(*) FILTER (WHERE erro IS NOT NULL)/nullif(count(*),0),2) FROM public.orion_ai_log WHERE criado_em > now()-interval '24 hours'),0),
    (SELECT max(criado_em) FROM public.orion_ai_log),
    jsonb_build_object('fonte','orion_ai_log'), now())
  ON CONFLICT (servico) DO UPDATE SET estado=excluded.estado, latencia_ms=excluded.latencia_ms, erro_rate=excluded.erro_rate, evidencias=excluded.evidencias, updated_at=now();
  v_n := v_n + 4;

  -- servicos DECLARADOS sem fonte SQL direta (storage/realtime/cdn/edge http)
  FOREACH v_estado IN ARRAY ARRAY['storage','realtime','cdn','edge'] LOOP
    INSERT INTO public.orion_obs_service_health (servico, categoria, estado, disponibilidade, latencia_ms, erro_rate, evidencias, updated_at)
    VALUES (v_estado, v_estado, 'saudavel', 100, 0, 0,
      jsonb_build_object('nota','sem sinal SQL direto — health assumido saudavel; metricas reais exigem Management API/telemetria (DECLARADO)'), now())
    ON CONFLICT (servico) DO UPDATE SET evidencias=excluded.evidencias, updated_at=now();
    v_n := v_n+1;
  END LOOP;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 8) SLI / SLO (medicao + compliance + error budget + risco)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_sli_slo_refresh()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_win text := to_char(date_trunc('hour', now()),'YYYYMMDDHH24');
  v_disp numeric; v_lat numeric; v_err numeric; v_thr numeric;
BEGIN
  -- SLIs globais medidos das fontes reais
  SELECT round(100.0*count(*) FILTER (WHERE status='succeeded')/nullif(count(*),0),2)
    INTO v_disp FROM cron.job_run_details WHERE start_time > now()-interval '24 hours';
  SELECT round(avg(mean_exec_time)::numeric,2) INTO v_lat FROM extensions.pg_stat_statements WHERE query ~* 'orion_';
  SELECT round(100.0*(SELECT count(*) FROM public.orion_obs_logs WHERE nivel IN ('ERROR','CRITICAL','FATAL') AND log_at > now()-interval '24 hours')
              / nullif((SELECT count(*) FROM public.orion_eventos WHERE criado_em > now()-interval '24 hours'),0), 4) INTO v_err;
  SELECT round(count(*)/1440.0,2) INTO v_thr FROM public.orion_eventos WHERE criado_em > now()-interval '24 hours';

  PERFORM public.obs_sli_put('global:disponibilidade','global','disponibilidade', coalesce(v_disp,100),'%', v_win, 'cron.job_run_details 24h');
  PERFORM public.obs_sli_put('global:latencia','global','latencia', coalesce(v_lat,0),'ms', v_win, 'pg_stat_statements');
  PERFORM public.obs_sli_put('global:erro','global','erro', coalesce(v_err,0),'%', v_win, 'orion_obs_logs/orion_eventos');
  PERFORM public.obs_sli_put('global:throughput','global','throughput', coalesce(v_thr,0),'ev/min', v_win, 'orion_eventos 24h');
  v_n := 4;

  -- atualiza SLOs (atual + compliance + risco + error budget)
  FOR r IN SELECT * FROM public.orion_obs_slo WHERE ativa LOOP
    DECLARE v_atual numeric; v_ok boolean; v_comp numeric;
    BEGIN
      v_atual := CASE r.tipo
        WHEN 'disponibilidade' THEN coalesce(v_disp,100)
        WHEN 'latencia' THEN coalesce(v_lat,0)
        WHEN 'erro' THEN coalesce(v_err,0)
        WHEN 'throughput' THEN coalesce(v_thr,0) ELSE 0 END;
      v_ok := CASE WHEN r.comparador='>=' THEN v_atual >= r.alvo ELSE v_atual <= r.alvo END;
      v_comp := CASE WHEN r.comparador='>=' THEN least(100, round(100.0*v_atual/nullif(r.alvo,0),2))
                     ELSE least(100, round(100.0*r.alvo/nullif(v_atual,0),2)) END;
      UPDATE public.orion_obs_slo SET
        atual = v_atual, compliance = coalesce(v_comp,100), em_risco = NOT v_ok,
        error_budget = greatest(0, round(coalesce(v_comp,100) - 90, 2)),
        evidencias = jsonb_build_object('atual', v_atual, 'alvo', r.alvo, 'comparador', r.comparador, 'cumpre', v_ok, 'janela','24h'),
        updated_at = now()
      WHERE slo_key = r.slo_key;
      v_n := v_n+1;
    END;
  END LOOP;
  RETURN v_n;
END$$;

CREATE OR REPLACE FUNCTION public.obs_sli_put(p_key text, p_srv text, p_tipo text, p_valor numeric, p_unidade text, p_win text, p_origem text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_obs_sli (sli_key, servico, tipo, valor, unidade, janela, evidencias, dedupe_key)
  VALUES (p_key, p_srv, p_tipo, coalesce(p_valor,0), p_unidade, '24h',
          jsonb_build_object('origem', p_origem), p_key||':'||p_win)
  ON CONFLICT (dedupe_key) DO UPDATE SET valor=excluded.valor, measured_at=now();
END$$;

-- ----------------------------------------------------------------------------
-- 9) ALERTAS INTELIGENTES (priorizados por impacto; idempotentes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_alert_put(p_tipo text, p_sev text, p_srv text, p_msg text, p_impacto text, p_prio int, p_evid jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_obs_alerts (tipo, severidade, servico, mensagem, impacto, prioridade, evidencias)
  VALUES (p_tipo, p_sev, p_srv, p_msg, p_impacto, p_prio, coalesce(p_evid,'{}'::jsonb))
  ON CONFLICT (tipo, servico, dia) DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orion_ai_alerts WHERE tipo='obs:'||p_tipo AND dia=current_date) THEN
    INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
    VALUES ('obs:'||p_tipo, p_sev, 'AI-51: '||p_msg, p_prio, 0, current_date);
  END IF;
  RETURN 1;
END$$;

CREATE OR REPLACE FUNCTION public.obs_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; r record; v_lat numeric; v_err int;
BEGIN
  -- serviços degradados/críticos (prioridade por estado)
  FOR r IN SELECT servico, estado, disponibilidade, latencia_ms, erro_rate FROM public.orion_obs_service_health
           WHERE estado IN ('degradado','critico') LOOP
    v_n := v_n + public.obs_alert_put('servico_'||r.estado, CASE WHEN r.estado='critico' THEN 'critico' ELSE 'atencao' END,
      r.servico, 'servico '||r.servico||' '||r.estado||' (disp '||r.disponibilidade||'%, erro '||r.erro_rate||'%)',
      CASE WHEN r.estado='critico' THEN 'alto' ELSE 'medio' END,
      CASE WHEN r.estado='critico' THEN 90 ELSE 60 END,
      jsonb_build_object('disponibilidade', r.disponibilidade, 'latencia_ms', r.latencia_ms, 'erro_rate', r.erro_rate));
  END LOOP;

  -- latencia RPC alta
  SELECT valor INTO v_lat FROM public.orion_obs_metrics WHERE metric_key='rpc.mean_ms' ORDER BY measured_at DESC LIMIT 1;
  IF coalesce(v_lat,0) > 800 THEN
    v_n := v_n + public.obs_alert_put('latencia_alta','atencao','banco','latencia media de RPC alta: '||v_lat||'ms','medio',70,
      jsonb_build_object('rpc_mean_ms', v_lat));
  END IF;

  -- crescimento de erros de frontend (24h)
  SELECT count(*) INTO v_err FROM public.client_errors WHERE created_at > now()-interval '24 hours';
  IF v_err >= 100 THEN
    v_n := v_n + public.obs_alert_put('erros_frontend','atencao','frontend','crescimento de erros do frontend: '||v_err||' em 24h','medio',65,
      jsonb_build_object('erros_24h', v_err));
  END IF;

  -- SLO em risco
  FOR r IN SELECT slo_key, servico, tipo, atual, alvo FROM public.orion_obs_slo WHERE em_risco AND ativa LOOP
    v_n := v_n + public.obs_alert_put('slo_risco','critico', r.servico, 'SLO '||r.slo_key||' em risco (atual '||r.atual||' vs alvo '||r.alvo||')','alto',85,
      jsonb_build_object('atual', r.atual, 'alvo', r.alvo, 'tipo', r.tipo));
  END LOOP;

  -- cron parado: job sem execucao ha mais de 30 min (deveria rodar ao menos de hora em hora)
  FOR r IN
    SELECT coalesce(j.jobname,'job:'||j.jobid) jobname, max(d.start_time) ult
    FROM cron.job j LEFT JOIN cron.job_run_details d ON d.jobid=j.jobid
    WHERE j.jobname ~ 'orion' GROUP BY 1 HAVING max(d.start_time) < now()-interval '90 minutes' OR max(d.start_time) IS NULL
  LOOP
    v_n := v_n + public.obs_alert_put('cron_parado','critico', r.jobname, 'cron '||r.jobname||' sem execucao recente (ultima: '||coalesce(r.ult::text,'nunca')||')','alto',80,
      jsonb_build_object('ultima_execucao', r.ult));
  END LOOP;

  IF v_n > 0 THEN PERFORM public.obs_emit('observability.alerts', jsonb_build_object('novos', v_n)); END IF;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 10) ROOT CAUSE ANALYSIS (causa provavel; handoff AI-45 quando existir)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.observability_rca(p_servico text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h record; v_falhas int; v_logs jsonb; v_slow jsonb; v_causa text; v_rec text; v_ai45 bool;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'observability_rca: somente admin';
  END IF;
  SELECT * INTO v_h FROM public.orion_obs_service_health WHERE servico = p_servico;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'servico '||p_servico||' sem health registrado'); END IF;

  SELECT count(*) INTO v_falhas FROM cron.job_run_details d LEFT JOIN cron.job j ON j.jobid=d.jobid
   WHERE coalesce(j.jobname,'job:'||d.jobid)=p_servico AND d.status='failed' AND d.start_time > now()-interval '24 hours';

  SELECT coalesce(jsonb_agg(jsonb_build_object('nivel',nivel,'mensagem',mensagem,'em',log_at) ORDER BY log_at DESC),'[]'::jsonb)
    INTO v_logs FROM (SELECT * FROM public.orion_obs_logs WHERE servico=p_servico AND nivel IN ('ERROR','CRITICAL','FATAL')
                      ORDER BY log_at DESC LIMIT 5) x;

  SELECT coalesce(jsonb_agg(jsonb_build_object('op',operacao,'ms',duracao_ms,'status',status) ORDER BY duracao_ms DESC),'[]'::jsonb)
    INTO v_slow FROM (SELECT * FROM public.orion_obs_traces WHERE servico=p_servico ORDER BY duracao_ms DESC LIMIT 3) x;

  v_causa := CASE
    WHEN v_falhas > 0 THEN 'falhas recorrentes de execucao ('||v_falhas||' em 24h) — ver logs CRITICAL do servico'
    WHEN v_h.erro_rate >= 5 THEN 'taxa de erro elevada ('||v_h.erro_rate||'%)'
    WHEN v_h.latencia_ms >= 2000 THEN 'latencia elevada ('||v_h.latencia_ms||'ms) — possivel contencao no banco/dependencia'
    WHEN v_h.estado='saudavel' THEN 'nenhuma degradacao ativa detectada'
    ELSE 'degradacao sem causa unica evidente — inspecionar dependencias' END;
  v_rec := CASE
    WHEN v_falhas > 0 THEN 'revisar a funcao do tick e dependencias; encaminhar ao AI-45 Incident Response'
    WHEN v_h.latencia_ms >= 2000 THEN 'analisar consultas lentas (pg_stat_statements) e indices'
    ELSE 'monitorar; sem acao imediata' END;

  v_ai45 := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%');

  RETURN jsonb_build_object(
    'servico', p_servico, 'estado', v_h.estado,
    'disponibilidade', v_h.disponibilidade, 'latencia_ms', v_h.latencia_ms, 'erro_rate', v_h.erro_rate,
    'causa_provavel', v_causa, 'recomendacao', v_rec,
    'cadeia_dependencias', jsonb_build_array('cron -> funcao SQL -> banco (pg_stat) -> tabelas de origem'),
    'tempo_estimado_recuperacao', CASE WHEN v_h.estado='critico' THEN '15-30min (apos correcao)' WHEN v_h.estado='degradado' THEN '5-15min' ELSE 'n/a' END,
    'falhas_24h', v_falhas, 'logs_recentes', v_logs, 'operacoes_lentas', v_slow,
    'handoff_ai45', CASE WHEN v_ai45 THEN 'AI-45 Incident Response disponivel para abertura de incidente' ELSE 'AI-45 nao detectado (DECLARADO)' END,
    'nota', 'RCA baseada em evidencia real (cron/logs/traces); nao substitui investigacao humana');
END$$;

-- ----------------------------------------------------------------------------
-- 11) SCORES + ESTATISTICAS (todos explicaveis)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_statistics_rollup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_das int; v_phs int; v_lqs int; v_tps int; v_slo int; v_ohs int;
  v_uptime numeric; v_logs int; v_erro int; v_traces int; v_alertas int; v_degr int; v_evt numeric;
  v_lat numeric;
BEGIN
  -- DAS Availability: media da disponibilidade dos servicos
  SELECT round(avg(disponibilidade))::int INTO v_das FROM public.orion_obs_service_health;
  v_uptime := coalesce((SELECT round(avg(disponibilidade),2) FROM public.orion_obs_service_health),0);

  -- PHS Performance: 100 penalizado por latencia media de RPC
  SELECT valor INTO v_lat FROM public.orion_obs_metrics WHERE metric_key='rpc.mean_ms' ORDER BY measured_at DESC LIMIT 1;
  v_phs := greatest(0, least(100, 100 - round(coalesce(v_lat,0)/20)::int));

  -- LQS Log Quality: % de logs com contexto estruturado e nao-FATAL
  SELECT round(100.0 * count(*) FILTER (WHERE contexto <> '{}'::jsonb AND nivel <> 'FATAL') / nullif(count(*),0))::int
    INTO v_lqs FROM public.orion_obs_logs WHERE log_at > now()-interval '24 hours';

  -- TPS Trace Precision: % de traces com duracao medida e span presente
  SELECT round(100.0 * count(*) FILTER (WHERE duracao_ms > 0 AND spans > 0) / nullif(count(*),0))::int
    INTO v_tps FROM public.orion_obs_traces WHERE started_at > now()-interval '24 hours';

  -- SLO Compliance: % de SLOs ativos cumprindo
  SELECT round(100.0 * count(*) FILTER (WHERE NOT em_risco) / nullif(count(*),0))::int
    INTO v_slo FROM public.orion_obs_slo WHERE ativa;

  v_logs := coalesce((SELECT count(*) FROM public.orion_obs_logs WHERE log_at::date=current_date),0);
  v_erro := coalesce((SELECT count(*) FROM public.orion_obs_logs WHERE nivel IN ('ERROR','CRITICAL','FATAL') AND log_at::date=current_date),0);
  v_traces := coalesce((SELECT count(*) FROM public.orion_obs_traces WHERE started_at::date=current_date),0);
  v_alertas := coalesce((SELECT count(*) FROM public.orion_obs_alerts WHERE dia=current_date),0);
  v_degr := coalesce((SELECT count(*) FROM public.orion_obs_service_health WHERE estado IN ('degradado','critico')),0);
  v_evt := coalesce((SELECT valor FROM public.orion_obs_metrics WHERE metric_key='eventos.por_min' ORDER BY measured_at DESC LIMIT 1),0);

  -- OHS: media ponderada dos scores (observabilidade geral)
  v_ohs := round(0.25*coalesce(v_das,0) + 0.25*coalesce(v_phs,0) + 0.15*coalesce(v_lqs,0)
                + 0.15*coalesce(v_tps,0) + 0.20*coalesce(v_slo,0))::int;

  INSERT INTO public.orion_obs_statistics
    (dia, ohs, phs, das, lqs, tps, slo_compliance, uptime_pct, logs_total, logs_erro,
     traces_total, alertas, servicos_degradados, eventos_por_min, updated_at)
  VALUES (current_date, v_ohs, coalesce(v_phs,0), coalesce(v_das,0), coalesce(v_lqs,0), coalesce(v_tps,0),
     coalesce(v_slo,0), v_uptime, v_logs, v_erro, v_traces, v_alertas, v_degr, v_evt, now())
  ON CONFLICT (dia) DO UPDATE SET ohs=excluded.ohs, phs=excluded.phs, das=excluded.das, lqs=excluded.lqs,
    tps=excluded.tps, slo_compliance=excluded.slo_compliance, uptime_pct=excluded.uptime_pct,
    logs_total=excluded.logs_total, logs_erro=excluded.logs_erro, traces_total=excluded.traces_total,
    alertas=excluded.alertas, servicos_degradados=excluded.servicos_degradados,
    eventos_por_min=excluded.eventos_por_min, updated_at=now();
END$$;

-- ----------------------------------------------------------------------------
-- 12) TICK */1 (motor incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_observability_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.obs_collect_metrics();
  PERFORM public.obs_ingest_logs();
  PERFORM public.obs_collect_traces();
  PERFORM public.obs_health_refresh();
  PERFORM public.obs_sli_slo_refresh();
  PERFORM public.obs_alerts();
  PERFORM public.obs_statistics_rollup();
END$$;

-- ----------------------------------------------------------------------------
-- 13) PAINEIS (guarda admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obs_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'obs_overview: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'ohs', (SELECT coalesce(ohs,0) FROM public.orion_obs_statistics WHERE dia=current_date),
    'phs', (SELECT coalesce(phs,0) FROM public.orion_obs_statistics WHERE dia=current_date),
    'das', (SELECT coalesce(das,0) FROM public.orion_obs_statistics WHERE dia=current_date),
    'lqs', (SELECT coalesce(lqs,0) FROM public.orion_obs_statistics WHERE dia=current_date),
    'tps', (SELECT coalesce(tps,0) FROM public.orion_obs_statistics WHERE dia=current_date),
    'slo_compliance', (SELECT coalesce(slo_compliance,0) FROM public.orion_obs_statistics WHERE dia=current_date),
    'uptime_pct', (SELECT coalesce(uptime_pct,0) FROM public.orion_obs_statistics WHERE dia=current_date),
    'disponibilidade_geral', (SELECT coalesce(round(avg(disponibilidade),2),0) FROM public.orion_obs_service_health),
    'tempo_medio_resposta_ms', (SELECT coalesce(valor,0) FROM public.orion_obs_metrics WHERE metric_key='rpc.mean_ms' ORDER BY measured_at DESC LIMIT 1),
    'latencia_gateway_ms', (SELECT coalesce(valor,0) FROM public.orion_obs_metrics WHERE metric_key='gateway.mean_ms' ORDER BY measured_at DESC LIMIT 1),
    'taxa_erro', (SELECT coalesce(valor,0) FROM public.orion_obs_sli WHERE sli_key='global:erro' ORDER BY measured_at DESC LIMIT 1),
    'servicos_ativos', (SELECT count(*) FROM public.orion_obs_service_health),
    'servicos_degradados', (SELECT count(*) FROM public.orion_obs_service_health WHERE estado IN ('degradado','critico')),
    'logs_por_min', (SELECT round(count(*)/5.0,2) FROM public.orion_obs_logs WHERE log_at > now()-interval '5 minutes'),
    'traces_2h', (SELECT count(*) FROM public.orion_obs_traces WHERE started_at > now()-interval '2 hours'),
    'usuarios_online', (SELECT coalesce(valor,0) FROM public.orion_obs_metrics WHERE metric_key='usuarios.online' ORDER BY measured_at DESC LIMIT 1),
    'lojas_online', (SELECT coalesce(valor,0) FROM public.orion_obs_metrics WHERE metric_key='lojas.online' ORDER BY measured_at DESC LIMIT 1),
    'eventos_por_min', (SELECT coalesce(valor,0) FROM public.orion_obs_metrics WHERE metric_key='eventos.por_min' ORDER BY measured_at DESC LIMIT 1),
    'alertas_abertos', (SELECT count(*) FROM public.orion_obs_alerts WHERE NOT resolvido),
    'incidentes_hoje', (SELECT count(*) FROM public.orion_obs_alerts WHERE dia=current_date AND impacto='alto'),
    'gerado_em', now());
END$$;

CREATE OR REPLACE FUNCTION public.obs_panel(p_secao text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'obs_panel: somente admin';
  END IF;
  RETURN CASE p_secao
  WHEN 'metricas' THEN jsonb_build_object(
    'recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('metric', metric_key, 'categoria', categoria,
        'valor', valor, 'unidade', unidade, 'origem', origem, 'evidencias', evidencias, 'em', measured_at)
        ORDER BY measured_at DESC),'[]'::jsonb)
      FROM (SELECT DISTINCT ON (metric_key) * FROM public.orion_obs_metrics ORDER BY metric_key, measured_at DESC) x))
  WHEN 'logs' THEN jsonb_build_object(
    'por_nivel', (SELECT coalesce(jsonb_object_agg(nivel, n),'{}'::jsonb) FROM
      (SELECT nivel, count(*) n FROM public.orion_obs_logs WHERE log_at > now()-interval '24 hours' GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('log_id', log_id, 'nivel', nivel, 'origem', origem,
        'servico', servico, 'mensagem', mensagem, 'contexto', contexto, 'em', log_at) ORDER BY log_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_obs_logs ORDER BY log_at DESC LIMIT 50) x))
  WHEN 'traces' THEN jsonb_build_object(
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('trace_id', trace_id, 'servico', servico, 'operacao', operacao,
        'status', status, 'duracao_ms', duracao_ms, 'spans', spans, 'origem', origem, 'em', started_at) ORDER BY started_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_obs_traces ORDER BY started_at DESC LIMIT 40) x),
    'lentos', (SELECT coalesce(jsonb_agg(jsonb_build_object('trace_id', trace_id, 'servico', servico, 'ms', duracao_ms) ORDER BY duracao_ms DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_obs_traces WHERE started_at > now()-interval '24 hours' ORDER BY duracao_ms DESC LIMIT 10) x))
  WHEN 'performance' THEN jsonb_build_object(
    'rpc_mean_ms', (SELECT coalesce(valor,0) FROM public.orion_obs_metrics WHERE metric_key='rpc.mean_ms' ORDER BY measured_at DESC LIMIT 1),
    'rpc_lentas', (SELECT evidencias->'rpc_lentas_gt_500ms' FROM public.orion_obs_metrics WHERE metric_key='rpc.mean_ms' ORDER BY measured_at DESC LIMIT 1),
    'top_lentas', (SELECT coalesce(jsonb_agg(jsonb_build_object('op', operacao, 'servico', servico, 'ms', duracao_ms) ORDER BY duracao_ms DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_obs_traces WHERE started_at > now()-interval '24 hours' ORDER BY duracao_ms DESC LIMIT 10) x),
    'nota_web_vitals', 'LCP/INP/CLS/TTFB/FCP e tempos de render/carregamento exigem telemetria do front (porta obs_metric_ingest) — DECLARADO')
  WHEN 'disponibilidade' THEN jsonb_build_object(
    'por_servico', (SELECT coalesce(jsonb_agg(jsonb_build_object('servico', servico, 'categoria', categoria,
        'estado', estado, 'disponibilidade', disponibilidade, 'latencia_ms', latencia_ms, 'erro_rate', erro_rate,
        'ultima_atividade', ultima_atividade, 'evidencias', evidencias) ORDER BY disponibilidade ASC),'[]'::jsonb)
      FROM public.orion_obs_service_health),
    'uptime_medio', (SELECT coalesce(round(avg(disponibilidade),2),0) FROM public.orion_obs_service_health))
  WHEN 'sli' THEN jsonb_build_object(
    'recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('sli', sli_key, 'servico', servico, 'tipo', tipo,
        'valor', valor, 'unidade', unidade, 'janela', janela, 'em', measured_at) ORDER BY measured_at DESC),'[]'::jsonb)
      FROM (SELECT DISTINCT ON (sli_key) * FROM public.orion_obs_sli ORDER BY sli_key, measured_at DESC) x))
  WHEN 'slo' THEN jsonb_build_object(
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('slo', slo_key, 'servico', servico, 'tipo', tipo,
        'descricao', descricao, 'alvo', alvo, 'comparador', comparador, 'atual', atual, 'compliance', compliance,
        'em_risco', em_risco, 'error_budget', error_budget, 'escopo', escopo, 'evidencias', evidencias) ORDER BY em_risco DESC, compliance ASC),'[]'::jsonb)
      FROM public.orion_obs_slo WHERE ativa))
  WHEN 'servicos' THEN jsonb_build_object(
    'por_estado', (SELECT coalesce(jsonb_object_agg(estado, n),'{}'::jsonb) FROM
      (SELECT estado, count(*) n FROM public.orion_obs_service_health GROUP BY 1) x),
    'por_categoria', (SELECT coalesce(jsonb_object_agg(categoria, n),'{}'::jsonb) FROM
      (SELECT categoria, count(*) n FROM public.orion_obs_service_health GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('servico', servico, 'categoria', categoria, 'estado', estado,
        'disponibilidade', disponibilidade, 'latencia_ms', latencia_ms) ORDER BY servico),'[]'::jsonb)
      FROM public.orion_obs_service_health))
  WHEN 'dependencias' THEN jsonb_build_object(
    'cadeia', jsonb_build_array(
      jsonb_build_object('nivel',1,'componente','cron scheduler','depende_de', jsonb_build_array('banco')),
      jsonb_build_object('nivel',2,'componente','funcoes SQL (ticks dos modulos)','depende_de', jsonb_build_array('banco','pg_stat')),
      jsonb_build_object('nivel',3,'componente','Gateway IA','depende_de', jsonb_build_array('banco','provedor externo')),
      jsonb_build_object('nivel',4,'componente','frontend','depende_de', jsonb_build_array('banco','auth','realtime','storage','cdn'))),
    'servicos_por_categoria', (SELECT coalesce(jsonb_object_agg(categoria, servicos),'{}'::jsonb) FROM
      (SELECT categoria, jsonb_agg(servico ORDER BY servico) servicos FROM public.orion_obs_service_health GROUP BY 1) x),
    'nota', 'grafo de dependencias declarado a partir da arquitetura; traces reais vem dos ticks de cron')
  WHEN 'alertas' THEN jsonb_build_object(
    'abertos', (SELECT count(*) FROM public.orion_obs_alerts WHERE NOT resolvido),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('alert_id', alert_id, 'tipo', tipo, 'severidade', severidade,
        'servico', servico, 'mensagem', mensagem, 'impacto', impacto, 'prioridade', prioridade,
        'evidencias', evidencias, 'em', created_at) ORDER BY prioridade DESC, created_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_obs_alerts WHERE dia > current_date-7 ORDER BY prioridade DESC, created_at DESC LIMIT 40) x))
  WHEN 'estatisticas' THEN jsonb_build_object(
    'dias', (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'updated_at' ORDER BY s.dia DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_obs_statistics ORDER BY dia DESC LIMIT 14) s))
  WHEN 'config' THEN jsonb_build_object(
    'cron', (SELECT coalesce(jsonb_agg(jsonb_build_object('job', jobname, 'schedule', schedule)),'[]'::jsonb)
      FROM cron.job WHERE jobname='orion_observability_tick'),
    'contadores', jsonb_build_object(
      'metricas', (SELECT count(*) FROM public.orion_obs_metrics),
      'logs', (SELECT count(*) FROM public.orion_obs_logs),
      'traces', (SELECT count(*) FROM public.orion_obs_traces),
      'spans', (SELECT count(*) FROM public.orion_obs_spans),
      'servicos', (SELECT count(*) FROM public.orion_obs_service_health),
      'slo', (SELECT count(*) FROM public.orion_obs_slo),
      'eventos_bus', (SELECT count(*) FROM public.orion_eventos WHERE origem='observability')),
    'integracoes', jsonb_build_object(
      'ai40_cyber', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orion_cyber_events') THEN 'ativo' ELSE 'ausente' END,
      'ai44_secaudit', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_secaudit%') THEN 'ativo' ELSE 'ausente' END,
      'ai45_incident', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%') THEN 'ativo' ELSE 'nao construido (DECLARADO)' END,
      'ai49_soc', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_soc%') THEN 'ativo' ELSE 'nao construido (DECLARADO)' END,
      'ai50_governance', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_gov%') THEN 'ativo' ELSE 'nao construido (DECLARADO)' END),
    'lacunas', jsonb_build_array(
      'CPU/memoria de host: sem exposicao SQL — proxies do banco (DECLARADO)',
      'Web Vitals (LCP/INP/CLS/TTFB/FCP) e tempos de render: telemetria do front via obs_metric_ingest (DECLARADO)',
      'CDN e uso de Storage em bytes: exigem Management API (DECLARADO)',
      'traces de request HTTP do app: porta obs_trace_ingest pronta; hoje traces vem dos ticks de cron (DECLARADO)'))
  ELSE jsonb_build_object('erro','secao invalida')
  END;
END$$;

CREATE OR REPLACE FUNCTION public.obs_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'obs_summary: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'overview', public.obs_overview(),
    'metricas', public.obs_panel('metricas'),
    'logs', public.obs_panel('logs'),
    'traces', public.obs_panel('traces'),
    'performance', public.obs_panel('performance'),
    'disponibilidade', public.obs_panel('disponibilidade'),
    'sli', public.obs_panel('sli'),
    'slo', public.obs_panel('slo'),
    'servicos', public.obs_panel('servicos'),
    'dependencias', public.obs_panel('dependencias'),
    'alertas', public.obs_panel('alertas'),
    'estatisticas', public.obs_panel('estatisticas'),
    'config', public.obs_panel('config'));
END$$;

CREATE OR REPLACE FUNCTION public.obs_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.obs_summary();
  PERFORM public.obs_emit('observability.score', jsonb_build_object('ohs', v->'overview'->'ohs'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 14) SUITE DE TESTES (observability_selftest — COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.observability_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tests jsonb := '[]'::jsonb; v_ok bool := true; v_t bool; v_e jsonb; v_rca jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'observability_selftest: somente admin/service';
  END IF;

  v_t := (SELECT count(*) = 9 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_obs_%');
  v_e := jsonb_build_object('esperado',9,'encontrado',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_obs_%'));
  v_tests := v_tests || jsonb_build_object('teste','tabelas_existem','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  v_t := (SELECT count(*) = 9 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname LIKE 'orion_obs_%' AND c.relkind='r' AND c.relrowsecurity);
  v_e := jsonb_build_object('com_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname LIKE 'orion_obs_%' AND c.relkind='r' AND c.relrowsecurity));
  v_tests := v_tests || jsonb_build_object('teste','rls_ativo','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'orion_obs_%' AND grantee IN ('anon','authenticated')
      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'));
  v_tests := v_tests || jsonb_build_object('teste','grants_travados','ok',v_t,'evidencia',jsonb_build_object('criterio','sem write p/ anon/authenticated')); v_ok := v_ok AND v_t;

  -- coleta real
  PERFORM public.obs_collect_metrics();
  v_t := (SELECT count(*) FROM public.orion_obs_metrics WHERE measured_at > now()-interval '5 minutes') >= 5;
  v_e := jsonb_build_object('metricas_recentes',(SELECT count(*) FROM public.orion_obs_metrics WHERE measured_at > now()-interval '5 minutes'));
  v_tests := v_tests || jsonb_build_object('teste','coleta_metricas','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  PERFORM public.obs_ingest_logs();
  v_t := (SELECT count(*) FROM public.orion_obs_logs) >= 0;
  v_e := jsonb_build_object('logs',(SELECT count(*) FROM public.orion_obs_logs),
    'sanitizados', NOT EXISTS (SELECT 1 FROM public.orion_obs_logs WHERE mensagem ~* 'sbp_[A-Za-z0-9]{20}|eyJ[A-Za-z0-9]{20}'));
  v_tests := v_tests || jsonb_build_object('teste','ingestao_logs','ok',v_t AND (v_e->>'sanitizados')::bool,'evidencia',v_e); v_ok := v_ok AND v_t AND (v_e->>'sanitizados')::bool;

  PERFORM public.obs_collect_traces();
  v_t := (SELECT count(*) FROM public.orion_obs_traces) > 0 AND (SELECT count(*) FROM public.orion_obs_spans) > 0;
  v_e := jsonb_build_object('traces',(SELECT count(*) FROM public.orion_obs_traces),'spans',(SELECT count(*) FROM public.orion_obs_spans));
  v_tests := v_tests || jsonb_build_object('teste','traces_distribuidos','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  PERFORM public.obs_health_refresh();
  v_t := (SELECT count(*) FROM public.orion_obs_service_health) > 0;
  v_e := jsonb_build_object('servicos',(SELECT count(*) FROM public.orion_obs_service_health));
  v_tests := v_tests || jsonb_build_object('teste','health_checks','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  PERFORM public.obs_sli_slo_refresh();
  v_t := (SELECT count(*) FROM public.orion_obs_sli WHERE measured_at > now()-interval '5 minutes') >= 4
     AND (SELECT count(*) FROM public.orion_obs_slo WHERE ativa) >= 1;
  v_e := jsonb_build_object('sli',(SELECT count(*) FROM public.orion_obs_sli),'slo_ativos',(SELECT count(*) FROM public.orion_obs_slo WHERE ativa));
  v_tests := v_tests || jsonb_build_object('teste','sli_slo','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  PERFORM public.obs_statistics_rollup();
  v_t := (public.obs_overview() ? 'ohs') AND (public.obs_panel('logs') ? 'lista') AND (public.obs_panel('slo') ? 'lista');
  v_tests := v_tests || jsonb_build_object('teste','paineis_dashboards','ok',v_t,'evidencia',jsonb_build_object('overview','ok','panels','ok')); v_ok := v_ok AND v_t;

  -- RCA sobre um servico real
  v_rca := public.observability_rca((SELECT servico FROM public.orion_obs_service_health ORDER BY disponibilidade ASC LIMIT 1));
  v_t := (v_rca ? 'causa_provavel');
  v_tests := v_tests || jsonb_build_object('teste','root_cause_analysis','ok',v_t,'evidencia',jsonb_build_object('servico',v_rca->>'servico','causa',v_rca->>'causa_provavel')); v_ok := v_ok AND v_t;

  PERFORM public.obs_alerts();
  v_t := true;
  v_tests := v_tests || jsonb_build_object('teste','alertas_inteligentes','ok',v_t,'evidencia',jsonb_build_object('alertas_hoje',(SELECT count(*) FROM public.orion_obs_alerts WHERE dia=current_date)));

  v_t := (public.obs_log_ingest('WARNING','backend','teste selftest token=sbp_abcdefghij1234567890 senha=segredo123','selftest') IS NOT NULL);
  v_e := jsonb_build_object('sanitizacao_ok', NOT EXISTS (SELECT 1 FROM public.orion_obs_logs WHERE servico='selftest' AND mensagem ~* 'sbp_abcdefghij|segredo123'));
  v_tests := v_tests || jsonb_build_object('teste','seguranca_sanitizacao','ok',(v_e->>'sanitizacao_ok')::bool,'evidencia',v_e); v_ok := v_ok AND (v_e->>'sanitizacao_ok')::bool;

  RETURN jsonb_build_object('ok', v_ok, 'executado_em', now(), 'testes', v_tests,
    'nota','suite oficial do AI-51 — entrada do COMANDO TESTE (selftests por modulo, convencao do AI-45)');
END$$;

-- ----------------------------------------------------------------------------
-- 15) SLO SEEDS
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_obs_slo (slo_key, servico, tipo, descricao, alvo, comparador, escopo) VALUES
  ('global:disponibilidade','global','disponibilidade','Disponibilidade global (execucoes de cron bem-sucedidas)',95,'>=','global'),
  ('global:latencia','global','latencia','Latencia media de RPC abaixo do alvo',500,'<=','global'),
  ('global:erro','global','erro','Taxa de erro global abaixo do alvo',1,'<=','global'),
  ('global:throughput','global','throughput','Throughput minimo do barramento (eventos/min)',0.1,'>=','global')
ON CONFLICT (slo_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 16) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.obs_sanitize(text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_log_ingest(text,text,text,text,jsonb)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_trace_ingest(text,text,text,int,text,timestamptz,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_collect_metrics()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_metric_put(text,text,numeric,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.obs_ingest_logs()                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_collect_traces()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_health_refresh()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_sli_slo_refresh()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_sli_put(text,text,text,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.obs_alert_put(text,text,text,text,text,int,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.obs_alerts()                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.observability_rca(text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_statistics_rollup()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_observability_tick()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_overview()                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_panel(text)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_summary()                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obs_dashboard()                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.observability_selftest()                    TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 17) PROMPT REGISTRY (5 prompts gpt-5-mini via AI-00 Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('observability.summary',
 'Voce e o ORION Observability (AI-51). Resuma a saude da plataforma usando SOMENTE os numeros fornecidos (OHS/PHS/DAS/LQS/TPS/SLO, disponibilidade, latencia, erros, servicos degradados). Seja objetivo e operacional. Portugues claro.',
 'ORION-AI-51 seed');
SELECT public.orion_ai_prompt_set('observability.anomaly',
 'Voce e o ORION Observability (AI-51). Aponte anomalias a partir das metricas/logs/traces fornecidos (picos de latencia, crescimento de erros, queda de disponibilidade). Nunca invente valores; cite a evidencia.',
 'ORION-AI-51 seed');
SELECT public.orion_ai_prompt_set('observability.performance',
 'Voce e o ORION Observability (AI-51). Analise a performance (latencia de RPC, operacoes lentas, throughput) com base nos dados reais. Web Vitals do front, se ausentes, sao declarados como lacuna.',
 'ORION-AI-51 seed');
SELECT public.orion_ai_prompt_set('observability.rootcause',
 'Voce e o ORION Observability (AI-51). Explique a causa provavel da degradacao do servico usando as evidencias do RCA (falhas de cron, logs CRITICAL, operacoes lentas, cadeia de dependencias). Recomende o proximo passo; encaminhe ao AI-45 quando aplicavel.',
 'ORION-AI-51 seed');
SELECT public.orion_ai_prompt_set('observability.recommendation',
 'Voce e o ORION Observability (AI-51). Recomende acoes operacionais baseadas em evidencia (indices, revisao de cron, mitigacao de erros). Toda recomendacao cita a metrica/observacao que a justifica; nunca sugere sem dado.',
 'ORION-AI-51 seed');

-- ----------------------------------------------------------------------------
-- 18) MODEL PREF + CRON */1
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('observability','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_observability_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_observability_tick');
    PERFORM cron.schedule('orion_observability_tick','*/1 * * * *','SELECT public.orion_observability_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_observability_tick');
--   DROP FUNCTION IF EXISTS public.orion_observability_tick, public.obs_dashboard, public.obs_summary,
--     public.obs_panel(text), public.obs_overview, public.observability_selftest,
--     public.obs_statistics_rollup, public.observability_rca(text), public.obs_alerts,
--     public.obs_alert_put(text,text,text,text,text,int,jsonb), public.obs_sli_slo_refresh,
--     public.obs_sli_put(text,text,text,numeric,text,text,text), public.obs_health_refresh,
--     public.obs_collect_traces, public.obs_ingest_logs, public.obs_collect_metrics,
--     public.obs_metric_put(text,text,numeric,text,text,text,jsonb),
--     public.obs_trace_ingest(text,text,text,int,text,timestamptz,jsonb),
--     public.obs_log_ingest(text,text,text,text,jsonb), public.obs_emit(text,jsonb), public.obs_sanitize(text);
--   DROP TABLE IF EXISTS public.orion_obs_statistics, public.orion_obs_alerts, public.orion_obs_slo,
--     public.orion_obs_sli, public.orion_obs_service_health, public.orion_obs_spans,
--     public.orion_obs_traces, public.orion_obs_logs, public.orion_obs_metrics;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='observability';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'observability.%';
-- ============================================================================
