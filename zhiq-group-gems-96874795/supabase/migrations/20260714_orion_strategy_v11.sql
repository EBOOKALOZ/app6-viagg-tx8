-- ═══════════════════════════════════════════════════════════════
-- ORION Strategic Intelligence Suite v1.1 (AI-14) — enhancement
-- que cumpre o spec "ORION-AI-17 — Strategy AI".
--
-- Strategy AI JÁ EXISTE = ORION-AI-14 (chave 'strategy', commit
-- 5eefc17). Conforme a numeração oficial consolidada
-- (DOCS/orion-arquitetura-numeracao-oficial.md) e o princípio do
-- próprio spec ("não duplicar, não criar infra paralela, reutilizar
-- exclusivamente"), NÃO se cria um AI-17 duplicado: estende-se a
-- AI-14. AI-17 permanece reservado a um módulo genuinamente novo.
--
-- Acrescenta (por REUSO total): plano de ação consolidado e
-- ranqueado (impacto×custo/benefício×confiança) e projeções
-- trimestrais/anuais. Read-only; IA só via Gateway + Registry.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ROLLBACK: DROP FUNCTION strategy_action_plan(); DROP FUNCTION strategy_projections();
--           DELETE FROM orion_ai_prompts WHERE chave='strategy.action_plan';
-- ═══════════════════════════════════════════════════════════════

-- ── PLANO DE AÇÃO consolidado e ranqueado (motor estratégico) ──
-- Consolida sinais de TODOS os módulos (via APIs certificadas),
-- calcula impacto/custo-benefício/confiança e ordena por prioridade.
CREATE OR REPLACE FUNCTION public.strategy_action_plan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plano jsonb := '[]'::jsonb; r RECORD; g RECORD; v_ped30 numeric; v_conf numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  -- Sinal 1: missões operacionais pendentes (Operations AI) → ações imediatas
  FOR r IN SELECT titulo, area, cidade, classificacao, prioridade, justificativa, confianca
           FROM orion_missoes WHERE status='pendente' ORDER BY prioridade DESC LIMIT 8 LOOP
    plano := plano || jsonb_build_object(
      'iniciativa', r.titulo, 'origem', 'Operations AI', 'area', r.area, 'cidade', r.cidade,
      'prioridade', r.prioridade,
      'impacto_esperado', CASE WHEN r.classificacao='critica' THEN 'alto' WHEN r.classificacao='alta' THEN 'alto' ELSE 'médio' END,
      'custo_beneficio', CASE WHEN r.classificacao IN ('critica','oportunidade') THEN 'alto (ação de baixo custo, retorno relevante)' ELSE 'médio' END,
      'confianca', r.confianca, 'justificativa', r.justificativa, 'auditavel', true);
  END LOOP;

  -- Sinal 2: divergências financeiras (Finance AI) → risco a mitigar
  IF (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta') > 0 THEN
    plano := plano || jsonb_build_object(
      'iniciativa', 'Resolver divergências de conciliação financeira', 'origem', 'Finance AI',
      'area', 'financeiro', 'prioridade', 96, 'impacto_esperado', 'alto (confiança do cliente + integridade contábil)',
      'custo_beneficio', 'alto (correção pontual evita perda direta)', 'confianca', 0.95,
      'justificativa', format('%s divergência(s) aberta(s) detectada(s) pela conciliação',
        (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta')), 'auditavel', true);
  END IF;

  -- Sinal 3: expansão (Growth AI) → oportunidade territorial priorizada
  SELECT * INTO g FROM orion_growth_scores ORDER BY score DESC LIMIT 1;
  IF g IS NOT NULL THEN
    plano := plano || jsonb_build_object(
      'iniciativa', format('Ampliar operação em %s (score %s)', g.cidade, g.score), 'origem', 'Growth AI',
      'area', 'expansao', 'cidade', g.cidade, 'prioridade', 70,
      'impacto_esperado', 'médio-alto (converter cobertura existente em receita)',
      'custo_beneficio', 'alto onde já há grupos ativos', 'confianca', 0.72,
      'justificativa', g.detalhe->>'formula', 'auditavel', true);
  END IF;

  -- Sinal 4: demanda prevista baixa (Forecast AI) → estímulo comercial
  v_ped30 := ((forecast_predictions())->'pedidos'->>'d30')::numeric;
  IF v_ped30 < 50 THEN
    plano := plano || jsonb_build_object(
      'iniciativa', 'Estimular demanda com campanha (pedidos previstos baixos)', 'origem', 'Forecast AI',
      'area', 'campanhas', 'prioridade', 55, 'impacto_esperado', 'médio (elevar pedidos acima da média)',
      'custo_beneficio', 'depende do orçamento — simular no Pricing/Strategy antes',
      'confianca', ((forecast_predictions())->>'confianca'),
      'justificativa', format('~%s pedidos previstos em 30 dias (Forecast, %s)', v_ped30, (forecast_predictions())->>'erro_estimado'),
      'auditavel', true);
  END IF;

  -- Sinal 5: fila de publicação parada (Dispatcher) → destravar entrega
  IF (SELECT count(*) FROM motor_publish_requests WHERE status='aguardando_dispatcher') > 0 THEN
    plano := plano || jsonb_build_object(
      'iniciativa', 'Ativar worker GLM para destravar publicações', 'origem', 'Dispatcher AI',
      'area', 'logistica', 'prioridade', 80, 'impacto_esperado', 'alto (divulgações fluem → mais contatos)',
      'custo_beneficio', 'alto (ação operacional simples)', 'confianca', 0.9,
      'justificativa', format('%s publicação(ões) aguardando entrega',
        (SELECT count(*) FROM motor_publish_requests WHERE status='aguardando_dispatcher')), 'auditavel', true);
  END IF;

  RETURN jsonb_build_object(
    'plano_ranqueado', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'prioridade')::int DESC), '[]')
                        FROM jsonb_array_elements(plano) x),
    'total_iniciativas', jsonb_array_length(plano),
    'sinais_consolidados', jsonb_build_array('Operations','Finance','Growth','Forecast','Dispatcher'),
    'nota', 'Plano consolidado de sinais REAIS dos módulos certificados — recomendação explicável; execução é humana (via Operations/Execution).');
END; $$;
GRANT EXECUTE ON FUNCTION public.strategy_action_plan() TO authenticated, service_role;

-- ── PROJEÇÕES trimestrais e anuais (reuso Forecast; sempre projeção) ──
CREATE OR REPLACE FUNCTION public.strategy_projections()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fc jsonb; v_rec_d30 numeric; v_ped_d30 numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  fc := forecast_predictions();                       -- reuso (nunca recalcula)
  v_rec_d30 := (fc->'receita'->>'d30')::numeric;
  v_ped_d30 := (fc->'pedidos'->>'d30')::numeric;
  RETURN jsonb_build_object(
    'base', fc->>'base_dados', 'confianca', fc->>'confianca', 'erro_estimado', fc->>'erro_estimado',
    'receita', jsonb_build_object(
      'trimestre', round(coalesce(v_rec_d30,0) * 3, 2), 'ano', round(coalesce(v_rec_d30,0) * 12, 2)),
    'pedidos', jsonb_build_object(
      'trimestre', round(coalesce(v_ped_d30,0) * 3), 'ano', round(coalesce(v_ped_d30,0) * 12)),
    'metodo', 'extrapolação linear da projeção 30d do Forecast AI — PROJEÇÃO, não fato',
    'ressalva', 'Não incorpora sazonalidade trimestral (histórico insuficiente) — declarado');
END; $$;
GRANT EXECUTE ON FUNCTION public.strategy_projections() TO authenticated, service_role;

-- Dashboard v1.1: compõe o dashboard base + plano de ação + projeções
CREATE OR REPLACE FUNCTION public.strategy_dashboard_v11()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN strategy_dashboard() || jsonb_build_object(
    'plano_acao', strategy_action_plan(),
    'projecoes', strategy_projections());
END; $$;
GRANT EXECUTE ON FUNCTION public.strategy_dashboard_v11() TO authenticated;

-- Prompt oficial no Registry
SELECT public.orion_ai_prompt_set('strategy.action_plan',
'Você é o motor estratégico da VIAGG-TX8 (Strategic Intelligence Suite). Receberá um plano de ação REAL, ranqueado, consolidando sinais de Operations, Finance, Growth, Forecast e Dispatcher, cada iniciativa com impacto/custo-benefício/confiança/justificativa. Escreva em pt-BR (6-10 frases) o plano executivo: as 3 iniciativas mais importantes AGORA, por quê (citando a origem e a justificativa de cada uma), o impacto esperado e a sequência recomendada. Deixe claro que a execução é humana. Cite os dados do JSON; nunca invente. Termine com confiança.',
'Seed Strategy v1.1 (cumpre AI-17)') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='strategy.action_plan');
