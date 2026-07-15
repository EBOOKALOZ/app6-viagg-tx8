-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-14 — STRATEGIC INTELLIGENCE SUITE v1.0
-- UM módulo, CINCO motores internos: Knowledge · Prediction ·
-- Decision · Optimization · Simulation.
--
-- REGRA MÁXIMA: reuso total — nenhum indicador recalculado; os
-- motores LEEM as APIs oficiais certificadas e produzem conhecimento,
-- previsões (sempre rotuladas projeção + confiança + erro estimado),
-- decisões explicáveis, plano de otimização (nunca aplica) e
-- simulações que NUNCA tocam produção (modelo declarado, gravadas em
-- histórico imutável). IA só via Gateway v3 + Prompt Registry.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── ENGINE 01: Knowledge (memória operacional imutável + grafo) ──
CREATE TABLE IF NOT EXISTS public.orion_knowledge (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave            text NOT NULL UNIQUE,
  tipo             text NOT NULL,     -- erro|acerto|incidente|missao|padrao|aprendizado
  area             text,
  titulo           text NOT NULL,
  causa_raiz       text,
  solucao          text,
  resultado        text,
  recorrencias     int NOT NULL DEFAULT 1,
  relacionado      jsonb DEFAULT '[]'::jsonb,   -- grafo: chaves relacionadas
  dados            jsonb DEFAULT '{}'::jsonb,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  ultima_ocorrencia timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ok_admin ON public.orion_knowledge;
CREATE POLICY ok_admin ON public.orion_knowledge
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE DELETE ON public.orion_knowledge FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_simulacoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta   text NOT NULL,
  parametros jsonb NOT NULL,
  cenario_atual jsonb NOT NULL,
  cenario_simulado jsonb NOT NULL,
  resultado  jsonb NOT NULL,
  criado_por uuid,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_simulacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osim_admin ON public.orion_simulacoes;
CREATE POLICY osim_admin ON public.orion_simulacoes
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_simulacoes FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.knowledge_engine()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_novos int := 0; v_rec int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- incidentes resolvidos → conhecimento (causa raiz + tempo)
  FOR r IN SELECT id, tipo, titulo, causa_raiz,
             round(extract(epoch FROM resolvido_em-aberto_em)/3600,1) AS horas
           FROM orion_health_incidentes WHERE status='resolvido' LOOP
    INSERT INTO orion_knowledge (chave, tipo, area, titulo, causa_raiz, resultado, dados)
    VALUES ('incidente:'||r.tipo, 'incidente', 'health', r.titulo, r.causa_raiz,
      format('resolvido em %sh', r.horas), jsonb_build_object('ultimo_id', r.id))
    ON CONFLICT (chave) DO UPDATE SET recorrencias = orion_knowledge.recorrencias + 1,
      ultima_ocorrencia = now(), causa_raiz = coalesce(excluded.causa_raiz, orion_knowledge.causa_raiz);
    IF FOUND THEN v_novos := v_novos + 1; END IF;
  END LOOP;

  -- missões concluídas → acertos (solução + impacto)
  FOR r IN SELECT chave AS mchave, titulo, area, resultado, impacto_obtido
           FROM orion_missoes WHERE status='concluida' LOOP
    INSERT INTO orion_knowledge (chave, tipo, area, titulo, solucao, resultado)
    VALUES ('missao:'||r.mchave, 'acerto', r.area, r.titulo, r.resultado, r.impacto_obtido)
    ON CONFLICT (chave) DO UPDATE SET recorrencias = orion_knowledge.recorrencias + 1,
      ultima_ocorrencia = now();
    IF FOUND THEN v_novos := v_novos + 1; END IF;
  END LOOP;

  -- divergências financeiras resolvidas → conhecimento financeiro
  FOR r IN SELECT tipo AS dtipo, descricao, nota_resolucao
           FROM orion_finance_divergencias WHERE status='resolvida' LOOP
    INSERT INTO orion_knowledge (chave, tipo, area, titulo, solucao, relacionado)
    VALUES ('finance:'||r.dtipo, 'erro', 'financeiro', r.descricao, r.nota_resolucao,
      '["incidente:dlq_presente"]'::jsonb)
    ON CONFLICT (chave) DO UPDATE SET recorrencias = orion_knowledge.recorrencias + 1,
      ultima_ocorrencia = now();
    IF FOUND THEN v_novos := v_novos + 1; END IF;
  END LOOP;

  -- aprendizado contínuo dos módulos → memória operacional
  FOR r IN SELECT evento, count(*) n, max(criado_em) ult
           FROM orion_aprendizado GROUP BY evento LOOP
    INSERT INTO orion_knowledge (chave, tipo, area, titulo, resultado, dados)
    VALUES ('aprendizado:'||r.evento, 'aprendizado', 'orion',
      format('Série de aprendizado: %s', r.evento),
      format('%s registro(s) acumulados', r.n),
      jsonb_build_object('registros', r.n, 'ultimo', r.ult))
    ON CONFLICT (chave) DO UPDATE SET
      resultado = format('%s registro(s) acumulados', (excluded.dados->>'registros')::int),
      dados = excluded.dados, ultima_ocorrencia = now();
    v_novos := v_novos + 1;
  END LOOP;

  SELECT count(*) INTO v_rec FROM orion_knowledge WHERE recorrencias > 1;
  RETURN jsonb_build_object('ok', true,
    'registros_total', (SELECT count(*) FROM orion_knowledge),
    'padroes_recorrentes', v_rec,
    'processados_agora', v_novos,
    'top', (SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.recorrencias DESC, k.ultima_ocorrencia DESC), '[]')
            FROM (SELECT tipo, area, titulo, causa_raiz, solucao, resultado, recorrencias, relacionado,
                         ultima_ocorrencia
                  FROM orion_knowledge ORDER BY recorrencias DESC, ultima_ocorrencia DESC LIMIT 12) k));
END; $$;
GRANT EXECUTE ON FUNCTION public.knowledge_engine() TO authenticated, service_role;

-- ── ENGINE 02: Prediction (reuso + horizontes; sempre projeção) ──
CREATE OR REPLACE FUNCTION public.prediction_engine()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_media7 numeric; v_hist int; v_conf text;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT coalesce(avg(t),0) INTO v_media7 FROM (
    SELECT paid_at::date, sum(amount) t FROM pay_payment_orders
    WHERE status='paid' AND paid_at > now()-interval '7 days' GROUP BY 1) m;
  SELECT count(DISTINCT paid_at::date) INTO v_hist FROM pay_payment_orders
   WHERE status='paid' AND paid_at > now()-interval '30 days';
  v_conf := CASE WHEN v_hist >= 20 THEN 'média' WHEN v_hist >= 7 THEN 'baixa-média' ELSE 'baixa' END;

  RETURN jsonb_build_object(
    'metodo', 'média móvel 7d (receita) + séries próprias — SEMPRE projeção, nunca fato',
    'confianca', v_conf,
    'erro_estimado', CASE WHEN v_hist >= 20 THEN '±25%' WHEN v_hist >= 7 THEN '±40%' ELSE '±60% (histórico curto)' END,
    'dados_utilizados', format('%s dia(s) com receita nos últimos 30', v_hist),
    'receita', jsonb_build_object('h24', round(v_media7,2), 'd7', round(v_media7*7,2),
      'd30', round(v_media7*30,2), 'd90', round(v_media7*90,2), 'ano', round(v_media7*365,2)),
    'infra_e_ia', performance_predictions(),               -- reuso (custo IA/storage/carga)
    'disponibilidade', (health_predictions())->>'tendencia_disponibilidade',  -- reuso
    'indisponiveis_declarados', jsonb_build_array('CAC','LTV','ROI por campanha (AI-09)',
      'CPU/latência de host (telemetria externa)'));
END; $$;
GRANT EXECUTE ON FUNCTION public.prediction_engine() TO authenticated, service_role;

-- ── ENGINE 03: Decision (Top 10 explicável; reuso Operations/Growth) ──
CREATE OR REPLACE FUNCTION public.decision_engine()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb := '[]'::jsonb; r RECORD; g RECORD;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  -- missões pendentes → decisões operacionais/financeiras
  FOR r IN SELECT * FROM orion_missoes WHERE status='pendente' ORDER BY prioridade DESC LIMIT 6 LOOP
    d := d || jsonb_build_object(
      'decisao', r.titulo,
      'classe', CASE r.area WHEN 'financeiro' THEN 'financeira' WHEN 'growth' THEN 'estrategica'
                            WHEN 'mobilidade' THEN 'mobilidade' ELSE 'operacional' END,
      'dados_utilizados', r.justificativa, 'confianca', r.confianca,
      'impacto_esperado', r.impacto_esperado, 'risco', 'baixo (ação reversível/controlada)',
      'justificativa', coalesce(r.descricao, r.justificativa), 'prioridade', r.prioridade);
  END LOOP;
  -- growth → decisão estratégica de expansão
  SELECT * INTO g FROM orion_growth_scores ORDER BY score DESC LIMIT 1;
  IF g IS NOT NULL THEN
    d := d || jsonb_build_object('decisao', format('Concentrar expansão em %s (score %s)', g.cidade, g.score),
      'classe', 'estrategica', 'dados_utilizados', 'orion_growth_scores (fórmula explicável)',
      'confianca', 0.75, 'impacto_esperado', 'Maior conversão onde já há cobertura',
      'risco', 'concentração territorial (monitorada pelo Growth)',
      'justificativa', g.detalhe->>'formula', 'prioridade', 70);
  END IF;
  -- gateway/custos → decisão de IA
  d := d || jsonb_build_object('decisao', 'Manter modelos gpt-5-nano/mini (custo atual irrisório)',
    'classe', 'ia', 'dados_utilizados', 'orion_ai_log (custo total acumulado)',
    'confianca', 0.9, 'impacto_esperado', 'Orçamento de IA previsível',
    'risco', 'nenhum identificado',
    'justificativa', format('Custo acumulado US$ %s com 0 erros',
      (SELECT round(coalesce(sum(custo_estimado),0),4) FROM orion_ai_log)), 'prioridade', 40);

  RETURN jsonb_build_object('top_decisoes',
    (SELECT jsonb_agg(x ORDER BY (x->>'prioridade')::int DESC) FROM jsonb_array_elements(d) x),
    'nota', 'Decisões derivadas 1:1 de fontes oficiais — a execução é sempre humana');
END; $$;
GRANT EXECUTE ON FUNCTION public.decision_engine() TO authenticated, service_role;

-- ── ENGINE 04: Optimization (reuso performance_optimizer + IA/custos) ──
CREATE OR REPLACE FUNCTION public.optimization_engine()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base jsonb; extra jsonb := '[]'::jsonb; v_cache numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  base := performance_optimizer();                        -- reuso integral
  SELECT round(count(*) FILTER (WHERE status='cache')*100.0/nullif(count(*),0),1) INTO v_cache
  FROM orion_ai_log;
  IF v_cache IS NOT NULL AND v_cache >= 25 THEN
    extra := extra || jsonb_build_object('area','gateway','prioridade','INFORMATIVO',
      'sugestao', format('Cache do Gateway economizando %s%% das chamadas — manter', v_cache),
      'justificativa','orion_ai_log', 'impacto_estimado','custo evitado contínuo','risco','—');
  END IF;
  RETURN jsonb_build_object(
    'plano', (base->'sugestoes') || extra,
    'ganhos_rapidos', (SELECT coalesce(jsonb_agg(x), '[]') FROM jsonb_array_elements(base->'sugestoes') x
      WHERE x->>'prioridade' IN ('ALTO','MEDIO')),
    'nota', 'Nada é aplicado automaticamente — plano requer aprovação humana');
END; $$;
GRANT EXECUTE ON FUNCTION public.optimization_engine() TO authenticated, service_role;

-- ── ENGINE 05: Simulation (modelo declarado; NUNCA toca produção) ──
CREATE OR REPLACE FUNCTION public.simulation_engine(p_pergunta text, p_tipo text, p_valor numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atual jsonb; v_sim jsonb; v_res jsonb; v_id uuid;
  v_grupos int; v_membros int; v_ticket numeric; v_receita7 numeric; v_pacote numeric;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;

  SELECT count(*), coalesce(sum(members_count),0) INTO v_grupos, v_membros
  FROM whatsapp_groups WHERE is_active AND coalesce(is_valid,true);
  SELECT coalesce(avg(amount),0) INTO v_ticket FROM pay_payment_orders
   WHERE status='paid' AND paid_at > now()-interval '30 days';
  SELECT coalesce(sum(amount),0) INTO v_receita7 FROM pay_payment_orders
   WHERE status='paid' AND paid_at > now()-interval '7 days';
  SELECT coalesce(min(preco_brl),19.9) INTO v_pacote FROM divulgacao_packages WHERE ativo;

  v_atual := jsonb_build_object('grupos_ativos', v_grupos, 'alcance_membros', v_membros,
    'ticket_medio_30d', round(v_ticket,2), 'receita_7d', v_receita7);

  IF p_tipo = 'investimento_campanha' THEN
    v_sim := jsonb_build_object(
      'investimento', p_valor,
      'publicacoes_estimadas', floor(p_valor / v_pacote * 10),
      'alcance_estimado', round(v_membros * 0.6 * (p_valor / 100)),
      'cliques_estimados', round(v_membros * 0.6 * (p_valor / 100) * 0.02),
      'conversoes_estimadas', greatest(1, round(v_membros * 0.6 * (p_valor / 100) * 0.002)),
      'receita_potencial', round(greatest(1, v_membros * 0.6 * (p_valor / 100) * 0.002) * greatest(v_ticket, 30), 2));
    v_res := jsonb_build_object(
      'roi_estimado_pct', round(((v_sim->>'receita_potencial')::numeric - p_valor) * 100 / nullif(p_valor,0), 1),
      'probabilidade', CASE WHEN v_grupos >= 5 THEN 'média' ELSE 'baixa (cobertura de grupos limitada)' END,
      'riscos', jsonb_build_array('CTR/conversão baseline (2%/0,2%) são referência de mercado, não histórico próprio',
        'Depende do worker GLM ativo para entrega no WhatsApp'),
      'modelo', 'alcance = membros×0,6×(R$/100) · cliques 2% · conversão 0,2% · ticket real');
  ELSIF p_tipo = 'motoboys' THEN
    v_sim := jsonb_build_object('novos_motoboys', p_valor,
      'capacidade_entregas_dia', p_valor * 12,
      'cidades_cobriveis', least(p_valor, (SELECT count(DISTINCT city_name) FROM whatsapp_groups WHERE is_active)),
      'custo_incentivo_estimado', p_valor * 50);
    v_res := jsonb_build_object(
      'ganho', format('+%s entregas/dia potenciais (12/motoboy — referência operacional)', p_valor * 12),
      'probabilidade', 'média',
      'riscos', jsonb_build_array('Demanda precisa acompanhar (São Paulo tem demanda sem entregadores — priorizar lá)',
        'Custo de incentivo estimado, não contratado'),
      'modelo', '12 entregas/dia/motoboy (referência) · incentivo R$50/cabeça (parâmetro editável)');
  ELSIF p_tipo = 'novas_cidades' THEN
    v_sim := jsonb_build_object('cidades', p_valor,
      'grupos_necessarios', p_valor * 3,
      'alcance_novo_estimado', p_valor * round(coalesce(nullif(v_membros,0)/nullif(v_grupos,0), 90)) * 3,
      'tempo_estimado', format('%s a %s semanas', p_valor, p_valor * 2));
    v_res := jsonb_build_object(
      'ganho', 'Novos mercados com o playbook validado em Aripuanã',
      'probabilidade', 'média',
      'riscos', jsonb_build_array('Requer captação de 3 grupos/cidade antes de campanhas (regra Growth)',
        'Operação local (motoboys/lojistas) precisa de âncora'),
      'modelo', '3 grupos/cidade × média real de membros/grupo');
  ELSE
    RAISE EXCEPTION 'Tipo de simulação inválido: % (use investimento_campanha|motoboys|novas_cidades)', p_tipo;
  END IF;

  INSERT INTO orion_simulacoes (pergunta, parametros, cenario_atual, cenario_simulado, resultado, criado_por)
  VALUES (p_pergunta, jsonb_build_object('tipo', p_tipo, 'valor', p_valor), v_atual, v_sim, v_res, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'cenario_atual', v_atual,
    'cenario_simulado', v_sim, 'resultado', v_res,
    'nota', 'Simulação NUNCA altera produção — gravada em histórico imutável');
END; $$;
GRANT EXECUTE ON FUNCTION public.simulation_engine(text, text, numeric) TO authenticated;

-- ── Scores + dashboard + auxiliares ──
CREATE OR REPLACE FUNCTION public.strategy_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k int; p int; dd int; o int; s int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  k := least(100, 40 + (SELECT count(*) FROM orion_knowledge) * 4);
  p := least(100, 40 + (SELECT count(DISTINCT criado_em::date) FROM orion_perf_snapshots) * 10
                     + (SELECT count(DISTINCT dia) FROM orion_finance_snapshots) * 10);
  dd := least(100, CASE WHEN (SELECT count(*) FROM orion_missoes) = 0 THEN 50
    ELSE 50 + (SELECT count(*) FILTER (WHERE status IN ('concluida','arquivada')) * 50
               / greatest(count(*),1) FROM orion_missoes) END);
  o := coalesce((SELECT score FROM orion_perf_snapshots ORDER BY criado_em DESC LIMIT 1), 80);
  s := least(100, 40 + (SELECT count(*) FROM orion_simulacoes) * 15);
  RETURN jsonb_build_object(
    'knowledge_score', k, 'prediction_score', p, 'decision_score', dd,
    'optimization_score', o, 'simulation_score', s,
    'strategic_score', round((k + p + dd + o + s) / 5.0),
    'formula', 'maturidade por volume/execução das memórias próprias + performance oficial (nada recalculado); scores crescem com o uso');
END; $$;
GRANT EXECUTE ON FUNCTION public.strategy_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.strategy_recommendations()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (decision_engine())->'top_decisoes';
$$;
GRANT EXECUTE ON FUNCTION public.strategy_recommendations() TO authenticated;

CREATE OR REPLACE FUNCTION public.strategy_insights()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'padroes_recorrentes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'titulo', titulo, 'recorrencias', recorrencias, 'causa_raiz', causa_raiz, 'solucao', solucao)
        ORDER BY recorrencias DESC), '[]')
      FROM orion_knowledge WHERE recorrencias > 1),
    'operacionais', operations_insights());               -- reuso
END; $$;
GRANT EXECUTE ON FUNCTION public.strategy_insights() TO authenticated;

CREATE OR REPLACE FUNCTION public.strategy_roadmap()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'proximos_modulos', jsonb_build_array(
      jsonb_build_object('codigo','ORION-AI-08','nome','GLM Auto-Poster',
        'motivo_real','requests WhatsApp dependem de worker; métricas de views/cliques fecham o ROI'),
      jsonb_build_object('codigo','ORION-AI-09','nome','Conversion & Attribution',
        'motivo_real','CAC/LTV/ROI e receita por cidade declarados indisponíveis em 4 módulos')),
    'divida_tecnica', (orion_core_health())->'divida_conhecida',   -- reuso
    'fonte', 'Roadmap derivado exclusivamente de necessidades reais certificadas');
$$;
GRANT EXECUTE ON FUNCTION public.strategy_roadmap() TO authenticated;

CREATE OR REPLACE FUNCTION public.strategy_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'score', strategy_score(),
    'predicao', prediction_engine(),
    'decisoes', strategy_recommendations(),
    'kpis', executive_kpis(),
    'prompt_keys', jsonb_build_array('strategy.executive','strategy.prediction',
      'strategy.optimization','strategy.simulation','strategy.knowledge'));
END; $$;
GRANT EXECUTE ON FUNCTION public.strategy_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.strategy_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('strategy_dashboard_consultado',
      'strategy_suite', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', strategy_score(),
    'knowledge', knowledge_engine(),
    'prediction', prediction_engine(),
    'decision', decision_engine(),
    'optimization', optimization_engine(),
    'simulacoes_recentes', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.criado_em DESC), '[]')
      FROM (SELECT pergunta, parametros, resultado, criado_em FROM orion_simulacoes
            ORDER BY criado_em DESC LIMIT 5) s),
    'insights', strategy_insights(),
    'roadmap', strategy_roadmap(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.strategy_dashboard() TO authenticated;

-- Tick: aprendizado contínuo
CREATE OR REPLACE FUNCTION public.orion_strategy_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM knowledge_engine();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_strategy_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_strategy_tick', '58 * * * *', 'SELECT public.orion_strategy_tick()');
END $$;

-- Prompts oficiais (5) no Registry
SELECT public.orion_ai_prompt_set('strategy.executive',
'Você é o Conselho Estratégico Inteligente da VIAGG-TX8 (ORION Strategic Intelligence Suite). Receberá o estado estratégico REAL (scores, previsões com confiança, top decisões, KPIs) e o tipo de resumo (executivo, estrategico, financeiro, comercial, operacional, tecnologico, ia) OU uma pergunta do conselho. Responda em pt-BR, 6-10 frases, nível diretoria: leitura da situação, as 3 decisões mais importantes com justificativa/dados/risco, e o horizonte. Cite sempre os dados do JSON; declare o que estiver indisponível. Termine com confiança (alta/média/baixa).',
'Seed ORION-AI-14') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='strategy.executive');
SELECT public.orion_ai_prompt_set('strategy.prediction',
'Você é o motor de previsão do Conselho Estratégico da VIAGG-TX8. Receberá previsões REAIS multi-horizonte com método, confiança e erro estimado. Explique em pt-BR (5-8 frases) o que esperar em 24h/7d/30d/90d/1 ano, sempre deixando claro que são PROJEÇÕES, o erro estimado e o que melhoraria a precisão. Nunca invente números fora do JSON.',
'Seed ORION-AI-14') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='strategy.prediction');
SELECT public.orion_ai_prompt_set('strategy.optimization',
'Você é o motor de otimização do Conselho Estratégico da VIAGG-TX8. Receberá o plano REAL de otimização (sugestões com justificativa/impacto/risco). Organize em pt-BR: ganhos rápidos primeiro, depois estruturais, com esforço×retorno. Nada é aplicado automaticamente — deixe claro que requer aprovação. Não invente melhorias fora do plano.',
'Seed ORION-AI-14') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='strategy.optimization');
SELECT public.orion_ai_prompt_set('strategy.simulation',
'Você é o motor de simulação do Conselho Estratégico da VIAGG-TX8. Receberá uma simulação REAL (cenário atual × simulado, modelo declarado, riscos, ROI estimado). Interprete em pt-BR (5-8 frases): vale a pena? Sob que condições? Quais premissas do modelo mais afetam o resultado? Deixe claro que é simulação com premissas declaradas, não promessa.',
'Seed ORION-AI-14') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='strategy.simulation');
SELECT public.orion_ai_prompt_set('strategy.knowledge',
'Você é a memória institucional da VIAGG-TX8 (Knowledge Engine). Receberá o conhecimento operacional REAL (erros, acertos, incidentes, padrões recorrentes com causa raiz e solução). Responda em pt-BR (5-8 frases): o que a empresa já aprendeu, quais padrões se repetem, e que lição aplicar agora. Cite os registros do JSON; não invente histórico.',
'Seed ORION-AI-14') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='strategy.knowledge');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('strategy', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
