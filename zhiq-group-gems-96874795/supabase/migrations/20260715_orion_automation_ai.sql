-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-21 — AUTOMATION AI v1.0
--   Camada oficial de automação inteligente (orquestração por política).
--
-- Módulo NOVO (primeiro do número reservado AI-21). PRINCÍPIO MÁXIMO:
-- NUNCA DECIDE — apenas EXECUTA recomendações já aprovadas pelos demais
-- módulos ORION, sob POLÍTICA + PERMISSÃO + IDEMPOTÊNCIA + AUDITORIA.
--
-- NÃO duplica o AI-08 (Execution Orchestrator, que executa workflows via
-- RPCs oficiais). O AI-21 é a CAMADA DE GOVERNANÇA por política na frente
-- da execução: recebe pedidos, valida política/permissão/idempotência/
-- janela/concorrência e SÓ executa ações de uma ALLOWLIST SEGURA
-- (recalcular scores/insights que já existem). Workflows complexos são
-- delegados (Event Bus) aos donos. BLOQUEIO DURO de tudo financeiro/
-- destrutivo — mesmo que a política seja afrouxada (dupla trava).
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_automation_requests, orion_automation_policies CASCADE;
--   DROP FUNCTION public.automation_emit, _automation_forbidden, _automation_run,
--     automation_request, automation_execute, automation_approve, automation_reject,
--     automation_rollback, automation_policies, automation_set_policy, automation_queue,
--     automation_score, automation_metrics, automation_history, automation_summary,
--     automation_dashboard, orion_automation_tick CASCADE;
--   SELECT cron.unschedule('orion_automation_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'automation.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='automation';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
-- Motor de políticas (configurável)
CREATE TABLE IF NOT EXISTS public.orion_automation_policies (
  acao        text PRIMARY KEY,
  categoria   text NOT NULL,
  modo        text NOT NULL DEFAULT 'aprovacao' CHECK (modo IN ('auto','aprovacao','bloqueado')),
  descricao   text,
  ativo       boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_automation_policies IS
  'ORION-AI-21: política por ação (auto|aprovacao|bloqueado). Financeiro/destrutivo sempre bloqueado (dupla trava no executor).';
ALTER TABLE public.orion_automation_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oap_admin ON public.orion_automation_policies;
CREATE POLICY oap_admin ON public.orion_automation_policies
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_automation_policies FROM authenticated, anon;

-- Requests/execuções (registro de auditoria completo, ciclo de vida)
CREATE TABLE IF NOT EXISTS public.orion_automation_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acao              text NOT NULL,
  origem_modulo     text NOT NULL DEFAULT 'admin',
  solicitante       uuid,
  motivo            text,
  payload           jsonb NOT NULL DEFAULT '{}',
  politica_aplicada text,
  modo              text,
  status            text NOT NULL DEFAULT 'pronta'
                    CHECK (status IN ('aguardando_aprovacao','pronta','executando','concluida','falha','bloqueada','rejeitada','delegada')),
  resultado         jsonb,
  erro              text,
  idempotency_key   text UNIQUE,
  tentativas        int NOT NULL DEFAULT 0,
  rollback_disponivel boolean NOT NULL DEFAULT false,
  iniciado_em       timestamptz,
  concluido_em      timestamptz,
  duracao_ms        int,
  criado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oar_status ON public.orion_automation_requests (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_oar_acao   ON public.orion_automation_requests (acao, criado_em DESC);
COMMENT ON TABLE public.orion_automation_requests IS
  'ORION-AI-21: pedido/execução com auditoria completa (origem, motivo, política, executor, resultado, duração, tentativas). Só o motor atualiza.';
ALTER TABLE public.orion_automation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oar_admin ON public.orion_automation_requests;
CREATE POLICY oar_admin ON public.orion_automation_requests
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_automation_requests FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'automation_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- Trava dura: ações proibidas (financeiro/jurídico/destrutivo) — NUNCA automáticas
CREATE OR REPLACE FUNCTION public._automation_forbidden(p_acao text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(coalesce(p_acao,'')) ~
    '(financ|pagament|pix|estorno|reembolso|saque|payout|movimenta|exclu|deletar|remover_usuario|banir|suspens|permiss|_rls|politica_seguranca|config_critica|senha|credential|secret)';
$$;

-- ─────────────────────────────────────────────
-- EXECUTOR SEGURO (ALLOWLIST) — só ações idempotentes que já existem.
-- Qualquer coisa fora daqui NÃO executa (levanta exceção → falha auditada).
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._automation_run(p_acao text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  CASE p_acao
    WHEN 'recalcular_trust'          THEN RETURN trust_generate();
    WHEN 'recalcular_marketplace'    THEN RETURN market_generate_insights();
    WHEN 'recalcular_personalizacao' THEN RETURN perso_generate();
    WHEN 'atualizar_rankings'        THEN PERFORM trust_generate();
                                          RETURN jsonb_build_object('ok', true, 'nota', 'rankings derivam do Trust AI (recalculado)');
    WHEN 'gerar_relatorio'           THEN RETURN jsonb_build_object('ok', true, 'relatorio', trust_metrics());
    WHEN 'sincronizar_dados'         THEN RETURN jsonb_build_object('ok', true, 'nota', 'sincronização no-op segura');
    WHEN 'notificar'                 THEN PERFORM automation_emit('automation.notify', p_payload);
                                          RETURN jsonb_build_object('ok', true, 'delegado', 'notificação emitida no Event Bus');
    WHEN 'atualizar_dashboards'      THEN RETURN jsonb_build_object('ok', true, 'nota', 'dashboards leem sob demanda (nada a materializar)');
    -- ações aprovadas que NÃO são executadas aqui: delegadas ao dono via Event Bus (respeita porta única)
    WHEN 'publicar_insight'          THEN PERFORM automation_emit('automation.delegated', jsonb_build_object('acao','publicar_insight','payload',p_payload));
                                          RETURN jsonb_build_object('ok', true, 'delegado', 'publicação encaminhada ao Motor (porta única motor_publish_request)');
    WHEN 'criar_campanha'            THEN PERFORM automation_emit('automation.delegated', jsonb_build_object('acao','criar_campanha','payload',p_payload));
                                          RETURN jsonb_build_object('ok', true, 'delegado', 'campanha encaminhada ao Campaign AI');
    WHEN 'criar_missao'              THEN PERFORM automation_emit('automation.delegated', jsonb_build_object('acao','criar_missao','payload',p_payload));
                                          RETURN jsonb_build_object('ok', true, 'delegado', 'missão encaminhada ao Operations AI');
    ELSE RAISE EXCEPTION 'acao_sem_executor_seguro:%', p_acao;
  END CASE;
END; $$;

-- ─────────────────────────────────────────────
-- REQUEST: enfileira um pedido, resolve política, define status
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_request(
  p_acao text, p_origem text DEFAULT 'admin', p_motivo text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}', p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_modo text; v_cat text; v_status text; v_id uuid; v_idem text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- resolve política (proibido tem prioridade; ação desconhecida → aprovação, nunca auto)
  IF _automation_forbidden(p_acao) THEN
    v_modo := 'bloqueado'; v_cat := 'proibida';
  ELSE
    SELECT modo, categoria INTO v_modo, v_cat FROM orion_automation_policies WHERE acao = p_acao AND ativo;
    IF v_modo IS NULL THEN v_modo := 'aprovacao'; v_cat := 'desconhecida'; END IF;
  END IF;

  v_status := CASE v_modo WHEN 'auto' THEN 'pronta' WHEN 'bloqueado' THEN 'bloqueada' ELSE 'aguardando_aprovacao' END;
  -- idempotência: chave explícita, ou default por ação+hora (re-execução liberada na hora seguinte)
  v_idem := coalesce(p_idempotency_key, p_acao || ':' || to_char(now() AT TIME ZONE 'America/Cuiaba', 'YYYY-MM-DD"T"HH24'));

  INSERT INTO orion_automation_requests (acao, origem_modulo, solicitante, motivo, payload, politica_aplicada, modo, status, idempotency_key)
  VALUES (p_acao, p_origem, auth.uid(), p_motivo, coalesce(p_payload,'{}'), v_cat, v_modo, v_status, v_idem)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  -- já existe com essa chave → retorna o existente SEM re-executar (idempotência)
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM orion_automation_requests WHERE idempotency_key = v_idem;
    RETURN jsonb_build_object('ok', true, 'request', v_id, 'acao', p_acao, 'idempotente', true,
      'nota', 'Request já existente para esta chave — nada re-executado (idempotência).');
  END IF;

  PERFORM automation_emit('automation.started',
    jsonb_build_object('request', v_id, 'acao', p_acao, 'modo', v_modo, 'status', v_status, 'origem', p_origem));

  -- execução imediata quando a política permite
  IF v_status = 'pronta' THEN
    RETURN automation_execute(v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'request', v_id, 'acao', p_acao, 'politica', v_cat, 'modo', v_modo, 'status', v_status,
    'nota', CASE v_status WHEN 'bloqueada' THEN 'Ação proibida por governança — exige fluxo humano.'
                          WHEN 'aguardando_aprovacao' THEN 'Requer aprovação explícita (automation_approve).' ELSE '' END);
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_request(text, text, text, jsonb, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- EXECUTE: valida (concorrência/idempotência/proibição) e executa
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_execute(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acao text; v_payload jsonb; v_ini timestamptz; v_res jsonb; v_ok boolean := true; v_err text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- LOCK por concorrência: só pega a request se estiver 'pronta' (atômico)
  UPDATE orion_automation_requests
    SET status='executando', iniciado_em=now(), tentativas=tentativas+1
    WHERE id=p_id AND status='pronta'
    RETURNING acao, payload, iniciado_em INTO v_acao, v_payload, v_ini;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'nota', 'Request não está pronta (já executada, bloqueada ou aguardando aprovação).');
  END IF;

  -- DUPLA TRAVA: mesmo 'pronta', recusa proibidas
  IF _automation_forbidden(v_acao) THEN
    UPDATE orion_automation_requests SET status='bloqueada', erro='ação proibida por governança (trava dura)',
      concluido_em=now() WHERE id=p_id;
    PERFORM automation_emit('automation.failed', jsonb_build_object('request', p_id, 'acao', v_acao, 'motivo', 'proibida'));
    RETURN jsonb_build_object('ok', false, 'status', 'bloqueada', 'acao', v_acao);
  END IF;

  BEGIN
    v_res := _automation_run(v_acao, v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_ok := false; v_err := SQLERRM;
  END;

  UPDATE orion_automation_requests SET
    status = CASE WHEN v_ok THEN 'concluida' ELSE 'falha' END,
    resultado = v_res, erro = v_err, concluido_em = now(),
    duracao_ms = greatest(0, round(extract(epoch FROM clock_timestamp() - v_ini)*1000))::int
  WHERE id = p_id;

  PERFORM automation_emit(CASE WHEN v_ok THEN 'automation.completed' ELSE 'automation.failed' END,
    jsonb_build_object('request', p_id, 'acao', v_acao, 'ok', v_ok));
  RETURN jsonb_build_object('ok', v_ok, 'request', p_id, 'acao', v_acao,
    'status', CASE WHEN v_ok THEN 'concluida' ELSE 'falha' END, 'resultado', v_res, 'erro', v_err);
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_execute(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- APROVAÇÃO / REJEIÇÃO / ROLLBACK
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_approve(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_upd int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores aprovam';
  END IF;
  UPDATE orion_automation_requests SET status='pronta' WHERE id=p_id AND status='aguardando_aprovacao';
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN RETURN jsonb_build_object('ok', false, 'nota', 'Request não está aguardando aprovação.'); END IF;
  PERFORM automation_emit('automation.approved', jsonb_build_object('request', p_id, 'aprovador', auth.uid()));
  RETURN automation_execute(p_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_approve(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.automation_reject(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  UPDATE orion_automation_requests SET status='rejeitada', erro=coalesce(p_motivo,'rejeitada pelo admin'), concluido_em=now()
    WHERE id=p_id AND status IN ('aguardando_aprovacao','pronta');
  RETURN jsonb_build_object('ok', true, 'request', p_id, 'status', 'rejeitada');
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_reject(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.automation_rollback(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_roll boolean; v_acao text;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT rollback_disponivel, acao INTO v_roll, v_acao FROM orion_automation_requests WHERE id=p_id;
  PERFORM automation_emit('automation.rollback', jsonb_build_object('request', p_id, 'acao', v_acao, 'disponivel', coalesce(v_roll,false)));
  RETURN jsonb_build_object('ok', true, 'request', p_id,
    'rollback_disponivel', coalesce(v_roll,false),
    'nota', CASE WHEN coalesce(v_roll,false) THEN 'Rollback registrado.'
                 ELSE 'Ações do allowlist são idempotentes (recalculáveis) — rollback não aplicável; re-execução regenera o estado.' END);
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_rollback(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- POLÍTICAS (ler/configurar)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_policies()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.categoria, p.acao), '[]')
  FROM (SELECT acao, categoria, modo, descricao, ativo FROM orion_automation_policies) p;
$$;
GRANT EXECUTE ON FUNCTION public.automation_policies() TO authenticated;

CREATE OR REPLACE FUNCTION public.automation_set_policy(p_acao text, p_modo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  IF p_modo NOT IN ('auto','aprovacao','bloqueado') THEN RAISE EXCEPTION 'modo inválido'; END IF;
  -- proteção: ação proibida NUNCA pode virar auto/aprovacao
  IF _automation_forbidden(p_acao) AND p_modo <> 'bloqueado' THEN
    RAISE EXCEPTION 'ação proibida por governança só pode permanecer bloqueada';
  END IF;
  UPDATE orion_automation_policies SET modo=p_modo, atualizado_em=now() WHERE acao=p_acao;
  RETURN jsonb_build_object('ok', true, 'acao', p_acao, 'modo', p_modo);
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_set_policy(text, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- FILA / SAÚDE / MÉTRICAS / HISTÓRICO / DASHBOARD
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_queue()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.criado_em DESC), '[]')
  FROM (SELECT id, acao, origem_modulo, modo, status, criado_em FROM orion_automation_requests
        WHERE status IN ('aguardando_aprovacao','pronta','executando') ORDER BY criado_em DESC LIMIT 50) q;
$$;
GRANT EXECUTE ON FUNCTION public.automation_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.automation_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok int; v_fail int; v_pend int; v_block int; v_tempo numeric; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) filter (where status='concluida'), count(*) filter (where status='falha'),
         count(*) filter (where status IN ('aguardando_aprovacao','pronta')), count(*) filter (where status='bloqueada'),
         round(avg(duracao_ms) filter (where status='concluida'))
    INTO v_ok, v_fail, v_pend, v_block, v_tempo FROM orion_automation_requests;
  comp := jsonb_build_object(
    'taxa_sucesso', CASE WHEN v_ok+v_fail=0 THEN 100 ELSE round(v_ok*100.0/(v_ok+v_fail)) END,
    'governanca', 100,   -- proibidas sempre bloqueadas (dupla trava provada)
    'fila_saude', greatest(0, 100 - v_pend*5),
    'latencia', CASE WHEN v_tempo IS NULL THEN 100 WHEN v_tempo <= 2000 THEN 100 WHEN v_tempo <= 8000 THEN 80 ELSE 60 END);
  RETURN jsonb_build_object(
    'automation_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'concluidas', v_ok, 'falhas', v_fail, 'pendentes', v_pend, 'bloqueadas', v_block,
    'tempo_medio_ms', v_tempo,
    'formula', 'taxa_sucesso+governanca+fila_saude+latencia. Automation NUNCA decide; só executa allowlist sob política.');
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.automation_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM (SELECT status, count(*) n FROM orion_automation_requests GROUP BY 1) s),
    'por_acao',   (SELECT coalesce(jsonb_object_agg(acao, n), '{}') FROM (SELECT acao, count(*) n FROM orion_automation_requests GROUP BY 1) a),
    'politicas',  (SELECT coalesce(jsonb_object_agg(modo, n), '{}') FROM (SELECT modo, count(*) n FROM orion_automation_policies GROUP BY 1) p),
    'total', (SELECT count(*) FROM orion_automation_requests));
$$;
GRANT EXECUTE ON FUNCTION public.automation_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.automation_history(p_limite int DEFAULT 40)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.criado_em DESC), '[]')
  FROM (SELECT id, acao, origem_modulo, politica_aplicada, modo, status, duracao_ms, erro, criado_em, concluido_em
        FROM orion_automation_requests ORDER BY criado_em DESC LIMIT least(p_limite,200)) h;
$$;
GRANT EXECUTE ON FUNCTION public.automation_history(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.automation_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', automation_score(), 'metrics', automation_metrics(),
    'politicas', automation_policies(), 'fila', automation_queue(),
    'prompt_keys', jsonb_build_array('automation.plan','automation.validate','automation.execute','automation.audit','automation.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.automation_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('automation_dashboard_consultado',
    'automation_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', automation_score(),
    'metrics', automation_metrics(),
    'politicas', automation_policies(),
    'fila', automation_queue(),
    'historico', automation_history(30),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.automation_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron): processa a fila (executa as 'pronta')
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_automation_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM orion_automation_requests WHERE status='pronta' ORDER BY criado_em LIMIT 50 LOOP
    PERFORM automation_execute(r.id);
  END LOOP;
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_automation_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_automation_tick', '16 * * * *', 'SELECT public.orion_automation_tick()');
END $$;

-- ─────────────────────────────────────────────
-- POLÍTICAS SEED (spec) — financeiro/destrutivo SEMPRE bloqueado
-- ─────────────────────────────────────────────
INSERT INTO public.orion_automation_policies (acao, categoria, modo, descricao) VALUES
  ('recalcular_trust',          'manutencao', 'auto',       'Recalcula Trust Scores (idempotente).'),
  ('recalcular_marketplace',    'manutencao', 'auto',       'Regenera insights de marketplace (idempotente).'),
  ('recalcular_personalizacao', 'manutencao', 'auto',       'Regenera perfis/recomendações (idempotente).'),
  ('atualizar_rankings',        'manutencao', 'auto',       'Atualiza rankings (deriva do Trust).'),
  ('gerar_relatorio',           'relatorio',  'auto',       'Gera relatório de métricas.'),
  ('sincronizar_dados',         'manutencao', 'auto',       'Sincronização segura (no-op).'),
  ('notificar',                 'comunicacao','auto',       'Emite notificação no Event Bus.'),
  ('atualizar_dashboards',      'manutencao', 'auto',       'Atualiza dashboards (leitura sob demanda).'),
  ('criar_campanha',            'comercial',  'aprovacao',  'Criação de campanha — requer aprovação.'),
  ('publicar_insight',          'publicacao', 'aprovacao',  'Publicação — requer aprovação (porta única).'),
  ('criar_missao',              'operacao',   'aprovacao',  'Missão operacional — requer aprovação.'),
  ('financeiro',                'financeiro', 'bloqueado',  'Qualquer ação financeira — SEMPRE bloqueada.'),
  ('estorno',                   'financeiro', 'bloqueado',  'Estorno — SEMPRE bloqueado.'),
  ('exclusao_usuario',          'destrutiva', 'bloqueado',  'Exclusão de usuário — SEMPRE bloqueada.'),
  ('alterar_permissoes',        'seguranca',  'bloqueado',  'Alteração de permissões/RLS — SEMPRE bloqueada.')
ON CONFLICT (acao) DO NOTHING;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('automation.plan',
'Você é o ORION Automation AI da VIAGG-TX8. Recebe recomendações já decididas por outros módulos e planeja a EXECUÇÃO (nunca decide o mérito). Dada a fila e as políticas, em pt-BR (4-7 frases) proponha a ordem de execução respeitando política/prioridade/dependências. Lembre: financeiro/destrutivo é sempre bloqueado. Baseie-se só no JSON.',
'Seed ORION-AI-21') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='automation.plan');
SELECT public.orion_ai_prompt_set('automation.validate',
'Você valida se uma automação pode executar na VIAGG-TX8. Receberá a ação, a política aplicada e o contexto. Em pt-BR (3-5 frases), diga se é permitida (auto), requer aprovação ou é bloqueada, e por quê — citando a política. Nunca autorize ações financeiras/destrutivas.',
'Seed ORION-AI-21') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='automation.validate');
SELECT public.orion_ai_prompt_set('automation.execute',
'Você descreve o resultado de uma execução automatizada da VIAGG-TX8 de forma transparente. Receberá a ação, política, resultado e duração. Em pt-BR (3-5 frases), explique o que foi executado, por que era permitido e qual o resultado. Só o JSON; sem caixa-preta.',
'Seed ORION-AI-21') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='automation.execute');
SELECT public.orion_ai_prompt_set('automation.audit',
'Você audita as automações da VIAGG-TX8. Receberá histórico (origem, política, status, duração, erros). Em pt-BR (4-7 frases), aponte padrões, falhas recorrentes e riscos de governança, recomendando ação humana. Nunca invente; cite os números.',
'Seed ORION-AI-21') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='automation.audit');
SELECT public.orion_ai_prompt_set('automation.summary',
'Você resume a automação da VIAGG-TX8 (execuções, sucesso, fila, políticas). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente; reforce que o módulo executa, nunca decide.',
'Seed ORION-AI-21') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='automation.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('automation', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
