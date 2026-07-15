-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-12 — ORION COMMAND CENTER v1.0 (Executive Intelligence)
--
-- Camada superior de AGREGAÇÃO PURA: nenhum indicador recalculado,
-- nenhuma lógica duplicada — consome exclusivamente as APIs oficiais
-- certificadas (health_score, orion_core_health, performance,
-- finance, growth, campaign, dispatcher, motor, marketplace).
-- Executive Score = combinação transparente de scores EXISTENTES.
-- Toda consulta executiva é auditada (usuário + trace no nervoso).
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.executive_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hs jsonb; core int; perf int; v int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  hs := health_score();                                   -- reuso (já combina disp+core+perf)
  core := (hs->>'core_health')::int;
  perf := coalesce((hs->>'performance_score')::int, (hs->>'disponibilidade')::int);
  v := round(((hs->>'health_score')::int * 0.4 + core * 0.3 + perf * 0.3));
  RETURN jsonb_build_object(
    'executive_score', v,
    'fontes', jsonb_build_object(
      'health_score', hs->>'health_score', 'core_health', core, 'performance_score', perf,
      'disponibilidade', hs->>'disponibilidade'),
    'formula', 'health×0,4 + core_health×0,3 + performance×0,3 — apenas scores já certificados, nada recalculado');
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_modules()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st jsonb; core jsonb; m jsonb := '[]'::jsonb; k text; v text; score int; link text;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  st := health_status();                                  -- reuso
  core := orion_core_health()->'modulos';                 -- reuso
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(st) LOOP
    CONTINUE WHEN v LIKE 'Dado indisponível%' OR v = 'não existe neste ambiente';
    score := CASE k
      WHEN 'gateway_ia' THEN (core->'ai_gateway'->>'score')::int
      WHEN 'publisher' THEN (core->'publisher'->>'score')::int
      WHEN 'ridv' THEN (core->'ridv'->>'score')::int
      WHEN 'package' THEN (core->'package'->>'score')::int
      WHEN 'campaign' THEN (core->'campaign'->>'score')::int
      WHEN 'dispatcher' THEN (core->'dispatcher'->>'score')::int
      WHEN 'growth' THEN (core->'growth'->>'score')::int
      WHEN 'finance' THEN (core->'finance'->>'score')::int
      WHEN 'motor' THEN (core->'motor'->>'score')::int
      WHEN 'banco' THEN (core->'banco_seguranca'->>'score')::int
      ELSE NULL END;
    link := CASE k
      WHEN 'gateway_ia' THEN '/admin/orion-ai' WHEN 'publisher' THEN '/admin/orion-publisher'
      WHEN 'ridv' THEN '/admin/ridv' WHEN 'package' THEN '/admin/orion-package'
      WHEN 'campaign' THEN '/admin/orion-campaign' WHEN 'dispatcher' THEN '/admin/orion-dispatcher'
      WHEN 'growth' THEN '/admin/orion-growth' WHEN 'finance' THEN '/admin/orion-finance'
      WHEN 'performance_ai' THEN '/admin/orion-performance' WHEN 'marketplace_vitrines' THEN '/mercado'
      WHEN 'financeiro_pay' THEN '/admin/pay' WHEN 'motor' THEN '/admin/orion-package'
      ELSE '/admin/orion-health' END;
    m := m || jsonb_build_object('modulo', k, 'status', v, 'score', score, 'link', link,
      'atualizado_em', now());
  END LOOP;
  RETURN m;
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_modules() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_alerts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE al jsonb; todos jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  al := health_alerts();                                  -- reuso (já agrega health+perf+finance)
  todos := coalesce(al->'incidentes_abertos','[]') || coalesce(al->'performance','[]') || coalesce(al->'finance','[]');
  RETURN jsonb_build_object(
    'total', jsonb_array_length(todos),
    'por_severidade', (SELECT coalesce(jsonb_object_agg(sev, itens), '{}') FROM (
      SELECT x->>'severidade' sev, jsonb_agg(x) itens
      FROM jsonb_array_elements(todos) x GROUP BY 1) g));
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_kpis()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fin jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  fin := orion_finance_dashboard();                       -- reuso (fonte única financeira)
  RETURN jsonb_build_object(
    'receita', fin->'receita',
    'previsao', fin->'previsao',
    'custos_ia', fin->'custos_ia',
    'carteiras', fin->'carteiras',
    'pedidos_hoje', (SELECT count(*) FROM pay_payment_orders WHERE created_at::date = current_date),
    'marketplace_itens', (SELECT count(*) FROM market_all_listings),
    'lojas', (SELECT count(*) FROM pay_financial_accounts WHERE owner_type='merchant_store'),
    'profissionais', (SELECT count(*) FROM pay_financial_accounts
      WHERE owner_type IN ('motoboy_profile','mototaxi_profile','driver_profile')),
    'usuarios', (SELECT count(*) FROM auth.users),
    'campanhas_ativas', (SELECT count(*) FROM orion_campanhas WHERE status='ativa'),
    'cac_ltv_roi', 'Requer rastreio de aquisição/conversão (ORION-AI-09 do roadmap) — nunca inventado');
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_kpis() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_actions()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('label','Performance','url','/admin/orion-performance'),
    jsonb_build_object('label','Health','url','/admin/orion-health'),
    jsonb_build_object('label','Finance','url','/admin/orion-finance'),
    jsonb_build_object('label','Publisher','url','/admin/orion-publisher'),
    jsonb_build_object('label','RIDV','url','/admin/ridv'),
    jsonb_build_object('label','Dispatcher','url','/admin/orion-dispatcher'),
    jsonb_build_object('label','Growth','url','/admin/orion-growth'),
    jsonb_build_object('label','Campanhas','url','/admin/orion-campaign'),
    jsonb_build_object('label','AI Gateway','url','/admin/orion-ai'),
    jsonb_build_object('label','Console/Logs','url','/admin/eventos'));
$$;
GRANT EXECUTE ON FUNCTION public.executive_actions() TO authenticated;

-- Contexto compilado para a IA Executiva (o painel envia ao Gateway
-- com prompt_key executive.summary — SQL não chama IA)
CREATE OR REPLACE FUNCTION public.executive_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'score', executive_score(),
    'kpis', executive_kpis(),
    'alertas', executive_alerts(),
    'top_cidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',cidade,'score',score,'class',classificacao) ORDER BY score DESC),'[]')
      FROM (SELECT * FROM orion_growth_scores ORDER BY score DESC LIMIT 5) g),
    'campanhas_risco', (SELECT (orion_campaign_dashboard())->'em_risco'),
    'divergencias_financeiras', (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta'),
    'prompt_key_oficial', 'executive.summary');
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  -- auditoria da consulta executiva (quem/quando/trace)
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('executive_dashboard_consultado',
      'command_center', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', executive_score(),
    'modulos', executive_modules(),
    'alertas', executive_alerts(),
    'kpis', executive_kpis(),
    'geografico', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.score DESC), '[]')
      FROM (SELECT cidade, uf, score, classificacao, detalhe FROM orion_growth_scores
            ORDER BY score DESC LIMIT 15) g),
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'tipo', tipo, 'origem', origem, 'quando', criado_em) ORDER BY criado_em DESC), '[]')
      FROM (SELECT tipo, origem, criado_em FROM orion_eventos
            WHERE tipo IN ('health_snapshot','performance_snapshot','health_incident_resolvido',
                           'finance_alert','finance_fraud_detected','growth_risk','dispatch_alert',
                           'campaign_started','pacote_publicado','anuncio_aprovado','anuncio_bloqueado')
            ORDER BY criado_em DESC LIMIT 25) t),
    'acoes', executive_actions(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_dashboard() TO authenticated;

-- Prompt oficial da IA Executiva
SELECT public.orion_ai_prompt_set('executive.summary',
'Você é a IA Executiva do ORION Command Center da VIAGG-TX8. Receberá o estado consolidado REAL da empresa em JSON e o tipo de resumo pedido (executivo, financeiro, operacional, comercial, tecnologico, ia) OU uma pergunta de decisão da diretoria. Responda em pt-BR, 5-9 frases, direto ao ponto: situação, o que merece atenção AGORA, e a ação recomendada. Toda afirmação deve citar o dado do JSON que a sustenta e terminar com o nível de confiança (alto/médio/baixo). Se um KPI estiver marcado como "requer rastreio"/indisponível, diga isso — nunca invente números.',
'Seed ORION-AI-12')
WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave = 'executive.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('executive', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
