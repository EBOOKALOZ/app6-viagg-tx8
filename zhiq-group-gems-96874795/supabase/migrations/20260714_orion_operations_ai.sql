-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-13 — OPERATIONS AI v1.0 (Executive Operations / COO AI)
--
-- Diretor Operacional Inteligente: transforma os ACHADOS REAIS dos
-- módulos certificados (Finance, Publisher, Growth, Dispatcher,
-- Health, Campaign) em MISSÕES operacionais priorizadas, com ciclo
-- de execução auditado (pendente→em_execucao→concluida) e ROI.
-- REGRA MÁXIMA: nada recalculado — o Motor de Decisão apenas LÊ as
-- APIs/tabelas oficiais; missão é idempotente por chave (1 por
-- achado) e ARQUIVA sozinha quando a condição normaliza.
-- IA (COO narrativo) só via Gateway v3 + Prompt Registry.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_missoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave           text NOT NULL UNIQUE,     -- idempotência: 1 missão por achado
  titulo          text NOT NULL,
  descricao       text,
  objetivo        text,
  area            text NOT NULL,
  cidade          text,
  categoria       text,
  classificacao   text NOT NULL,            -- critica|alta|media|baixa|oportunidade
  prioridade      int NOT NULL DEFAULT 50,
  impacto_esperado text,
  urgencia        text,
  complexidade    text,
  tempo_estimado  text,
  confianca       numeric(3,2) DEFAULT 0.7,
  justificativa   text NOT NULL,
  dados           jsonb DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pendente', -- pendente|em_execucao|concluida|cancelada|arquivada
  origem          text NOT NULL DEFAULT 'auto',
  responsavel     uuid,
  resultado       text,
  impacto_obtido  text,
  roi_estimado    text,
  roi_obtido      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  iniciado_em     timestamptz,
  concluido_em    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_orion_missoes_status ON public.orion_missoes (status, prioridade DESC);
ALTER TABLE public.orion_missoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS om_admin ON public.orion_missoes;
CREATE POLICY om_admin ON public.orion_missoes
  FOR SELECT TO authenticated USING (mp_is_admin());
-- transições SÓ via RPC auditada (sem policies de escrita)

CREATE OR REPLACE FUNCTION public.operations_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'operations_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END; $$;

-- ─────────────────────────────────────────────
-- MOTOR DE DECISÃO: achados reais → missões (idempotente por chave)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operations_missions_gerar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_novas int := 0; v_arq int := 0; r RECORD; n int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- 1) Divergências financeiras abertas → CRÍTICA (1 por divergência)
  FOR r IN SELECT id, descricao, evidencias FROM orion_finance_divergencias WHERE status='aberta' LOOP
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, classificacao, prioridade,
      impacto_esperado, urgencia, complexidade, tempo_estimado, confianca, justificativa, dados, roi_estimado)
    VALUES ('finance_div:'||r.id, 'Resolver divergência financeira', r.descricao,
      'Cliente/ledger conciliados e caso fechado com nota auditada', 'financeiro', 'critica', 95,
      'Confiança do cliente + integridade contábil', 'imediata', 'baixa', '30 min', 0.95,
      'Detectada pela conciliação automática do Finance AI (fonte oficial)', r.evidencias,
      'Evita perda direta do valor da ordem')
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  END LOOP;

  -- 2) Motor com requests aguardando GLM → ALTA
  SELECT count(*) INTO n FROM motor_publish_requests WHERE status='aguardando_dispatcher';
  IF n > 0 THEN
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, classificacao, prioridade,
      impacto_esperado, urgencia, complexidade, tempo_estimado, confianca, justificativa, dados)
    VALUES ('ativar_glm', 'Ativar worker GLM (fila de publicação aguardando)',
      format('%s publicação(ões) WhatsApp aguardando o Dispatcher', n),
      'Fila zerada: puxar no modo Operador Humano ou religar auto-poster (AI-08)',
      'dispatcher', 'alta', 80, 'Divulgações fluem → mais contatos', 'hoje', 'baixa', '15 min', 0.9,
      'Motor de Publicação reporta requests aguardando (fonte oficial)', jsonb_build_object('aguardando', n))
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  ELSE
    UPDATE orion_missoes SET status='arquivada', resultado='condição normalizada automaticamente',
      concluido_em=now() WHERE chave='ativar_glm' AND status='pendente';
    IF FOUND THEN v_arq := v_arq + 1; END IF;
  END IF;

  -- 3) Anúncios com erro de validação no Publisher → MÉDIA
  SELECT count(*) INTO n FROM orion_publisher_log WHERE status='erro_validacao';
  IF n > 0 THEN
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, classificacao, prioridade,
      impacto_esperado, urgencia, complexidade, tempo_estimado, confianca, justificativa, dados)
    VALUES ('publisher_erros', 'Corrigir anúncios com cadastro incompleto',
      format('%s anúncio(s) reprovados na validação (cidade/descrição faltando)', n),
      'Cadastros corrigidos ou removidos', 'publisher', 'media', 60,
      'Anúncios voltam a ser elegíveis para divulgação', 'esta semana', 'baixa', '30 min', 0.9,
      'Fila do Publisher Control (fonte oficial)', jsonb_build_object('erros', n))
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  ELSE
    UPDATE orion_missoes SET status='arquivada', resultado='condição normalizada automaticamente',
      concluido_em=now() WHERE chave='publisher_erros' AND status='pendente';
    IF FOUND THEN v_arq := v_arq + 1; END IF;
  END IF;

  -- 4) Cidades com anúncios e SEM grupos → OPORTUNIDADE (Growth)
  FOR r IN SELECT x->>'cidade' AS cidade, (x->>'anuncios')::int AS anuncios
           FROM jsonb_array_elements((orion_campaign_expansao())->'cidades_sem_grupos') x LOOP
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, cidade, classificacao, prioridade,
      impacto_esperado, urgencia, complexidade, tempo_estimado, confianca, justificativa, dados)
    VALUES ('captar_grupos:'||public.orion_norm(r.cidade), format('Captar grupos WhatsApp em %s', r.cidade),
      format('%s anúncio(s) ativos sem nenhum grupo local para divulgar', r.anuncios),
      'Pelo menos 3 grupos ativos na cidade', 'growth', r.cidade, 'oportunidade', 40,
      'Habilita divulgação local (alcance novo)', 'este mês', 'media', '2-3 dias', 0.75,
      'Radar de expansão do Growth/Campaign (fonte oficial)', jsonb_build_object('anuncios', r.anuncios))
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  END LOOP;

  -- 5) Campanhas planejadas paradas → MÉDIA (decisão humana pendente)
  SELECT count(*) INTO n FROM orion_campanhas WHERE status='planejada';
  IF n > 0 THEN
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, classificacao, prioridade,
      impacto_esperado, urgencia, complexidade, tempo_estimado, confianca, justificativa, dados)
    VALUES ('campanhas_planejadas', 'Iniciar campanhas planejadas',
      format('%s campanha(s) planejadas aguardando decisão do administrador', n),
      'Campanhas iniciadas via Motor (porta única)', 'campaign', 'media', 55,
      'Divulgação ativa dos pacotes montados', 'esta semana', 'baixa', '10 min', 0.85,
      'Campaign AI reporta campanhas planejadas (fonte oficial)', jsonb_build_object('planejadas', n))
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  ELSE
    UPDATE orion_missoes SET status='arquivada', resultado='condição normalizada automaticamente',
      concluido_em=now() WHERE chave='campanhas_planejadas' AND status='pendente';
    IF FOUND THEN v_arq := v_arq + 1; END IF;
  END IF;

  -- 6) DLQs → CRÍTICA
  SELECT (SELECT count(*) FROM orion_dispatch_queue WHERE status='dlq')
       + (SELECT count(*) FROM orion_pacotes WHERE status='dlq')
       + (SELECT count(*) FROM orion_campanhas WHERE status='dlq') INTO n;
  IF n > 0 THEN
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, classificacao, prioridade,
      impacto_esperado, urgencia, confianca, justificativa, dados)
    VALUES ('dlq_revisar', 'Revisar itens na Dead Letter Queue',
      format('%s item(ns) falharam 3x e aguardam revisão', n),
      'DLQ zerada (reprocessar ou cancelar com nota)', 'dispatcher', 'critica', 90,
      'Nenhuma solicitação perdida', 'hoje', 0.95,
      'DLQ dos módulos Package/Campaign/Dispatcher (fonte oficial)', jsonb_build_object('dlq', n))
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  ELSE
    UPDATE orion_missoes SET status='arquivada', resultado='condição normalizada automaticamente',
      concluido_em=now() WHERE chave='dlq_revisar' AND status='pendente';
    IF FOUND THEN v_arq := v_arq + 1; END IF;
  END IF;

  -- 7) Profissionais inativos 30d → OPORTUNIDADE de reativação
  SELECT count(*) INTO n FROM pay_financial_accounts a
   WHERE a.owner_type IN ('motoboy_profile','mototaxi_profile','driver_profile')
     AND NOT EXISTS (SELECT 1 FROM pay_ledger_entries l WHERE l.account_id=a.id
                     AND l.created_at > now()-interval '30 days');
  IF n >= 3 THEN
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, classificacao, prioridade,
      impacto_esperado, urgencia, confianca, justificativa, dados)
    VALUES ('reativar_profissionais', 'Reativar profissionais inativos',
      format('%s profissional(is) sem movimento financeiro há 30+ dias', n),
      'Campanha de reativação (mensagem/incentivo)', 'mobilidade', 'oportunidade', 45,
      'Oferta operacional recuperada', 'este mês', 0.7,
      'Proxy de inatividade por movimento no ledger (Growth, fonte oficial)', jsonb_build_object('inativos', n))
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  END IF;

  -- 8) Incidentes de saúde abertos → ALTA (1 por incidente)
  FOR r IN SELECT id, titulo FROM orion_health_incidentes WHERE status='aberto' LOOP
    INSERT INTO orion_missoes (chave, titulo, descricao, objetivo, area, classificacao, prioridade,
      urgencia, confianca, justificativa, dados)
    VALUES ('incidente:'||r.id, 'Tratar incidente: '||r.titulo, r.titulo,
      'Incidente resolvido com causa raiz', 'health', 'alta', 85, 'hoje', 0.9,
      'Centro de Incidentes do Health (fonte oficial)', jsonb_build_object('incidente_id', r.id))
    ON CONFLICT (chave) DO NOTHING;
    IF FOUND THEN v_novas := v_novas + 1; END IF;
  END LOOP;

  IF v_novas > 0 OR v_arq > 0 THEN
    PERFORM operations_emit('operations_missoes_geradas',
      jsonb_build_object('novas', v_novas, 'arquivadas_auto', v_arq));
  END IF;
  RETURN jsonb_build_object('ok', true, 'novas', v_novas, 'arquivadas_auto', v_arq,
    'pendentes_total', (SELECT count(*) FROM orion_missoes WHERE status='pendente'));
END; $$;
GRANT EXECUTE ON FUNCTION public.operations_missions_gerar() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- Ciclo de vida da missão (auditado)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operations_mission_atualizar(
  p_id uuid, p_acao text, p_resultado text DEFAULT NULL,
  p_impacto text DEFAULT NULL, p_roi text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_novo text;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  v_novo := CASE p_acao WHEN 'iniciar' THEN 'em_execucao' WHEN 'concluir' THEN 'concluida'
                        WHEN 'cancelar' THEN 'cancelada' WHEN 'arquivar' THEN 'arquivada' ELSE NULL END;
  IF v_novo IS NULL THEN RAISE EXCEPTION 'Ação inválida: %', p_acao; END IF;

  UPDATE orion_missoes SET
    status = v_novo,
    responsavel = coalesce(responsavel, auth.uid()),
    iniciado_em = CASE WHEN p_acao='iniciar' THEN now() ELSE iniciado_em END,
    concluido_em = CASE WHEN p_acao IN ('concluir','cancelar','arquivar') THEN now() ELSE concluido_em END,
    resultado = coalesce(p_resultado, resultado),
    impacto_obtido = coalesce(p_impacto, impacto_obtido),
    roi_obtido = coalesce(p_roi, roi_obtido)
  WHERE id = p_id AND status IN ('pendente','em_execucao');
  IF NOT FOUND THEN RAISE EXCEPTION 'Missão não encontrada ou já encerrada'; END IF;

  PERFORM operations_emit('operations_missao_'||p_acao,
    jsonb_build_object('missao', p_id, 'por', auth.uid(), 'resultado', p_resultado));
  RETURN jsonb_build_object('ok', true, 'status', v_novo);
END; $$;
GRANT EXECUTE ON FUNCTION public.operations_mission_atualizar(uuid, text, text, text, text) TO authenticated;

-- Missão manual do admin (aprovação humana embutida: nasce do humano)
CREATE OR REPLACE FUNCTION public.operations_mission_criar(
  p_titulo text, p_area text, p_classificacao text, p_descricao text DEFAULT NULL,
  p_cidade text DEFAULT NULL, p_justificativa text DEFAULT 'Criada manualmente pelo administrador')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  INSERT INTO orion_missoes (chave, titulo, descricao, area, cidade, classificacao, prioridade,
    origem, responsavel, justificativa)
  VALUES ('manual:'||gen_random_uuid(), p_titulo, p_descricao, p_area, p_cidade, p_classificacao,
    CASE p_classificacao WHEN 'critica' THEN 90 WHEN 'alta' THEN 75 WHEN 'media' THEN 55
                         WHEN 'baixa' THEN 30 ELSE 40 END,
    'admin', auth.uid(), p_justificativa)
  RETURNING id INTO v;
  PERFORM operations_emit('operations_missao_criada_manual', jsonb_build_object('missao', v, 'por', auth.uid()));
  RETURN jsonb_build_object('ok', true, 'id', v);
END; $$;
GRANT EXECUTE ON FUNCTION public.operations_mission_criar(text, text, text, text, text, text) TO authenticated;

-- ─────────────────────────────────────────────
-- APIs de leitura (agregação pura)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operations_missions(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.prioridade DESC, m.criado_em), '[]')
  FROM (SELECT * FROM orion_missoes
        WHERE p_status IS NULL OR status = p_status
        ORDER BY prioridade DESC, criado_em LIMIT 60) m;
$$;
GRANT EXECUTE ON FUNCTION public.operations_missions(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_priorities()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.prioridade DESC), '[]')
  FROM (SELECT titulo, area, cidade, classificacao, prioridade, justificativa, confianca
        FROM orion_missoes WHERE status = 'pendente'
        ORDER BY prioridade DESC LIMIT 10) m;
$$;
GRANT EXECUTE ON FUNCTION public.operations_priorities() TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex jsonb; v int; pen int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  ex := executive_score();                                -- reuso total
  SELECT least(20,
    5 * count(*) FILTER (WHERE classificacao='critica')
    + 2 * count(*) FILTER (WHERE classificacao='alta'))
  INTO pen FROM orion_missoes WHERE status='pendente';
  v := greatest(0, (ex->>'executive_score')::int - pen);
  RETURN jsonb_build_object('execution_score', v,
    'base_executive_score', ex->>'executive_score',
    'penalidade_missoes_pendentes', pen,
    'formula', 'executive_score − min(20, críticas×5 + altas×2) — nada recalculado');
END; $$;
GRANT EXECUTE ON FUNCTION public.operations_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_insights()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'insight', titulo || CASE WHEN cidade IS NOT NULL THEN ' ('||cidade||')' ELSE '' END,
      'area', area, 'classificacao', classificacao,
      'justificativa', justificativa, 'confianca', confianca,
      'dados', dados) ORDER BY prioridade DESC), '[]')
    FROM orion_missoes WHERE status = 'pendente');
END; $$;
GRANT EXECUTE ON FUNCTION public.operations_insights() TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_map()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'cidade', g.cidade, 'uf', g.uf, 'growth_score', g.score, 'classificacao', g.classificacao,
    'detalhe', g.detalhe,
    'missoes_pendentes', (SELECT count(*) FROM orion_missoes m
      WHERE m.status='pendente' AND m.cidade IS NOT NULL
        AND public.orion_norm(m.cidade) = public.orion_norm(g.cidade)),
    'prioridade_operacional', (SELECT coalesce(max(m2.prioridade),0) FROM orion_missoes m2
      WHERE m2.status='pendente' AND m2.cidade IS NOT NULL
        AND public.orion_norm(m2.cidade) = public.orion_norm(g.cidade))
    ) ORDER BY g.score DESC), '[]')
  FROM orion_growth_scores g;
$$;
GRANT EXECUTE ON FUNCTION public.operations_map() TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_execution()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM
      (SELECT status, count(*) n FROM orion_missoes GROUP BY 1) s),
    'tempo_medio_resolucao_h', (SELECT round(avg(extract(epoch FROM concluido_em - criado_em)/3600)::numeric, 1)
      FROM orion_missoes WHERE status='concluida'),
    'impacto_acumulado', (SELECT count(*) FROM orion_missoes WHERE status='concluida'),
    'concluidas_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'titulo', titulo, 'resultado', resultado, 'impacto', impacto_obtido, 'roi', roi_obtido,
        'quando', concluido_em) ORDER BY concluido_em DESC), '[]')
      FROM (SELECT * FROM orion_missoes WHERE status='concluida'
            ORDER BY concluido_em DESC LIMIT 10) c));
$$;
GRANT EXECUTE ON FUNCTION public.operations_execution() TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'score', operations_score(),
    'prioridades', operations_priorities(),
    'execucao', operations_execution(),
    'kpis', executive_kpis(),
    'prompt_key_oficial', 'operations.executive');
END; $$;
GRANT EXECUTE ON FUNCTION public.operations_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('operations_dashboard_consultado',
      'operations_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', operations_score(),
    'missoes', operations_missions(NULL),
    'prioridades', operations_priorities(),
    'insights', operations_insights(),
    'mapa', operations_map(),
    'execucao', operations_execution(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.operations_dashboard() TO authenticated;

-- Tick: gera/arquiva missões de hora em hora
CREATE OR REPLACE FUNCTION public.orion_operations_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM operations_missions_gerar();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_operations_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_operations_tick', '52 * * * *', 'SELECT public.orion_operations_tick()');
END $$;

-- Prompt oficial do COO
SELECT public.orion_ai_prompt_set('operations.executive',
'Você é o Diretor Operacional (COO AI) da VIAGG-TX8 — ORION Operations AI. Receberá o estado operacional REAL (score, fila de missões priorizadas com justificativas e dados, execução, KPIs) e o tipo de resumo (executivo, operacional, financeiro, comercial, marketplace, mobilidade, ia) OU uma pergunta de coordenação. Responda em pt-BR, 5-9 frases: o que fazer AGORA em ordem de prioridade, por quê (cite a justificativa/dados de cada missão), impacto esperado e quem deve executar. Termine com o nível de confiança. Nunca invente dados; o que estiver marcado como indisponível, declare.',
'Seed ORION-AI-13')
WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave = 'operations.executive');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('operations', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
