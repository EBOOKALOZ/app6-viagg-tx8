-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-10 — HEALTH & OBSERVABILITY CENTER v2.0 (Core Monitoring)
--
-- Monitora DISPONIBILIDADE, erros, serviços e incidentes de todo o
-- ecossistema. Não duplica lógica (regra ORION): reusa
-- orion_core_health(), performance_score()/report() e o sistema
-- nervoso (orion_eventos = Event Engine). O que o ambiente não expõe
-- (Realtime/Storage/CPU/Web Vitals) aparece como
-- "Dado indisponível para este ambiente" — nunca estimado.
-- Trace Engine: orion_trace + orion_trace_registrar (adoção pelos
-- módulos é incremental e declarada). Histórico imutável.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_health_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score       int NOT NULL,
  componentes jsonb NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_health_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ohs_admin ON public.orion_health_snapshots;
CREATE POLICY ohs_admin ON public.orion_health_snapshots
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_health_snapshots FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_health_incidentes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,
  severidade   text NOT NULL,            -- informativo|baixo|medio|alto|critico
  titulo       text NOT NULL,
  origem       text,
  impacto      text,
  dados        jsonb DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'aberto',   -- aberto|resolvido
  causa_raiz   text,
  responsavel  uuid,
  trace_id     uuid,
  aberto_em    timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ohi_aberto_unico
  ON public.orion_health_incidentes (tipo) WHERE status = 'aberto';
ALTER TABLE public.orion_health_incidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ohi_admin ON public.orion_health_incidentes;
CREATE POLICY ohi_admin ON public.orion_health_incidentes
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.orion_trace (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id       uuid NOT NULL,
  request_id     text,
  correlation_id text,
  user_id        uuid,
  cidade         text,
  origem         text NOT NULL,
  destino        text,
  modulo         text,
  tempo_ms       int,
  resultado      text,
  erro           text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_trace_tid ON public.orion_trace (trace_id);
ALTER TABLE public.orion_trace ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS otr_admin ON public.orion_trace;
CREATE POLICY otr_admin ON public.orion_trace
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_trace FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.orion_trace_registrar(
  p_trace uuid, p_origem text, p_destino text DEFAULT NULL, p_modulo text DEFAULT NULL,
  p_tempo_ms int DEFAULT NULL, p_resultado text DEFAULT 'ok', p_erro text DEFAULT NULL,
  p_cidade text DEFAULT NULL, p_request text DEFAULT NULL, p_correlation text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  INSERT INTO orion_trace (trace_id, origem, destino, modulo, tempo_ms, resultado, erro,
    cidade, request_id, correlation_id, user_id)
  VALUES (coalesce(p_trace, gen_random_uuid()), p_origem, p_destino, p_modulo, p_tempo_ms,
    p_resultado, p_erro, p_cidade, p_request, p_correlation, auth.uid())
  RETURNING trace_id INTO v;
  RETURN v;
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_trace_registrar(uuid, text, text, text, int, text, text, text, text, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- health_status(): disponibilidade por componente (checks vivos)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.health_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st jsonb := '{}'::jsonb;
  v_gw_ult text; v_cron_falhas int; v_worker_ult timestamptz;
  comp text; jobname text;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  -- banco: se esta função responde, o banco está de pé; degradação por locks
  st := st || jsonb_build_object('banco', CASE
    WHEN (SELECT count(*) FROM pg_locks WHERE NOT granted) > 0 THEN 'degradado' ELSE 'operacional' END);

  -- gateway IA: última chamada nas 24h
  SELECT status INTO v_gw_ult FROM orion_ai_log ORDER BY criado_em DESC LIMIT 1;
  st := st || jsonb_build_object('gateway_ia', CASE
    WHEN v_gw_ult IS NULL THEN 'sem_trafego'
    WHEN v_gw_ult = 'erro' THEN 'degradado' ELSE 'operacional' END);

  -- crons (workers agendados)
  SELECT count(*) INTO v_cron_falhas FROM cron.job_run_details
   WHERE status <> 'succeeded' AND end_time > now() - interval '2 hours';
  st := st || jsonb_build_object('cron_workers', CASE
    WHEN (SELECT count(*) FROM cron.job WHERE active) = 0 THEN 'parado'
    WHEN v_cron_falhas > 0 THEN 'degradado' ELSE 'operacional' END);

  -- dispatcher workers (heartbeat GLM)
  SELECT max(heartbeat_em) INTO v_worker_ult FROM orion_dispatch_workers;
  st := st || jsonb_build_object('dispatcher_workers', CASE
    WHEN v_worker_ult IS NULL THEN 'sem_trafego'
    WHEN v_worker_ult < now() - interval '1 day' THEN 'ocioso' ELSE 'operacional' END);

  -- módulos ORION por atividade/DLQ e core_health
  st := st || jsonb_build_object(
    'publisher',  CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname ILIKE '%publisher%' AND NOT tgisinternal) >= 6 THEN 'operacional' ELSE 'degradado' END,
    'ridv',       CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname='trg_ridv_v2_universal_queue' AND NOT tgisinternal) >= 8 THEN 'operacional' ELSE 'degradado' END,
    'package',    CASE WHEN (SELECT count(*) FROM orion_pacotes WHERE status='dlq') > 0 THEN 'degradado' ELSE 'operacional' END,
    'campaign',   CASE WHEN (SELECT count(*) FROM orion_campanhas WHERE status='dlq') > 0 THEN 'degradado' ELSE 'operacional' END,
    'dispatcher', CASE WHEN (SELECT count(*) FROM orion_dispatch_queue WHERE status='dlq') > 0 THEN 'degradado' ELSE 'operacional' END,
    'motor',      CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname='motor_publish_execute') = 1 THEN 'operacional' ELSE 'indisponivel' END,
    'finance',    CASE WHEN (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta' AND gravidade='critico') > 0 THEN 'atencao' ELSE 'operacional' END,
    'growth',     CASE WHEN (SELECT count(*) FROM orion_growth_scores) > 0 THEN 'operacional' ELSE 'sem_dados' END,
    'performance_ai', CASE WHEN (SELECT count(*) FROM orion_perf_snapshots) > 0 THEN 'operacional' ELSE 'sem_dados' END,
    'marketplace_vitrines', CASE WHEN (SELECT count(*) FROM market_all_listings) > 0 THEN 'operacional' ELSE 'sem_dados' END,
    'financeiro_pay', CASE WHEN (SELECT count(*) FROM pay_financial_accounts) > 0 THEN 'operacional' ELSE 'sem_dados' END);

  -- não mensuráveis neste ambiente (NUNCA estimar)
  st := st || jsonb_build_object(
    'realtime', 'Dado indisponível para este ambiente.',
    'storage_api', 'Dado indisponível para este ambiente.',
    'edge_functions_latencia', 'Dado indisponível para este ambiente (logs do Supabase).',
    'redis', 'não existe neste ambiente',
    'frontend_web_vitals', 'Dado indisponível (requer coleta no navegador).');

  RETURN st;
END; $$;
GRANT EXECUTE ON FUNCTION public.health_status() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- health_score(): disponibilidade + reuso de core_health e perf
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.health_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st jsonb; disp numeric; n int := 0; s int := 0; k text; v text;
  core int; perf int;
BEGIN
  st := health_status();
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(st) LOOP
    CONTINUE WHEN v LIKE 'Dado indisponível%' OR v IN ('não existe neste ambiente');
    n := n + 1;
    s := s + CASE v WHEN 'operacional' THEN 100 WHEN 'sem_trafego' THEN 100
                    WHEN 'ocioso' THEN 90 WHEN 'sem_dados' THEN 80
                    WHEN 'atencao' THEN 70 WHEN 'degradado' THEN 50 ELSE 0 END;
  END LOOP;
  disp := CASE WHEN n > 0 THEN round(s::numeric / n) ELSE 0 END;

  core := (orion_core_health()->>'score_geral')::int;
  SELECT score INTO perf FROM orion_perf_snapshots ORDER BY criado_em DESC LIMIT 1;

  RETURN jsonb_build_object(
    'health_score', round((disp * 0.5 + core * 0.3 + coalesce(perf, disp) * 0.2)),
    'disponibilidade', disp,
    'core_health', core,
    'performance_score', perf,
    'status', st,
    'formula', 'disponibilidade×0,5 + core_health×0,3 + performance×0,2 (componentes não mensuráveis excluídos, declarados)');
END; $$;
GRANT EXECUTE ON FUNCTION public.health_score() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- Demais APIs oficiais
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.health_incidents()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'abertos', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.aberto_em DESC), '[]')
      FROM (SELECT *, extract(epoch FROM now() - aberto_em)/3600 AS horas_aberto
            FROM orion_health_incidentes WHERE status='aberto') i),
    'historico', (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.aberto_em DESC), '[]')
      FROM (SELECT *, extract(epoch FROM coalesce(resolvido_em, now()) - aberto_em)/3600 AS horas_resolucao
            FROM orion_health_incidentes WHERE status='resolvido'
            ORDER BY aberto_em DESC LIMIT 20) h));
$$;
GRANT EXECUTE ON FUNCTION public.health_incidents() TO authenticated;

CREATE OR REPLACE FUNCTION public.health_events(p_filtro text DEFAULT NULL, p_limite int DEFAULT 50)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tipo', tipo, 'origem', origem, 'dados', dados, 'quando', criado_em) ORDER BY criado_em DESC), '[]')
  FROM (SELECT * FROM orion_eventos
        WHERE p_filtro IS NULL OR tipo ILIKE '%'||p_filtro||'%' OR origem ILIKE '%'||p_filtro||'%'
           OR dados::text ILIKE '%'||p_filtro||'%'
        ORDER BY criado_em DESC LIMIT least(p_limite, 200)) e;
$$;
GRANT EXECUTE ON FUNCTION public.health_events(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.health_alerts()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  -- agregador (sem lógica duplicada): incidentes + alertas perf + alertas finance
  SELECT jsonb_build_object(
    'incidentes_abertos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'fonte','health','severidade',severidade,'titulo',titulo,'quando',aberto_em)), '[]')
      FROM orion_health_incidentes WHERE status='aberto'),
    'performance', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'fonte','performance','severidade',severidade,'titulo',titulo,'quando',criado_em)), '[]')
      FROM orion_perf_alertas WHERE status='aberto'),
    'finance', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'fonte','finance','severidade',severidade,'titulo',titulo,'quando',criado_em)), '[]')
      FROM orion_finance_alertas WHERE status='aberto'));
$$;
GRANT EXECUTE ON FUNCTION public.health_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.health_predictions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atual int; v_media numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT score INTO v_atual FROM orion_health_snapshots ORDER BY criado_em DESC LIMIT 1;
  SELECT avg(score) INTO v_media FROM orion_health_snapshots WHERE criado_em > now()-interval '7 days';
  RETURN jsonb_build_object(
    'tendencia_disponibilidade', CASE WHEN v_atual IS NULL THEN 'histórico insuficiente'
      WHEN v_media IS NULL OR v_atual >= v_media THEN 'estável' ELSE 'em queda — ver incidentes' END,
    'reuso_performance', performance_predictions(),
    'nota', 'PROJEÇÃO baseada em séries próprias — nunca estimativa inventada');
END; $$;
GRANT EXECUTE ON FUNCTION public.health_predictions() TO authenticated;

CREATE OR REPLACE FUNCTION public.health_trace(p_trace uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.criado_em), '[]')
  FROM orion_trace t WHERE t.trace_id = p_trace;
$$;
GRANT EXECUTE ON FUNCTION public.health_trace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.health_report()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'score', health_score(),
    'incidentes', health_incidents(),
    'alertas', health_alerts(),
    'serie_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('quando', criado_em, 'score', score) ORDER BY criado_em), '[]')
      FROM orion_health_snapshots WHERE criado_em > now()-interval '7 days'),
    'consumo_ia', jsonb_build_object(
      'tokens_30d', (SELECT coalesce(sum(tokens_in)+sum(tokens_out),0) FROM orion_ai_log WHERE criado_em>now()-interval '30 days'),
      'custo_30d_usd', (SELECT round(coalesce(sum(custo_estimado),0),4) FROM orion_ai_log WHERE criado_em>now()-interval '30 days'),
      'latencia_media_ms', (SELECT round(avg(duracao_ms)) FROM orion_ai_log WHERE status='ok' AND criado_em>now()-interval '7 days')),
    'gerado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.health_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.health_incident_resolver(p_id uuid, p_causa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  UPDATE orion_health_incidentes
     SET status='resolvido', resolvido_em=now(), causa_raiz=p_causa, responsavel=auth.uid()
   WHERE id = p_id AND status='aberto';
  IF NOT FOUND THEN RAISE EXCEPTION 'Incidente não encontrado/já resolvido'; END IF;
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('health_incident_resolvido','health_center',
      jsonb_build_object('incidente', p_id, 'causa', p_causa, 'por', auth.uid()));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.health_incident_resolver(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron 20 min): snapshot + Alert Engine (abre/fecha incidentes)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_health_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hs jsonb; v_score int; v_dlq int; v_cron_parado int; v_gw_err int; v_perf int;
BEGIN
  hs := health_score();
  v_score := (hs->>'health_score')::int;
  INSERT INTO orion_health_snapshots (score, componentes) VALUES (v_score, hs);

  -- regras do Alert Engine (abre incidente único por tipo)
  v_dlq := (SELECT count(*) FROM orion_dispatch_queue WHERE status='dlq')
         + (SELECT count(*) FROM orion_pacotes WHERE status='dlq')
         + (SELECT count(*) FROM orion_campanhas WHERE status='dlq');
  IF v_dlq > 0 THEN
    INSERT INTO orion_health_incidentes (tipo, severidade, titulo, origem, impacto, dados)
    VALUES ('dlq_presente','alto', format('%s item(ns) em Dead Letter Queue', v_dlq),
      'dispatcher/package/campaign','itens não processados aguardam revisão', jsonb_build_object('dlq', v_dlq))
    ON CONFLICT (tipo) WHERE status='aberto' DO NOTHING;
  ELSE
    UPDATE orion_health_incidentes SET status='resolvido', resolvido_em=now(),
      causa_raiz='condição normalizada automaticamente'
    WHERE tipo='dlq_presente' AND status='aberto';
  END IF;

  SELECT count(*) INTO v_cron_parado FROM cron.job WHERE NOT active;
  IF v_cron_parado > 0 THEN
    INSERT INTO orion_health_incidentes (tipo, severidade, titulo, origem, dados)
    VALUES ('cron_parado','critico', format('%s cron(s) inativo(s)', v_cron_parado), 'pg_cron',
      jsonb_build_object('inativos', v_cron_parado))
    ON CONFLICT (tipo) WHERE status='aberto' DO NOTHING;
  ELSE
    UPDATE orion_health_incidentes SET status='resolvido', resolvido_em=now(),
      causa_raiz='condição normalizada automaticamente'
    WHERE tipo='cron_parado' AND status='aberto';
  END IF;

  SELECT count(*) INTO v_gw_err FROM orion_ai_log WHERE status='erro' AND criado_em > now()-interval '1 hour';
  IF v_gw_err >= 3 THEN
    INSERT INTO orion_health_incidentes (tipo, severidade, titulo, origem, dados)
    VALUES ('gateway_erros_repetitivos','alto', format('%s erros de IA na última hora', v_gw_err),
      'orion-ai-gateway', jsonb_build_object('erros', v_gw_err))
    ON CONFLICT (tipo) WHERE status='aberto' DO NOTHING;
  END IF;

  IF v_score < 80 THEN
    INSERT INTO orion_health_incidentes (tipo, severidade, titulo, origem, dados)
    VALUES ('health_score_baixo','critico', format('Health Score em %s (<80)', v_score),
      'health_center', hs)
    ON CONFLICT (tipo) WHERE status='aberto' DO NOTHING;
  ELSE
    UPDATE orion_health_incidentes SET status='resolvido', resolvido_em=now(),
      causa_raiz='condição normalizada automaticamente'
    WHERE tipo='health_score_baixo' AND status='aberto';
  END IF;

  SELECT score INTO v_perf FROM orion_perf_snapshots ORDER BY criado_em DESC LIMIT 1;
  IF v_perf IS NOT NULL AND v_perf < 80 THEN
    INSERT INTO orion_health_incidentes (tipo, severidade, titulo, origem, dados)
    VALUES ('performance_score_baixo','alto', format('Performance Score em %s (<80)', v_perf),
      'performance_ai', jsonb_build_object('score', v_perf))
    ON CONFLICT (tipo) WHERE status='aberto' DO NOTHING;
  END IF;

  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('health_snapshot','health_center', jsonb_build_object('score', v_score));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_health_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_health_tick', '*/20 * * * *', 'SELECT public.orion_health_tick()');
END $$;

-- Prompt oficial do Narrative Engine
SELECT public.orion_ai_prompt_set('health.narrativa',
'Você é o ORION Health & Observability Center da VIAGG-TX8. Receberá o estado real de saúde da plataforma em JSON e o tipo de resumo (executivo, tecnico, operacional, financeiro, diario, semanal ou mensal). Escreva em pt-BR, 5-9 frases: status geral, componentes degradados/incidentes (se houver), disponibilidade, consumo de IA, e a ação prioritária. Cite números do JSON; se um componente estiver marcado como "Dado indisponível", mencione a limitação sem estimar valores.',
'Seed ORION-AI-10')
WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave = 'health.narrativa');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('health', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
