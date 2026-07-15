-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-08 — EXECUTION AI v1.0 (Execution Engine)
--
-- Executor oficial: recebe ações APROVADAS e as executa chamando
-- EXCLUSIVAMENTE as RPCs oficiais já certificadas (nunca lógica
-- paralela): iniciar_campanha→orion_campaign_iniciar,
-- enviar_pacote_motor→orion_package_enviar_motor,
-- executar_divulgacao→orion_dispatcher_planejar, notificacao→evento.
-- Aprovação humana configurável (execucao_auto_aprovar, default OFF).
-- Pipeline: validar→executar→registrar→instrumentar (touchpoint p/
-- AI-09)→notificar. Trace/rollback/retry backoff→DLQ/idempotência
-- por chave. Postagem FÍSICA no WhatsApp permanece com o worker GLM
-- humano/integração externa (declarado — sem lógica paralela).
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_execucoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave         text UNIQUE,                 -- idempotência
  tipo          text NOT NULL,               -- iniciar_campanha|enviar_pacote_motor|executar_divulgacao|notificacao
  origem        text NOT NULL,               -- operations|strategy|campaign|admin|...
  alvo_id       uuid,
  parametros    jsonb DEFAULT '{}'::jsonb,
  prioridade    int NOT NULL DEFAULT 50,
  dependencias  uuid[] NOT NULL DEFAULT '{}',  -- workflows que precisam concluir antes
  status        text NOT NULL DEFAULT 'aguardando_aprovacao',
                -- aguardando_aprovacao|agendada|em_execucao|concluida|falha|dlq|cancelada
  agendado_para timestamptz NOT NULL DEFAULT now(),
  executor      text,
  tentativas    int NOT NULL DEFAULT 0,
  proxima_tentativa timestamptz,
  resultado     jsonb,
  erro          text,
  rollback_acao text,                        -- ação inversa declarada (quando existir)
  trace_id      uuid NOT NULL DEFAULT gen_random_uuid(),
  correlation_id text,
  aprovado_por  uuid,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  iniciado_em   timestamptz,
  concluido_em  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_oexec_status ON public.orion_execucoes (status, agendado_para);
ALTER TABLE public.orion_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oexec_admin ON public.orion_execucoes;
CREATE POLICY oexec_admin ON public.orion_execucoes
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_execucoes FROM authenticated, anon;

INSERT INTO public.orion_ai_config (chave, valor) VALUES ('execucao_auto_aprovar', 'false')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.execution_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'execution_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END; $$;

-- ─────────────────────────────────────────────
-- AGENDAR (fontes oficiais/admin) — nasce aguardando aprovação
-- salvo auto_aprovar ligado OU origem admin
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.execution_schedule(text, text, uuid, jsonb, timestamptz, int, text);
ALTER TABLE public.orion_execucoes ADD COLUMN IF NOT EXISTS dependencias uuid[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.execution_schedule(
  p_tipo text, p_origem text, p_alvo uuid DEFAULT NULL,
  p_parametros jsonb DEFAULT '{}'::jsonb, p_quando timestamptz DEFAULT now(),
  p_prioridade int DEFAULT 50, p_chave text DEFAULT NULL, p_dependencias uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; v_auto boolean; v_status text; v_rb text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF p_tipo NOT IN ('iniciar_campanha','enviar_pacote_motor','executar_divulgacao','notificacao') THEN
    RAISE EXCEPTION 'Tipo de execução inválido: %', p_tipo;
  END IF;
  v_auto := coalesce((SELECT valor::text::boolean FROM orion_ai_config WHERE chave='execucao_auto_aprovar'), false);
  v_status := CASE WHEN v_auto OR p_origem = 'admin' THEN 'agendada' ELSE 'aguardando_aprovacao' END;
  v_rb := CASE p_tipo WHEN 'iniciar_campanha' THEN 'orion_campaign_estado(alvo, pausar)'
                      WHEN 'enviar_pacote_motor' THEN 'motor_publish_cancel(requests gerados)'
                      ELSE 'não aplicável (ação idempotente/informativa)' END;

  INSERT INTO orion_execucoes (chave, tipo, origem, alvo_id, parametros, prioridade, dependencias,
    status, agendado_para, rollback_acao, criado_por, aprovado_por)
  VALUES (coalesce(p_chave, p_tipo||':'||coalesce(p_alvo::text, gen_random_uuid()::text)),
    p_tipo, p_origem, p_alvo, p_parametros, p_prioridade, coalesce(p_dependencias,'{}'), v_status, p_quando, v_rb,
    auth.uid(), CASE WHEN v_status = 'agendada' AND p_origem = 'admin' THEN auth.uid() END)
  ON CONFLICT (chave) DO NOTHING
  RETURNING id INTO v;
  IF v IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicada', true);
  END IF;
  PERFORM execution_emit('execution_agendada',
    jsonb_build_object('execucao', v, 'tipo', p_tipo, 'origem', p_origem, 'status', v_status));
  RETURN jsonb_build_object('ok', true, 'id', v, 'status', v_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_schedule(text, text, uuid, jsonb, timestamptz, int, text, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.execution_aprovar(p_id uuid, p_acao text DEFAULT 'aprovar')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  IF p_acao = 'aprovar' THEN
    UPDATE orion_execucoes SET status='agendada', aprovado_por=auth.uid()
    WHERE id=p_id AND status='aguardando_aprovacao';
  ELSE
    UPDATE orion_execucoes SET status='cancelada', aprovado_por=auth.uid(),
      erro='cancelada na aprovação' WHERE id=p_id AND status IN ('aguardando_aprovacao','agendada','falha');
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Execução não encontrada/estado inválido'; END IF;
  PERFORM execution_emit('execution_'||p_acao, jsonb_build_object('execucao', p_id, 'por', auth.uid()));
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_aprovar(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- EXECUTOR: pipeline (claim concorrente-seguro → RPC oficial →
-- resultado → touchpoint AI-09 → evento). Retry backoff → DLQ.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.execution_run(p_limite int DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD; v_res jsonb; v_ok boolean; v_erro text; v_out jsonb := '[]'::jsonb; v_canais text[];
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  FOR e IN
    SELECT * FROM orion_execucoes o
    WHERE o.status IN ('agendada','falha') AND o.agendado_para <= now()
      AND (o.proxima_tentativa IS NULL OR o.proxima_tentativa <= now())
      -- dependências: só executa quando TODAS já concluíram (orquestração)
      AND NOT EXISTS (SELECT 1 FROM unnest(o.dependencias) dep
                      JOIN orion_execucoes d ON d.id = dep
                      WHERE d.status <> 'concluida')
    ORDER BY o.prioridade DESC, o.agendado_para
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE orion_execucoes SET status='em_execucao', executor='execution-ai',
      iniciado_em=coalesce(iniciado_em, now()) WHERE id=e.id;
    v_ok := true; v_erro := NULL; v_res := NULL;

    BEGIN
      IF e.tipo = 'iniciar_campanha' THEN
        v_canais := coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(e.parametros->'canais') x),
                             ARRAY['feed','whatsapp']);
        v_res := orion_campaign_iniciar(e.alvo_id, v_canais);        -- RPC oficial
      ELSIF e.tipo = 'enviar_pacote_motor' THEN
        v_canais := coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(e.parametros->'canais') x),
                             ARRAY['feed','whatsapp']);
        v_res := orion_package_enviar_motor(e.alvo_id, v_canais);    -- RPC oficial
      ELSIF e.tipo = 'executar_divulgacao' THEN
        v_res := orion_dispatcher_planejar(20);                      -- RPC oficial (idempotente)
      ELSIF e.tipo = 'notificacao' THEN
        PERFORM execution_emit('execution_notificacao', e.parametros);
        v_res := jsonb_build_object('ok', true, 'entregue', 'sistema nervoso');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_ok := false; v_erro := SQLERRM;
    END;

    IF v_ok THEN
      UPDATE orion_execucoes SET status='concluida', resultado=v_res,
        concluido_em=now(), erro=NULL WHERE id=e.id;
      -- instrumentação → AI-09 (touchpoint da execução)
      INSERT INTO orion_touchpoints (tipo, origem, campanha_id, pacote_id, trace_id, canal, dados, chave)
      VALUES ('publicacao', 'execution',
        CASE WHEN e.tipo='iniciar_campanha' THEN e.alvo_id END,
        CASE WHEN e.tipo='enviar_pacote_motor' THEN e.alvo_id END,
        e.trace_id, e.tipo,
        jsonb_build_object('execucao', e.id, 'resultado', v_res), 'exec:'||e.id)
      ON CONFLICT (chave) DO NOTHING;
      PERFORM execution_emit('execution_concluida',
        jsonb_build_object('execucao', e.id, 'tipo', e.tipo, 'trace_id', e.trace_id));
    ELSE
      UPDATE orion_execucoes SET
        status = CASE WHEN tentativas + 1 >= 3 THEN 'dlq' ELSE 'falha' END,
        tentativas = tentativas + 1, erro = v_erro,
        proxima_tentativa = now() + (power(2, tentativas + 1) * 5 || ' minutes')::interval
      WHERE id = e.id;
      PERFORM execution_emit(
        CASE WHEN e.tentativas + 1 >= 3 THEN 'execution_dlq' ELSE 'execution_retry' END,
        jsonb_build_object('execucao', e.id, 'erro', v_erro, 'tentativas', e.tentativas + 1));
    END IF;

    v_out := v_out || jsonb_build_object('id', e.id, 'tipo', e.tipo, 'ok', v_ok, 'erro', v_erro);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processadas', jsonb_array_length(v_out), 'detalhe', v_out);
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_run(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.execution_rollback(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD; v jsonb;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO e FROM orion_execucoes WHERE id = p_id AND status = 'concluida';
  IF e IS NULL THEN RAISE EXCEPTION 'Execução não encontrada/não concluída'; END IF;
  IF e.tipo = 'iniciar_campanha' THEN
    v := orion_campaign_estado(e.alvo_id, 'pausar', 'rollback da execução '||e.id);
  ELSE
    RAISE EXCEPTION 'Rollback não disponível para o tipo % (%)', e.tipo, e.rollback_acao;
  END IF;
  PERFORM execution_emit('execution_rollback', jsonb_build_object('execucao', p_id, 'por', auth.uid()));
  RETURN jsonb_build_object('ok', true, 'rollback', v);
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_rollback(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- Geração automática a partir do ecossistema (fontes oficiais)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.execution_gerar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  -- pacotes montados sem envio → execução proposta (aguardando aprovação)
  FOR r IN SELECT id FROM orion_pacotes WHERE status='montado' LOOP
    PERFORM execution_schedule('enviar_pacote_motor', 'package', r.id, '{}'::jsonb, now(), 60,
      'enviar_pacote_motor:'||r.id);
    n := n + 1;
  END LOOP;
  -- campanhas planejadas → execução proposta
  FOR r IN SELECT id FROM orion_campanhas WHERE status='planejada' LOOP
    PERFORM execution_schedule('iniciar_campanha', 'campaign', r.id, '{}'::jsonb, now(), 70,
      'iniciar_campanha:'||r.id);
    n := n + 1;
  END LOOP;
  -- motor aguardando → planejar despacho
  IF EXISTS (SELECT 1 FROM motor_publish_requests WHERE status='aguardando_dispatcher') THEN
    PERFORM execution_schedule('executar_divulgacao', 'dispatcher', NULL, '{}'::jsonb, now(), 80,
      'executar_divulgacao:pendentes');
    n := n + 1;
  END IF;
  RETURN jsonb_build_object('ok', true, 'propostas', n);
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_gerar() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- APIs de leitura / score / narrativa
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.execution_queue(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.prioridade DESC, e.agendado_para), '[]')
  FROM (SELECT * FROM orion_execucoes WHERE p_status IS NULL OR status = p_status
        ORDER BY prioridade DESC, agendado_para LIMIT 50) e;
$$;
GRANT EXECUTE ON FUNCTION public.execution_queue(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_history()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.concluido_em DESC), '[]')
  FROM (SELECT id, tipo, origem, status, resultado, erro, trace_id,
               round(extract(epoch FROM concluido_em - iniciado_em)*1000) AS duracao_ms, concluido_em
        FROM orion_execucoes WHERE status IN ('concluida','cancelada')
        ORDER BY concluido_em DESC NULLS LAST LIMIT 30) e;
$$;
GRANT EXECUTE ON FUNCTION public.execution_history() TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_failures()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.criado_em DESC), '[]')
  FROM (SELECT id, tipo, origem, status, tentativas, erro, proxima_tentativa, trace_id, criado_em
        FROM orion_execucoes WHERE status IN ('falha','dlq')
        ORDER BY criado_em DESC LIMIT 30) e;
$$;
GRANT EXECUTE ON FUNCTION public.execution_failures() TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM
      (SELECT status, count(*) n FROM orion_execucoes GROUP BY 1) s),
    'tempo_medio_ms', (SELECT round(avg(extract(epoch FROM concluido_em - iniciado_em)*1000))
      FROM orion_execucoes WHERE status='concluida'),
    'tempo_max_ms', (SELECT round(max(extract(epoch FROM concluido_em - iniciado_em)*1000))
      FROM orion_execucoes WHERE status='concluida'),
    'tempo_min_ms', (SELECT round(min(extract(epoch FROM concluido_em - iniciado_em)*1000))
      FROM orion_execucoes WHERE status='concluida'));
$$;
GRANT EXECUTE ON FUNCTION public.execution_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t int; c int; f int; v int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE status='concluida'),
         count(*) FILTER (WHERE status IN ('falha','dlq'))
    INTO t, c, f FROM orion_execucoes;
  v := CASE WHEN t = 0 THEN 100 ELSE greatest(0, round(c * 100.0 / t) - f * 5) END;
  RETURN jsonb_build_object('execution_score', v,
    'taxa_sucesso_pct', CASE WHEN t > 0 THEN round(c*100.0/t,1) ELSE NULL END,
    'total', t, 'concluidas', c, 'falhas_dlq', f,
    'tempos', execution_metrics(),
    'formula', 'sucesso% − 5×(falhas+dlq); 100 quando sem histórico (nada recalculado de outros módulos)');
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_pipeline(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'execucao', (SELECT to_jsonb(e) FROM orion_execucoes e WHERE id = p_id),
    'eventos', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'quando', criado_em)
        ORDER BY criado_em), '[]')
      FROM orion_eventos WHERE dados->>'execucao' = p_id::text),
    'touchpoint_ai09', (SELECT to_jsonb(t) FROM orion_touchpoints t WHERE t.chave = 'exec:'||p_id),
    'etapas', jsonb_build_array('receber','validar','aprovar (humano/config)','executar via RPC oficial',
      'registrar resultado','instrumentar AI-09','notificar (evento)'));
$$;
GRANT EXECUTE ON FUNCTION public.execution_pipeline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_performance()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'metrics', execution_metrics(),
    'dispatcher_throughput_reuso', (SELECT count(*) FROM orion_dispatch_queue
      WHERE status='confirmada' AND confirmada_em > now()-interval '24 hours'),
    'fonte', 'orion_execucoes + Dispatcher (reuso)');
$$;
GRANT EXECUTE ON FUNCTION public.execution_performance() TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', execution_score(), 'fila', execution_queue('aguardando_aprovacao'),
    'falhas', execution_failures(),
    'prompt_keys', jsonb_build_array('execution.summary','execution.daily','execution.failure',
      'execution.performance','execution.insights'));
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.execution_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('execution_dashboard_consultado',
      'execution_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', execution_score(),
    'fila', execution_queue(NULL),
    'historico', execution_history(),
    'falhas', execution_failures(),
    'auto_aprovar', (SELECT valor FROM orion_ai_config WHERE chave='execucao_auto_aprovar'),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.execution_dashboard() TO authenticated;

-- Tick: gera propostas + executa aprovadas (10 min)
CREATE OR REPLACE FUNCTION public.orion_execution_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM execution_gerar();
  PERFORM execution_run(5);
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_execution_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_execution_tick', '*/10 * * * *', 'SELECT public.orion_execution_tick()');
END $$;

-- Prompts oficiais (5)
SELECT public.orion_ai_prompt_set('execution.summary',
'Você é o Execution AI da VIAGG-TX8. Receberá o estado da central de execução (score, fila, aprovações pendentes, falhas). Resuma em pt-BR (5-8 frases): o que está executando, o que aguarda aprovação humana, falhas e a próxima ação. Cite números do JSON; nunca invente.',
'Seed ORION-AI-08') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='execution.summary');
SELECT public.orion_ai_prompt_set('execution.daily',
'Você é o Execution AI da VIAGG-TX8. Gere o relatório diário de execuções em pt-BR (5-8 frases): concluídas, taxa de sucesso, tempos, falhas relevantes e pendências de aprovação, sempre com os números do JSON.',
'Seed ORION-AI-08') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='execution.daily');
SELECT public.orion_ai_prompt_set('execution.failure',
'Você analisa falhas de execução da VIAGG-TX8. Receberá as falhas/DLQ com erro e tentativas. Explique em pt-BR (4-7 frases) causa provável, se o retry resolve e quando escalar para humano. Não invente causas fora dos erros do JSON.',
'Seed ORION-AI-08') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='execution.failure');
SELECT public.orion_ai_prompt_set('execution.performance',
'Você analisa a performance do executor da VIAGG-TX8 (tempos, throughput reusado do Dispatcher). Avalie em pt-BR (4-6 frases) se a execução está saudável e o que otimizar, citando os números.',
'Seed ORION-AI-08') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='execution.performance');
SELECT public.orion_ai_prompt_set('execution.insights',
'Você gera insights do executor da VIAGG-TX8: padrões de falha, tipos mais executados, gargalos de aprovação. Responda em pt-BR (4-7 frases) com base exclusiva no JSON.',
'Seed ORION-AI-08') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='execution.insights');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('execution', 'gpt-5-nano')
ON CONFLICT (module) DO NOTHING;
