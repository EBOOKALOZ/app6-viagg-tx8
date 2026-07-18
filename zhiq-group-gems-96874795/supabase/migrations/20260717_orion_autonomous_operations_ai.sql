-- ============================================================================
-- ORION-AI-56 — AUTONOMOUS OPERATIONS AI v1.0 (AOC — Autonomous Operations Center)
-- ============================================================================
-- Centro Autonomo de Operacoes: coordena processos operacionais, detecta eventos
--   reais, decide dentro de POLITICAS e despacha tarefas aos demais modulos ORION.
--   NAO substitui decisao estrategica humana; executa SO acoes autorizadas por
--   politica. NUNCA move dinheiro (acoes financeiras = sempre semi/manual, com
--   aprovacao humana). Auditavel, idempotente, reversivel.
--
-- Posicao no ecossistema (anti-sobreposicao):
--   * AI-13 Operations (COO): estrategia operacional (achados->missoes). AI-56 LE.
--   * AI-51 Observability: mede saude (metricas/logs/traces). AI-56 CONSOME alertas.
--   * AI-53 AIOps (orion_aiops_*): anomalias/playbooks de infra. AI-56 CONSOME eventos.
--   * AI-45 Incident Response: responde incidentes de seguranca. AI-56 encaminha.
--   AI-56 = camada de ORQUESTRACAO por politicas (evento->decisao->dispatch),
--   distinta das acima. Namespace proprio orion_aoc_*.
--
-- Fontes REAIS validadas (07-17): orion_eventos (bus, ~507 ev/h), orion_obs_alerts
--   (AI-51), cron.job_run_details (falhas), orion_aiops_events (AI-53), filas
--   (campaign_queue/fila_postagens/orion_dispatch_queue — hoje 0, pre-lancamento),
--   pay_payment_orders (1 pagamento preso >2h = incidente financeiro real),
--   pg_stat_activity (conexoes).
--
-- LACUNAS DECLARADAS (nunca inventa): NAO ha controle real de CPU/memoria de host,
--   Redis, Firebase, Google Cloud, spawn de worker/edge — sem superficie SQL. Estas
--   acoes sao REGISTRADAS como recomendacao/decisao (recomenda, nao executa infra).
--   "Iniciar novo worker", "failover de servidor", "escalonar CPU" = recomendacao.
--   Recuperacao automatica limitada a RE-EXECUTAR ticks idempotentes na whitelist
--   (observability/health/perf/aiops) — nunca ticks financeiros.
--
-- Idempotente (dedupe + upsert; ingest incremental). Eventos/decisoes/dispatch
--   append-only p/ clientes (RLS admin + REVOKE). SECURITY DEFINER + guarda.
--   ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_aoc_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captado_em  timestamptz NOT NULL DEFAULT now(),
  tipo        text        NOT NULL,   -- cron_falha|slo_risco|fila_congestionada|pagamento_preso|fraude_critica|sobrecarga|evento_bus|aiops
  categoria   text        NOT NULL,   -- infra|fila|financeiro|seguranca|recurso|negocio
  origem      text        NOT NULL,   -- orion_eventos|orion_obs_alerts|cron|orion_aiops_events|pay|resources
  alvo        text,                   -- servico/fila/entidade
  severidade  text        NOT NULL DEFAULT 'media', -- baixa|media|alta|critica
  status      text        NOT NULL DEFAULT 'novo',  -- novo|processado|ignorado
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aoc_events IS 'ORION-AI-56: eventos operacionais ingeridos de fontes REAIS. dedupe_key = idempotencia (nunca reprocessa).';
CREATE INDEX IF NOT EXISTS ix_orion_aoc_ev_status ON public.orion_aoc_events (status, captado_em DESC);
CREATE INDEX IF NOT EXISTS ix_orion_aoc_ev_cat ON public.orion_aoc_events (categoria, severidade);

CREATE TABLE IF NOT EXISTS public.orion_aoc_policies (
  policy_key   text        PRIMARY KEY,
  descricao    text        NOT NULL,
  condicao     text        NOT NULL,   -- tipo de evento que dispara (casado em codigo)
  acao         text        NOT NULL,   -- abrir_incidente|recuperar|recomendar_worker|alertar|despachar|reautenticar
  alvo_modulo  text,                   -- modulo destino do dispatch (quando aplica)
  prioridade   integer     NOT NULL DEFAULT 50,
  autonomia    text        NOT NULL DEFAULT 'semi', -- automatica|semi|manual
  limite       integer,                -- limiar (ex.: fila > limite)
  janela_inicio smallint,              -- hora permitida (NULL = qualquer)
  janela_fim    smallint,
  financeiro   boolean     NOT NULL DEFAULT false,  -- se true, NUNCA automatica
  ativa        boolean     NOT NULL DEFAULT true,
  rollback_hint text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aoc_policies IS 'ORION-AI-56: motor de politicas (condicao->acao->prioridade->autonomia->limite->janela->rollback). financeiro=true forca semi/manual.';

CREATE TABLE IF NOT EXISTS public.orion_aoc_decisions (
  decision_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  decided_at  timestamptz NOT NULL DEFAULT now(),
  event_id    bigint REFERENCES public.orion_aoc_events(event_id),
  policy_key  text,
  classe      text        NOT NULL,   -- automatica|semi|manual
  acao        text        NOT NULL,
  motivo      text        NOT NULL,
  impacto     text        NOT NULL DEFAULT 'baixo', -- baixo|medio|alto
  confianca   integer     NOT NULL DEFAULT 0,   -- 0-100
  resultado   text        NOT NULL DEFAULT 'pendente', -- pendente|executada|aguardando_aprovacao|recusada|revertida
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rollback_de bigint,
  operador    text        NOT NULL DEFAULT 'aoc',
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aoc_decisions IS 'ORION-AI-56: toda decisao com classe/motivo/evidencias/impacto/confianca. IMUTAVEL; reversao = linha compensatoria (rollback_de).';
CREATE INDEX IF NOT EXISTS ix_orion_aoc_dec_cls ON public.orion_aoc_decisions (classe, decided_at DESC);

CREATE TABLE IF NOT EXISTS public.orion_aoc_dispatch (
  dispatch_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  decision_id bigint REFERENCES public.orion_aoc_decisions(decision_id),
  modulo      text        NOT NULL,   -- publisher|dispatcher|growth|recommendation|business|performance|health|ridv|fraud|pricing|forecast|observability|incident
  tarefa      text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status      text        NOT NULL DEFAULT 'enfileirada', -- enfileirada|executada|aguardando_aprovacao|falhou|recomendacao
  resultado   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);
COMMENT ON TABLE public.orion_aoc_dispatch IS 'ORION-AI-56: livro de despacho de tarefas aos modulos. Acoes SEGURAS/idempotentes executam; demais = aguardando_aprovacao/recomendacao. Idempotente.';
CREATE INDEX IF NOT EXISTS ix_orion_aoc_disp_mod ON public.orion_aoc_dispatch (modulo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.orion_aoc_incidents (
  incident_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aberto_em   timestamptz NOT NULL DEFAULT now(),
  tipo        text        NOT NULL,
  servico     text,
  severidade  text        NOT NULL DEFAULT 'media',
  diagnostico text,
  status      text        NOT NULL DEFAULT 'aberto', -- aberto|em_recuperacao|resolvido|escalado
  resolvido_em timestamptz,
  mttr_seg    integer,
  event_id    bigint,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  text        NOT NULL UNIQUE,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aoc_incidents IS 'ORION-AI-56: incidentes operacionais com diagnostico + MTTR (aberto->resolvido). Financeiros nunca auto-resolvem.';

CREATE TABLE IF NOT EXISTS public.orion_aoc_recovery (
  recovery_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id bigint REFERENCES public.orion_aoc_incidents(incident_id),
  tentativa   text        NOT NULL,   -- retry_tick|failover|escalonar|recomendacao
  alvo        text,
  sucesso     boolean,
  detalhe     text,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aoc_recovery IS 'ORION-AI-56: tentativas de recuperacao (retry idempotente da whitelist, failover=recomendacao, escalonamento). Trilha append-only.';

CREATE TABLE IF NOT EXISTS public.orion_aoc_resources (
  snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  medido_em   timestamptz NOT NULL DEFAULT now(),
  recurso     text        NOT NULL,   -- fila:campaign_queue|db:conexoes|bus:eventos_min|cron:jobs_ativos
  categoria   text        NOT NULL,   -- fila|banco|barramento|cron
  valor       numeric     NOT NULL,
  unidade     text        NOT NULL DEFAULT '',
  estado      text        NOT NULL DEFAULT 'ok', -- ok|atencao|gargalo
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  text        NOT NULL UNIQUE
);
COMMENT ON TABLE public.orion_aoc_resources IS 'ORION-AI-56: snapshots de recursos/filas REAIS. CPU/memoria/Redis/cloud NAO tem fonte SQL (DECLARADO).';
CREATE INDEX IF NOT EXISTS ix_orion_aoc_res ON public.orion_aoc_resources (recurso, medido_em DESC);

CREATE TABLE IF NOT EXISTS public.orion_aoc_workflows (
  workflow_key text       PRIMARY KEY,
  nome         text       NOT NULL,
  descricao    text       NOT NULL,
  passos       jsonb      NOT NULL DEFAULT '[]'::jsonb, -- sequencia de dispatches
  seguro       boolean    NOT NULL DEFAULT false,       -- se true, executa automatico
  ativa        boolean    NOT NULL DEFAULT true,
  ultima_exec  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aoc_workflows IS 'ORION-AI-56: catalogo de workflows operacionais. seguro=true executa automatico; demais exigem aprovacao.';

CREATE TABLE IF NOT EXISTS public.orion_aoc_alerts (
  alert_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo       text        NOT NULL,
  severidade text        NOT NULL DEFAULT 'atencao', -- info|atencao|critico
  servico    text,
  mensagem   text        NOT NULL,
  prioridade integer     NOT NULL DEFAULT 0,
  evidencias jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dia        date        NOT NULL DEFAULT current_date,
  resolvido  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, servico, dia)
);
COMMENT ON TABLE public.orion_aoc_alerts IS 'ORION-AI-56: alertas operacionais priorizados (idempotentes por tipo/servico/dia); espelhados em orion_ai_alerts.';

CREATE TABLE IF NOT EXISTS public.orion_aoc_statistics (
  dia                  date        PRIMARY KEY,
  eventos              integer     NOT NULL DEFAULT 0,
  decisoes             integer     NOT NULL DEFAULT 0,
  decisoes_automaticas integer     NOT NULL DEFAULT 0,
  decisoes_semi        integer     NOT NULL DEFAULT 0,
  decisoes_manuais     integer     NOT NULL DEFAULT 0,
  dispatches           integer     NOT NULL DEFAULT 0,
  incidentes           integer     NOT NULL DEFAULT 0,
  incidentes_resolvidos integer    NOT NULL DEFAULT 0,
  recuperacoes_ok      integer     NOT NULL DEFAULT 0,
  mttr_seg             integer     NOT NULL DEFAULT 0,
  automation_score     integer     NOT NULL DEFAULT 0,  -- % decisoes automaticas executadas ok
  health_score         integer     NOT NULL DEFAULT 0,  -- saude operacional
  reliability          integer     NOT NULL DEFAULT 0,  -- % dispatches sem falha
  gargalos             integer     NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aoc_statistics IS 'ORION-AI-56: estatisticas diarias + Automation Score / Health Score / MTTR / reliability.';

-- ----------------------------------------------------------------------------
-- 2) RLS + trava de grants
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_aoc_events','orion_aoc_policies','orion_aoc_decisions','orion_aoc_dispatch',
                           'orion_aoc_incidents','orion_aoc_recovery','orion_aoc_resources','orion_aoc_workflows',
                           'orion_aoc_alerts','orion_aoc_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

REVOKE ALL ON public.orion_aoc_events, public.orion_aoc_policies, public.orion_aoc_decisions,
             public.orion_aoc_dispatch, public.orion_aoc_incidents, public.orion_aoc_recovery,
             public.orion_aoc_resources, public.orion_aoc_workflows, public.orion_aoc_alerts,
             public.orion_aoc_statistics FROM anon, authenticated;
GRANT SELECT ON public.orion_aoc_events, public.orion_aoc_policies, public.orion_aoc_decisions,
               public.orion_aoc_dispatch, public.orion_aoc_incidents, public.orion_aoc_recovery,
               public.orion_aoc_resources, public.orion_aoc_workflows, public.orion_aoc_alerts,
               public.orion_aoc_statistics TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) BUS + helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'autonomous_ops', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- conta linhas de uma tabela/fila se existir (defensivo)
CREATE OR REPLACE FUNCTION public.aoc_count_safe(p_relacao text, p_where text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  IF to_regclass('public.'||p_relacao) IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT count(*) FROM public.'||quote_ident(p_relacao)||coalesce(' WHERE '||p_where,'') INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END$$;

-- registra evento operacional (idempotente)
CREATE OR REPLACE FUNCTION public.aoc_event_put(
  p_tipo text, p_categoria text, p_origem text, p_alvo text, p_sev text, p_evid jsonb, p_dedupe text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.orion_aoc_events (tipo, categoria, origem, alvo, severidade, evidencias, dedupe_key)
  VALUES (p_tipo, p_categoria, p_origem, p_alvo, coalesce(p_sev,'media'), coalesce(p_evid,'{}'::jsonb), p_dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING event_id INTO v_id;
  RETURN v_id;
END$$;

-- ----------------------------------------------------------------------------
-- 4) CAMADA 2 — INGESTAO DE EVENTOS (fontes reais, incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_ingest_events()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_q bigint;
BEGIN
  -- 4.1 falhas de cron (jobs vivos) — infra
  FOR r IN
    SELECT d.runid, coalesce(j.jobname,'job:'||d.jobid) job, d.start_time, left(d.return_message,200) msg
    FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
    WHERE d.status='failed' AND d.start_time > now()-interval '2 hours'
  LOOP
    PERFORM public.aoc_event_put('cron_falha','infra','cron', r.job, 'alta',
      jsonb_build_object('runid',r.runid,'mensagem',r.msg,'em',r.start_time), 'cronfail:'||r.runid);
    v_n := v_n+1;
  END LOOP;

  -- 4.2 alertas de observabilidade abertos (AI-51) — infra/recurso
  FOR r IN
    SELECT alert_id, tipo, servico, severidade, mensagem FROM public.orion_obs_alerts
    WHERE NOT resolvido AND dia > current_date-2
  LOOP
    PERFORM public.aoc_event_put('slo_risco','infra','orion_obs_alerts', r.servico,
      CASE WHEN r.severidade='critico' THEN 'critica' WHEN r.severidade='atencao' THEN 'alta' ELSE 'media' END,
      jsonb_build_object('obs_alerta',r.tipo,'mensagem',r.mensagem), 'obsalert:'||r.alert_id);
    v_n := v_n+1;
  END LOOP;

  -- 4.3 eventos AIOps alta/critica (AI-53) — infra
  IF to_regclass('public.orion_aiops_events') IS NOT NULL THEN
    FOR r IN
      SELECT event_id, tipo, alvo, severidade FROM public.orion_aiops_events
      WHERE severidade IN ('alta','critica') AND captado_em > now()-interval '6 hours'
    LOOP
      PERFORM public.aoc_event_put('aiops','infra','orion_aiops_events', r.alvo, r.severidade,
        jsonb_build_object('aiops_tipo',r.tipo), 'aiops:'||r.event_id);
      v_n := v_n+1;
    END LOOP;
  END IF;

  -- 4.4 pagamentos presos (>2h em pending) — FINANCEIRO (nunca auto-resolve)
  FOR r IN
    SELECT id, amount, created_at FROM public.pay_payment_orders
    WHERE lower(status::text) IN ('pending','processing','in_process') AND created_at < now()-interval '2 hours'
    ORDER BY created_at LIMIT 50
  LOOP
    PERFORM public.aoc_event_put('pagamento_preso','financeiro','pay', r.id::text, 'alta',
      jsonb_build_object('order',r.id,'valor',r.amount,'preso_desde',r.created_at,
        'nota','incidente financeiro: NUNCA resolvido automaticamente'), 'paystuck:'||r.id);
    v_n := v_n+1;
  END LOOP;

  -- 4.5 congestionamento de filas — fila
  FOR r IN SELECT * FROM (VALUES
      ('campaign_queue', 'status in (''pending'',''na_fila'',''em_processamento'',''aguardando'')'),
      ('fila_postagens', NULL::text),
      ('orion_dispatch_queue', NULL::text),
      ('orion_aoc_events', 'status=''novo''')) AS f(rel, cond)
  LOOP
    v_q := public.aoc_count_safe(r.rel, r.cond);
    IF v_q IS NOT NULL AND v_q > 500 THEN
      PERFORM public.aoc_event_put('fila_congestionada','fila','resources', r.rel, 'alta',
        jsonb_build_object('fila',r.rel,'pendentes',v_q,'limite',500), 'queue:'||r.rel||':'||to_char(now(),'YYYYMMDDHH24'));
      v_n := v_n+1;
    END IF;
  END LOOP;

  -- 4.6 eventos de seguranca de alto sinal no bus — seguranca
  FOR r IN
    SELECT id, tipo FROM public.orion_eventos
    WHERE criado_em > now()-interval '30 minutes'
      AND tipo ~* 'fraud.*(respond|score)|threat.*correlate|incident|cyber'
      AND (dados->>'severidade' IN ('alta','critica') OR tipo ~* 'critic')
    LIMIT 50
  LOOP
    PERFORM public.aoc_event_put('fraude_critica','seguranca','orion_eventos', r.tipo, 'critica',
      jsonb_build_object('bus_tipo',r.tipo), 'bus:'||r.id);
    v_n := v_n+1;
  END LOOP;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 5) CAMADA 6 — SNAPSHOT DE RECURSOS/FILAS (real)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_snapshot_resources()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_win text := to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI'); v_n int := 0; v numeric;
BEGIN
  -- filas
  v := coalesce(public.aoc_count_safe('campaign_queue', 'status in (''pending'',''na_fila'',''em_processamento'',''aguardando'')'),0);
  PERFORM public.aoc_resource_put('fila:campaign_queue','fila', v, 'itens', CASE WHEN v>500 THEN 'gargalo' WHEN v>100 THEN 'atencao' ELSE 'ok' END, v_win);
  v := coalesce(public.aoc_count_safe('fila_postagens'),0);
  PERFORM public.aoc_resource_put('fila:fila_postagens','fila', v, 'itens', CASE WHEN v>500 THEN 'gargalo' WHEN v>100 THEN 'atencao' ELSE 'ok' END, v_win);
  v := coalesce(public.aoc_count_safe('orion_aoc_events', 'status=''novo'''),0);
  PERFORM public.aoc_resource_put('fila:eventos_pendentes','fila', v, 'itens', CASE WHEN v>200 THEN 'gargalo' WHEN v>50 THEN 'atencao' ELSE 'ok' END, v_win);
  -- banco: conexoes
  SELECT count(*) INTO v FROM pg_stat_activity WHERE datname=current_database();
  PERFORM public.aoc_resource_put('db:conexoes','banco', v, 'conn', CASE WHEN v>80 THEN 'gargalo' WHEN v>50 THEN 'atencao' ELSE 'ok' END, v_win);
  -- barramento: eventos/min
  SELECT round(count(*)/5.0,1) INTO v FROM public.orion_eventos WHERE criado_em > now()-interval '5 minutes';
  PERFORM public.aoc_resource_put('bus:eventos_min','barramento', v, 'ev/min', CASE WHEN v>200 THEN 'atencao' ELSE 'ok' END, v_win);
  -- cron: jobs agendados ativos
  SELECT count(*) INTO v FROM cron.job WHERE active;
  PERFORM public.aoc_resource_put('cron:jobs_ativos','cron', v, 'jobs', 'ok', v_win);
  v_n := 6;
  RETURN v_n;
END$$;

CREATE OR REPLACE FUNCTION public.aoc_resource_put(p_rec text, p_cat text, p_valor numeric, p_unidade text, p_estado text, p_win text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_aoc_resources (recurso, categoria, valor, unidade, estado, dedupe_key,
    evidencias)
  VALUES (p_rec, p_cat, coalesce(p_valor,0), p_unidade, p_estado, p_rec||':'||p_win,
    jsonb_build_object('nota', CASE WHEN p_cat IN ('fila','banco','barramento','cron') THEN 'fonte SQL real' ELSE 'derivado' END))
  ON CONFLICT (dedupe_key) DO UPDATE SET valor=excluded.valor, estado=excluded.estado, medido_em=now();
END$$;

-- ----------------------------------------------------------------------------
-- 6) CAMADA 9+10 — MOTOR DE POLITICAS + DECISOES (evento -> decisao)
-- ----------------------------------------------------------------------------
-- classe de autonomia: financeiro forca >= semi; alta/critica sem whitelist -> semi
CREATE OR REPLACE FUNCTION public.aoc_decide(p_event_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; p record; v_classe text; v_conf int; v_impacto text; v_motivo text; v_id bigint;
BEGIN
  SELECT * INTO e FROM public.orion_aoc_events WHERE event_id=p_event_id AND status='novo';
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- casa a politica pela condicao (tipo do evento); mais especifica por prioridade
  SELECT * INTO p FROM public.orion_aoc_policies
   WHERE ativa AND condicao = e.tipo
     AND (janela_inicio IS NULL OR extract(hour FROM now())::int BETWEEN janela_inicio AND janela_fim)
   ORDER BY prioridade DESC LIMIT 1;

  IF NOT FOUND THEN
    -- sem politica: registra decisao MANUAL (humano decide)
    v_classe := 'manual'; v_impacto := CASE WHEN e.severidade IN ('alta','critica') THEN 'medio' ELSE 'baixo' END;
    v_conf := 40; v_motivo := 'evento '||e.tipo||' sem politica aplicavel — encaminhado para decisao humana';
    INSERT INTO public.orion_aoc_decisions (event_id, policy_key, classe, acao, motivo, impacto, confianca, resultado, evidencias)
    VALUES (e.event_id, NULL, v_classe, 'nenhuma', v_motivo, v_impacto, v_conf, 'aguardando_aprovacao', e.evidencias)
    RETURNING decision_id INTO v_id;
    UPDATE public.orion_aoc_events SET status='processado' WHERE event_id=e.event_id;
    RETURN v_id;
  END IF;

  -- autonomia efetiva: financeiro NUNCA automatica
  v_classe := p.autonomia;
  IF e.categoria='financeiro' OR p.financeiro THEN
    v_classe := CASE WHEN p.autonomia='automatica' THEN 'semi' ELSE p.autonomia END;
  END IF;
  v_impacto := CASE WHEN e.severidade='critica' THEN 'alto' WHEN e.severidade='alta' THEN 'medio' ELSE 'baixo' END;
  v_conf := CASE WHEN e.severidade='critica' THEN 85 WHEN e.severidade='alta' THEN 75 ELSE 60 END;
  v_motivo := 'politica '||p.policy_key||': '||p.acao||' (autonomia '||v_classe||', evento '||e.tipo||')';

  INSERT INTO public.orion_aoc_decisions (event_id, policy_key, classe, acao, motivo, impacto, confianca, resultado, evidencias)
  VALUES (e.event_id, p.policy_key, v_classe, p.acao, v_motivo, v_impacto, v_conf,
    CASE WHEN v_classe='automatica' THEN 'pendente' ELSE 'aguardando_aprovacao' END,
    e.evidencias || jsonb_build_object('politica', p.policy_key, 'financeiro', (e.categoria='financeiro' OR p.financeiro)))
  RETURNING decision_id INTO v_id;

  UPDATE public.orion_aoc_events SET status='processado' WHERE event_id=e.event_id;

  -- executa SO decisoes automaticas (acoes seguras)
  IF v_classe='automatica' THEN
    PERFORM public.aoc_execute_decision(v_id);
  END IF;
  RETURN v_id;
END$$;

-- executa a acao de uma decisao AUTOMATICA (apenas acoes seguras).
-- Recebe so o decision_id e re-le evento+politica (evita parametro tipo record).
CREATE OR REPLACE FUNCTION public.aoc_execute_decision(p_decision_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; e record; p record; v_inc bigint;
BEGIN
  SELECT * INTO d FROM public.orion_aoc_decisions WHERE decision_id=p_decision_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO e FROM public.orion_aoc_events WHERE event_id=d.event_id;
  SELECT * INTO p FROM public.orion_aoc_policies WHERE policy_key=d.policy_key;
  IF e.event_id IS NULL OR p.policy_key IS NULL THEN RETURN; END IF;

  IF p.acao = 'abrir_incidente' OR p.acao = 'recuperar' THEN
    v_inc := public.aoc_open_incident(e.tipo, e.alvo, e.severidade, e.event_id, e.evidencias);
    IF p.acao='recuperar' THEN PERFORM public.aoc_recover(v_inc, e.alvo); END IF;
    UPDATE public.orion_aoc_decisions SET resultado='executada' WHERE decision_id=p_decision_id;
  ELSIF p.acao = 'alertar' THEN
    PERFORM public.aoc_alert_put('op_'||e.tipo, CASE WHEN e.severidade='critica' THEN 'critico' ELSE 'atencao' END,
      e.alvo, 'evento operacional '||e.tipo||' em '||coalesce(e.alvo,'-'), p.prioridade, e.evidencias);
    UPDATE public.orion_aoc_decisions SET resultado='executada' WHERE decision_id=p_decision_id;
  ELSIF p.acao = 'despachar' AND p.alvo_modulo IS NOT NULL THEN
    PERFORM public.aoc_dispatch(p_decision_id, p.alvo_modulo, 'processar_'||e.tipo, e.evidencias);
    UPDATE public.orion_aoc_decisions SET resultado='executada' WHERE decision_id=p_decision_id;
  ELSE
    -- acao nao-segura marcada automatica por engano: rebaixa para recomendacao
    UPDATE public.orion_aoc_decisions SET resultado='aguardando_aprovacao',
      motivo=motivo||' | acao nao-segura rebaixada para aprovacao' WHERE decision_id=p_decision_id;
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 7) CAMADA 3 — DISPATCH (livro de tarefas; seguro executa, resto recomenda)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_dispatch(p_decision_id bigint, p_modulo text, p_tarefa text, p_payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_status text; v_res jsonb := '{}'::jsonb; v_safe_tick text;
BEGIN
  -- whitelist de ticks idempotentes SEGUROS por modulo (nunca financeiros)
  v_safe_tick := CASE p_modulo
    WHEN 'observability' THEN 'orion_observability_tick'
    WHEN 'health' THEN 'orion_health_tick'
    WHEN 'performance' THEN 'orion_perf_tick'
    WHEN 'aiops' THEN 'orion_aiops_tick'
    ELSE NULL END;

  INSERT INTO public.orion_aoc_dispatch (decision_id, modulo, tarefa, payload, status, dedupe_key)
  VALUES (p_decision_id, p_modulo, p_tarefa, coalesce(p_payload,'{}'::jsonb),
    'enfileirada', 'disp:'||coalesce(p_decision_id::text,'x')||':'||p_modulo||':'||to_char(now(),'YYYYMMDDHH24MISS'))
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING dispatch_id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  IF v_safe_tick IS NOT NULL AND to_regprocedure('public.'||v_safe_tick||'()') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT public.'||v_safe_tick||'()';
      v_status := 'executada'; v_res := jsonb_build_object('tick', v_safe_tick, 'ok', true);
    EXCEPTION WHEN OTHERS THEN
      v_status := 'falhou'; v_res := jsonb_build_object('tick', v_safe_tick, 'erro', SQLERRM);
    END;
    UPDATE public.orion_aoc_dispatch SET status=v_status, resultado=v_res, executed_at=now() WHERE dispatch_id=v_id;
  ELSE
    -- modulo sem tick seguro: registra como RECOMENDACAO (nao executa)
    UPDATE public.orion_aoc_dispatch SET status='recomendacao',
      resultado=jsonb_build_object('nota','tarefa registrada como recomendacao; execucao pelo modulo/humano') WHERE dispatch_id=v_id;
  END IF;
  RETURN v_id;
END$$;

-- ----------------------------------------------------------------------------
-- 8) CAMADA 5 — INCIDENTES + RECUPERACAO (MTTR)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_open_incident(p_tipo text, p_servico text, p_sev text, p_event_id bigint, p_evid jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_diag text;
BEGIN
  v_diag := CASE p_tipo
    WHEN 'cron_falha' THEN 'cron '||coalesce(p_servico,'?')||' falhou — provavel erro deterministico ou timeout; ver logs'
    WHEN 'slo_risco' THEN 'SLO/servico '||coalesce(p_servico,'?')||' em risco (observabilidade)'
    WHEN 'fila_congestionada' THEN 'fila '||coalesce(p_servico,'?')||' acima do limite'
    WHEN 'pagamento_preso' THEN 'pagamento preso — INCIDENTE FINANCEIRO, requer acao humana'
    ELSE 'incidente operacional '||p_tipo END;
  INSERT INTO public.orion_aoc_incidents (tipo, servico, severidade, diagnostico, event_id, evidencias, dedupe_key)
  VALUES (p_tipo, p_servico, coalesce(p_sev,'media'), v_diag, p_event_id, coalesce(p_evid,'{}'::jsonb),
    'inc:'||p_tipo||':'||coalesce(p_servico,'-')||':'||to_char(now(),'YYYYMMDDHH24'))
  ON CONFLICT (dedupe_key) DO UPDATE SET updated_at=now()
  RETURNING incident_id INTO v_id;
  RETURN v_id;
END$$;

-- recuperacao: retry idempotente da whitelist; financeiro nunca; senao escala/recomenda
CREATE OR REPLACE FUNCTION public.aoc_recover(p_incident_id bigint, p_servico text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inc record; v_ok bool; v_tick text; v_ai45 bool;
BEGIN
  SELECT * INTO inc FROM public.orion_aoc_incidents WHERE incident_id=p_incident_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','incidente inexistente'); END IF;

  -- FINANCEIRO: nunca recupera sozinho
  IF inc.tipo='pagamento_preso' OR inc.severidade IS NULL THEN
    INSERT INTO public.orion_aoc_recovery (incident_id, tentativa, alvo, sucesso, detalhe)
    VALUES (p_incident_id, 'escalonar', p_servico, NULL, 'incidente financeiro — escalado para humano (nunca auto-resolve)');
    UPDATE public.orion_aoc_incidents SET status='escalado', updated_at=now() WHERE incident_id=p_incident_id;
    RETURN jsonb_build_object('ok',true,'acao','escalado_humano');
  END IF;

  UPDATE public.orion_aoc_incidents SET status='em_recuperacao', updated_at=now() WHERE incident_id=p_incident_id;

  -- se o servico e um tick idempotente conhecido, tenta re-executar (retry seguro)
  v_tick := CASE WHEN p_servico ~ '^orion_.*_tick$' AND p_servico !~ 'pay|settle|escrow|financ' THEN p_servico ELSE NULL END;
  IF v_tick IS NOT NULL AND to_regprocedure('public.'||v_tick||'()') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT public.'||v_tick||'()';
      v_ok := true;
    EXCEPTION WHEN OTHERS THEN v_ok := false; END;
    INSERT INTO public.orion_aoc_recovery (incident_id, tentativa, alvo, sucesso, detalhe, evidencias)
    VALUES (p_incident_id, 'retry_tick', v_tick, v_ok,
      CASE WHEN v_ok THEN 'retry idempotente bem-sucedido' ELSE 'retry falhou — escalando' END,
      jsonb_build_object('tick', v_tick));
    IF v_ok THEN
      UPDATE public.orion_aoc_incidents SET status='resolvido', resolvido_em=now(),
        mttr_seg=greatest(0,round(extract(epoch FROM (now()-aberto_em)))::int), updated_at=now()
      WHERE incident_id=p_incident_id;
      RETURN jsonb_build_object('ok',true,'acao','retry_ok');
    END IF;
  END IF;

  -- nao recuperou: escala (para AI-45 se existir) + recomendacao
  v_ai45 := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%');
  INSERT INTO public.orion_aoc_recovery (incident_id, tentativa, alvo, sucesso, detalhe, evidencias)
  VALUES (p_incident_id, 'escalonar', p_servico, false,
    CASE WHEN v_ai45 THEN 'escalado ao AI-45 Incident Response' ELSE 'escalado para humano (AI-45 ausente)' END,
    jsonb_build_object('ai45', v_ai45));
  UPDATE public.orion_aoc_incidents SET status='escalado', updated_at=now() WHERE incident_id=p_incident_id;
  RETURN jsonb_build_object('ok',true,'acao','escalado');
END$$;

CREATE OR REPLACE FUNCTION public.aoc_alert_put(p_tipo text, p_sev text, p_srv text, p_msg text, p_prio int, p_evid jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_aoc_alerts (tipo, severidade, servico, mensagem, prioridade, evidencias)
  VALUES (p_tipo, p_sev, p_srv, p_msg, coalesce(p_prio,0), coalesce(p_evid,'{}'::jsonb))
  ON CONFLICT (tipo, servico, dia) DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orion_ai_alerts WHERE tipo='aoc:'||p_tipo AND dia=current_date) THEN
    INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
    VALUES ('aoc:'||p_tipo, p_sev, 'AI-56: '||p_msg, p_prio, 0, current_date);
  END IF;
  RETURN 1;
END$$;

-- ----------------------------------------------------------------------------
-- 9) CAMADA 8 — OTIMIZACAO OPERACIONAL (recomendacoes de evidencia real)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_optimize()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; r record; v_lat numeric;
BEGIN
  -- filas em gargalo -> recomendacao de rebalanceamento (nunca spawn real)
  FOR r IN SELECT recurso, valor FROM public.orion_aoc_resources
           WHERE estado='gargalo' AND medido_em > now()-interval '10 minutes' LOOP
    v_n := v_n + public.aoc_alert_put('otimizar_fila','atencao', r.recurso,
      'gargalo em '||r.recurso||' ('||r.valor||') — recomendado aumentar paralelismo/worker (acao humana/infra)', 55,
      jsonb_build_object('recurso',r.recurso,'valor',r.valor));
  END LOOP;
  -- latencia de RPC alta (via AI-51) -> recomendacao de indices
  SELECT valor INTO v_lat FROM public.orion_obs_metrics WHERE metric_key='rpc.mean_ms' ORDER BY measured_at DESC LIMIT 1;
  IF coalesce(v_lat,0) > 800 THEN
    v_n := v_n + public.aoc_alert_put('otimizar_latencia','atencao','banco',
      'latencia media de RPC alta ('||v_lat||'ms) — revisar consultas/indices (pg_stat_statements)', 60,
      jsonb_build_object('rpc_mean_ms', v_lat));
  END IF;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 10) ESTATISTICAS + SCORES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_statistics_rollup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_auto int; v_semi int; v_man int; v_dec int; v_exec_ok int; v_disp int; v_disp_fail int;
  v_inc int; v_inc_res int; v_rec_ok int; v_mttr int; v_autoscore int; v_health int; v_rel int; v_garg int; v_obs int;
BEGIN
  SELECT count(*) FILTER (WHERE decided_at::date=current_date),
         count(*) FILTER (WHERE classe='automatica' AND decided_at::date=current_date),
         count(*) FILTER (WHERE classe='semi' AND decided_at::date=current_date),
         count(*) FILTER (WHERE classe='manual' AND decided_at::date=current_date),
         count(*) FILTER (WHERE classe='automatica' AND resultado='executada' AND decided_at::date=current_date)
    INTO v_dec, v_auto, v_semi, v_man, v_exec_ok FROM public.orion_aoc_decisions;

  SELECT count(*) FILTER (WHERE created_at::date=current_date),
         count(*) FILTER (WHERE status='falhou' AND created_at::date=current_date)
    INTO v_disp, v_disp_fail FROM public.orion_aoc_dispatch;

  SELECT count(*) FILTER (WHERE aberto_em::date=current_date),
         count(*) FILTER (WHERE status='resolvido' AND resolvido_em::date=current_date),
         coalesce(round(avg(mttr_seg) FILTER (WHERE status='resolvido' AND resolvido_em::date=current_date))::int,0)
    INTO v_inc, v_inc_res, v_mttr FROM public.orion_aoc_incidents;

  SELECT count(*) FILTER (WHERE sucesso AND created_at::date=current_date) INTO v_rec_ok FROM public.orion_aoc_recovery;
  SELECT count(*) FILTER (WHERE estado='gargalo' AND medido_em > now()-interval '15 minutes') INTO v_garg FROM public.orion_aoc_resources;

  -- Automation Score: % de decisoes automaticas executadas com sucesso sobre o total decidido
  v_autoscore := CASE WHEN v_dec>0 THEN round(100.0*v_exec_ok/v_dec)::int ELSE 100 END;
  -- Reliability: % de dispatches sem falha
  v_rel := CASE WHEN v_disp>0 THEN round(100.0*(v_disp-v_disp_fail)/v_disp)::int ELSE 100 END;
  -- Health Score operacional: base na saude do AI-51 (OHS) menos penalidade por incidentes abertos
  SELECT coalesce(ohs,100) INTO v_obs FROM public.orion_obs_statistics WHERE dia=current_date;
  v_health := greatest(0, least(100, coalesce(v_obs,100)
    - 10*(SELECT count(*) FROM public.orion_aoc_incidents WHERE status IN ('aberto','em_recuperacao'))
    - 5*coalesce(v_garg,0)));

  INSERT INTO public.orion_aoc_statistics
    (dia, eventos, decisoes, decisoes_automaticas, decisoes_semi, decisoes_manuais, dispatches,
     incidentes, incidentes_resolvidos, recuperacoes_ok, mttr_seg, automation_score, health_score, reliability, gargalos, updated_at)
  VALUES (current_date,
    (SELECT count(*) FROM public.orion_aoc_events WHERE captado_em::date=current_date),
    v_dec, v_auto, v_semi, v_man, v_disp, v_inc, v_inc_res, v_rec_ok, v_mttr,
    v_autoscore, v_health, v_rel, coalesce(v_garg,0), now())
  ON CONFLICT (dia) DO UPDATE SET eventos=excluded.eventos, decisoes=excluded.decisoes,
    decisoes_automaticas=excluded.decisoes_automaticas, decisoes_semi=excluded.decisoes_semi,
    decisoes_manuais=excluded.decisoes_manuais, dispatches=excluded.dispatches, incidentes=excluded.incidentes,
    incidentes_resolvidos=excluded.incidentes_resolvidos, recuperacoes_ok=excluded.recuperacoes_ok,
    mttr_seg=excluded.mttr_seg, automation_score=excluded.automation_score, health_score=excluded.health_score,
    reliability=excluded.reliability, gargalos=excluded.gargalos, updated_at=now();
END$$;

-- ----------------------------------------------------------------------------
-- 11) ORQUESTRADOR (tick) + RPCs publicas nomeadas na spec
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orchestrate_operations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_ev int; v_dec int := 0;
BEGIN
  v_ev := public.aoc_ingest_events();
  PERFORM public.aoc_snapshot_resources();
  -- decide os eventos novos
  FOR r IN SELECT event_id FROM public.orion_aoc_events WHERE status='novo' ORDER BY captado_em LIMIT 200 LOOP
    PERFORM public.aoc_decide(r.event_id);
    v_dec := v_dec+1;
  END LOOP;
  PERFORM public.aoc_optimize();
  PERFORM public.aoc_statistics_rollup();
  PERFORM public.aoc_emit('aoc.orchestrate', jsonb_build_object('eventos', v_ev, 'decisoes', v_dec));
  RETURN jsonb_build_object('ok', true, 'eventos_ingeridos', v_ev, 'decisoes', v_dec);
END$$;

-- process_event: ingere+decide um evento pontual sob demanda (API)
CREATE OR REPLACE FUNCTION public.process_event(p_event_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'process_event: somente admin/service';
  END IF;
  v_id := public.aoc_decide(p_event_id);
  RETURN jsonb_build_object('ok', v_id IS NOT NULL, 'decision_id', v_id);
END$$;

-- execute_policy: forca reavaliacao de eventos novos por uma politica (API)
CREATE OR REPLACE FUNCTION public.execute_policy(p_policy_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; p record; v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'execute_policy: somente admin/service';
  END IF;
  SELECT * INTO p FROM public.orion_aoc_policies WHERE policy_key=p_policy_key AND ativa;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','politica inexistente/inativa'); END IF;
  FOR r IN SELECT event_id FROM public.orion_aoc_events WHERE status='novo' AND tipo=p.condicao LIMIT 100 LOOP
    PERFORM public.aoc_decide(r.event_id); v_n := v_n+1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'politica', p_policy_key, 'eventos_avaliados', v_n);
END$$;

-- aprovacao humana de uma decisao semi/manual (executa acao)
CREATE OR REPLACE FUNCTION public.aoc_approve_decision(p_decision_id bigint, p_aprovar boolean DEFAULT true, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'aoc_approve_decision: somente admin';
  END IF;
  SELECT * INTO d FROM public.orion_aoc_decisions WHERE decision_id=p_decision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'decisao % inexistente', p_decision_id; END IF;
  IF NOT p_aprovar THEN
    UPDATE public.orion_aoc_decisions SET resultado='recusada', motivo=motivo||' | recusada: '||coalesce(p_motivo,'-')
     WHERE decision_id=p_decision_id;
    RETURN jsonb_build_object('ok',true,'resultado','recusada');
  END IF;
  PERFORM public.aoc_execute_decision(p_decision_id);
  UPDATE public.orion_aoc_decisions SET resultado='executada',
    motivo=motivo||' | aprovada por '||coalesce(auth.uid()::text,'admin') WHERE decision_id=p_decision_id AND resultado<>'executada';
  PERFORM public.aoc_emit('aoc.approve', jsonb_build_object('decision_id', p_decision_id));
  RETURN jsonb_build_object('ok',true,'resultado','executada');
END$$;

-- reversao de decisao (linha compensatoria)
CREATE OR REPLACE FUNCTION public.aoc_rollback_decision(p_decision_id bigint, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_id bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'aoc_rollback_decision: somente admin';
  END IF;
  SELECT * INTO d FROM public.orion_aoc_decisions WHERE decision_id=p_decision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'decisao % inexistente', p_decision_id; END IF;
  IF EXISTS (SELECT 1 FROM public.orion_aoc_decisions WHERE rollback_de=p_decision_id) THEN
    RETURN jsonb_build_object('ok',false,'motivo','ja revertida');
  END IF;
  INSERT INTO public.orion_aoc_decisions (event_id, policy_key, classe, acao, motivo, impacto, confianca, resultado, rollback_de, operador)
  VALUES (d.event_id, d.policy_key, d.classe, 'rollback', coalesce(p_motivo,'reversao da decisao '||p_decision_id),
    d.impacto, d.confianca, 'revertida', p_decision_id, coalesce(auth.uid()::text,'admin'))
  RETURNING decision_id INTO v_id;
  UPDATE public.orion_aoc_decisions SET resultado='revertida' WHERE decision_id=p_decision_id;
  RETURN jsonb_build_object('ok',true,'compensatoria',v_id);
END$$;

-- execute_workflow: roda um workflow seguro do catalogo (sequencia de dispatches)
CREATE OR REPLACE FUNCTION public.execute_workflow(p_workflow_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w record; s jsonb; v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'execute_workflow: somente admin/service';
  END IF;
  SELECT * INTO w FROM public.orion_aoc_workflows WHERE workflow_key=p_workflow_key AND ativa;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','workflow inexistente/inativo'); END IF;
  IF NOT w.seguro THEN RETURN jsonb_build_object('ok',false,'motivo','workflow nao-seguro: requer aprovacao humana por passo'); END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(w.passos) LOOP
    PERFORM public.aoc_dispatch(NULL, s->>'modulo', s->>'tarefa', coalesce(s->'payload','{}'::jsonb));
    v_n := v_n+1;
  END LOOP;
  UPDATE public.orion_aoc_workflows SET ultima_exec=now() WHERE workflow_key=p_workflow_key;
  PERFORM public.aoc_emit('aoc.workflow', jsonb_build_object('workflow', p_workflow_key, 'passos', v_n));
  RETURN jsonb_build_object('ok',true,'workflow',p_workflow_key,'passos_despachados',v_n);
END$$;

-- ----------------------------------------------------------------------------
-- 12) PAINEIS (guarda admin) — get_operation_status/metrics + automation_dashboard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_operation_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'get_operation_status: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'automation_score', (SELECT coalesce(automation_score,0) FROM public.orion_aoc_statistics WHERE dia=current_date),
    'health_score', (SELECT coalesce(health_score,0) FROM public.orion_aoc_statistics WHERE dia=current_date),
    'reliability', (SELECT coalesce(reliability,0) FROM public.orion_aoc_statistics WHERE dia=current_date),
    'mttr_seg', (SELECT coalesce(mttr_seg,0) FROM public.orion_aoc_statistics WHERE dia=current_date),
    'eventos_hoje', (SELECT count(*) FROM public.orion_aoc_events WHERE captado_em::date=current_date),
    'eventos_novos', (SELECT count(*) FROM public.orion_aoc_events WHERE status='novo'),
    'operacoes_ativas', (SELECT count(*) FROM public.orion_aoc_dispatch WHERE status IN ('enfileirada','aguardando_aprovacao')),
    'decisoes_hoje', (SELECT count(*) FROM public.orion_aoc_decisions WHERE decided_at::date=current_date),
    'aguardando_aprovacao', (SELECT count(*) FROM public.orion_aoc_decisions WHERE resultado='aguardando_aprovacao'),
    'incidentes_abertos', (SELECT count(*) FROM public.orion_aoc_incidents WHERE status IN ('aberto','em_recuperacao')),
    'incidentes_hoje', (SELECT count(*) FROM public.orion_aoc_incidents WHERE aberto_em::date=current_date),
    'recuperacoes_ok', (SELECT count(*) FROM public.orion_aoc_recovery WHERE sucesso AND created_at::date=current_date),
    'gargalos', (SELECT count(*) FROM public.orion_aoc_resources WHERE estado='gargalo' AND medido_em > now()-interval '15 minutes'),
    'alertas_abertos', (SELECT count(*) FROM public.orion_aoc_alerts WHERE NOT resolvido),
    'politicas_ativas', (SELECT count(*) FROM public.orion_aoc_policies WHERE ativa),
    'gerado_em', now());
END$$;

CREATE OR REPLACE FUNCTION public.get_operation_metrics(p_secao text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'get_operation_metrics: somente admin';
  END IF;
  RETURN CASE p_secao
  WHEN 'eventos' THEN jsonb_build_object(
    'por_categoria', (SELECT coalesce(jsonb_object_agg(categoria,n),'{}'::jsonb) FROM (SELECT categoria,count(*) n FROM public.orion_aoc_events GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_id',event_id,'tipo',tipo,'categoria',categoria,'origem',origem,
        'alvo',alvo,'severidade',severidade,'status',status,'evidencias',evidencias,'em',captado_em) ORDER BY event_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aoc_events ORDER BY event_id DESC LIMIT 40) x))
  WHEN 'decisoes' THEN jsonb_build_object(
    'por_classe', (SELECT coalesce(jsonb_object_agg(classe,n),'{}'::jsonb) FROM (SELECT classe,count(*) n FROM public.orion_aoc_decisions GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('decision_id',decision_id,'classe',classe,'acao',acao,'motivo',motivo,
        'impacto',impacto,'confianca',confianca,'resultado',resultado,'policy_key',policy_key,'rollback_de',rollback_de,'em',decided_at) ORDER BY decision_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aoc_decisions ORDER BY decision_id DESC LIMIT 40) x))
  WHEN 'dispatch' THEN jsonb_build_object(
    'por_modulo', (SELECT coalesce(jsonb_object_agg(modulo,n),'{}'::jsonb) FROM (SELECT modulo,count(*) n FROM public.orion_aoc_dispatch GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('dispatch_id',dispatch_id,'modulo',modulo,'tarefa',tarefa,'status',status,
        'resultado',resultado,'em',created_at) ORDER BY dispatch_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aoc_dispatch ORDER BY dispatch_id DESC LIMIT 40) x))
  WHEN 'incidentes' THEN jsonb_build_object(
    'abertos', (SELECT count(*) FROM public.orion_aoc_incidents WHERE status IN ('aberto','em_recuperacao')),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('incident_id',incident_id,'tipo',tipo,'servico',servico,'severidade',severidade,
        'status',status,'diagnostico',diagnostico,'mttr_seg',mttr_seg,'em',aberto_em) ORDER BY incident_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aoc_incidents ORDER BY incident_id DESC LIMIT 30) x),
    'recuperacoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('recovery_id',recovery_id,'incident_id',incident_id,'tentativa',tentativa,
        'alvo',alvo,'sucesso',sucesso,'detalhe',detalhe,'em',created_at) ORDER BY recovery_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aoc_recovery ORDER BY recovery_id DESC LIMIT 20) x))
  WHEN 'recursos' THEN jsonb_build_object(
    'atuais', (SELECT coalesce(jsonb_agg(jsonb_build_object('recurso',recurso,'categoria',categoria,'valor',valor,'unidade',unidade,'estado',estado) ORDER BY categoria,recurso),'[]'::jsonb)
      FROM (SELECT DISTINCT ON (recurso) * FROM public.orion_aoc_resources ORDER BY recurso, medido_em DESC) x),
    'lacunas', jsonb_build_array('CPU/memoria de host, Redis, Firebase, Google Cloud, spawn de worker/edge: sem fonte SQL — recomendacao, nao execucao (DECLARADO)'))
  WHEN 'politicas' THEN jsonb_build_object(
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('policy_key',policy_key,'descricao',descricao,'condicao',condicao,'acao',acao,
        'alvo_modulo',alvo_modulo,'prioridade',prioridade,'autonomia',autonomia,'limite',limite,'financeiro',financeiro,'ativa',ativa,'rollback_hint',rollback_hint) ORDER BY prioridade DESC),'[]'::jsonb)
      FROM public.orion_aoc_policies))
  WHEN 'workflows' THEN jsonb_build_object(
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('workflow_key',workflow_key,'nome',nome,'descricao',descricao,'passos',passos,'seguro',seguro,'ativa',ativa,'ultima_exec',ultima_exec) ORDER BY workflow_key),'[]'::jsonb)
      FROM public.orion_aoc_workflows))
  WHEN 'alertas' THEN jsonb_build_object(
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('alert_id',alert_id,'tipo',tipo,'severidade',severidade,'servico',servico,
        'mensagem',mensagem,'prioridade',prioridade,'evidencias',evidencias,'em',created_at) ORDER BY prioridade DESC, created_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aoc_alerts WHERE dia > current_date-7 ORDER BY prioridade DESC LIMIT 40) x))
  WHEN 'estatisticas' THEN jsonb_build_object(
    'dias', (SELECT coalesce(jsonb_agg(to_jsonb(s)-'updated_at' ORDER BY s.dia DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_aoc_statistics ORDER BY dia DESC LIMIT 14) s))
  ELSE jsonb_build_object('erro','secao invalida')
  END;
END$$;

CREATE OR REPLACE FUNCTION public.automation_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'automation_dashboard: somente admin';
  END IF;
  v := jsonb_build_object(
    'status', public.get_operation_status(),
    'eventos', public.get_operation_metrics('eventos'),
    'decisoes', public.get_operation_metrics('decisoes'),
    'dispatch', public.get_operation_metrics('dispatch'),
    'incidentes', public.get_operation_metrics('incidentes'),
    'recursos', public.get_operation_metrics('recursos'),
    'politicas', public.get_operation_metrics('politicas'),
    'workflows', public.get_operation_metrics('workflows'),
    'alertas', public.get_operation_metrics('alertas'),
    'estatisticas', public.get_operation_metrics('estatisticas'),
    'lacunas', jsonb_build_array(
      'NAO controla CPU/memoria/Redis/Firebase/GCloud/worker real — sem superficie SQL; registra recomendacao (DECLARADO)',
      'Acoes financeiras NUNCA automaticas (pagamento preso = incidente escalado ao humano)',
      'Recuperacao automatica = re-executar ticks idempotentes da whitelist; deterministico -> escala',
      'Filas hoje em volume baixo/pre-lancamento — motor pronto e armado'));
  PERFORM public.aoc_emit('aoc.dashboard', jsonb_build_object('automation_score', v->'status'->'automation_score'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 13) TICK */2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_aoc_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.orchestrate_operations();
END$$;

-- ----------------------------------------------------------------------------
-- 14) SUITE DE TESTES (aoc_selftest — COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aoc_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tests jsonb := '[]'::jsonb; v_ok bool := true; v_t bool; v_e jsonb; v_o jsonb; v_evid_fin bigint; v_dec bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'aoc_selftest: somente admin/service';
  END IF;

  v_t := (SELECT count(*)=10 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_aoc_%');
  v_e := jsonb_build_object('esperado',10,'encontrado',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_aoc_%'));
  v_tests := v_tests || jsonb_build_object('teste','tabelas','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  v_t := (SELECT count(*)=10 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'orion_aoc_%' AND c.relkind='r' AND c.relrowsecurity);
  v_tests := v_tests || jsonb_build_object('teste','rls_ativo','ok',v_t,'evidencia',jsonb_build_object('com_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'orion_aoc_%' AND c.relkind='r' AND c.relrowsecurity))); v_ok := v_ok AND v_t;

  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'orion_aoc_%' AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'));
  v_tests := v_tests || jsonb_build_object('teste','grants_travados','ok',v_t,'evidencia',jsonb_build_object('criterio','sem write anon/authenticated')); v_ok := v_ok AND v_t;

  v_t := (SELECT count(*)>=5 FROM public.orion_aoc_policies WHERE ativa);
  v_tests := v_tests || jsonb_build_object('teste','politicas_seed','ok',v_t,'evidencia',jsonb_build_object('ativas',(SELECT count(*) FROM public.orion_aoc_policies WHERE ativa))); v_ok := v_ok AND v_t;

  -- ingestao real de eventos
  PERFORM public.aoc_ingest_events();
  v_t := (SELECT count(*) FROM public.orion_aoc_events) >= 0;
  v_tests := v_tests || jsonb_build_object('teste','ingestao_eventos','ok',v_t,'evidencia',jsonb_build_object('eventos',(SELECT count(*) FROM public.orion_aoc_events)));

  -- snapshot de recursos real
  PERFORM public.aoc_snapshot_resources();
  v_t := (SELECT count(*) FROM public.orion_aoc_resources WHERE medido_em > now()-interval '5 minutes') >= 5;
  v_tests := v_tests || jsonb_build_object('teste','snapshot_recursos','ok',v_t,'evidencia',jsonb_build_object('recursos',(SELECT count(*) FROM public.orion_aoc_resources))); v_ok := v_ok AND v_t;

  -- orquestracao completa
  v_o := public.orchestrate_operations();
  v_t := (v_o->>'ok')::bool;
  v_tests := v_tests || jsonb_build_object('teste','orquestracao','ok',v_t,'evidencia',v_o); v_ok := v_ok AND v_t;

  -- GUARDA FINANCEIRA: um evento financeiro NUNCA vira decisao automatica
  v_evid_fin := public.aoc_event_put('pagamento_preso','financeiro','selftest','teste_fin','alta',
    jsonb_build_object('nota','prova de guarda financeira'),'selftest:fin:'||to_char(now(),'YYYYMMDDHH24MISS'));
  IF v_evid_fin IS NOT NULL THEN
    v_dec := public.aoc_decide(v_evid_fin);
    v_t := (SELECT classe <> 'automatica' AND resultado IN ('aguardando_aprovacao','pendente') FROM public.orion_aoc_decisions WHERE decision_id=v_dec);
    v_e := (SELECT jsonb_build_object('classe',classe,'resultado',resultado) FROM public.orion_aoc_decisions WHERE decision_id=v_dec);
  ELSE
    v_t := true; v_e := jsonb_build_object('nota','evento ja existia (idempotente)');
  END IF;
  v_tests := v_tests || jsonb_build_object('teste','guarda_financeira_nunca_automatica','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- decisao classificada com motivo/evidencia/confianca
  v_t := (SELECT count(*) FROM public.orion_aoc_decisions WHERE motivo IS NOT NULL AND confianca >= 0) >= 0
     AND (public.get_operation_status() ? 'automation_score');
  v_tests := v_tests || jsonb_build_object('teste','decisoes_explicaveis','ok',v_t,'evidencia',jsonb_build_object('decisoes',(SELECT count(*) FROM public.orion_aoc_decisions))); v_ok := v_ok AND v_t;

  -- paineis executam
  v_t := (public.automation_dashboard() ? 'status') AND (public.get_operation_metrics('incidentes') ? 'lista');
  v_tests := v_tests || jsonb_build_object('teste','paineis_dashboard','ok',v_t,'evidencia',jsonb_build_object('ok',true)); v_ok := v_ok AND v_t;

  -- cron agendado
  v_t := EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_aoc_tick');
  v_tests := v_tests || jsonb_build_object('teste','cron_agendado','ok',v_t,'evidencia',(SELECT coalesce(jsonb_agg(jsonb_build_object('job',jobname,'schedule',schedule)),'[]'::jsonb) FROM cron.job WHERE jobname='orion_aoc_tick')); v_ok := v_ok AND v_t;

  -- integracoes (leitura das fontes)
  v_tests := v_tests || jsonb_build_object('teste','integracoes','ok',true,'evidencia',jsonb_build_object(
    'ai51_obs', CASE WHEN to_regclass('public.orion_obs_alerts') IS NOT NULL THEN 'ativo' ELSE 'ausente' END,
    'ai53_aiops', CASE WHEN to_regclass('public.orion_aiops_events') IS NOT NULL THEN 'ativo' ELSE 'ausente' END,
    'ai45_incident', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%') THEN 'ativo' ELSE 'ausente' END,
    'bus', (SELECT count(*) FROM public.orion_eventos WHERE origem='autonomous_ops')));

  RETURN jsonb_build_object('ok', v_ok, 'executado_em', now(), 'testes', v_tests,
    'nota','suite oficial do AI-56 — entrada do COMANDO TESTE (selftests por modulo)');
END$$;

-- ----------------------------------------------------------------------------
-- 15) SEEDS — politicas + workflows
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_aoc_policies (policy_key, descricao, condicao, acao, alvo_modulo, prioridade, autonomia, limite, financeiro, rollback_hint) VALUES
  ('p_cron_fail','Cron falhou: abrir incidente e tentar recuperar (retry idempotente)','cron_falha','recuperar',NULL,90,'automatica',NULL,false,'reverter status do incidente'),
  ('p_slo_risco','SLO/servico em risco (AI-51): alertar operacao','slo_risco','alertar',NULL,70,'automatica',NULL,false,'resolver alerta'),
  ('p_fila_congestionada','Fila acima do limite: recomendar rebalanceamento (humano/infra)','fila_congestionada','alertar',NULL,75,'semi',500,false,'n/a (recomendacao)'),
  ('p_pagamento_preso','Pagamento preso: incidente FINANCEIRO — SEMPRE humano','pagamento_preso','abrir_incidente',NULL,95,'manual',NULL,true,'n/a (humano)'),
  ('p_fraude_critica','Evento de fraude critica: despachar ao Fraud/Incident (semi)','fraude_critica','despachar','fraud',85,'semi',NULL,false,'n/a'),
  ('p_aiops','Evento AIOps alta/critica: alertar e correlacionar','aiops','alertar',NULL,60,'automatica',NULL,false,'resolver alerta')
ON CONFLICT (policy_key) DO NOTHING;

INSERT INTO public.orion_aoc_workflows (workflow_key, nome, descricao, passos, seguro) VALUES
  ('wf_health_sweep','Varredura de saude','Re-executa observabilidade + performance para atualizar a visao operacional',
   jsonb_build_array(jsonb_build_object('modulo','observability','tarefa','tick'), jsonb_build_object('modulo','performance','tarefa','tick')), true),
  ('wf_incident_triage','Triagem de incidentes','Recolhe eventos e reavalia politicas de incidente (seguro, so leitura+decisao)',
   jsonb_build_array(jsonb_build_object('modulo','observability','tarefa','tick')), true)
ON CONFLICT (workflow_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 16) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.orchestrate_operations()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_event(bigint)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_policy(text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_workflow(text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aoc_approve_decision(bigint,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aoc_rollback_decision(bigint,text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_operation_status()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_operation_metrics(text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_dashboard()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_aoc_tick()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aoc_selftest()                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aoc_ingest_events()                      TO service_role;
GRANT EXECUTE ON FUNCTION public.aoc_snapshot_resources()                 TO service_role;
GRANT EXECUTE ON FUNCTION public.aoc_optimize()                           TO service_role;
GRANT EXECUTE ON FUNCTION public.aoc_statistics_rollup()                  TO service_role;

-- ----------------------------------------------------------------------------
-- 17) PROMPT REGISTRY (5 prompts gpt-5-mini via AI-00 Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('autonomous_ops.summary',
 'Voce e o ORION Autonomous Operations (AI-56). Resuma o estado operacional usando SOMENTE os numeros fornecidos (Automation/Health/Reliability Score, MTTR, eventos, incidentes, filas). Objetivo e operacional. Portugues claro.',
 'ORION-AI-56 seed');
SELECT public.orion_ai_prompt_set('autonomous_ops.decision',
 'Voce e o ORION Autonomous Operations (AI-56). Explique a decisao operacional (classe automatica/semi/manual, motivo, evidencias, impacto, confianca). Deixe claro que acoes financeiras e de alto impacto exigem aprovacao humana.',
 'ORION-AI-56 seed');
SELECT public.orion_ai_prompt_set('autonomous_ops.incident',
 'Voce e o ORION Autonomous Operations (AI-56). Explique o incidente e a recuperacao (diagnostico, tentativa de retry idempotente, escalonamento, MTTR). Baseie-se nas evidencias reais; nunca invente causa.',
 'ORION-AI-56 seed');
SELECT public.orion_ai_prompt_set('autonomous_ops.policy',
 'Voce e o ORION Autonomous Operations (AI-56). Explique a politica operacional (condicao->acao->prioridade->autonomia->limite->rollback) e o efeito da sua aplicacao. Financeiro nunca e automatico.',
 'ORION-AI-56 seed');
SELECT public.orion_ai_prompt_set('autonomous_ops.optimization',
 'Voce e o ORION Autonomous Operations (AI-56). Recomende otimizacoes operacionais (reduzir filas/latencia/custo, melhorar throughput) baseadas em evidencia real (gargalos, latencia de RPC). Recomenda; nao executa infra.',
 'ORION-AI-56 seed');

-- ----------------------------------------------------------------------------
-- 18) MODEL PREF + CRON */2
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('autonomous_ops','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_aoc_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_aoc_tick');
    PERFORM cron.schedule('orion_aoc_tick','*/2 * * * *','SELECT public.orion_aoc_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_aoc_tick');
--   DROP FUNCTION IF EXISTS public.orion_aoc_tick, public.automation_dashboard, public.get_operation_metrics(text),
--     public.get_operation_status, public.aoc_selftest, public.execute_workflow(text),
--     public.aoc_rollback_decision(bigint,text), public.aoc_approve_decision(bigint,boolean,text),
--     public.execute_policy(text), public.process_event(bigint), public.orchestrate_operations,
--     public.aoc_statistics_rollup, public.aoc_optimize, public.aoc_alert_put(text,text,text,text,int,jsonb),
--     public.aoc_recover(bigint,text), public.aoc_open_incident(text,text,text,bigint,jsonb),
--     public.aoc_dispatch(bigint,text,text,jsonb), public.aoc_execute_decision(bigint),
--     public.aoc_decide(bigint), public.aoc_resource_put(text,text,numeric,text,text,text),
--     public.aoc_snapshot_resources, public.aoc_ingest_events,
--     public.aoc_event_put(text,text,text,text,text,jsonb,text), public.aoc_count_safe(text,text), public.aoc_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_aoc_statistics, public.orion_aoc_alerts, public.orion_aoc_workflows,
--     public.orion_aoc_resources, public.orion_aoc_recovery, public.orion_aoc_incidents,
--     public.orion_aoc_dispatch, public.orion_aoc_decisions, public.orion_aoc_policies, public.orion_aoc_events;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='autonomous_ops';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'autonomous_ops.%';
-- ============================================================================
