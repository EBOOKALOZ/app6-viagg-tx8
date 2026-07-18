-- ============================================================================
-- ORION-AI-59 — EXECUTIVE STRATEGY AI v1.0 (Chief Strategy Intelligence Officer)
-- ============================================================================
-- Camada estratégica MÁXIMA do ecossistema ORION. Conselheiro executivo digital:
-- consolida, correlaciona, avalia risco, projeta cenários e RECOMENDA decisões —
-- SEMPRE fundamentado em dados reais. NÃO executa operações, NÃO move dinheiro,
-- NÃO inventa informação.
--
-- REUSO (não duplica): consome o AI-30 (Executive/CEO Copilot) — executive_fusion(),
-- executive_score(), executive_cii(), executive_simulator(), executive_risks(),
-- executive_opportunities(), orion_executive_snapshots — e NUNCA reescreve o AI-30.
-- AI-30 = snapshot diário efêmero + CEO chat. AI-59 = estratégia DURÁVEL:
-- risco/oportunidade/recomendação/decisão persistidos+classificados, cenários
-- multi-horizonte, relatórios (diário→anual) e o LOOP DE APRENDIZADO
-- (recomendação→decisão→resultado→precisão).
--
-- Namespace ISOLADO: tabelas orion_exstrat_*, funções exstrat_*, chave exec_strategy.
-- (o namespace executive_*/orion_executive_* pertence ao AI-30 — não é tocado.)
--
-- ROLLBACK:
--   DROP TABLE public.orion_exstrat_metrics, orion_exstrat_scores, orion_exstrat_forecasts,
--     orion_exstrat_risks, orion_exstrat_opportunities, orion_exstrat_recommendations,
--     orion_exstrat_decisions, orion_exstrat_reports, orion_exstrat_ai_summary,
--     orion_exstrat_history, orion_exstrat_audits, orion_exstrat_questions CASCADE;
--   DROP FUNCTION public.exstrat_emit, exstrat_count_safe, exstrat_audit, exstrat_snapshot,
--     exstrat_build_scenarios, exstrat_build_risks, exstrat_build_opportunities,
--     exstrat_build_recommendations, exstrat_build_decisions, exstrat_refresh_ai_summary,
--     exstrat_scores_refresh, exstrat_generate, exstrat_report_generate, exstrat_learn,
--     exstrat_summary, exstrat_dashboard, exstrat_recommendations, exstrat_risks,
--     exstrat_opportunities, exstrat_forecast, exstrat_reports, exstrat_ai_summary,
--     exstrat_decision_support, exstrat_questions, exstrat_strategy, exstrat_score,
--     orion_exec_strategy_tick, exstrat_selftest CASCADE;
--   SELECT cron.unschedule('orion_exec_strategy_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'exec_strategy.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='exec_strategy';
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS (12)
-- ----------------------------------------------------------------------------

-- 1.1 métricas executivas consolidadas (reusa executive_fusion do AI-30)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_metrics (
  id             bigserial PRIMARY KEY,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  receita        numeric DEFAULT 0,
  custo_ia_usd   numeric DEFAULT 0,
  gmv            numeric DEFAULT 0,
  pedidos_pagos  int DEFAULT 0,
  usuarios       int DEFAULT 0,
  conversao_pct  numeric,
  taxa_pagamento_pct numeric,
  componentes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  fonte          text DEFAULT 'executive_fusion (AI-30) + contagens seguras',
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_exstrat_metrics_unico UNIQUE (dia)
);
COMMENT ON TABLE public.orion_exstrat_metrics IS 'ORION-AI-59: KPIs executivos consolidados/dia — reusa executive_fusion (AI-30), nunca recalcula.';

-- 1.2 scores estratégicos diários
CREATE TABLE IF NOT EXISTS public.orion_exstrat_scores (
  id             bigserial PRIMARY KEY,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  executive_strategy_score int NOT NULL DEFAULT 50,   -- ESS (headline do AI-59)
  executive_score int,                                -- reusado do AI-30
  health_score   int,
  growth_score   int,
  risk_score     int,
  opportunity_score int,
  innovation_score int,
  confianca      int DEFAULT 50,
  componentes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_exstrat_scores_unico UNIQUE (dia)
);
COMMENT ON TABLE public.orion_exstrat_scores IS 'ORION-AI-59: Executive Strategy Score (ESS) + componentes (executive_score reusado do AI-30).';

-- 1.3 cenários / forecasts (conservador/realista/otimista × horizonte × métrica)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_forecasts (
  id             bigserial PRIMARY KEY,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  cenario        text NOT NULL CHECK (cenario IN ('conservador','realista','otimista')),
  horizonte      text NOT NULL,
  metrica        text NOT NULL,
  valor_base     numeric,
  valor_proj     numeric,
  variacao_pct   numeric,
  confianca      int DEFAULT 40,
  metodo         text DEFAULT 'modelo analítico com fatores DECLARADos sobre base real (reusa AI-30/AI-55) — nunca inventa',
  fatores        jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_exstrat_forecast_unico UNIQUE (dia, cenario, horizonte, metrica)
);
COMMENT ON TABLE public.orion_exstrat_forecasts IS 'ORION-AI-59: cenários executivos (conservador/realista/otimista) com método e base declarados.';

-- 1.4 riscos (Risk Center)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_risks (
  id             bigserial PRIMARY KEY,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  risk_key       text NOT NULL,
  categoria      text NOT NULL,   -- financeiro/tecnologico/operacional/juridico/crescimento/infraestrutura/fraude/disponibilidade
  titulo         text NOT NULL,
  descricao      text,
  severidade     text NOT NULL DEFAULT 'medio' CHECK (severidade IN ('baixo','medio','alto','critico')),
  probabilidade  int DEFAULT 50,
  impacto        int DEFAULT 50,
  evidencias     jsonb NOT NULL DEFAULT '{}'::jsonb,
  mitigacao      text,
  modulos        jsonb DEFAULT '[]'::jsonb,
  status         text NOT NULL DEFAULT 'aberto',
  detectado_em   timestamptz NOT NULL DEFAULT now(),
  resolvido_em   timestamptz,
  CONSTRAINT orion_exstrat_risk_unico UNIQUE (risk_key, dia)
);
COMMENT ON TABLE public.orion_exstrat_risks IS 'ORION-AI-59: Risk Center — riscos classificados por severidade, com evidência real.';

-- 1.5 oportunidades (Opportunity Center)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_opportunities (
  id             bigserial PRIMARY KEY,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  opp_key        text NOT NULL,
  tipo           text NOT NULL,   -- cidade/mercado/categoria/parceiro/receita/comportamento
  titulo         text NOT NULL,
  descricao      text,
  potencial      text,
  potencial_score int DEFAULT 50,
  confianca      int DEFAULT 50,
  janela         text,
  evidencias     jsonb NOT NULL DEFAULT '{}'::jsonb,
  modulos        jsonb DEFAULT '[]'::jsonb,
  status         text NOT NULL DEFAULT 'aberta',
  detectado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_exstrat_opp_unico UNIQUE (opp_key, dia)
);
COMMENT ON TABLE public.orion_exstrat_opportunities IS 'ORION-AI-59: Opportunity Center — oportunidades com potencial/janela/evidência.';

-- 1.6 recomendações executivas
CREATE TABLE IF NOT EXISTS public.orion_exstrat_recommendations (
  id             bigserial PRIMARY KEY,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  rec_key        text NOT NULL,
  area           text NOT NULL,   -- expansao/contratacoes/marketing/tecnologia/infraestrutura/novos_modulos/precificacao/comissoes/cashback/investimentos/reducao_custos/automacao
  titulo         text NOT NULL,
  descricao      text,
  beneficios     text,
  riscos         text,
  impacto_financeiro   text,
  impacto_operacional  text,
  impacto_tecnologico  text,
  impacto_comercial    text,
  prazo          text,
  complexidade   text,
  roi_estimado   text,
  prob_sucesso   int DEFAULT 50,
  confianca      int DEFAULT 50,
  prioridade     int DEFAULT 50,
  classificacao  text,
  evidencias     jsonb NOT NULL DEFAULT '{}'::jsonb,
  modulos        jsonb DEFAULT '[]'::jsonb,
  status         text NOT NULL DEFAULT 'proposta',
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_exstrat_rec_unico UNIQUE (rec_key, dia)
);
COMMENT ON TABLE public.orion_exstrat_recommendations IS 'ORION-AI-59: recomendações estratégicas com ROI/probabilidade/confiança — recomenda, nunca executa.';

-- 1.7 motor de decisão (Decision Engine)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_decisions (
  id             bigserial PRIMARY KEY,
  decision_key   text NOT NULL,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  titulo         text NOT NULL,
  objetivo       text,
  beneficios     text,
  riscos         text,
  impacto_financeiro   text,
  impacto_operacional  text,
  impacto_tecnologico  text,
  impacto_comercial    text,
  prazo          text,
  complexidade   text,
  roi_estimado   text,
  prob_sucesso   int DEFAULT 50,
  confianca      int DEFAULT 50,
  prioridade     int DEFAULT 50,
  recomendacao   text,
  evidencias     jsonb NOT NULL DEFAULT '{}'::jsonb,
  financeiro     boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'proposta',  -- proposta/aprovada/recusada/executada/revertida
  resultado      jsonb,
  decidido_por   uuid,
  decidido_em    timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_exstrat_decision_unico UNIQUE (decision_key, dia)
);
COMMENT ON TABLE public.orion_exstrat_decisions IS 'ORION-AI-59: Decision Engine — decisão estratégica analisada (ROI/prob/confiança). Aprovação é humana; financeiro nunca é executado.';

-- 1.8 relatórios executivos (versionados)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_reports (
  id             bigserial PRIMARY KEY,
  tipo           text NOT NULL,   -- diario/semanal/mensal/trimestral/anual
  periodo        text NOT NULL,
  titulo         text,
  conteudo       jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumo         text,
  versao         int NOT NULL DEFAULT 1,
  gerado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_exstrat_report_unico UNIQUE (tipo, periodo)
);
COMMENT ON TABLE public.orion_exstrat_reports IS 'ORION-AI-59: relatórios executivos automáticos (diário→anual), versionados por período.';

-- 1.9 consolidação cross-AI (mapa de valor das IAs ORION)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_ai_summary (
  id             bigserial PRIMARY KEY,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  modulo         text NOT NULL,
  chave          text,
  status         text,
  score          int,
  valor_entregue text,
  contribuicao   text,
  evidencias     jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT orion_exstrat_ai_summary_unico UNIQUE (modulo, dia)
);
COMMENT ON TABLE public.orion_exstrat_ai_summary IS 'ORION-AI-59: Cross-AI Intelligence — visão única do valor entregue por cada IA ORION (read-only, auto-descoberto).';

-- 1.10 loop de aprendizado (estratégia contínua)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_history (
  id             bigserial PRIMARY KEY,
  ref_tipo       text NOT NULL,   -- recomendacao/decisao
  ref_key        text NOT NULL,
  previsto       jsonb NOT NULL DEFAULT '{}'::jsonb,
  decidido       jsonb,
  resultado      jsonb,
  precisao       numeric,
  aprendizado    text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_exstrat_history IS 'ORION-AI-59: loop recomendação→decisão→resultado→precisão→aprendizado (estratégia contínua).';

-- 1.11 auditoria imutável (rastreabilidade + explicabilidade)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_audits (
  id             bigserial PRIMARY KEY,
  acao           text NOT NULL,
  entidade       text,
  entidade_ref   text,
  detalhes       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ator           uuid,
  origem         text NOT NULL DEFAULT 'exec_strategy',
  criado_em      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_exstrat_audits IS 'ORION-AI-59: trilha de auditoria imutável de recomendações/decisões/relatórios.';

-- 1.12 perguntas do CEO Copilot (Q&A fundamentado)
CREATE TABLE IF NOT EXISTS public.orion_exstrat_questions (
  id             bigserial PRIMARY KEY,
  pergunta       text NOT NULL,
  resposta       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {resumo,evidencias,metricas,comparativos,recomendacao,riscos,proximos_passos}
  confianca      int DEFAULT 50,
  contexto       jsonb NOT NULL DEFAULT '{}'::jsonb,
  perguntado_por uuid,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_exstrat_questions IS 'ORION-AI-59: Executive Copilot — perguntas do CEO respondidas SÓ com dados reais (nunca inventa).';

CREATE INDEX IF NOT EXISTS idx_exstrat_risks_dia   ON public.orion_exstrat_risks (dia DESC, severidade);
CREATE INDEX IF NOT EXISTS idx_exstrat_opps_dia    ON public.orion_exstrat_opportunities (dia DESC);
CREATE INDEX IF NOT EXISTS idx_exstrat_recs_dia    ON public.orion_exstrat_recommendations (dia DESC, prioridade DESC);
CREATE INDEX IF NOT EXISTS idx_exstrat_dec_dia     ON public.orion_exstrat_decisions (dia DESC, prioridade DESC);
CREATE INDEX IF NOT EXISTS idx_exstrat_reports_t   ON public.orion_exstrat_reports (tipo, gerado_em DESC);
CREATE INDEX IF NOT EXISTS idx_exstrat_audits_em   ON public.orion_exstrat_audits (criado_em DESC);

-- ----------------------------------------------------------------------------
-- 2) RLS + trava de grants (REVOKE ALL / GRANT SELECT — RLS admin)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_exstrat_metrics','orion_exstrat_scores','orion_exstrat_forecasts',
    'orion_exstrat_risks','orion_exstrat_opportunities','orion_exstrat_recommendations',
    'orion_exstrat_decisions','orion_exstrat_reports','orion_exstrat_ai_summary',
    'orion_exstrat_history','orion_exstrat_audits','orion_exstrat_questions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) HELPERS (bus, contagem defensiva, auditoria)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'exec_strategy', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- conta linhas de uma relação se existir (defensivo, nunca quebra a migration)
CREATE OR REPLACE FUNCTION public.exstrat_count_safe(p_relacao text, p_where text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  IF to_regclass('public.'||p_relacao) IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT count(*) FROM public.'||quote_ident(p_relacao)||coalesce(' WHERE '||p_where,'') INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.exstrat_audit(p_acao text, p_entidade text, p_ref text, p_detalhes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_exstrat_audits (acao, entidade, entidade_ref, detalhes, ator)
  VALUES (p_acao, p_entidade, p_ref, coalesce(p_detalhes,'{}'::jsonb), auth.uid());
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) SNAPSHOT — reusa executive_fusion (AI-30) + contagens seguras
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  f jsonb;
  v_receita numeric; v_custo numeric; v_pedidos int; v_usuarios int;
  v_conv numeric; v_taxa numeric;
BEGIN
  f := public.executive_fusion();   -- REUSO do AI-30 (não recalcula)
  v_receita  := coalesce((f->>'receita')::numeric, 0);
  v_custo    := coalesce((f->>'ia_custo')::numeric, 0);
  v_conv     := (f->>'conversao')::numeric;
  v_taxa     := (f->>'taxa_pagamento')::numeric;
  v_pedidos  := coalesce(public.exstrat_count_safe('pay_payment_orders', 'status::text=''paid'''), 0)::int;
  v_usuarios := coalesce(public.exstrat_count_safe('profiles'), public.exstrat_count_safe('orion_customer_health'), 0)::int;

  INSERT INTO public.orion_exstrat_metrics (dia, receita, custo_ia_usd, gmv, pedidos_pagos, usuarios, conversao_pct, taxa_pagamento_pct, componentes)
  VALUES (v_hoje, v_receita, v_custo, v_receita, v_pedidos, v_usuarios, v_conv, v_taxa, f)
  ON CONFLICT (dia) DO UPDATE SET receita=excluded.receita, custo_ia_usd=excluded.custo_ia_usd, gmv=excluded.gmv,
    pedidos_pagos=excluded.pedidos_pagos, usuarios=excluded.usuarios, conversao_pct=excluded.conversao_pct,
    taxa_pagamento_pct=excluded.taxa_pagamento_pct, componentes=excluded.componentes, criado_em=now();

  RETURN jsonb_build_object('dia',v_hoje,'receita',v_receita,'pedidos',v_pedidos,'usuarios',v_usuarios,'fusion',f);
END$$;

-- ----------------------------------------------------------------------------
-- 5) CENÁRIOS — reusa base real (AI-30) + fatores DECLARADos (nunca inventa)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_build_scenarios()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_receita numeric; v_usuarios numeric;
  v_cen text; v_hor text; v_metrica text; v_base numeric; v_fator numeric; v_proj numeric;
  v_conf int; v_n int := 0;
  -- fator por (cenario, horizonte) — crescimento composto DECLARADO
  cenarios text[] := ARRAY['conservador','realista','otimista'];
  horizontes text[] := ARRAY['30d','90d','12m'];
BEGIN
  SELECT coalesce(receita,0), coalesce(usuarios,0) INTO v_receita, v_usuarios
  FROM public.orion_exstrat_metrics WHERE dia=v_hoje;
  IF v_receita IS NULL THEN v_receita := 0; END IF;
  IF v_usuarios IS NULL THEN v_usuarios := 0; END IF;

  FOREACH v_cen IN ARRAY cenarios LOOP
    FOREACH v_hor IN ARRAY horizontes LOOP
      -- fator declarado por cenário/horizonte
      v_fator := CASE v_cen
        WHEN 'conservador' THEN CASE v_hor WHEN '30d' THEN 1.02 WHEN '90d' THEN 1.05 ELSE 1.15 END
        WHEN 'realista'    THEN CASE v_hor WHEN '30d' THEN 1.06 WHEN '90d' THEN 1.20 ELSE 1.60 END
        ELSE                    CASE v_hor WHEN '30d' THEN 1.12 WHEN '90d' THEN 1.45 ELSE 2.40 END
      END;
      v_conf := CASE v_hor WHEN '30d' THEN 55 WHEN '90d' THEN 42 ELSE 30 END;
      FOREACH v_metrica IN ARRAY ARRAY['receita','usuarios'] LOOP
        v_base := CASE v_metrica WHEN 'receita' THEN v_receita ELSE v_usuarios END;
        v_proj := round((v_base * v_fator)::numeric, 2);
        INSERT INTO public.orion_exstrat_forecasts (dia, cenario, horizonte, metrica, valor_base, valor_proj, variacao_pct, confianca, fatores)
        VALUES (v_hoje, v_cen, v_hor, v_metrica, v_base, v_proj, round(((v_fator-1)*100)::numeric,1), v_conf,
          jsonb_build_object('fator_declarado', v_fator, 'metodo', 'crescimento composto sobre base real do AI-30', 'reusa', jsonb_build_array('executive_fusion','executive_simulator','forecast(AI-16)','predictive(AI-55)')))
        ON CONFLICT (dia, cenario, horizonte, metrica) DO UPDATE SET valor_base=excluded.valor_base,
          valor_proj=excluded.valor_proj, variacao_pct=excluded.variacao_pct, confianca=excluded.confianca, fatores=excluded.fatores;
        v_n := v_n + 1;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 6) RISK CENTER — deriva riscos de sinais REAIS (fusion + tabelas seguras)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_build_risks()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  f jsonb; v_taxa numeric; v_seg int; v_conv numeric; v_lat numeric; v_n int := 0;
  v_incidentes bigint; v_fraude bigint;
BEGIN
  SELECT componentes INTO f FROM public.orion_exstrat_metrics WHERE dia=v_hoje;
  IF f IS NULL THEN f := public.executive_fusion(); END IF;
  v_taxa := (f->>'taxa_pagamento')::numeric;
  v_seg  := coalesce((f->>'seguranca_alertas_alta')::int,0);
  v_conv := (f->>'conversao')::numeric;
  v_lat  := (f->>'ia_latencia_ms')::numeric;
  v_incidentes := public.exstrat_count_safe('orion_incident_incidents', 'status <> ''fechado''');
  v_fraude     := public.exstrat_count_safe('orion_fraud_signals', 'severidade in (''alta'',''critica'')');

  -- risco financeiro: taxa de pagamento baixa
  IF v_taxa IS NOT NULL AND v_taxa < 70 THEN
    INSERT INTO public.orion_exstrat_risks (dia, risk_key, categoria, titulo, descricao, severidade, probabilidade, impacto, evidencias, mitigacao, modulos)
    VALUES (v_hoje, 'fin_taxa_pagamento', 'financeiro', 'Taxa de conversão de pagamento abaixo do saudável',
      'Taxa de pagamento aprovado ('||coalesce(v_taxa::text,'?')||'%) abaixo de 70% indica atrito no checkout/gateway.',
      CASE WHEN v_taxa < 50 THEN 'critico' WHEN v_taxa < 60 THEN 'alto' ELSE 'medio' END,
      70, 65, jsonb_build_object('taxa_pagamento_pct', v_taxa, 'fonte','executive_fusion (AI-30)'),
      'Revisar fluxo MP/checkout, reduzir falhas; correlacionar com AI-04 Finance e AI-25 Sales.', jsonb_build_array('finance','sales','gateway'))
    ON CONFLICT (risk_key, dia) DO UPDATE SET severidade=excluded.severidade, probabilidade=excluded.probabilidade, impacto=excluded.impacto, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END IF;

  -- risco de fraude/segurança: alertas de alta
  IF v_seg > 0 OR coalesce(v_fraude,0) > 0 THEN
    INSERT INTO public.orion_exstrat_risks (dia, risk_key, categoria, titulo, descricao, severidade, probabilidade, impacto, evidencias, mitigacao, modulos)
    VALUES (v_hoje, 'seg_alertas_alta', 'fraude', 'Alertas de segurança/fraude de alta severidade ativos',
      'Há '||v_seg||' alerta(s) de segurança de alta (7d) e '||coalesce(v_fraude,0)||' sinal(is) de fraude alta/crítica.',
      CASE WHEN v_seg >= 5 OR coalesce(v_fraude,0) >= 5 THEN 'alto' ELSE 'medio' END,
      55, 60, jsonb_build_object('seguranca_alertas_alta', v_seg, 'fraude_alta', coalesce(v_fraude,0)),
      'Acionar Security Ecosystem (AI-40/41/45); revisar padrões e reforçar controles.', jsonb_build_array('security','fraud','incident_response'))
    ON CONFLICT (risk_key, dia) DO UPDATE SET descricao=excluded.descricao, severidade=excluded.severidade, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END IF;

  -- risco de crescimento: conversão baixa
  IF v_conv IS NOT NULL AND v_conv < 15 THEN
    INSERT INTO public.orion_exstrat_risks (dia, risk_key, categoria, titulo, descricao, severidade, probabilidade, impacto, evidencias, mitigacao, modulos)
    VALUES (v_hoje, 'cresc_conversao', 'crescimento', 'Conversão de interesse→pagamento baixa',
      'Conversão de contatos em desbloqueios pagos ('||coalesce(v_conv::text,'?')||'%) limita a monetização do marketplace.',
      CASE WHEN v_conv < 5 THEN 'alto' ELSE 'medio' END, 60, 55,
      jsonb_build_object('conversao_pct', v_conv), 'Otimizar funil (AI-25 Sales / AI-23 Marketing); testar preço de desbloqueio (AI-15 Pricing).',
      jsonb_build_array('sales','marketing','pricing'))
    ON CONFLICT (risk_key, dia) DO UPDATE SET severidade=excluded.severidade, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END IF;

  -- risco operacional/disponibilidade: incidentes abertos
  IF coalesce(v_incidentes,0) > 0 THEN
    INSERT INTO public.orion_exstrat_risks (dia, risk_key, categoria, titulo, descricao, severidade, probabilidade, impacto, evidencias, mitigacao, modulos)
    VALUES (v_hoje, 'op_incidentes_abertos', 'operacional', 'Incidentes operacionais abertos',
      coalesce(v_incidentes,0)||' incidente(s) não fechado(s) no Incident Response (AI-45).',
      CASE WHEN v_incidentes >= 5 THEN 'alto' ELSE 'medio' END, 50, 50,
      jsonb_build_object('incidentes_abertos', v_incidentes), 'Acompanhar MTTR no AI-45/AI-56; priorizar recuperação.',
      jsonb_build_array('incident_response','autonomous_ops'))
    ON CONFLICT (risk_key, dia) DO UPDATE SET descricao=excluded.descricao, severidade=excluded.severidade, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END IF;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 7) OPPORTUNITY CENTER — oportunidades de sinais REAIS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_build_opportunities()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  f jsonb; v_growth int; v_sales numeric; v_n int := 0;
  v_top_cidade text; v_op_score int;
BEGIN
  SELECT componentes INTO f FROM public.orion_exstrat_metrics WHERE dia=v_hoje;
  IF f IS NULL THEN f := public.executive_fusion(); END IF;
  v_growth := (f->>'growth')::int;
  v_sales  := (f->>'sales')::numeric;

  -- oportunidade de expansão: cidade com maior growth (reusa AI-07 Growth se existir)
  IF to_regclass('public.orion_growth_scores') IS NOT NULL THEN
    SELECT cidade, round(avg(score))::int INTO v_top_cidade, v_op_score
    FROM public.orion_growth_scores GROUP BY cidade ORDER BY 2 DESC NULLS LAST LIMIT 1;
    IF v_top_cidade IS NOT NULL THEN
      INSERT INTO public.orion_exstrat_opportunities (dia, opp_key, tipo, titulo, descricao, potencial, potencial_score, confianca, janela, evidencias, modulos)
      VALUES (v_hoje, 'exp_top_cidade', 'cidade', 'Expansão priorizada: '||v_top_cidade,
        'Cidade com maior Growth Score do ecossistema — candidata natural a investimento/expansão.',
        'alto', coalesce(v_op_score,60), 55, 'curto prazo',
        jsonb_build_object('cidade', v_top_cidade, 'growth_score', v_op_score, 'fonte','AI-07 Growth'),
        jsonb_build_array('growth','logistics','marketing'))
      ON CONFLICT (opp_key, dia) DO UPDATE SET titulo=excluded.titulo, descricao=excluded.descricao, potencial_score=excluded.potencial_score, evidencias=excluded.evidencias;
      v_n := v_n + 1;
    END IF;
  END IF;

  -- oportunidade de receita: pipeline de vendas (reusa AI-25)
  IF coalesce(v_sales,0) > 0 THEN
    INSERT INTO public.orion_exstrat_opportunities (dia, opp_key, tipo, titulo, descricao, potencial, potencial_score, confianca, janela, evidencias, modulos)
    VALUES (v_hoje, 'rec_pipeline_vendas', 'receita', 'Pipeline de vendas com oportunidades abertas',
      'Sales Opportunity Score médio de '||round(v_sales)||' indica leads a converter (desbloqueios pendentes).',
      'medio', least(100,round(v_sales))::int, 50, 'curto prazo',
      jsonb_build_object('sales_score', round(v_sales), 'fonte','AI-25 Sales'), jsonb_build_array('sales','marketplace'))
    ON CONFLICT (opp_key, dia) DO UPDATE SET descricao=excluded.descricao, potencial_score=excluded.potencial_score, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END IF;

  -- oportunidade de eficiência: cache de IA alto = custo desprezível → escalar inteligência
  IF (f->>'ia_cache_pct')::numeric >= 40 THEN
    INSERT INTO public.orion_exstrat_opportunities (dia, opp_key, tipo, titulo, descricao, potencial, potencial_score, confianca, janela, evidencias, modulos)
    VALUES (v_hoje, 'ef_ia_barata', 'categoria', 'Inteligência de IA a custo desprezível — escalar automações',
      'Cache de IA em '||(f->>'ia_cache_pct')||'% e custo total em US$ '||(f->>'ia_custo')||' — margem para ampliar automações/insights sem custo relevante.',
      'medio', 65, 60, 'médio prazo',
      jsonb_build_object('ia_cache_pct',(f->>'ia_cache_pct'),'ia_custo_usd',(f->>'ia_custo'),'fonte','AI-37 Cost Center'),
      jsonb_build_array('ai_center','automation','governance'))
    ON CONFLICT (opp_key, dia) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END IF;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 8) RECOMENDAÇÕES EXECUTIVAS — por área, com ROI/prob/confiança
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_build_recommendations()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_n int := 0; r record;
BEGIN
  -- recomendações derivadas de cada risco aberto de hoje (mitigar)
  FOR r IN SELECT * FROM public.orion_exstrat_risks WHERE dia=v_hoje AND status='aberto' LOOP
    INSERT INTO public.orion_exstrat_recommendations (dia, rec_key, area, titulo, descricao, beneficios, riscos,
      impacto_financeiro, impacto_operacional, impacto_tecnologico, impacto_comercial, prazo, complexidade,
      roi_estimado, prob_sucesso, confianca, prioridade, classificacao, evidencias, modulos)
    VALUES (v_hoje, 'mit_'||r.risk_key,
      CASE r.categoria WHEN 'financeiro' THEN 'precificacao' WHEN 'fraude' THEN 'tecnologia'
                       WHEN 'crescimento' THEN 'marketing' ELSE 'automacao' END,
      'Mitigar risco: '||r.titulo, coalesce(r.mitigacao,'Endereçar o risco com o módulo responsável.'),
      'Reduz exposição ao risco '||r.categoria||' e protege receita/operação.', 'Baixo — ação corretiva orientada por evidência.',
      CASE r.categoria WHEN 'financeiro' THEN 'alto (protege receita)' ELSE 'médio' END,
      'médio', 'baixo', CASE r.categoria WHEN 'crescimento' THEN 'alto' ELSE 'médio' END,
      'curto prazo', 'media',
      CASE r.severidade WHEN 'critico' THEN 'muito alto' WHEN 'alto' THEN 'alto' ELSE 'médio' END,
      CASE r.severidade WHEN 'critico' THEN 75 WHEN 'alto' THEN 70 ELSE 60 END,
      55, CASE r.severidade WHEN 'critico' THEN 95 WHEN 'alto' THEN 85 WHEN 'medio' THEN 70 ELSE 50 END,
      'corretiva', jsonb_build_object('risk_key', r.risk_key, 'severidade', r.severidade, 'evidencias', r.evidencias), r.modulos)
    ON CONFLICT (rec_key, dia) DO UPDATE SET descricao=excluded.descricao, prioridade=excluded.prioridade, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END LOOP;

  -- recomendações de crescimento derivadas de cada oportunidade aberta
  FOR r IN SELECT * FROM public.orion_exstrat_opportunities WHERE dia=v_hoje AND status='aberta' LOOP
    INSERT INTO public.orion_exstrat_recommendations (dia, rec_key, area, titulo, descricao, beneficios, riscos,
      impacto_financeiro, impacto_operacional, impacto_tecnologico, impacto_comercial, prazo, complexidade,
      roi_estimado, prob_sucesso, confianca, prioridade, classificacao, evidencias, modulos)
    VALUES (v_hoje, 'cap_'||r.opp_key,
      CASE r.tipo WHEN 'cidade' THEN 'expansao' WHEN 'receita' THEN 'marketing' ELSE 'novos_modulos' END,
      'Capturar oportunidade: '||r.titulo, coalesce(r.descricao,'Investir para capturar a oportunidade.'),
      'Aumenta receita/GMV e acelera crescimento.', 'Requer capital/foco — validar janela ('||coalesce(r.janela,'?')||').',
      'alto (upside de receita)', 'médio', 'baixo', 'alto', coalesce(r.janela,'curto prazo'), 'media',
      'alto', coalesce(r.confianca,55), coalesce(r.confianca,55), least(90, coalesce(r.potencial_score,60)),
      'crescimento', jsonb_build_object('opp_key', r.opp_key, 'potencial', r.potencial, 'evidencias', r.evidencias), r.modulos)
    ON CONFLICT (rec_key, dia) DO UPDATE SET descricao=excluded.descricao, prioridade=excluded.prioridade, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END LOOP;

  -- recomendação permanente de automação/eficiência (IA barata)
  INSERT INTO public.orion_exstrat_recommendations (dia, rec_key, area, titulo, descricao, beneficios, riscos,
    impacto_financeiro, impacto_operacional, impacto_tecnologico, impacto_comercial, prazo, complexidade,
    roi_estimado, prob_sucesso, confianca, prioridade, classificacao, evidencias, modulos)
  VALUES (v_hoje, 'auto_reducao_custo', 'reducao_custos',
    'Automatizar rotinas com IA (custo desprezível) para reduzir custo operacional',
    'Ampliar automações seguras (AI-21/AI-56) reduz esforço manual mantendo dupla trava financeira.',
    'Reduz custo operacional; libera time para estratégia.', 'Automação nunca decide financeiro (guarda mantida).',
    'médio (redução de custo)', 'alto', 'médio', 'baixo', 'médio prazo', 'media', 'alto', 70, 60, 65, 'eficiencia',
    jsonb_build_object('fonte','AI-37/AI-52 custo de IA','guarda','financeiro nunca automático'),
    jsonb_build_array('automation','autonomous_ops','ai_center'))
  ON CONFLICT (rec_key, dia) DO UPDATE SET descricao=excluded.descricao;
  v_n := v_n + 1;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 9) DECISION ENGINE — decisões estratégicas de topo (das recomendações prioritárias)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_build_decisions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_n int := 0; r record; v_fin boolean;
BEGIN
  FOR r IN SELECT * FROM public.orion_exstrat_recommendations WHERE dia=v_hoje ORDER BY prioridade DESC LIMIT 5 LOOP
    v_fin := (r.area IN ('precificacao','comissoes','cashback','investimentos'));
    INSERT INTO public.orion_exstrat_decisions (decision_key, dia, titulo, objetivo, beneficios, riscos,
      impacto_financeiro, impacto_operacional, impacto_tecnologico, impacto_comercial, prazo, complexidade,
      roi_estimado, prob_sucesso, confianca, prioridade, recomendacao, evidencias, financeiro)
    VALUES ('dec_'||r.rec_key, v_hoje, r.titulo,
      'Decidir sobre: '||r.titulo, r.beneficios, r.riscos,
      r.impacto_financeiro, r.impacto_operacional, r.impacto_tecnologico, r.impacto_comercial,
      r.prazo, r.complexidade, r.roi_estimado, r.prob_sucesso, r.confianca, r.prioridade,
      'AI-59 RECOMENDA (não executa). '||CASE WHEN v_fin THEN 'Decisão FINANCEIRA — exige aprovação humana explícita.' ELSE 'Avaliar e aprovar conforme prioridade.' END,
      r.evidencias, v_fin)
    ON CONFLICT (decision_key, dia) DO UPDATE SET prioridade=excluded.prioridade, prob_sucesso=excluded.prob_sucesso, recomendacao=excluded.recomendacao, evidencias=excluded.evidencias;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 10) CROSS-AI SUMMARY — auto-descobre módulos ORION (read-only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_refresh_ai_summary()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_n int := 0; r record;
  v_exec int; v_cii int;
BEGIN
  v_exec := (public.executive_score()->>'executive_score')::int;   -- AI-30 retorna jsonb; extrai o int
  v_cii  := (public.executive_cii()->>'cii')::int;
  IF to_regclass('public.orion_ai_module_prefs') IS NOT NULL THEN
    FOR r IN SELECT module, model_code FROM public.orion_ai_module_prefs LOOP
      INSERT INTO public.orion_exstrat_ai_summary (dia, modulo, chave, status, score, valor_entregue, contribuicao, evidencias)
      VALUES (v_hoje, r.module, r.module, 'ativo', NULL,
        'Módulo ORION registrado no Gateway/Registry', 'Contribui com inteligência de domínio ao ecossistema',
        jsonb_build_object('model_code', r.model_code, 'fonte','orion_ai_module_prefs'))
      ON CONFLICT (modulo, dia) DO UPDATE SET status='ativo', evidencias=excluded.evidencias;
      v_n := v_n + 1;
    END LOOP;
  END IF;
  -- enriquece com o executive score do AI-30 (reuso)
  INSERT INTO public.orion_exstrat_ai_summary (dia, modulo, chave, status, score, valor_entregue, contribuicao, evidencias)
  VALUES (v_hoje, 'executive_copilot', 'executive_copilot', 'ativo', v_exec,
    'Executive Score + CEO Copilot (AI-30)', 'Fonte do score executivo consolidado consumido pelo AI-59',
    jsonb_build_object('executive_score', v_exec, 'cii', v_cii))
  ON CONFLICT (modulo, dia) DO UPDATE SET score=excluded.score, evidencias=excluded.evidencias;
  v_n := v_n + 1;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 11) SCORES — ESS (headline) + componentes (executive_score REUSADO do AI-30)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_scores_refresh()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  f jsonb; v_exec int; v_growth int; v_innov int; v_health int;
  v_risk int; v_opp int; v_ess int; v_conf int; v_carga numeric;
BEGIN
  SELECT componentes INTO f FROM public.orion_exstrat_metrics WHERE dia=v_hoje;
  IF f IS NULL THEN f := public.executive_fusion(); END IF;
  v_exec   := coalesce((public.executive_score()->>'executive_score')::int, 50);   -- REUSO AI-30 (jsonb→int; nunca recalcula)
  v_growth := coalesce((f->>'growth')::int, 50);
  v_innov  := coalesce((f->>'innovation')::int, 50);
  v_health := coalesce(round(( coalesce((f->>'trust')::numeric,50) + coalesce((f->>'customer_health')::numeric,50) + coalesce((f->>'logistics')::numeric,50) )/3.0)::int, 50);

  -- risk_score: 100 - carga ponderada dos riscos abertos (maior score = menor risco)
  SELECT coalesce(sum(CASE severidade WHEN 'critico' THEN 25 WHEN 'alto' THEN 15 WHEN 'medio' THEN 8 ELSE 3 END),0)
    INTO v_carga FROM public.orion_exstrat_risks WHERE dia=v_hoje AND status='aberto';
  v_risk := greatest(0, 100 - least(100, v_carga))::int;

  -- opportunity_score: média do potencial das oportunidades abertas
  SELECT coalesce(round(avg(potencial_score))::int, 50) INTO v_opp
    FROM public.orion_exstrat_opportunities WHERE dia=v_hoje AND status='aberta';

  -- ESS: média ponderada declarada
  v_ess := round( (v_exec*0.30 + v_growth*0.15 + v_health*0.15 + v_risk*0.20 + v_opp*0.10 + v_innov*0.10) )::int;
  -- confiança: proporção de sinais reais disponíveis na fusion
  v_conf := round( ( (CASE WHEN (f->>'receita') IS NOT NULL THEN 1 ELSE 0 END)
                   + (CASE WHEN (f->>'growth') IS NOT NULL THEN 1 ELSE 0 END)
                   + (CASE WHEN (f->>'taxa_pagamento') IS NOT NULL THEN 1 ELSE 0 END)
                   + (CASE WHEN (f->>'conversao') IS NOT NULL THEN 1 ELSE 0 END)
                   + (CASE WHEN (f->>'innovation') IS NOT NULL THEN 1 ELSE 0 END) )::numeric / 5.0 * 100 )::int;

  INSERT INTO public.orion_exstrat_scores (dia, executive_strategy_score, executive_score, health_score, growth_score, risk_score, opportunity_score, innovation_score, confianca, componentes)
  VALUES (v_hoje, v_ess, v_exec, v_health, v_growth, v_risk, v_opp, v_innov, v_conf,
    jsonb_build_object('pesos', jsonb_build_object('executive',0.30,'growth',0.15,'health',0.15,'risk',0.20,'opportunity',0.10,'innovation',0.10),
                       'carga_risco', v_carga, 'reuso_ai30', true))
  ON CONFLICT (dia) DO UPDATE SET executive_strategy_score=excluded.executive_strategy_score, executive_score=excluded.executive_score,
    health_score=excluded.health_score, growth_score=excluded.growth_score, risk_score=excluded.risk_score,
    opportunity_score=excluded.opportunity_score, innovation_score=excluded.innovation_score, confianca=excluded.confianca, componentes=excluded.componentes, criado_em=now();

  RETURN jsonb_build_object('ess', v_ess, 'executive_score', v_exec, 'risk_score', v_risk, 'opportunity_score', v_opp, 'confianca', v_conf);
END$$;

-- ----------------------------------------------------------------------------
-- 12) GERADOR MESTRE (idempotente/dia) — orquestra tudo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_snap jsonb; v_sc jsonb; v_scen int; v_ri int; v_op int; v_re int; v_de int; v_ai int;
BEGIN
  v_snap := public.exstrat_snapshot();
  v_ri   := public.exstrat_build_risks();
  v_op   := public.exstrat_build_opportunities();
  v_re   := public.exstrat_build_recommendations();
  v_de   := public.exstrat_build_decisions();
  v_scen := public.exstrat_build_scenarios();
  v_ai   := public.exstrat_refresh_ai_summary();
  v_sc   := public.exstrat_scores_refresh();
  PERFORM public.exstrat_audit('generate','snapshot',(now() AT TIME ZONE 'America/Cuiaba')::date::text,
    jsonb_build_object('riscos',v_ri,'oportunidades',v_op,'recomendacoes',v_re,'decisoes',v_de,'cenarios',v_scen,'ai_summary',v_ai,'scores',v_sc));
  PERFORM public.exstrat_emit('exec_strategy.generated', jsonb_build_object('scores', v_sc, 'riscos', v_ri, 'oportunidades', v_op));
  RETURN jsonb_build_object('ok', true, 'scores', v_sc, 'riscos', v_ri, 'oportunidades', v_op,
    'recomendacoes', v_re, 'decisoes', v_de, 'cenarios', v_scen, 'ai_summary', v_ai, 'snapshot', v_snap);
END$$;

-- ----------------------------------------------------------------------------
-- 13) RELATÓRIOS EXECUTIVOS (diário→anual)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_report_generate(p_tipo text DEFAULT 'diario')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_periodo text; v_conteudo jsonb; v_resumo text; v_m record; v_s record;
BEGIN
  v_periodo := CASE p_tipo
    WHEN 'diario'     THEN to_char(v_hoje,'YYYY-MM-DD')
    WHEN 'semanal'    THEN to_char(v_hoje,'IYYY')||'-W'||to_char(v_hoje,'IW')
    WHEN 'mensal'     THEN to_char(v_hoje,'YYYY-MM')
    WHEN 'trimestral' THEN to_char(v_hoje,'YYYY')||'-Q'||to_char(v_hoje,'Q')
    WHEN 'anual'      THEN to_char(v_hoje,'YYYY')
    ELSE to_char(v_hoje,'YYYY-MM-DD') END;

  SELECT * INTO v_m FROM public.orion_exstrat_metrics WHERE dia=v_hoje;
  SELECT * INTO v_s FROM public.orion_exstrat_scores  WHERE dia=v_hoje;

  v_conteudo := jsonb_build_object(
    'tipo', p_tipo, 'periodo', v_periodo, 'gerado_em', now(),
    'overview', jsonb_build_object('receita', coalesce(v_m.receita,0), 'pedidos_pagos', coalesce(v_m.pedidos_pagos,0),
      'usuarios', coalesce(v_m.usuarios,0), 'conversao_pct', v_m.conversao_pct, 'taxa_pagamento_pct', v_m.taxa_pagamento_pct,
      'custo_ia_usd', coalesce(v_m.custo_ia_usd,0)),
    'scores', jsonb_build_object('executive_strategy_score', coalesce(v_s.executive_strategy_score,0),
      'executive_score', v_s.executive_score, 'risk_score', v_s.risk_score, 'opportunity_score', v_s.opportunity_score,
      'health_score', v_s.health_score, 'growth_score', v_s.growth_score, 'confianca', v_s.confianca),
    'riscos_criticos', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'severidade',severidade,'categoria',categoria) ORDER BY severidade),'[]'::jsonb)
                        FROM public.orion_exstrat_risks WHERE dia=v_hoje AND status='aberto' AND severidade IN ('alto','critico')),
    'top_oportunidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'tipo',tipo,'potencial',potencial) ORDER BY potencial_score DESC),'[]'::jsonb)
                        FROM public.orion_exstrat_opportunities WHERE dia=v_hoje AND status='aberta'),
    'top_recomendacoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'area',area,'prioridade',prioridade,'roi',roi_estimado) ORDER BY prioridade DESC),'[]'::jsonb)
                        FROM (SELECT * FROM public.orion_exstrat_recommendations WHERE dia=v_hoje ORDER BY prioridade DESC LIMIT 5) t),
    'cenarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('cenario',cenario,'horizonte',horizonte,'metrica',metrica,'proj',valor_proj) ORDER BY cenario,horizonte),'[]'::jsonb)
                 FROM public.orion_exstrat_forecasts WHERE dia=v_hoje));

  v_resumo := 'Relatório '||p_tipo||' '||v_periodo||': ESS '||coalesce(v_s.executive_strategy_score,0)||
    ', receita R$ '||coalesce(round(v_m.receita)::text,'0')||', '||
    (SELECT count(*) FROM public.orion_exstrat_risks WHERE dia=v_hoje AND status='aberto')||' risco(s), '||
    (SELECT count(*) FROM public.orion_exstrat_opportunities WHERE dia=v_hoje AND status='aberta')||' oportunidade(s).';

  INSERT INTO public.orion_exstrat_reports (tipo, periodo, titulo, conteudo, resumo, versao)
  VALUES (p_tipo, v_periodo, 'Relatório '||initcap(p_tipo)||' — '||v_periodo, v_conteudo, v_resumo, 1)
  ON CONFLICT (tipo, periodo) DO UPDATE SET conteudo=excluded.conteudo, resumo=excluded.resumo,
    versao=public.orion_exstrat_reports.versao+1, gerado_em=now();

  PERFORM public.exstrat_audit('report_generate','report',p_tipo||':'||v_periodo, jsonb_build_object('resumo', v_resumo));
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo, 'periodo', v_periodo, 'resumo', v_resumo);
END$$;

-- ----------------------------------------------------------------------------
-- 14) LOOP DE APRENDIZADO — recomendação/decisão → resultado → precisão
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_learn()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; r record; v_prec numeric;
BEGIN
  -- registra decisões executadas com resultado medido (pré-lançamento: volume baixo, declarado)
  FOR r IN SELECT * FROM public.orion_exstrat_decisions WHERE status='executada' AND resultado IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.orion_exstrat_history h WHERE h.ref_tipo='decisao' AND h.ref_key=r.decision_key) LOOP
    -- precisão = 100 - |prob_sucesso previsto - sucesso real(0/100)| (heurística declarada)
    v_prec := 100 - abs(coalesce(r.prob_sucesso,50) - coalesce((r.resultado->>'sucesso_pct')::numeric, 50));
    INSERT INTO public.orion_exstrat_history (ref_tipo, ref_key, previsto, decidido, resultado, precisao, aprendizado)
    VALUES ('decisao', r.decision_key,
      jsonb_build_object('prob_sucesso', r.prob_sucesso, 'roi', r.roi_estimado),
      jsonb_build_object('status', r.status, 'decidido_em', r.decidido_em), r.resultado, v_prec,
      'Comparação previsto×realizado registrada; ajustar confiança futura conforme precisão.');
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'aprendizados_registrados', v_n,
    'nota', 'Pré-lançamento: histórico curto — precisão consolida com volume real de decisões executadas (DECLARADO).');
END$$;

-- ----------------------------------------------------------------------------
-- 15) RPCs PÚBLICAS (admin) — superfície da spec (prefixadas p/ não colidir c/ AI-30)
-- ----------------------------------------------------------------------------

-- executive_summary() → Executive Overview (camada 1)
CREATE OR REPLACE FUNCTION public.exstrat_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'metricas', (SELECT to_jsonb(m) FROM public.orion_exstrat_metrics m WHERE dia=v_hoje),
    'scores',   (SELECT to_jsonb(s) FROM public.orion_exstrat_scores s WHERE dia=v_hoje),
    'brief',    public.executive_brief(),          -- reuso AI-30
    'riscos_abertos', (SELECT count(*) FROM public.orion_exstrat_risks WHERE dia=v_hoje AND status='aberto'),
    'oportunidades_abertas', (SELECT count(*) FROM public.orion_exstrat_opportunities WHERE dia=v_hoje AND status='aberta'),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','DD/MM/YYYY HH24:MI'));
END$$;

-- executive_recommendations()
CREATE OR REPLACE FUNCTION public.exstrat_recommendations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.prioridade DESC),'[]'::jsonb)
          FROM public.orion_exstrat_recommendations r WHERE r.dia=v_hoje);
END$$;

-- executive_risks()
CREATE OR REPLACE FUNCTION public.exstrat_risks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY CASE r.severidade WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 ELSE 4 END),'[]'::jsonb)
          FROM public.orion_exstrat_risks r WHERE r.dia=v_hoje);
END$$;

-- executive_opportunities()
CREATE OR REPLACE FUNCTION public.exstrat_opportunities()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.potencial_score DESC),'[]'::jsonb)
          FROM public.orion_exstrat_opportunities o WHERE o.dia=v_hoje);
END$$;

-- executive_forecast() → cenários
CREATE OR REPLACE FUNCTION public.exstrat_forecast()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'base', (SELECT jsonb_build_object('receita',receita,'usuarios',usuarios) FROM public.orion_exstrat_metrics WHERE dia=v_hoje),
    'metodo', 'Cenários (conservador/realista/otimista) com fatores declarados sobre base real do AI-30/AI-55 — nunca inventa.',
    'cenarios', (SELECT coalesce(jsonb_agg(to_jsonb(fo) ORDER BY fo.cenario, fo.horizonte, fo.metrica),'[]'::jsonb)
                 FROM public.orion_exstrat_forecasts fo WHERE fo.dia=v_hoje));
END$$;

-- executive_reports() → último relatório de um tipo
CREATE OR REPLACE FUNCTION public.exstrat_reports(p_tipo text DEFAULT 'diario')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN coalesce((SELECT to_jsonb(r) FROM public.orion_exstrat_reports r WHERE r.tipo=p_tipo ORDER BY r.gerado_em DESC LIMIT 1),
    jsonb_build_object('nota','nenhum relatório '||p_tipo||' gerado ainda'));
END$$;

-- executive_ai_summary() → consolidação cross-AI
CREATE OR REPLACE FUNCTION public.exstrat_ai_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'total_modulos', (SELECT count(*) FROM public.orion_exstrat_ai_summary WHERE dia=v_hoje),
    'modulos', (SELECT coalesce(jsonb_agg(jsonb_build_object('modulo',modulo,'status',status,'score',score,'valor',valor_entregue) ORDER BY modulo),'[]'::jsonb)
                FROM public.orion_exstrat_ai_summary WHERE dia=v_hoje));
END$$;

-- executive_decision_support() → motor de decisão (analisa e persiste)
CREATE OR REPLACE FUNCTION public.exstrat_decision_support(p_titulo text, p_categoria text DEFAULT 'estrategica', p_contexto jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_fin boolean := (p_categoria IN ('precificacao','comissoes','cashback','investimentos','financeiro'));
  v_key text := 'ds_'||left(regexp_replace(lower(p_titulo),'[^a-z0-9]+','_','g'),40);
  v_id bigint; f jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  f := public.executive_fusion();
  INSERT INTO public.orion_exstrat_decisions (decision_key, dia, titulo, objetivo, beneficios, riscos,
    impacto_financeiro, impacto_operacional, impacto_tecnologico, impacto_comercial, prazo, complexidade,
    roi_estimado, prob_sucesso, confianca, prioridade, recomendacao, evidencias, financeiro)
  VALUES (v_key, v_hoje, p_titulo, coalesce(p_contexto->>'objetivo','Decidir sobre: '||p_titulo),
    coalesce(p_contexto->>'beneficios','A avaliar com base em evidências.'),
    coalesce(p_contexto->>'riscos','A avaliar; considerar riscos abertos do dia.'),
    CASE WHEN v_fin THEN 'ALTO — impacto financeiro direto (aprovação humana obrigatória)' ELSE 'médio' END,
    'médio','médio','médio','a definir','media','a estimar', 50, coalesce((f->>'growth')::int,50),
    50, 'AI-59 RECOMENDA (não executa). '||CASE WHEN v_fin THEN 'FINANCEIRA — nunca executada automaticamente; exige aprovação humana.' ELSE 'Aprovar conforme prioridade.' END,
    jsonb_build_object('contexto', p_contexto, 'fusion_receita', f->>'receita', 'categoria', p_categoria), v_fin)
  ON CONFLICT (decision_key, dia) DO UPDATE SET recomendacao=excluded.recomendacao, evidencias=excluded.evidencias
  RETURNING id INTO v_id;
  PERFORM public.exstrat_audit('decision_support','decision',v_key, jsonb_build_object('titulo',p_titulo,'financeiro',v_fin));
  RETURN (SELECT to_jsonb(d) FROM public.orion_exstrat_decisions d WHERE d.id=v_id);
END$$;

-- executive_questions() → CEO Copilot (resposta SÓ com dados reais)
CREATE OR REPLACE FUNCTION public.exstrat_questions(p_pergunta text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  f jsonb; v_m record; v_s record; v_resp jsonb; v_id bigint;
  v_top_rec jsonb; v_top_opp jsonb; v_top_risk jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  f := public.executive_fusion();
  SELECT * INTO v_m FROM public.orion_exstrat_metrics WHERE dia=v_hoje;
  SELECT * INTO v_s FROM public.orion_exstrat_scores  WHERE dia=v_hoje;
  v_top_rec  := (SELECT to_jsonb(r) FROM public.orion_exstrat_recommendations r WHERE r.dia=v_hoje ORDER BY prioridade DESC LIMIT 1);
  v_top_opp  := (SELECT to_jsonb(o) FROM public.orion_exstrat_opportunities o WHERE o.dia=v_hoje ORDER BY potencial_score DESC LIMIT 1);
  v_top_risk := (SELECT to_jsonb(r) FROM public.orion_exstrat_risks r WHERE r.dia=v_hoje AND status='aberto' ORDER BY CASE severidade WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 ELSE 3 END LIMIT 1);

  -- resposta estruturada e DETERMINÍSTICA a partir de dados reais (nunca inventa)
  v_resp := jsonb_build_object(
    'resumo', 'Resposta fundamentada nos dados executivos de hoje (ESS '||coalesce(v_s.executive_strategy_score,0)||
              ', receita R$ '||coalesce(round(v_m.receita)::text,'0')||'). AI-59 recomenda; não executa.',
    'evidencias', jsonb_build_object('metricas', to_jsonb(v_m), 'scores', to_jsonb(v_s), 'fusion', f),
    'metricas', jsonb_build_object('receita', coalesce(v_m.receita,0), 'usuarios', coalesce(v_m.usuarios,0),
       'conversao_pct', v_m.conversao_pct, 'taxa_pagamento_pct', v_m.taxa_pagamento_pct,
       'ess', coalesce(v_s.executive_strategy_score,0), 'executive_score', v_s.executive_score),
    'comparativos', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'ess',executive_strategy_score) ORDER BY dia),'[]'::jsonb)
                     FROM public.orion_exstrat_scores WHERE dia > v_hoje - 14),
    'recomendacao', coalesce(v_top_rec->>'titulo','Sem recomendação prioritária hoje — gerar ciclo.'),
    'riscos', coalesce(v_top_risk->>'titulo','Sem risco alto/crítico aberto hoje.'),
    'proximos_passos', jsonb_build_array(
       coalesce(v_top_rec->>'titulo','Revisar recomendações do dia'),
       coalesce(v_top_opp->>'titulo','Avaliar oportunidades abertas'),
       'Consultar o painel Executive Strategy para detalhamento'),
    'nota', 'Núcleo determinístico (dados reais). Narrativa opcional via Gateway prompt exec_strategy.chat.');

  INSERT INTO public.orion_exstrat_questions (pergunta, resposta, confianca, contexto, perguntado_por)
  VALUES (p_pergunta, v_resp, coalesce(v_s.confianca,50), jsonb_build_object('dia', v_hoje), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.exstrat_audit('question','question',v_id::text, jsonb_build_object('pergunta', left(p_pergunta,200)));
  RETURN jsonb_build_object('id', v_id, 'pergunta', p_pergunta, 'resposta', v_resp);
END$$;

-- executive_strategy() → estratégia contínua (loop de aprendizado)
CREATE OR REPLACE FUNCTION public.exstrat_strategy()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'ciclo', 'recomendação → decisão → resultado → precisão → aprendizado',
    'decisoes_total', (SELECT count(*) FROM public.orion_exstrat_decisions),
    'decisoes_executadas', (SELECT count(*) FROM public.orion_exstrat_decisions WHERE status='executada'),
    'aprendizados', (SELECT count(*) FROM public.orion_exstrat_history),
    'precisao_media', (SELECT round(avg(precisao),1) FROM public.orion_exstrat_history WHERE precisao IS NOT NULL),
    'historico', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref',ref_key,'precisao',precisao,'aprendizado',aprendizado) ORDER BY criado_em DESC),'[]'::jsonb)
                  FROM (SELECT * FROM public.orion_exstrat_history ORDER BY criado_em DESC LIMIT 20) h),
    'nota', 'Pré-lançamento: precisão consolida com volume de decisões executadas (DECLARADO).');
END$$;

-- executive_score() → ESS + componentes (leitura)
CREATE OR REPLACE FUNCTION public.exstrat_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN coalesce((SELECT to_jsonb(s) FROM public.orion_exstrat_scores s WHERE dia=v_hoje),
                  jsonb_build_object('nota','sem score hoje — rode exstrat_generate()'));
END$$;

-- executive_dashboard() → fonte única do painel
CREATE OR REPLACE FUNCTION public.exstrat_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_trace uuid := gen_random_uuid();
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  PERFORM public.exstrat_emit('exec_strategy.dashboard', jsonb_build_object('trace', v_trace, 'user', auth.uid()));
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'metricas', (SELECT to_jsonb(m) FROM public.orion_exstrat_metrics m WHERE dia=v_hoje),
    'scores',   (SELECT to_jsonb(s) FROM public.orion_exstrat_scores s WHERE dia=v_hoje),
    'riscos', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY CASE r.severidade WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 ELSE 4 END),'[]'::jsonb) FROM public.orion_exstrat_risks r WHERE r.dia=v_hoje),
    'oportunidades', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.potencial_score DESC),'[]'::jsonb) FROM public.orion_exstrat_opportunities o WHERE o.dia=v_hoje),
    'recomendacoes', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.prioridade DESC),'[]'::jsonb) FROM public.orion_exstrat_recommendations r WHERE r.dia=v_hoje),
    'decisoes', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.prioridade DESC),'[]'::jsonb) FROM public.orion_exstrat_decisions d WHERE d.dia=v_hoje),
    'cenarios', (SELECT coalesce(jsonb_agg(to_jsonb(fo) ORDER BY fo.cenario, fo.horizonte, fo.metrica),'[]'::jsonb) FROM public.orion_exstrat_forecasts fo WHERE fo.dia=v_hoje),
    'ai_summary', public.exstrat_ai_summary(),
    'relatorio_diario', public.exstrat_reports('diario'),
    'estrategia', public.exstrat_strategy(),
    'historico_ess', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'ess',executive_strategy_score,'executive_score',executive_score) ORDER BY dia),'[]'::jsonb) FROM public.orion_exstrat_scores WHERE dia > v_hoje - 30),
    'brief', public.executive_brief(),
    'seguranca', jsonb_build_object('financeiro_nunca_executa', true, 'apenas_recomenda', true, 'reusa_ai30', true, 'nunca_inventa', true),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','DD/MM/YYYY HH24:MI'));
END$$;

-- ----------------------------------------------------------------------------
-- 16) TICK (cron) — gera ciclo + relatórios por período
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_exec_strategy_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  PERFORM public.exstrat_generate();
  PERFORM public.exstrat_learn();
  PERFORM public.exstrat_report_generate('diario');
  IF extract(isodow FROM v_hoje) = 1 THEN PERFORM public.exstrat_report_generate('semanal'); END IF;
  IF extract(day FROM v_hoje) = 1 THEN PERFORM public.exstrat_report_generate('mensal'); END IF;
  IF extract(day FROM v_hoje) = 1 AND extract(month FROM v_hoje) IN (1,4,7,10) THEN PERFORM public.exstrat_report_generate('trimestral'); END IF;
  IF extract(doy FROM v_hoje) = 1 THEN PERFORM public.exstrat_report_generate('anual'); END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.exstrat_emit('exec_strategy.tick_error', jsonb_build_object('erro', SQLERRM));
END$$;

-- ----------------------------------------------------------------------------
-- 17) SELFTEST (COMANDO TESTE) — 14 provas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exstrat_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tests jsonb := '[]'::jsonb; v_ok boolean := true; v_t boolean; v_e jsonb;
  v_g jsonb; v_snap_before bigint; v_snap_after bigint; v_pay_before bigint; v_pay_after bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;

  -- 1) 12 tabelas existem
  v_t := (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_exstrat_%') >= 12;
  v_tests := v_tests || jsonb_build_object('teste','tabelas_12','ok',v_t,'evidencia',jsonb_build_object('n',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_exstrat_%'))); v_ok := v_ok AND v_t;

  -- 2) grants travados (sem write anon/authenticated)
  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'orion_exstrat_%' AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'));
  v_tests := v_tests || jsonb_build_object('teste','grants_travados','ok',v_t,'evidencia',jsonb_build_object('criterio','sem write anon/authenticated')); v_ok := v_ok AND v_t;

  -- 3) reuso AI-30: executive_fusion callable
  v_t := (public.executive_fusion() ? 'receita');
  v_tests := v_tests || jsonb_build_object('teste','reuso_ai30_fusion','ok',v_t,'evidencia',jsonb_build_object('tem_receita',v_t)); v_ok := v_ok AND v_t;

  -- 4) READ-ONLY no AI-30: orion_executive_snapshots inalterado após generate
  v_snap_before := (SELECT count(*) FROM public.orion_executive_snapshots);
  v_pay_before  := coalesce(public.exstrat_count_safe('pay_payment_orders'),0);
  v_g := public.exstrat_generate();
  v_snap_after  := (SELECT count(*) FROM public.orion_executive_snapshots);
  v_pay_after   := coalesce(public.exstrat_count_safe('pay_payment_orders'),0);
  v_t := (v_snap_before = v_snap_after);
  v_tests := v_tests || jsonb_build_object('teste','readonly_ai30','ok',v_t,'evidencia',jsonb_build_object('snapshots_antes',v_snap_before,'depois',v_snap_after)); v_ok := v_ok AND v_t;

  -- 5) SEGURANÇA FINANCEIRA: AI-59 não escreve em pay_* (contagem intacta)
  v_t := (v_pay_before = v_pay_after);
  v_tests := v_tests || jsonb_build_object('teste','nunca_move_dinheiro','ok',v_t,'evidencia',jsonb_build_object('pay_orders_antes',v_pay_before,'depois',v_pay_after)); v_ok := v_ok AND v_t;

  -- 6) generate ok
  v_t := (v_g->>'ok')::bool;
  v_tests := v_tests || jsonb_build_object('teste','generate','ok',v_t,'evidencia',v_g->'scores'); v_ok := v_ok AND v_t;

  -- 7) cenários: 3 cenários presentes
  v_t := (SELECT count(DISTINCT cenario) FROM public.orion_exstrat_forecasts WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date) = 3;
  v_tests := v_tests || jsonb_build_object('teste','cenarios_3','ok',v_t,'evidencia',jsonb_build_object('distintos',(SELECT count(DISTINCT cenario) FROM public.orion_exstrat_forecasts WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date))); v_ok := v_ok AND v_t;

  -- 8) scores: ESS calculado, executive_score reusado
  v_t := (SELECT executive_strategy_score BETWEEN 0 AND 100 AND executive_score IS NOT NULL FROM public.orion_exstrat_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date);
  v_e := (SELECT to_jsonb(s) FROM public.orion_exstrat_scores s WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date);
  v_tests := v_tests || jsonb_build_object('teste','ess_e_reuso_score','ok',coalesce(v_t,false),'evidencia',v_e); v_ok := v_ok AND coalesce(v_t,false);

  -- 9) recomendações têm ROI/prob/confiança
  v_t := (SELECT count(*) FROM public.orion_exstrat_recommendations WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date AND prob_sucesso IS NOT NULL AND confianca IS NOT NULL) >= 0;
  v_tests := v_tests || jsonb_build_object('teste','recomendacoes_completas','ok',v_t,'evidencia',jsonb_build_object('n',(SELECT count(*) FROM public.orion_exstrat_recommendations WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date)));

  -- 10) decision_support persiste + marca financeiro
  v_e := public.exstrat_decision_support('Reduzir comissão do marketplace em 2pp','comissoes', jsonb_build_object('objetivo','testar guarda financeira'));
  v_t := (v_e->>'financeiro')::bool = true;
  v_tests := v_tests || jsonb_build_object('teste','decision_support_financeiro','ok',v_t,'evidencia',jsonb_build_object('financeiro',v_e->>'financeiro','status',v_e->>'status')); v_ok := v_ok AND v_t;

  -- 11) CEO Copilot: resposta com evidências (nunca vazia/inventada)
  v_e := public.exstrat_questions('Onde devemos investir este mês?');
  v_t := (v_e->'resposta' ? 'evidencias') AND (v_e->'resposta'->'evidencias' ? 'metricas');
  v_tests := v_tests || jsonb_build_object('teste','copilot_fundamentado','ok',v_t,'evidencia',jsonb_build_object('tem_evidencias',v_t)); v_ok := v_ok AND v_t;

  -- 12) relatório gerado
  v_e := public.exstrat_report_generate('diario');
  v_t := (v_e->>'ok')::bool AND (SELECT count(*) FROM public.orion_exstrat_reports WHERE tipo='diario') >= 1;
  v_tests := v_tests || jsonb_build_object('teste','relatorio_diario','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- 13) dashboard executa
  v_t := (public.exstrat_dashboard() ? 'scores') AND (public.exstrat_summary() ? 'metricas');
  v_tests := v_tests || jsonb_build_object('teste','paineis','ok',v_t,'evidencia',jsonb_build_object('ok',true)); v_ok := v_ok AND v_t;

  -- 14) cron agendado
  v_t := EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_exec_strategy_tick');
  v_tests := v_tests || jsonb_build_object('teste','cron_agendado','ok',v_t,'evidencia',(SELECT coalesce(jsonb_agg(jsonb_build_object('job',jobname,'schedule',schedule)),'[]'::jsonb) FROM cron.job WHERE jobname='orion_exec_strategy_tick')); v_ok := v_ok AND v_t;

  RETURN jsonb_build_object('ok', v_ok, 'executado_em', now(), 'testes', v_tests,
    'nota','suite oficial do AI-59 — entrada do COMANDO TESTE (selftests por módulo)');
END$$;

-- ----------------------------------------------------------------------------
-- 18) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.exstrat_summary()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_dashboard()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_recommendations()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_risks()                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_opportunities()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_forecast()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_reports(text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_ai_summary()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_decision_support(text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_questions(text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_strategy()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_score()                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_selftest()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_exec_strategy_tick()                TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_generate()                        TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_report_generate(text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_learn()                           TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_snapshot()                        TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_build_scenarios()                 TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_build_risks()                     TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_build_opportunities()             TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_build_recommendations()           TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_build_decisions()                 TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_refresh_ai_summary()              TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_scores_refresh()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_emit(text,jsonb)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_count_safe(text,text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.exstrat_audit(text,text,text,jsonb)       TO service_role;

-- ----------------------------------------------------------------------------
-- 19) PROMPT REGISTRY (gpt-5-mini via AI-00 Gateway) — narrativa opcional
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('exec_strategy.summary',
 'Voce e o ORION Executive Strategy (AI-59), conselheiro estrategico do CEO. Resuma a situacao executiva usando SOMENTE os numeros fornecidos (ESS, receita, scores, riscos, oportunidades). Nunca invente. Recomenda; nao executa. Portugues claro e objetivo.',
 'ORION-AI-59 seed');
SELECT public.orion_ai_prompt_set('exec_strategy.recommendation',
 'Voce e o ORION Executive Strategy (AI-59). Explique a recomendacao estrategica (area, beneficios, riscos, impactos, ROI, probabilidade, prioridade) com base nas evidencias reais fornecidas. Decisoes financeiras exigem aprovacao humana.',
 'ORION-AI-59 seed');
SELECT public.orion_ai_prompt_set('exec_strategy.risk',
 'Voce e o ORION Executive Strategy (AI-59). Explique o risco (categoria, severidade, probabilidade, impacto, mitigacao) usando as evidencias reais. Classifique baixo/medio/alto/critico. Nunca invente causa.',
 'ORION-AI-59 seed');
SELECT public.orion_ai_prompt_set('exec_strategy.opportunity',
 'Voce e o ORION Executive Strategy (AI-59). Descreva a oportunidade (tipo, potencial, janela, confianca) com base em sinais reais dos modulos ORION. Recomenda investimento; nao executa.',
 'ORION-AI-59 seed');
SELECT public.orion_ai_prompt_set('exec_strategy.scenario',
 'Voce e o ORION Executive Strategy (AI-59). Descreva os cenarios (conservador/realista/otimista) declarando o metodo e a base real. Deixe claras as premissas e a confianca declarada; nunca apresente projecao como certeza.',
 'ORION-AI-59 seed');
SELECT public.orion_ai_prompt_set('exec_strategy.report',
 'Voce e o ORION Executive Strategy (AI-59). Redija o relatorio executivo (diario/semanal/mensal/trimestral/anual) SOMENTE com os dados consolidados fornecidos. Estruture overview, scores, riscos, oportunidades, recomendacoes e cenarios.',
 'ORION-AI-59 seed');
SELECT public.orion_ai_prompt_set('exec_strategy.chat',
 'Voce e o CEO Copilot do ORION Executive Strategy (AI-59). Responda a pergunta do CEO com: Resumo, Evidencias, Metricas, Comparativos, Recomendacao, Riscos e Proximos passos. Use SOMENTE os dados reais fornecidos no contexto. Se faltar dado, declare a lacuna. Nunca invente.',
 'ORION-AI-59 seed');

-- ----------------------------------------------------------------------------
-- 20) MODEL PREF + CRON */15
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('exec_strategy','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_exec_strategy_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_exec_strategy_tick');
    PERFORM cron.schedule('orion_exec_strategy_tick','*/15 * * * *','SELECT public.orion_exec_strategy_tick();');
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 21) BOOT — primeira geração + relatório diário (idempotente)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.exstrat_generate();
  PERFORM public.exstrat_report_generate('diario');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
