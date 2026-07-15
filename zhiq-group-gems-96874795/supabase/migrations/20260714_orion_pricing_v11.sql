-- ═══════════════════════════════════════════════════════════════
-- ORION Pricing AI v1.1 — enhancement (spec detalhado AI-09/Pricing)
--
-- Estende o Pricing AI JÁ CERTIFICADO (v1.0, commit 0db2879) — NÃO
-- duplica lógica nem cria infraestrutura paralela (princípio do spec).
-- Acrescenta: motor de decisão EXPLICÁVEL (Preço Inteligente com pesos
-- por fator), detecção de anomalias, análise por cidade/categoria/
-- horário, heatmap nacional/estadual/municipal e previsões — tudo por
-- REUSO de Forecast/Conversion/Growth/Finance. Read-only financeiro,
-- IA só via Gateway + Registry.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ROLLBACK: DROP FUNCTION pricing_decision/anomalies/analysis/heatmap/predictions;
--           DELETE FROM orion_ai_prompts WHERE chave IN ('pricing.decision','pricing.anomaly');
-- ═══════════════════════════════════════════════════════════════

-- ── MOTOR DE DECISÃO: Preço Inteligente com fatores explicados ──
CREATE OR REPLACE FUNCTION public.pricing_decision(p_pacote uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pac RECORD; pol RECORD; fc jsonb; cv jsonb; g RECORD;
  v_base numeric; v_preco numeric; fatores jsonb := '[]'::jsonb;
  v_demanda numeric; v_recompra numeric; v_grupos int; v_membros int;
  v_ajuste numeric := 0; v_conf numeric := 0.5;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT * INTO pol FROM orion_pricing_policies WHERE escopo='global' AND ativo LIMIT 1;
  SELECT * INTO pac FROM divulgacao_packages
    WHERE id = coalesce(p_pacote, (SELECT id FROM divulgacao_packages WHERE ativo ORDER BY preco_brl LIMIT 1));
  IF pac IS NULL THEN RAISE EXCEPTION 'Pacote não encontrado'; END IF;
  v_base := pac.preco_brl;

  -- fatores REUSADOS de módulos certificados (cada um com peso explicável)
  fc := forecast_predictions();                                  -- demanda prevista
  v_demanda := (fc->'pedidos'->>'d30')::numeric;
  cv := conversion_ltv();                                          -- recompra/LTV
  v_recompra := (cv->>'recompra_pct')::numeric;
  SELECT count(*), coalesce(sum(members_count),0) INTO v_grupos, v_membros
    FROM whatsapp_groups WHERE is_active AND coalesce(is_valid,true);

  -- FATOR 1: demanda prevista (30d) — demanda alta suporta preço maior
  IF v_demanda >= 40 THEN v_ajuste := v_ajuste + 0.05;
    fatores := fatores || jsonb_build_object('fator','demanda_prevista','peso','+5%','valor',v_demanda,'fonte','Forecast AI (30d)');
  ELSIF v_demanda < 15 THEN v_ajuste := v_ajuste - 0.05;
    fatores := fatores || jsonb_build_object('fator','demanda_baixa','peso','-5%','valor',v_demanda,'fonte','Forecast AI (30d)');
  ELSE fatores := fatores || jsonb_build_object('fator','demanda_neutra','peso','0%','valor',v_demanda,'fonte','Forecast AI');
  END IF;

  -- FATOR 2: recompra (elasticidade de retenção) — recompra baixa pede preço-âncora atrativo
  IF coalesce(v_recompra,0) < 20 THEN v_ajuste := v_ajuste - 0.03;
    fatores := fatores || jsonb_build_object('fator','recompra_baixa','peso','-3%','valor',coalesce(v_recompra,0),'fonte','Conversion AI');
  ELSE fatores := fatores || jsonb_build_object('fator','recompra_saudavel','peso','+2%','valor',v_recompra,'fonte','Conversion AI');
    v_ajuste := v_ajuste + 0.02;
  END IF;

  -- FATOR 3: cobertura de grupos (alcance entregável) — mais alcance justifica premium
  IF v_grupos >= 5 THEN v_ajuste := v_ajuste + 0.03;
    fatores := fatores || jsonb_build_object('fator','cobertura_alta','peso','+3%','valor',v_grupos,'fonte','Dispatcher/grupos');
  END IF;

  v_conf := least(0.9, 0.4 + 0.1*(v_demanda>0)::int + 0.1*(v_grupos>0)::int
                      + 0.1*(v_recompra IS NOT NULL)::int + 0.1*(pol.id IS NOT NULL)::int);
  v_preco := round(v_base * (1 + v_ajuste), 2);
  -- governança: clampa dentro da política (nunca recomenda fora dos limites)
  IF pol.preco_min IS NOT NULL THEN v_preco := greatest(v_preco, pol.preco_min); END IF;
  IF pol.preco_max IS NOT NULL THEN v_preco := least(v_preco, pol.preco_max); END IF;

  RETURN jsonb_build_object(
    'pacote', pac.nome, 'preco_atual', v_base, 'preco_inteligente', v_preco,
    'ajuste_pct', round(v_ajuste*100,1), 'confianca', v_conf,
    'fatores', fatores,
    'preco_minimo', pol.preco_min, 'preco_maximo', pol.preco_max, 'margem_alvo_pct', pol.margem_alvo_pct,
    'explicacao', format('Preço inteligente = R$ %s × (1 %s%s%%) clampado pela política [R$ %s–%s]',
      v_base, CASE WHEN v_ajuste>=0 THEN '+' ELSE '' END, round(v_ajuste*100,1), pol.preco_min, pol.preco_max),
    'decisao', 'Recomendação explicável — aplicação exige aprovação (pricing_apply_package)',
    'auditavel', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_decision(uuid) TO authenticated, service_role;

-- ── DETECÇÃO DE ANOMALIAS de preço ──
CREATE OR REPLACE FUNCTION public.pricing_anomalies()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE anom jsonb := '[]'::jsonb; pol RECORD; r RECORD; v_med numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT * INTO pol FROM orion_pricing_policies WHERE escopo='global' AND ativo LIMIT 1;

  -- 1) preço do catálogo fora dos limites da política
  FOR r IN SELECT * FROM divulgacao_packages WHERE ativo LOOP
    IF pol.preco_min IS NOT NULL AND r.preco_brl < pol.preco_min THEN
      anom := anom || jsonb_build_object('tipo','abaixo_do_minimo','pacote',r.nome,'preco',r.preco_brl,
        'limite',pol.preco_min,'severidade','alta');
    END IF;
    IF pol.preco_max IS NOT NULL AND r.preco_brl > pol.preco_max THEN
      anom := anom || jsonb_build_object('tipo','acima_do_maximo','pacote',r.nome,'preco',r.preco_brl,
        'limite',pol.preco_max,'severidade','alta');
    END IF;
  END LOOP;

  -- 2) preço/divulgação (R$ por unidade) fora de ±50% da mediana (outlier de valor unitário)
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY preco_brl/nullif(qtd_divulgacoes,0)) INTO v_med
    FROM divulgacao_packages WHERE ativo AND qtd_divulgacoes > 0;
  IF v_med IS NOT NULL THEN
    FOR r IN SELECT *, preco_brl/nullif(qtd_divulgacoes,0) AS unit FROM divulgacao_packages
             WHERE ativo AND qtd_divulgacoes > 0 LOOP
      IF r.unit > v_med * 1.5 OR r.unit < v_med * 0.5 THEN
        anom := anom || jsonb_build_object('tipo','preco_unitario_outlier','pacote',r.nome,
          'unitario',round(r.unit,2),'mediana',round(v_med,2),'severidade','media');
      END IF;
    END LOOP;
  END IF;

  -- 3) mudanças bruscas no histórico (>30% em um passo)
  FOR r IN SELECT * FROM orion_pricing_history
           WHERE valor_antigo IS NOT NULL AND valor_novo IS NOT NULL AND NOT revertido
             AND abs(valor_novo - valor_antigo) > valor_antigo * 0.3
           ORDER BY criado_em DESC LIMIT 5 LOOP
    anom := anom || jsonb_build_object('tipo','mudanca_brusca','de',r.valor_antigo,'para',r.valor_novo,
      'quando',r.criado_em,'severidade','media');
  END LOOP;

  IF jsonb_array_length(anom) > 0 THEN
    PERFORM pricing_emit('pricing_anomalia_detectada', jsonb_build_object('n', jsonb_array_length(anom)));
  END IF;
  RETURN jsonb_build_object('anomalias', anom, 'total', jsonb_array_length(anom),
    'nota','Anomalias contra política + outliers de preço unitário + mudanças bruscas (histórico)');
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_anomalies() TO authenticated, service_role;

-- ── ANÁLISE por dimensão (cidade/categoria/horário) — reuso ──
CREATE OR REPLACE FUNCTION public.pricing_analysis(p_dimensao text DEFAULT 'cidade')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  IF p_dimensao = 'cidade' THEN
    RETURN jsonb_build_object('dimensao','cidade', 'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'cidade', g.cidade, 'uf', g.uf, 'growth_score', g.score,
      'suporta_reajuste', g.score >= 60, 'demanda_relativa',
      CASE WHEN g.score >= 60 THEN 'alta' WHEN g.score >= 40 THEN 'média' ELSE 'baixa' END,
      'recomendacao', CASE WHEN g.score >= 60 THEN 'preço pode subir (demanda sustenta)'
        ELSE 'proteger conversão / manter preço' END) ORDER BY g.score DESC), '[]') FROM orion_growth_scores g));
  ELSIF p_dimensao = 'categoria' THEN
    RETURN jsonb_build_object('dimensao','categoria', 'itens',
      (SELECT (orion_finance_dashboard())->'receita'->'por_produto'),
      'nota','receita por categoria (Finance, leitura) — categoria que fatura mais suporta premium');
  ELSIF p_dimensao = 'horario' THEN
    RETURN jsonb_build_object('dimensao','horario', 'itens',
      (SELECT (orion_finance_dashboard())->'insights'->'horarios_com_mais_vendas'),
      'nota','horários de pico (Finance) — surge pricing potencial nos picos');
  ELSE RAISE EXCEPTION 'Dimensão inválida: % (use cidade|categoria|horario)', p_dimensao;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_analysis(text) TO authenticated, service_role;

-- ── HEATMAP nacional/estadual/municipal (reuso growth + finance) ──
CREATE OR REPLACE FUNCTION public.pricing_heatmap(p_nivel text DEFAULT 'municipal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  IF p_nivel = 'municipal' THEN
    RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'uf', uf, 'score', score,
      'intensidade', CASE WHEN score >= 60 THEN 'quente' WHEN score >= 40 THEN 'morno' ELSE 'frio' END,
      'suporta_preco', score >= 60) ORDER BY score DESC), '[]') FROM orion_growth_scores);
  ELSIF p_nivel = 'estadual' THEN
    RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('uf', uf, 'cidades', n, 'score_medio', round(sm))), '[]')
      FROM (SELECT coalesce(uf,'?') uf, count(*) n, avg(score) sm FROM orion_growth_scores GROUP BY 1 ORDER BY avg(score) DESC) x);
  ELSE  -- nacional
    RETURN jsonb_build_object('cidades_pontuadas', (SELECT count(*) FROM orion_growth_scores),
      'score_nacional_medio', (SELECT round(avg(score)) FROM orion_growth_scores),
      'preco_medio_catalogo', (SELECT round(avg(preco_brl),2) FROM divulgacao_packages WHERE ativo),
      'receita_total', ((orion_finance_dashboard())->'receita'->>'ordens_pagas_total'));
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_heatmap(text) TO authenticated, service_role;

-- ── PREVISÕES de demanda/receita/lucro + elasticidade (reuso) ──
CREATE OR REPLACE FUNCTION public.pricing_predictions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'demanda', (forecast_predictions())->'pedidos',                 -- reuso Forecast
    'receita', (forecast_predictions())->'receita',
    'confianca_forecast', (forecast_predictions())->>'confianca',
    'erro_estimado', (forecast_predictions())->>'erro_estimado',
    'elasticidade_referencia', -0.8,
    'lucro', 'depende de custos operacionais — Finance é a fonte, não recalculado aqui',
    'nota', 'Previsões reusadas do Forecast AI (nunca recalculadas); elasticidade -0,8 declarada até calibrar histórico');
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_predictions() TO authenticated, service_role;

-- Dashboard v1.1: acrescenta decisão + anomalias + heatmap (reuso; não recria o dashboard base)
CREATE OR REPLACE FUNCTION public.pricing_dashboard_v11()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN pricing_dashboard() || jsonb_build_object(
    'decisao', pricing_decision(NULL),
    'anomalias', pricing_anomalies(),
    'heatmap_nacional', pricing_heatmap('nacional'),
    'predictions', pricing_predictions());
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_dashboard_v11() TO authenticated;

-- Prompts adicionais no Registry
SELECT public.orion_ai_prompt_set('pricing.decision',
'Você é o motor de decisão de preços da VIAGG-TX8. Receberá o Preço Inteligente calculado com FATORES explicados (demanda prevista, recompra, cobertura), limites de política e confiança. Explique em pt-BR (5-8 frases) por que o preço recomendado faz sentido, quais fatores mais pesaram e o risco. Deixe claro que a aplicação exige aprovação e respeita a política. Cite os números do JSON; nunca invente.',
'Seed Pricing v1.1') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='pricing.decision');
SELECT public.orion_ai_prompt_set('pricing.anomaly',
'Você analisa anomalias de preço da VIAGG-TX8 (fora da política, outliers de preço unitário, mudanças bruscas). Em pt-BR (4-7 frases), priorize as anomalias por severidade, explique a causa provável e a ação recomendada. Não invente anomalias fora do JSON.',
'Seed Pricing v1.1') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='pricing.anomaly');
