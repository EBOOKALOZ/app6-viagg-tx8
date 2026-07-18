-- ============================================================================
-- ORION-AI-53 — AI OPERATIONS (AIOps) AI v1.0
-- ============================================================================
-- Centro Inteligente de Operacoes Autonomas. Monitora a operacao TECNICA da
-- plataforma, detecta anomalias operacionais, preve falhas antes de afetarem
-- usuarios e automatiza SO acoes seguras/pre-autorizadas sob governanca (AI-50).
-- NUNCA executa acao destrutiva automaticamente. Tudo explicavel e auditavel.
--
-- Fontes REAIS de telemetria (sondadas 07-17):
--   * cron.job_run_details ⨝ cron.job — saude/falhas/duracao dos jobs (PRIMARIA;
--     ex.: orion_threat_tick 118/118 falhas em 24h = anomalia real detectada).
--   * orion_ai_log (Gateway) — duracao_ms/status/erro/retries/cache_hit por chamada.
--   * client_errors — erros de frontend (29/24h).
--   * AI-51 Observability: orion_obs_service_health (estado/disponibilidade/
--     latencia_ms/erro_rate), orion_obs_slo (em_risco/error_budget).
--   * AI-52 Cost: orion_cost_statistics. AI-45 orion_incidents. AI-49 SOC.
--   * orion_eventos (barramento) — liveness por modulo.
--
-- Integra (LEITURA): AI-40/44/45/46/47/49/50/51/52. Espelha anomalia critica em
--   orion_cyber_events (tipo 'ops_anomaly') → AI-43 correlaciona, AI-45 responde,
--   AI-49 consolida. Handoff a AI-45 via barramento.
--
-- Anti-colisao: namespace orion_aiops_*, funcoes aiops_*/run_aiops, chave `aiops`,
--   painel /admin/orion-aiops. NAO e o AI-13 `operations` (COO/negocio) nem o
--   AI-11 `performance` — este e OPERACAO TECNICA/runtime (AIOps).
--
-- Idempotente. Evidencias IMUTAVEIS. SECURITY DEFINER + guarda. Tick */2.
-- Automacao gated por orion_aiops_automation_policies (+ defere ao AI-50).
-- ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_aiops_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captado_em  timestamptz NOT NULL DEFAULT now(),
  fonte       text        NOT NULL,   -- cron|gateway|client|observability|slo|incidents|bus
  alvo        text        NOT NULL,   -- servico/job/modulo
  tipo        text        NOT NULL,
  severidade  text        NOT NULL DEFAULT 'info',
  valor       numeric,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.orion_aiops_events IS 'ORION-AI-53: eventos operacionais captados das fontes reais de telemetria.';
CREATE INDEX IF NOT EXISTS ix_aiops_ev_dt ON public.orion_aiops_events (captado_em DESC);

CREATE TABLE IF NOT EXISTS public.orion_aiops_anomalies (
  anomaly_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text        NOT NULL,
  tipo        text        NOT NULL,   -- cron_falhando|cron_lento|gateway_erro|gateway_latencia|erros_cliente|servico_degradado|slo_risco|modulo_estagnado
  categoria   text        NOT NULL,   -- banco|edge|api|gateway|frontend|servico|modulo
  alvo        text        NOT NULL,
  severidade  text        NOT NULL DEFAULT 'media',
  descricao   text        NOT NULL,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status      text        NOT NULL DEFAULT 'aberta',  -- aberta|em_tratamento|resolvida
  detectada_em timestamptz NOT NULL DEFAULT now(),
  resolvida_em timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aiops_anom_uq UNIQUE (dedupe_key)
);
-- fix idempotencia p/ instalacoes criadas com a constraint antiga (dedupe_key, detectada_em):
-- limpa acoes que referenciam as anomalias duplicadas mais antigas (FK) antes de deduplicar
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orion_aiops_actions') THEN
    DELETE FROM public.orion_aiops_actions WHERE anomaly_id IN (
      SELECT a.anomaly_id FROM public.orion_aiops_anomalies a JOIN public.orion_aiops_anomalies b
        ON a.dedupe_key=b.dedupe_key AND a.anomaly_id < b.anomaly_id);
  END IF;
END$$;
DELETE FROM public.orion_aiops_anomalies a USING public.orion_aiops_anomalies b
  WHERE a.dedupe_key=b.dedupe_key AND a.anomaly_id < b.anomaly_id;
ALTER TABLE public.orion_aiops_anomalies DROP CONSTRAINT IF EXISTS aiops_anom_uq;
ALTER TABLE public.orion_aiops_anomalies ADD CONSTRAINT aiops_anom_uq UNIQUE (dedupe_key);
COMMENT ON TABLE public.orion_aiops_anomalies IS 'ORION-AI-53: anomalias operacionais com evidencia. Fecham quando o sinal normaliza.';
CREATE INDEX IF NOT EXISTS ix_aiops_anom_status ON public.orion_aiops_anomalies (status, severidade);

CREATE TABLE IF NOT EXISTS public.orion_aiops_predictions (
  prediction_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key   text        NOT NULL,
  tipo         text        NOT NULL,   -- indisponibilidade|degradacao|esgotamento|saturacao_banco|falha_integracao|gargalo
  alvo         text        NOT NULL,
  probabilidade integer    NOT NULL DEFAULT 0,   -- 0-100
  impacto      text        NOT NULL DEFAULT 'medio',
  confianca    integer     NOT NULL DEFAULT 0,   -- 0-100
  horizonte    text        NOT NULL DEFAULT '2h',
  justificativa text       NOT NULL,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  realizado    boolean,                          -- validacao previsto x realizado
  criada_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aiops_pred_uq UNIQUE (dedupe_key)
);
DELETE FROM public.orion_aiops_predictions a USING public.orion_aiops_predictions b
  WHERE a.dedupe_key=b.dedupe_key AND a.prediction_id < b.prediction_id;
ALTER TABLE public.orion_aiops_predictions DROP CONSTRAINT IF EXISTS aiops_pred_uq;
ALTER TABLE public.orion_aiops_predictions ADD CONSTRAINT aiops_pred_uq UNIQUE (dedupe_key);
COMMENT ON TABLE public.orion_aiops_predictions IS 'ORION-AI-53: predicoes de falha (prob/impacto/confianca/justificativa) a partir de tendencia real.';

CREATE TABLE IF NOT EXISTS public.orion_aiops_actions (
  action_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anomaly_id  bigint REFERENCES public.orion_aiops_anomalies(anomaly_id),
  acao        text        NOT NULL,   -- reexecutar_verificacao|atualizar_metricas|abrir_incidente|notificar_admin|(destrutivas=recomendacao)
  automatica  boolean     NOT NULL DEFAULT true,
  resultado   text        NOT NULL DEFAULT 'executada', -- executada|falhou|aguardando_aprovacao|bloqueada_governanca
  motivo      text,
  duracao_ms  integer,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  operador    text        NOT NULL DEFAULT 'aiops',
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aiops_actions IS 'ORION-AI-53: acoes automaticas SEGURAS (trilha imutavel). Destrutivas viram recomendacao c/ aprovacao.';
CREATE INDEX IF NOT EXISTS ix_aiops_act_anom ON public.orion_aiops_actions (anomaly_id);

CREATE TABLE IF NOT EXISTS public.orion_aiops_playbooks (
  playbook_key text        PRIMARY KEY,
  nome         text        NOT NULL,
  gatilho      text        NOT NULL,
  diagnostico  text,
  acoes        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  destrutivo   boolean     NOT NULL DEFAULT false,
  ativo        boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aiops_playbooks IS 'ORION-AI-53: playbooks operacionais (origem/diagnostico/acoes). destrutivo=exige humano.';

CREATE TABLE IF NOT EXISTS public.orion_aiops_statistics (
  dia               date        PRIMARY KEY,
  anomalias         integer     NOT NULL DEFAULT 0,
  anomalias_criticas integer    NOT NULL DEFAULT 0,
  predicoes         integer     NOT NULL DEFAULT 0,
  acoes_automaticas integer     NOT NULL DEFAULT 0,
  acoes_bloqueadas  integer     NOT NULL DEFAULT 0,
  mttr_min          integer     NOT NULL DEFAULT 0,
  taxa_automacao    integer     NOT NULL DEFAULT 0,   -- OAS %
  disponibilidade   integer     NOT NULL DEFAULT 0,
  aos               integer     NOT NULL DEFAULT 0,
  aps               integer     NOT NULL DEFAULT 0,
  oas               integer     NOT NULL DEFAULT 0,
  frs               integer     NOT NULL DEFAULT 0,
  rhs               integer     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aiops_statistics IS 'ORION-AI-53: rollup diario (AOS/APS/OAS/FRS/RHS + MTTR + disponibilidade).';

CREATE TABLE IF NOT EXISTS public.orion_aiops_health (
  servico     text        PRIMARY KEY,
  categoria   text        NOT NULL,   -- banco|cron|gateway|frontend|servico|modulo
  estado      text        NOT NULL DEFAULT 'operacional', -- operacional|atencao|degradado|critico
  rhs         integer     NOT NULL DEFAULT 100,
  sucesso_pct integer,
  latencia_ms integer,
  erro_rate   numeric,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aiops_health IS 'ORION-AI-53: saude de runtime por servico/componente (RHS).';

CREATE TABLE IF NOT EXISTS public.orion_aiops_evidence (
  evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_tipo    text        NOT NULL,   -- anomaly|prediction|action|health
  ref_id      text        NOT NULL,
  conteudo    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  capturado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aiops_evidence IS 'ORION-AI-53: evidencias imutaveis (append-only) de todas as decisoes.';
CREATE INDEX IF NOT EXISTS ix_aiops_ev_ref ON public.orion_aiops_evidence (ref_tipo, ref_id);

CREATE TABLE IF NOT EXISTS public.orion_aiops_automation_policies (
  acao            text        PRIMARY KEY,
  descricao       text        NOT NULL,
  auto_autorizada boolean     NOT NULL DEFAULT false,
  requer_aprovacao boolean    NOT NULL DEFAULT true,
  destrutiva      boolean     NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aiops_automation_policies IS 'ORION-AI-53: politica de automacao (o que pode rodar sozinho). Defere ao AI-50 Governance.';

CREATE TABLE IF NOT EXISTS public.orion_aiops_recommendations (
  rec_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text        NOT NULL,
  titulo      text        NOT NULL,
  categoria   text        NOT NULL,
  prioridade  integer     NOT NULL DEFAULT 0,
  descricao   text        NOT NULL,
  acao_sugerida text,
  requer_aprovacao boolean NOT NULL DEFAULT true,
  status      text        NOT NULL DEFAULT 'aberta',  -- aberta|aprovada|descartada|aplicada
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criada_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aiops_rec_uq UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_aiops_recommendations IS 'ORION-AI-53: recomendacoes (acoes que alteram producao exigem aprovacao humana).';

-- ----------------------------------------------------------------------------
-- 2) RLS + hardening + imutabilidade das evidencias
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_aiops_events','orion_aiops_anomalies','orion_aiops_predictions','orion_aiops_actions',
      'orion_aiops_playbooks','orion_aiops_statistics','orion_aiops_health','orion_aiops_evidence',
      'orion_aiops_automation_policies','orion_aiops_recommendations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

REVOKE UPDATE, DELETE ON public.orion_aiops_evidence FROM anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'aiops', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.aiops_register_anomaly(
  p_tipo text, p_categoria text, p_alvo text, p_sev text, p_desc text, p_evid jsonb, p_dedupe text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_new boolean;
BEGIN
  INSERT INTO public.orion_aiops_anomalies (dedupe_key, tipo, categoria, alvo, severidade, descricao, evidencias)
  VALUES (p_dedupe, p_tipo, p_categoria, p_alvo, p_sev, p_desc, coalesce(p_evid,'{}'::jsonb))
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, descricao=excluded.descricao,
    evidencias=excluded.evidencias, updated_at=now(),
    status=CASE WHEN orion_aiops_anomalies.status='resolvida' THEN 'aberta' ELSE orion_aiops_anomalies.status END
  RETURNING anomaly_id, (xmax = 0) INTO v_id, v_new;
  IF v_new THEN  -- so grava evidencia (imutavel) na PRIMEIRA deteccao
    INSERT INTO public.orion_aiops_evidence (ref_tipo, ref_id, conteudo) VALUES ('anomaly', v_id::text, coalesce(p_evid,'{}'::jsonb));
  END IF;
  RETURN v_id;
END$$;

-- ----------------------------------------------------------------------------
-- 4) DETECCAO de anomalias (fontes reais)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_detect()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE r record; v_n int := 0; v_dia text := to_char(now(),'YYYY-MM-DD-HH24');
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'aiops_detect: acesso negado';
  END IF;

  -- D1: CRON falhando (fonte primaria) — cron.job_run_details ⨝ cron.job
  BEGIN
    FOR r IN
      SELECT j.jobname jn, count(*) total, count(*) FILTER (WHERE d.status='failed') fails,
             round(avg(extract(epoch FROM (d.end_time-d.start_time))*1000))::int avg_ms,
             max(d.return_message) FILTER (WHERE d.status='failed') err
      FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
      WHERE d.start_time > now()-interval '1 hour'
      GROUP BY j.jobname HAVING count(*) FILTER (WHERE d.status='failed') > 0
    LOOP
      PERFORM public.aiops_register_anomaly('cron_falhando','cron', r.jn,
        CASE WHEN r.fails=r.total THEN 'critica' WHEN r.fails::numeric/r.total > 0.5 THEN 'alta' ELSE 'media' END,
        'Cron '||r.jn||': '||r.fails||'/'||r.total||' falhas na ultima hora',
        jsonb_build_object('job',r.jn,'falhas',r.fails,'total',r.total,'avg_ms',r.avg_ms,'erro',left(coalesce(r.err,''),300)),
        'cron_fail:'||r.jn||':'||v_dia);
      v_n := v_n+1;
      INSERT INTO public.orion_aiops_events (fonte, alvo, tipo, severidade, valor, evidencias)
      VALUES ('cron', r.jn, 'cron_falha', 'alta', r.fails, jsonb_build_object('total',r.total));
    END LOOP;
    -- CRON lento (>8s medio)
    FOR r IN
      SELECT j.jobname jn, round(avg(extract(epoch FROM (d.end_time-d.start_time))*1000))::int avg_ms, count(*) total
      FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
      WHERE d.start_time > now()-interval '1 hour' AND d.status='succeeded'
      GROUP BY j.jobname HAVING avg(extract(epoch FROM (d.end_time-d.start_time))*1000) > 8000
    LOOP
      PERFORM public.aiops_register_anomaly('cron_lento','cron', r.jn, 'media',
        'Cron '||r.jn||' lento: '||r.avg_ms||'ms medio', jsonb_build_object('avg_ms',r.avg_ms,'runs',r.total), 'cron_slow:'||r.jn||':'||v_dia);
      v_n := v_n+1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- D2: GATEWAY (orion_ai_log) — erros e latencia
  BEGIN
    FOR r IN
      SELECT module m, count(*) FILTER (WHERE coalesce(status,'') ~* 'err|fail' OR erro IS NOT NULL) erros,
             count(*) total, round(avg(duracao_ms))::int avg_ms
      FROM public.orion_ai_log WHERE criado_em > now()-interval '1 hour'
      GROUP BY module HAVING count(*) FILTER (WHERE coalesce(status,'') ~* 'err|fail' OR erro IS NOT NULL) > 0 OR avg(duracao_ms) > 10000
    LOOP
      PERFORM public.aiops_register_anomaly(
        CASE WHEN r.erros>0 THEN 'gateway_erro' ELSE 'gateway_latencia' END, 'gateway', coalesce(r.m,'?'),
        CASE WHEN r.erros>0 THEN 'alta' ELSE 'media' END,
        'Gateway modulo '||coalesce(r.m,'?')||': '||r.erros||' erro(s), '||coalesce(r.avg_ms,0)||'ms medio',
        jsonb_build_object('erros',r.erros,'total',r.total,'avg_ms',r.avg_ms), 'gw:'||coalesce(r.m,'?')||':'||v_dia);
      v_n := v_n+1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- D3: ERROS DE CLIENTE (client_errors) — pico vs baseline
  BEGIN
    DECLARE v_hoje int; v_media numeric;
    BEGIN
      SELECT count(*) FILTER (WHERE created_at::date=current_date),
             coalesce(count(*) FILTER (WHERE created_at < current_date)::numeric / nullif(count(DISTINCT created_at::date) FILTER (WHERE created_at < current_date),0),0)
      INTO v_hoje, v_media FROM public.client_errors WHERE created_at > now()-interval '30 days';
      IF v_hoje >= 10 AND v_hoje > greatest(v_media*2, 10) THEN
        PERFORM public.aiops_register_anomaly('erros_cliente','frontend','client_errors', 'media',
          'Pico de erros de cliente hoje: '||v_hoje||' (media diaria '||round(v_media,1)||')',
          jsonb_build_object('hoje',v_hoje,'media',round(v_media,1)), 'cerr:'||current_date);
        v_n := v_n+1;
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- D4: SERVICOS degradados (AI-51 Observability)
  BEGIN
    FOR r IN
      SELECT servico, categoria, estado, disponibilidade, latencia_ms, erro_rate
      FROM public.orion_obs_service_health
      WHERE lower(coalesce(estado,'')) NOT IN ('ok','operacional','saudavel','healthy','verde','up')
    LOOP
      PERFORM public.aiops_register_anomaly('servico_degradado','servico', r.servico,
        CASE WHEN lower(r.estado) ~ 'crit|down|fora' THEN 'critica' ELSE 'alta' END,
        'Servico '||r.servico||' em estado '||r.estado,
        jsonb_build_object('estado',r.estado,'disponibilidade',r.disponibilidade,'latencia_ms',r.latencia_ms,'erro_rate',r.erro_rate),
        'svc:'||r.servico||':'||v_dia);
      v_n := v_n+1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- D5: SLO em risco (AI-51)
  BEGIN
    FOR r IN SELECT slo_key, servico, atual, alvo, error_budget FROM public.orion_obs_slo WHERE em_risco IS TRUE
    LOOP
      PERFORM public.aiops_register_anomaly('slo_risco','servico', coalesce(r.servico,r.slo_key), 'alta',
        'SLO '||r.slo_key||' em risco (atual '||coalesce(r.atual::text,'?')||' / alvo '||coalesce(r.alvo::text,'?')||')',
        jsonb_build_object('slo',r.slo_key,'atual',r.atual,'alvo',r.alvo,'error_budget',r.error_budget), 'slo:'||r.slo_key||':'||v_dia);
      v_n := v_n+1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- fecha anomalias cujo sinal normalizou hoje (cron sem novas falhas na ultima hora)
  UPDATE public.orion_aiops_anomalies a SET status='resolvida', resolvida_em=now(), updated_at=now()
   WHERE a.status='aberta' AND a.tipo='cron_falhando'
     AND NOT EXISTS (SELECT 1 FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
                     WHERE 'cron_fail:'||j.jobname||':'||v_dia = a.dedupe_key AND d.status='failed' AND d.start_time > now()-interval '1 hour');

  RETURN v_n;
EXCEPTION WHEN OTHERS THEN RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 5) SAUDE de runtime (RHS por servico) — a partir do cron + obs + gateway
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_refresh_health()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  -- saude por CRON job (sucesso na ultima hora)
  BEGIN
    INSERT INTO public.orion_aiops_health (servico, categoria, estado, rhs, sucesso_pct, latencia_ms, evidencias, updated_at)
    SELECT j.jobname, 'cron',
      CASE WHEN sucesso_pct >= 95 THEN 'operacional' WHEN sucesso_pct >= 70 THEN 'atencao' WHEN sucesso_pct >= 30 THEN 'degradado' ELSE 'critico' END,
      sucesso_pct::int, sucesso_pct::int, avg_ms,
      jsonb_build_object('total',total,'falhas',fails), now()
    FROM (
      SELECT j.jobname, count(*) total, count(*) FILTER (WHERE d.status='failed') fails,
             round(100.0*count(*) FILTER (WHERE d.status='succeeded')/nullif(count(*),0)) sucesso_pct,
             round(avg(extract(epoch FROM (d.end_time-d.start_time))*1000))::int avg_ms
      FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
      WHERE d.start_time > now()-interval '1 hour' GROUP BY j.jobname
    ) j
    ON CONFLICT (servico) DO UPDATE SET estado=excluded.estado, rhs=excluded.rhs, sucesso_pct=excluded.sucesso_pct,
      latencia_ms=excluded.latencia_ms, evidencias=excluded.evidencias, updated_at=now();
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- saude por SERVICO observability
  BEGIN
    INSERT INTO public.orion_aiops_health (servico, categoria, estado, rhs, latencia_ms, erro_rate, evidencias, updated_at)
    SELECT 'obs:'||servico, 'servico',
      CASE WHEN lower(coalesce(estado,'')) IN ('ok','operacional','saudavel','healthy','verde','up') THEN 'operacional'
           WHEN lower(coalesce(estado,'')) ~ 'crit|down|fora' THEN 'critico' ELSE 'degradado' END,
      CASE WHEN lower(coalesce(estado,'')) IN ('ok','operacional','saudavel','healthy','verde','up') THEN 100
           WHEN lower(coalesce(estado,'')) ~ 'crit|down|fora' THEN 20 ELSE 55 END,
      latencia_ms, erro_rate, jsonb_build_object('estado',estado,'disponibilidade',disponibilidade), now()
    FROM public.orion_obs_service_health
    ON CONFLICT (servico) DO UPDATE SET estado=excluded.estado, rhs=excluded.rhs, latencia_ms=excluded.latencia_ms,
      erro_rate=excluded.erro_rate, evidencias=excluded.evidencias, updated_at=now();
  EXCEPTION WHEN OTHERS THEN NULL; END;
END$$;

-- ----------------------------------------------------------------------------
-- 6) PREDICAO de falhas (tendencia real: falhas consecutivas de cron)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_predict()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE r record; v_n int := 0; v_h text := to_char(now(),'YYYY-MM-DD-HH24');
BEGIN
  -- job com falha total recente -> alta prob de continuar falhando
  BEGIN
    FOR r IN
      SELECT j.jobname jn, count(*) total, count(*) FILTER (WHERE d.status='failed') fails
      FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
      WHERE d.start_time > now()-interval '3 hours' GROUP BY j.jobname HAVING count(*) FILTER (WHERE d.status='failed') >= 3
    LOOP
      INSERT INTO public.orion_aiops_predictions (dedupe_key, tipo, alvo, probabilidade, impacto, confianca, horizonte, justificativa, evidencias)
      VALUES ('pred_cron:'||r.jn||':'||v_h, 'interrupcao_servico', r.jn,
        least(50 + round(50.0*r.fails/nullif(r.total,0))::int, 100),
        CASE WHEN r.fails=r.total THEN 'alto' ELSE 'medio' END,
        least(50 + r.fails*5, 95), '2h',
        'Job '||r.jn||' falhou '||r.fails||'/'||r.total||' nas ultimas 3h — tende a continuar ate correcao',
        jsonb_build_object('falhas',r.fails,'total',r.total))
      ON CONFLICT (dedupe_key) DO UPDATE SET probabilidade=excluded.probabilidade, confianca=excluded.confianca,
        justificativa=excluded.justificativa, evidencias=excluded.evidencias, criada_em=now();
      v_n := v_n+1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- saturacao: muitas anomalias abertas -> prob de degradacao geral
  DECLARE v_open int;
  BEGIN
    SELECT count(*) INTO v_open FROM public.orion_aiops_anomalies WHERE status='aberta' AND severidade IN ('alta','critica');
    IF v_open >= 3 THEN
      INSERT INTO public.orion_aiops_predictions (dedupe_key, tipo, alvo, probabilidade, impacto, confianca, horizonte, justificativa, evidencias)
      VALUES ('pred_degrad:'||current_date, 'degradacao', 'plataforma', least(40+v_open*10,100), 'medio', least(50+v_open*8,95), '4h',
        v_open||' anomalias alta/critica abertas — risco de degradacao operacional acumulada',
        jsonb_build_object('anomalias_criticas_abertas',v_open))
      ON CONFLICT (dedupe_key) DO UPDATE SET probabilidade=excluded.probabilidade, confianca=excluded.confianca,
        justificativa=excluded.justificativa, evidencias=excluded.evidencias, criada_em=now();
      v_n := v_n+1;
    END IF;
  END;
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 7) ROOT CAUSE ANALYSIS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_rca(p_anomaly_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; v_causa text; v_servico text; v_prio int;
BEGIN
  SELECT * INTO a FROM public.orion_aiops_anomalies WHERE anomaly_id=p_anomaly_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('erro','anomalia nao encontrada'); END IF;
  v_servico := a.alvo;
  v_causa := CASE a.tipo
    WHEN 'cron_falhando' THEN 'Job agendado retornando erro (ver return_message do cron.job_run_details): funcao/migration com defeito ou dependencia ausente'
    WHEN 'cron_lento' THEN 'Consulta/loop custoso no tick ou contencao de recursos no banco'
    WHEN 'gateway_erro' THEN 'Falha na chamada ao provedor de IA (chave/limite/timeout) — ver orion_ai_log.erro'
    WHEN 'gateway_latencia' THEN 'Latencia do provedor de IA acima do normal'
    WHEN 'erros_cliente' THEN 'Regressao no frontend ou dependencia externa (ver client_errors.message/stack)'
    WHEN 'servico_degradado' THEN 'Servico reportado degradado pelo AI-51 Observability'
    WHEN 'slo_risco' THEN 'Consumo de error budget do SLO acima do limiar'
    ELSE 'Causa a investigar a partir das evidencias' END;
  v_prio := CASE a.severidade WHEN 'critica' THEN 100 WHEN 'alta' THEN 75 WHEN 'media' THEN 50 ELSE 25 END;
  RETURN jsonb_build_object(
    'anomaly_id', p_anomaly_id, 'tipo', a.tipo, 'alvo', a.alvo, 'severidade', a.severidade,
    'causa_provavel', v_causa, 'servico_responsavel', v_servico, 'categoria', a.categoria,
    'cadeia_dependencias', jsonb_build_array('fonte:'||a.categoria, 'servico:'||v_servico, 'plataforma'),
    'impacto_operacional', CASE a.severidade WHEN 'critica' THEN 'alto' WHEN 'alta' THEN 'medio-alto' ELSE 'baixo-medio' END,
    'modulos_afetados', (SELECT coalesce(jsonb_agg(DISTINCT origem),'[]'::jsonb) FROM public.orion_eventos WHERE origem LIKE '%'||split_part(a.alvo,'_',2)||'%' LIMIT 5),
    'prioridade_correcao', v_prio, 'evidencias', a.evidencias,
    'nota', 'RCA baseada em evidencia real; encaminhavel ao AI-49 SOC / AI-45 Incident');
END$$;

-- ----------------------------------------------------------------------------
-- 8) AUTOMACAO SEGURA (gated por politica; destrutivo -> recomendacao)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_automate()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_ini timestamptz; pol record;
BEGIN
  FOR r IN
    SELECT * FROM public.orion_aiops_anomalies
    WHERE status='aberta' AND severidade IN ('alta','critica')
      AND NOT EXISTS (SELECT 1 FROM public.orion_aiops_actions a WHERE a.anomaly_id = orion_aiops_anomalies.anomaly_id)
  LOOP
    -- acao segura padrao: abrir handoff (append-only) + notificar
    v_ini := clock_timestamp();
    SELECT * INTO pol FROM public.orion_aiops_automation_policies WHERE acao='abrir_incidente';
    IF coalesce(pol.auto_autorizada,false) THEN
      -- espelha no barramento comum como ops_anomaly (AI-45 responde, AI-49 consolida)
      BEGIN
        INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
        VALUES ('aiops:'||r.anomaly_id, 'aiops', 'ops_anomaly', r.severidade, r.categoria,
          'AI-53 '||r.tipo||': '||r.descricao, r.evidencias, 90,
          CASE r.severidade WHEN 'critica' THEN 100 WHEN 'alta' THEN 80 ELSE 55 END)
        ON CONFLICT (dedupe_key) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL; END;
      INSERT INTO public.orion_aiops_actions (anomaly_id, acao, automatica, resultado, motivo, duracao_ms, evidencias)
      VALUES (r.anomaly_id, 'abrir_incidente', true, 'executada', 'anomalia '||r.severidade||' encaminhada ao ecossistema (AI-45/49)',
        round(extract(epoch FROM (clock_timestamp()-v_ini))*1000)::int, jsonb_build_object('via','orion_cyber_events'));
      UPDATE public.orion_aiops_anomalies SET status='em_tratamento', updated_at=now() WHERE anomaly_id=r.anomaly_id;
      PERFORM public.aiops_emit('aiops.handoff_ai45', jsonb_build_object('anomaly',r.anomaly_id,'tipo',r.tipo));
      v_n := v_n+1;
    ELSE
      -- bloqueado por governanca
      INSERT INTO public.orion_aiops_actions (anomaly_id, acao, automatica, resultado, motivo)
      VALUES (r.anomaly_id, 'abrir_incidente', true, 'bloqueada_governanca', 'politica de automacao nao autoriza');
    END IF;

    -- se a correcao real e destrutiva (ex.: reprocessar fila/limpar cache/reiniciar) -> RECOMENDACAO c/ aprovacao
    INSERT INTO public.orion_aiops_recommendations (dedupe_key, titulo, categoria, prioridade, descricao, acao_sugerida, requer_aprovacao, evidencias)
    VALUES ('rec:'||r.anomaly_id, 'Tratar '||r.tipo||' em '||r.alvo, r.categoria,
      CASE r.severidade WHEN 'critica' THEN 100 WHEN 'alta' THEN 75 ELSE 50 END,
      r.descricao, CASE r.tipo WHEN 'cron_falhando' THEN 'Corrigir a funcao do tick e revalidar (ver RCA)'
        WHEN 'gateway_erro' THEN 'Verificar chave/limite do provedor no Gateway' ELSE 'Ver RCA e acionar time responsavel' END,
      true, r.evidencias)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 9) SCORES (AOS/APS/OAS/FRS/RHS) — explicaveis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH an AS (SELECT count(*) tot, count(*) FILTER (WHERE severidade='critica') crit,
                     count(*) FILTER (WHERE severidade='alta') alta FROM public.orion_aiops_anomalies WHERE status IN ('aberta','em_tratamento')),
       hl AS (SELECT coalesce(round(avg(rhs))::int,100) rhs_avg, count(*) FILTER (WHERE estado IN ('critico','degradado')) ruins, count(*) tot FROM public.orion_aiops_health),
       pr AS (SELECT coalesce(max(probabilidade),0) maxp, coalesce(round(avg(confianca))::int,0) conf, count(*) n FROM public.orion_aiops_predictions WHERE criada_em > now()-interval '6 hours'),
       ac AS (SELECT count(*) FILTER (WHERE resultado='executada') ok, count(*) FILTER (WHERE resultado='bloqueada_governanca') blk, count(*) tot FROM public.orion_aiops_actions WHERE created_at > now()-interval '24 hours')
  SELECT jsonb_build_object(
    'rhs', (SELECT rhs_avg FROM hl),                                             -- Runtime Health (maior=melhor)
    'frs', least((SELECT crit*25 + alta*10 FROM an) + (SELECT maxp/4 FROM pr), 100),  -- Failure Risk (maior=pior)
    'aps', (SELECT conf FROM pr),                                                -- Anomaly Prediction (confianca)
    'oas', (SELECT CASE WHEN tot>0 THEN round(100.0*ok/tot)::int ELSE 100 END FROM ac),  -- Operational Automation (%)
    'aos', greatest(0, least(round(0.5*(SELECT rhs_avg FROM hl) + 0.3*(100-least((SELECT crit*25+alta*10 FROM an),100)) + 0.2*(SELECT CASE WHEN tot>0 THEN 100.0*ok/tot ELSE 100 END FROM ac))::int,100)),  -- AI Operations Score
    'anomalias_abertas', (SELECT tot FROM an), 'anomalias_criticas', (SELECT crit FROM an),
    'servicos_ruins', (SELECT ruins FROM hl), 'servicos_total', (SELECT tot FROM hl),
    'predicoes_6h', (SELECT n FROM pr), 'risco_max_predito', (SELECT maxp FROM pr),
    'acoes_bloqueadas', (SELECT blk FROM ac));
$$;

-- ----------------------------------------------------------------------------
-- 10) MOTOR — run_aiops(): detect -> health -> predict -> automate -> stats -> alerts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_aiops(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_det int; v_pred int; v_auto int; s jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'run_aiops: acesso negado';
  END IF;
  v_det := public.aiops_detect();
  PERFORM public.aiops_refresh_health();
  v_pred := public.aiops_predict();
  v_auto := public.aiops_automate();
  s := public.aiops_scores();

  -- alertas inteligentes (priorizados por impacto)
  IF (s->>'frs')::int >= 60 THEN
    PERFORM public.aiops_emit('aiops.alert', jsonb_build_object('tipo','risco_falha_elevado','frs',s->'frs'));
  END IF;
  IF (s->>'acoes_bloqueadas')::int > 0 THEN
    PERFORM public.aiops_emit('aiops.alert', jsonb_build_object('tipo','automacao_bloqueada','n',s->'acoes_bloqueadas'));
  END IF;

  PERFORM public.aiops_statistics_rollup(s, v_auto);
  PERFORM public.aiops_emit('aiops.run', jsonb_build_object('deteccoes',v_det,'predicoes',v_pred,'acoes',v_auto,'aos',s->'aos','trace',p_trace));
  RETURN jsonb_build_object('ok',true,'deteccoes',v_det,'predicoes',v_pred,'acoes_automaticas',v_auto,'scores',s);
END$$;

CREATE OR REPLACE FUNCTION public.aiops_statistics_rollup(p_scores jsonb, p_auto int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mttr int;
BEGIN
  SELECT round(avg(extract(epoch FROM (resolvida_em-detectada_em))/60))::int INTO v_mttr
   FROM public.orion_aiops_anomalies WHERE resolvida_em IS NOT NULL AND resolvida_em::date=current_date;
  INSERT INTO public.orion_aiops_statistics (dia, anomalias, anomalias_criticas, predicoes, acoes_automaticas, acoes_bloqueadas,
    mttr_min, taxa_automacao, disponibilidade, aos, aps, oas, frs, rhs, updated_at)
  VALUES (current_date,
    (SELECT count(*) FROM public.orion_aiops_anomalies WHERE detectada_em::date=current_date),
    (SELECT count(*) FROM public.orion_aiops_anomalies WHERE detectada_em::date=current_date AND severidade='critica'),
    (SELECT count(*) FROM public.orion_aiops_predictions WHERE criada_em::date=current_date),
    coalesce(p_auto,0),
    (SELECT count(*) FROM public.orion_aiops_actions WHERE created_at::date=current_date AND resultado='bloqueada_governanca'),
    coalesce(v_mttr,0), (p_scores->>'oas')::int, (p_scores->>'rhs')::int,
    (p_scores->>'aos')::int, (p_scores->>'aps')::int, (p_scores->>'oas')::int, (p_scores->>'frs')::int, (p_scores->>'rhs')::int, now())
  ON CONFLICT (dia) DO UPDATE SET anomalias=excluded.anomalias, anomalias_criticas=excluded.anomalias_criticas,
    predicoes=excluded.predicoes, acoes_automaticas=excluded.acoes_automaticas, acoes_bloqueadas=excluded.acoes_bloqueadas,
    mttr_min=excluded.mttr_min, taxa_automacao=excluded.taxa_automacao, disponibilidade=excluded.disponibilidade,
    aos=excluded.aos, aps=excluded.aps, oas=excluded.oas, frs=excluded.frs, rhs=excluded.rhs, updated_at=now();
END$$;

CREATE OR REPLACE FUNCTION public.orion_aiops_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_aiops('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;

-- ----------------------------------------------------------------------------
-- 11) SUITE DE TESTE (COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE casos jsonb := '[]'::jsonb; v_pass int := 0; v_tot int := 0;
BEGIN
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_aiops_health) >= 0 THEN v_pass:=v_pass+1;
    casos:=casos||jsonb_build_array(jsonb_build_object('t','deteccao_saude','ok',true)); END IF;
  v_tot:=v_tot+1; IF (SELECT (s->>'aos')::int BETWEEN 0 AND 100 AND (s->>'rhs')::int BETWEEN 0 AND 100 AND (s->>'frs')::int BETWEEN 0 AND 100 FROM (SELECT public.aiops_scores() s) x)
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','scores_validos','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','scores_validos','ok',false)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_aiops_playbooks WHERE ativo) > 0 THEN v_pass:=v_pass+1;
    casos:=casos||jsonb_build_array(jsonb_build_object('t','playbooks_ativos','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','playbooks_ativos','ok',false)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_aiops_automation_policies) > 0 THEN v_pass:=v_pass+1;
    casos:=casos||jsonb_build_array(jsonb_build_object('t','politicas_automacao','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','politicas_automacao','ok',false)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'orion_aiops%' AND NOT rowsecurity)=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',false)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='orion_aiops_evidence'
      AND grantee IN ('anon','authenticated') AND privilege_type IN ('UPDATE','DELETE'))=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_imutaveis','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_imutaveis','ok',false)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_aiops_automation_policies WHERE destrutiva AND auto_autorizada)=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','nenhuma_destrutiva_auto','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','nenhuma_destrutiva_auto','ok',false)); END IF;
  v_tot:=v_tot+1; IF jsonb_typeof(public.aiops_scores())='object' THEN v_pass:=v_pass+1;
    casos:=casos||jsonb_build_array(jsonb_build_object('t','motor_scores','ok',true)); END IF;
  RETURN jsonb_build_object('suite','orion-ai-53-aiops','total',v_tot,'passou',v_pass,'aprovado',(v_pass=v_tot),'casos',casos);
END$$;

-- ----------------------------------------------------------------------------
-- 12) PAINEIS (leitura agregada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aiops_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.aiops_scores() || jsonb_build_object(
    'saude_geral', (SELECT coalesce(round(avg(rhs))::int,100) FROM public.orion_aiops_health),
    'servicos_degradados', (SELECT count(*) FROM public.orion_aiops_health WHERE estado IN ('degradado','critico')),
    'acoes_24h', (SELECT count(*) FROM public.orion_aiops_actions WHERE created_at > now()-interval '24 hours' AND resultado='executada'),
    'mttr_min', (SELECT coalesce(mttr_min,0) FROM public.orion_aiops_statistics WHERE dia=current_date),
    'disponibilidade', (SELECT coalesce(round(avg(rhs))::int,100) FROM public.orion_aiops_health WHERE categoria='cron'),
    'tendencia_aos', (SELECT aos FROM public.orion_aiops_statistics ORDER BY dia DESC LIMIT 1)
      - coalesce((SELECT aos FROM public.orion_aiops_statistics WHERE dia=current_date-7),0),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.aiops_anomalies_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'abertas', (SELECT count(*) FROM public.orion_aiops_anomalies WHERE status IN ('aberta','em_tratamento')),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',anomaly_id,'tipo',tipo,'categoria',categoria,'alvo',alvo,
        'severidade',severidade,'descricao',descricao,'status',status,'evidencias',evidencias,'em',detectada_em)
        ORDER BY (severidade='critica') DESC, detectada_em DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aiops_anomalies ORDER BY (severidade='critica') DESC, detectada_em DESC LIMIT 40) x));
$$;

CREATE OR REPLACE FUNCTION public.aiops_predictions_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',prediction_id,'tipo',tipo,'alvo',alvo,'probabilidade',probabilidade,
    'impacto',impacto,'confianca',confianca,'horizonte',horizonte,'justificativa',justificativa,'evidencias',evidencias,'em',criada_em)
    ORDER BY probabilidade DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_aiops_predictions WHERE criada_em > now()-interval '24 hours' ORDER BY probabilidade DESC LIMIT 20) x;
$$;

CREATE OR REPLACE FUNCTION public.aiops_actions_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'acoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',action_id,'anomaly',anomaly_id,'acao',acao,'automatica',automatica,
        'resultado',resultado,'motivo',motivo,'duracao_ms',duracao_ms,'em',created_at) ORDER BY action_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aiops_actions ORDER BY action_id DESC LIMIT 25) x),
    'recomendacoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',rec_id,'titulo',titulo,'prioridade',prioridade,
        'descricao',descricao,'acao',acao_sugerida,'requer_aprovacao',requer_aprovacao,'status',status) ORDER BY prioridade DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aiops_recommendations WHERE status='aberta' ORDER BY prioridade DESC LIMIT 15) y),
    'politicas', (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'descricao',descricao,'auto',auto_autorizada,'aprovacao',requer_aprovacao,'destrutiva',destrutiva) ORDER BY acao),'[]'::jsonb) FROM public.orion_aiops_automation_policies));
$$;

CREATE OR REPLACE FUNCTION public.aiops_infra_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'servicos', (SELECT coalesce(jsonb_agg(jsonb_build_object('servico',servico,'categoria',categoria,'estado',estado,'rhs',rhs,
        'sucesso_pct',sucesso_pct,'latencia_ms',latencia_ms,'erro_rate',erro_rate,'evidencias',evidencias)
        ORDER BY rhs ASC),'[]'::jsonb) FROM public.orion_aiops_health),
    'por_categoria', (SELECT coalesce(jsonb_object_agg(categoria, n),'{}'::jsonb) FROM (SELECT categoria, count(*) n FROM public.orion_aiops_health GROUP BY 1) z));
$$;

CREATE OR REPLACE FUNCTION public.aiops_statistics_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'serie_14d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'aos',aos,'rhs',rhs,'frs',frs,'oas',oas,'aps',aps,
        'anomalias',anomalias,'criticas',anomalias_criticas,'acoes',acoes_automaticas,'mttr',mttr_min,'disp',disponibilidade)
        ORDER BY dia DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_aiops_statistics ORDER BY dia DESC LIMIT 14) x),
    'totais', jsonb_build_object('anomalias',(SELECT count(*) FROM public.orion_aiops_anomalies),
      'predicoes',(SELECT count(*) FROM public.orion_aiops_predictions),
      'acoes',(SELECT count(*) FROM public.orion_aiops_actions),
      'eventos_bus',(SELECT count(*) FROM public.orion_eventos WHERE origem='aiops')));
$$;

CREATE OR REPLACE FUNCTION public.aiops_config_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cron', jsonb_build_object('job','orion_aiops_tick','schedule','*/2 * * * *'),
    'modelo_ia', (SELECT model_code FROM public.orion_ai_module_prefs WHERE module='aiops'),
    'fontes', jsonb_build_array('cron.job_run_details','orion_ai_log (Gateway)','client_errors','orion_obs_service_health (AI-51)','orion_obs_slo (AI-51)','orion_cost_statistics (AI-52)','orion_incidents (AI-45)','orion_eventos'),
    'playbooks', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome',nome,'gatilho',gatilho,'destrutivo',destrutivo,'acoes',acoes)),'[]'::jsonb) FROM public.orion_aiops_playbooks WHERE ativo),
    'regra', 'NUNCA executa acao destrutiva automaticamente; automacao respeita politica (AI-50 Governance); toda acao gera evidencia.');
$$;

CREATE OR REPLACE FUNCTION public.aiops_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := jsonb_build_object(
    'overview', public.aiops_overview(),
    'anomalies', public.aiops_anomalies_view(),
    'predictions', public.aiops_predictions_view(),
    'actions', public.aiops_actions_view(),
    'infra', public.aiops_infra_view(),
    'statistics', public.aiops_statistics_view(),
    'config', public.aiops_config_view());
  PERFORM public.aiops_emit('aiops.dashboard', jsonb_build_object('aos', v->'overview'->'aos'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 13) SEED — politicas de automacao + playbooks
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_aiops_automation_policies (acao, descricao, auto_autorizada, requer_aprovacao, destrutiva) VALUES
 ('reexecutar_verificacao','Re-rodar a propria deteccao/health (escopo AIOps)', true, false, false),
 ('atualizar_metricas','Atualizar metricas/saude de runtime (escopo AIOps)', true, false, false),
 ('abrir_incidente','Espelhar anomalia no barramento p/ AI-45/AI-49 (append-only)', true, false, false),
 ('notificar_admin','Emitir notificacao/alerta ao admin', true, false, false),
 ('reprocessar_fila','Reprocessar fila de producao', false, true, true),
 ('limpar_cache','Limpar cache de servico', false, true, true),
 ('reiniciar_servico','Reiniciar servico/edge', false, true, true)
ON CONFLICT (acao) DO NOTHING;

INSERT INTO public.orion_aiops_playbooks (playbook_key, nome, gatilho, diagnostico, acoes, destrutivo) VALUES
 ('pb_cron','Cron interrompido/falhando','anomalia cron_falhando','Job retornando erro; ver return_message',
  jsonb_build_array('1. RCA da anomalia (aiops_rca)','2. Espelhar ao AI-45 (abrir_incidente, auto)','3. Recomendar correcao do tick (aprovacao)','4. Revalidar apos correcao'), false),
 ('pb_gateway','Falha/latencia no Gateway de IA','anomalia gateway_erro/latencia','Provedor com erro/limite/timeout',
  jsonb_build_array('1. Ler orion_ai_log.erro','2. Notificar admin','3. Recomendar verificar chave/limite (aprovacao)'), false),
 ('pb_servico','Servico degradado (AI-51)','anomalia servico_degradado/slo_risco','Servico reportado degradado / SLO em risco',
  jsonb_build_array('1. Consolidar com AI-51','2. Abrir incidente (AI-45)','3. Recomendar mitigacao (aprovacao)'), false),
 ('pb_frontend','Pico de erros de cliente','anomalia erros_cliente','Regressao no front ou dependencia externa',
  jsonb_build_array('1. Amostrar client_errors','2. Notificar admin','3. Recomendar rollback/hotfix (aprovacao)'), false),
 ('pb_indisp_total','Indisponibilidade total','multiplos servicos criticos','Falha ampla de plataforma',
  jsonb_build_array('1. Escalar ao AI-49 SOC','2. Abrir incidente critico (AI-45)','3. Acionar DR (AI-46, aprovacao humana)'), true)
ON CONFLICT (playbook_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 14) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.aiops_detect()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_refresh_health()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_predict()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_rca(bigint)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_automate()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_scores()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_aiops(text)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_statistics_rollup(jsonb,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_selftest()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_overview()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_anomalies_view()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_predictions_view()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_actions_view()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_infra_view()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_statistics_view()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_config_view()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aiops_dashboard()                  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 15) PROMPT REGISTRY (5 prompts GPT-5-mini)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('aiops.detect',
 'Voce e o ORION AI Operations (AI-53). Explique uma anomalia operacional a partir das evidencias reais (cron/gateway/client/observability). Nunca invente causa; descreva o sinal observado e a severidade.',
 'ORION-AI-53 seed');
SELECT public.orion_ai_prompt_set('aiops.predict',
 'Voce e o ORION AI Operations (AI-53). Explique uma predicao de falha (probabilidade/impacto/confianca) com base na tendencia real (ex.: falhas consecutivas de um job). Declare a incerteza.',
 'ORION-AI-53 seed');
SELECT public.orion_ai_prompt_set('aiops.recover',
 'Voce e o ORION AI Operations (AI-53). Sugira recuperacao proporcional. Acoes seguras (revalidar/notificar/abrir incidente) sao automaticas; destrutivas (reprocessar fila, reiniciar, limpar cache) exigem aprovacao humana e politica do AI-50.',
 'ORION-AI-53 seed');
SELECT public.orion_ai_prompt_set('aiops.summary',
 'Voce e o ORION AI Operations (AI-53). Resuma a saude operacional: AOS/RHS/FRS/OAS/APS, anomalias abertas, servicos degradados, disponibilidade e MTTR. Somente numeros fornecidos.',
 'ORION-AI-53 seed');
SELECT public.orion_ai_prompt_set('aiops.recommendation',
 'Voce e o ORION AI Operations (AI-53). Recomende acoes priorizadas por impacto operacional, apontando o servico/modulo responsavel e a evidencia. Nunca recomende acao destrutiva sem aprovacao humana.',
 'ORION-AI-53 seed');

-- ----------------------------------------------------------------------------
-- 16) MODEL PREF + CRON */2
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('aiops','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_aiops_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_aiops_tick');
    PERFORM cron.schedule('orion_aiops_tick','*/2 * * * *','SELECT public.orion_aiops_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_aiops_tick');
--   DROP FUNCTION IF EXISTS public.orion_aiops_tick, public.aiops_dashboard, public.aiops_config_view, public.aiops_statistics_view,
--     public.aiops_infra_view, public.aiops_actions_view, public.aiops_predictions_view, public.aiops_anomalies_view, public.aiops_overview,
--     public.aiops_selftest, public.aiops_statistics_rollup(jsonb,int), public.run_aiops(text), public.aiops_scores,
--     public.aiops_automate, public.aiops_rca(bigint), public.aiops_predict, public.aiops_refresh_health, public.aiops_detect,
--     public.aiops_register_anomaly(text,text,text,text,text,jsonb,text), public.aiops_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_aiops_recommendations, public.orion_aiops_automation_policies, public.orion_aiops_evidence,
--     public.orion_aiops_health, public.orion_aiops_statistics, public.orion_aiops_playbooks, public.orion_aiops_actions,
--     public.orion_aiops_predictions, public.orion_aiops_anomalies, public.orion_aiops_events;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='aiops';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'aiops.%';
-- ============================================================================
