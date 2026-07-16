-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-22 — BUSINESS INTELLIGENCE AI v1.0
--   O Centro Executivo de Inteligência da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-22). EXCLUSIVAMENTE
-- ANALÍTICO: consolida o que TODOS os módulos ORION já produziram em
-- KPIs executivos/financeiro/comercial/operacional/inteligência/IA,
-- com evolução histórica (snapshot/dia) e narrativa executiva. NÃO
-- executa ações, NÃO movimenta dinheiro, NÃO altera dados. Read-only.
--
-- NÃO duplica o AI-12 (Command Center, score executivo em tempo real):
-- o AI-22 é a camada ANALÍTICA/HISTÓRICA (snapshots diários,
-- comparativos, evolução, narrativa por domínio) — agrega saídas já
-- computadas; nunca recalcula regra de outro módulo.
--
-- Fontes REAIS (read-only): advertiser_listings, pay_payment_orders,
-- advertiser_contact_intentions, marketplace_product_click_events,
-- delivery_orders, freight_listings, orion_trust_scores,
-- orion_market_insights, orion_growth_scores, orion_perso_profiles,
-- orion_finance_snapshots, orion_ai_log (Gateway), orion_eventos.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_bi_kpis CASCADE;
--   DROP FUNCTION public.bi_emit, bi_executive, bi_financial, bi_commercial,
--     bi_operational, bi_intelligence, bi_ia, bi_generate, bi_evolution,
--     bi_score, bi_summary, bi_dashboard, orion_bi_tick CASCADE;
--   SELECT cron.unschedule('orion_bi_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'business.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='business';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELA: KPI snapshot/dia (histórico/evolução) — explicável e imutável
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_bi_kpis (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio      text NOT NULL,                 -- executivo|financeiro|comercial|operacional|inteligencia|ia
  chave        text NOT NULL,
  valor        numeric,
  unidade      text,
  origem       text,                          -- módulo/tabela de origem
  modulos      jsonb NOT NULL DEFAULT '[]',   -- módulos ORION que forneceram o dado
  metodologia  text,                          -- como o KPI é calculado
  confianca    int NOT NULL DEFAULT 80,       -- 0-100
  dia          date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_bi_kpi_unico UNIQUE (dominio, chave, dia)
);
CREATE INDEX IF NOT EXISTS idx_obk_dom ON public.orion_bi_kpis (dominio, dia DESC);
CREATE INDEX IF NOT EXISTS idx_obk_chave ON public.orion_bi_kpis (chave, dia DESC);
COMMENT ON TABLE public.orion_bi_kpis IS
  'ORION-AI-22: KPI executivo consolidado (snapshot/dia) com explicabilidade (origem/módulos/metodologia/confiança). Read-only agregado; imutável.';
ALTER TABLE public.orion_bi_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obk_admin ON public.orion_bi_kpis;
CREATE POLICY obk_admin ON public.orion_bi_kpis
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_bi_kpis FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bi_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'business_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- LENTES (read-only) — cada uma consolida um domínio a partir das fontes
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bi_executive()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'anuncios_ativos', (SELECT count(*) FROM advertiser_listings),
    'produtos_loja', (SELECT count(*) FROM merchant_products),
    'lojas', (SELECT count(*) FROM merchant_stores),
    'cidades_ativas', (SELECT count(*) FROM (
        SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL
        UNION SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL) c),
    'usuarios_ativos_45d', (SELECT count(DISTINCT visitor_user_id) FROM marketplace_product_click_events
        WHERE visitor_user_id IS NOT NULL AND created_at > now()-interval '45 days'),
    'eventos_barramento', (SELECT count(*) FROM orion_eventos),
    'origem', 'consolidação nacional', 'modulos', jsonb_build_array('publisher','marketplace','personalization'));
$$;
GRANT EXECUTE ON FUNCTION public.bi_executive() TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_financial()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'receita_paga', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
    'ticket_medio', (SELECT coalesce(round(avg(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
    'pedidos_pagos', (SELECT count(*) FROM pay_payment_orders WHERE status::text='paid'),
    'pedidos_pendentes', (SELECT count(*) FROM pay_payment_orders WHERE status::text IN ('waiting_payment','pending')),
    'pedidos_falhos', (SELECT count(*) FROM pay_payment_orders WHERE status::text='failed'),
    'taxa_pagamento_pct', (SELECT round(count(*) filter (where status::text='paid')*100.0/nullif(count(*) filter (where status::text in ('paid','failed')),0)) FROM pay_payment_orders),
    'ultimo_finance_snapshot', (SELECT kpis FROM orion_finance_snapshots ORDER BY dia DESC LIMIT 1),
    'nota', 'SOMENTE LEITURA — nunca altera dados financeiros.',
    'origem', 'pay_payment_orders + Finance AI', 'modulos', jsonb_build_array('finance'));
$$;
GRANT EXECUTE ON FUNCTION public.bi_financial() TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_commercial()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'interesses_30d', (SELECT count(*) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days'),
    'convertidos_30d', (SELECT count(*) FROM advertiser_contact_intentions WHERE unlock_paid_at IS NOT NULL AND created_at > now()-interval '30 days'),
    'conversao_pct', (SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0)) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days'),
    'cliques_30d', (SELECT count(*) FROM marketplace_product_click_events WHERE created_at > now()-interval '30 days'),
    'por_vertical', (SELECT coalesce(jsonb_object_agg(listing_module, n),'{}') FROM (SELECT listing_module, count(*) n FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY 1) v),
    'origem', 'intenções + cliques', 'modulos', jsonb_build_array('marketplace','conversion','campaign'));
$$;
GRANT EXECUTE ON FUNCTION public.bi_commercial() TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_operational()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'entregas_total', (SELECT count(*) FROM delivery_orders),
    'entregas_concluidas', (SELECT count(*) FROM delivery_orders WHERE delivered_at IS NOT NULL),
    'motoboys_ativos', (SELECT count(DISTINCT coalesce(motoboy_id, current_motoboy_id)) FROM delivery_orders),
    'fretes_ativos', (SELECT count(*) FROM freight_listings),
    'status', CASE WHEN (SELECT count(*) FROM delivery_orders)=0 THEN 'sem entregas registradas ainda (declarado)' ELSE 'ativo' END,
    'origem', 'delivery_orders + Fretes', 'modulos', jsonb_build_array('dispatcher'));
$$;
GRANT EXECUTE ON FUNCTION public.bi_operational() TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_intelligence()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'trust_medio', (SELECT round(avg(score)) FROM orion_trust_scores WHERE dia = (now() AT TIME ZONE 'America/Cuiaba')::date),
    'trust_alertas', (SELECT count(*) FROM orion_trust_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 14),
    'market_insights', (SELECT count(*) FROM orion_market_insights WHERE dia = (now() AT TIME ZONE 'America/Cuiaba')::date),
    'growth_cidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',cidade,'score',score) ORDER BY score DESC),'[]') FROM orion_growth_scores),
    'personalizacao_perfis', (SELECT count(*) FROM orion_perso_profiles),
    'origem', 'Trust/Marketplace/Growth/Personalization (saídas consolidadas)',
    'modulos', jsonb_build_array('trust','marketplace','growth','personalization','forecast','pricing'));
$$;
GRANT EXECUTE ON FUNCTION public.bi_intelligence() TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_ia()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'chamadas', (SELECT count(*) FROM orion_ai_log),
    'tokens_total', (SELECT coalesce(sum(tokens_in+tokens_out),0) FROM orion_ai_log),
    'custo_total_usd', (SELECT coalesce(round(sum(custo_estimado)::numeric,4),0) FROM orion_ai_log),
    'cache_hit_pct', (SELECT round(count(*) filter (where cache_hit)*100.0/nullif(count(*),0)) FROM orion_ai_log),
    'latencia_media_ms', (SELECT round(avg(duracao_ms)) FROM orion_ai_log WHERE status='ok'),
    'por_modulo', (SELECT coalesce(jsonb_object_agg(module, n),'{}') FROM (SELECT module, count(*) n FROM orion_ai_log GROUP BY 1) m),
    'por_provider', (SELECT coalesce(jsonb_object_agg(provider, n),'{}') FROM (SELECT provider, count(*) n FROM orion_ai_log GROUP BY 1) p),
    'origem', 'orion_ai_log (Gateway)', 'modulos', jsonb_build_array('gateway'));
$$;
GRANT EXECUTE ON FUNCTION public.bi_ia() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR: snapshot dos KPIs headline (idempotente/dia) — para evolução histórica
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bi_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  INSERT INTO orion_bi_kpis (dominio, chave, valor, unidade, origem, modulos, metodologia, confianca)
  SELECT 'executivo','anuncios_ativos',(SELECT count(*) FROM advertiser_listings),'un','advertiser_listings',jsonb_build_array('publisher'),'contagem de anúncios ativos',92
  UNION ALL SELECT 'executivo','usuarios_ativos_45d',(SELECT count(DISTINCT visitor_user_id) FROM marketplace_product_click_events WHERE visitor_user_id IS NOT NULL AND created_at>now()-interval '45 days'),'un','marketplace_product_click_events',jsonb_build_array('personalization'),'usuários distintos com clique em 45d',88
  UNION ALL SELECT 'executivo','cidades_ativas',(SELECT count(*) FROM (SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL UNION SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL) c),'un','intenções+cliques',jsonb_build_array('marketplace','growth'),'cidades distintas com sinal',85
  UNION ALL SELECT 'financeiro','receita_paga',(SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),'BRL','pay_payment_orders',jsonb_build_array('finance'),'soma de pagamentos com status paid',95
  UNION ALL SELECT 'financeiro','ticket_medio',(SELECT coalesce(round(avg(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),'BRL','pay_payment_orders',jsonb_build_array('finance'),'média do valor dos pagamentos pagos',95
  UNION ALL SELECT 'financeiro','taxa_pagamento_pct',(SELECT round(count(*) filter (where status::text='paid')*100.0/nullif(count(*) filter (where status::text in ('paid','failed')),0)) FROM pay_payment_orders),'%','pay_payment_orders',jsonb_build_array('finance','trust'),'pagos/(pagos+falhos)',90
  UNION ALL SELECT 'comercial','interesses_30d',(SELECT count(*) FROM advertiser_contact_intentions WHERE created_at>now()-interval '30 days'),'un','advertiser_contact_intentions',jsonb_build_array('marketplace','conversion'),'intenções de contato em 30d',92
  UNION ALL SELECT 'comercial','conversao_pct',(SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0)) FROM advertiser_contact_intentions WHERE created_at>now()-interval '30 days'),'%','advertiser_contact_intentions',jsonb_build_array('conversion','pricing'),'desbloqueados pagos / total (30d)',88
  UNION ALL SELECT 'comercial','cliques_30d',(SELECT count(*) FROM marketplace_product_click_events WHERE created_at>now()-interval '30 days'),'un','marketplace_product_click_events',jsonb_build_array('marketplace'),'cliques em produtos em 30d',90
  UNION ALL SELECT 'operacional','entregas_total',(SELECT count(*) FROM delivery_orders),'un','delivery_orders',jsonb_build_array('dispatcher'),'total de pedidos de entrega',95
  UNION ALL SELECT 'operacional','fretes_ativos',(SELECT count(*) FROM freight_listings),'un','freight_listings',jsonb_build_array('dispatcher'),'anúncios de frete',90
  UNION ALL SELECT 'inteligencia','trust_medio',(SELECT coalesce(round(avg(score)),0) FROM orion_trust_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),'score','orion_trust_scores',jsonb_build_array('trust'),'média dos Trust Scores do dia',85
  UNION ALL SELECT 'inteligencia','market_insights',(SELECT count(*) FROM orion_market_insights WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),'un','orion_market_insights',jsonb_build_array('marketplace'),'insights comerciais do dia',85
  UNION ALL SELECT 'inteligencia','personalizacao_perfis',(SELECT count(*) FROM orion_perso_profiles),'un','orion_perso_profiles',jsonb_build_array('personalization'),'perfis de personalização',85
  UNION ALL SELECT 'ia','ia_chamadas',(SELECT count(*) FROM orion_ai_log),'un','orion_ai_log',jsonb_build_array('gateway'),'chamadas ao AI Gateway',95
  UNION ALL SELECT 'ia','ia_custo_usd',(SELECT coalesce(round(sum(custo_estimado)::numeric,4),0) FROM orion_ai_log),'USD','orion_ai_log',jsonb_build_array('gateway'),'custo estimado acumulado de IA',95
  UNION ALL SELECT 'ia','ia_cache_hit_pct',(SELECT coalesce(round(count(*) filter (where cache_hit)*100.0/nullif(count(*),0)),0) FROM orion_ai_log),'%','orion_ai_log',jsonb_build_array('gateway'),'proporção de cache hit',95
  ON CONFLICT (dominio, chave, dia) DO UPDATE SET
    valor=excluded.valor, unidade=excluded.unidade, origem=excluded.origem,
    modulos=excluded.modulos, metodologia=excluded.metodologia, confianca=excluded.confianca, criado_em=now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM bi_emit('business.kpi.updated', jsonb_build_object('kpis', v_n, 'dia', (now() AT TIME ZONE 'America/Cuiaba')::date));
  RETURN jsonb_build_object('ok', true, 'kpis_snapshot', v_n);
END; $$;
GRANT EXECUTE ON FUNCTION public.bi_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- EVOLUÇÃO / SCORE / SUMMARY / DASHBOARD
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bi_evolution(p_dominio text DEFAULT NULL, p_dias int DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.dia, e.chave), '[]')
  FROM (SELECT dia, dominio, chave, valor, unidade FROM orion_bi_kpis
        WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - least(p_dias,180)
          AND (p_dominio IS NULL OR dominio = p_dominio)
        ORDER BY dia, chave) e;
$$;
GRANT EXECUTE ON FUNCTION public.bi_evolution(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  comp := jsonb_build_object(
    'cobertura_dominios', (SELECT round(count(DISTINCT dominio)*100.0/6) FROM orion_bi_kpis WHERE dia=v_hoje),
    'kpis_hoje', least(100, (SELECT count(*) FROM orion_bi_kpis WHERE dia=v_hoje) * 6),
    'confianca_media', (SELECT coalesce(round(avg(confianca)),0) FROM orion_bi_kpis WHERE dia=v_hoje),
    'frescor', CASE WHEN (SELECT count(*) FROM orion_bi_kpis WHERE dia=v_hoje) > 0 THEN 100 ELSE 0 END);
  RETURN jsonb_build_object(
    'bi_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'dominios_cobertos', (SELECT count(DISTINCT dominio) FROM orion_bi_kpis WHERE dia=v_hoje),
    'kpis_snapshot_hoje', (SELECT count(*) FROM orion_bi_kpis WHERE dia=v_hoje),
    'formula', 'cobertura_dominios+kpis_hoje+confianca_media+frescor — agregação read-only de saídas já computadas');
END; $$;
GRANT EXECUTE ON FUNCTION public.bi_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'executivo', bi_executive(), 'financeiro', bi_financial(), 'comercial', bi_commercial(),
    'operacional', bi_operational(), 'inteligencia', bi_intelligence(), 'ia', bi_ia(),
    'prompt_keys', jsonb_build_array('business.summary','business.analysis','business.executive','business.kpi','business.forecast'));
END; $$;
GRANT EXECUTE ON FUNCTION public.bi_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('business_dashboard_consultado',
    'business_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', bi_score(),
    'executivo', bi_executive(),
    'financeiro', bi_financial(),
    'comercial', bi_commercial(),
    'operacional', bi_operational(),
    'inteligencia', bi_intelligence(),
    'ia', bi_ia(),
    'kpis_snapshot', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'dominio',dominio,'chave',chave,'valor',valor,'unidade',unidade,'origem',origem,'modulos',modulos,'metodologia',metodologia,'confianca',confianca)
        ORDER BY dominio, chave),'[]')
      FROM orion_bi_kpis WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'evolucao', bi_evolution(NULL, 14),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.bi_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron): snapshot horário dos KPIs
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_bi_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM bi_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_bi_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_bi_tick', '9 * * * *', 'SELECT public.orion_bi_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('business.summary',
'Você é o ORION Business Intelligence AI da VIAGG-TX8 — o Centro Executivo. Receberá KPIs consolidados (executivo/financeiro/comercial/operacional/inteligência/IA) REAIS. Responda em pt-BR (6-10 frases) um panorama executivo: saúde da plataforma, faturamento, crescimento comercial, confiança e uso de IA, indicando QUAIS módulos forneceram cada dado. Cite os números do JSON; nunca invente; declare lacunas (ex.: entregas sem dados).',
'Seed ORION-AI-22') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='business.summary');
SELECT public.orion_ai_prompt_set('business.analysis',
'Você analisa tendências e comparativos da VIAGG-TX8. Receberá KPIs e evolução histórica. Em pt-BR (5-8 frases), aponte o que cresce/cai, sazonalidade, gargalos e oportunidades, citando o período e os módulos de origem. Baseie-se só no JSON; sem projeção inventada.',
'Seed ORION-AI-22') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='business.analysis');
SELECT public.orion_ai_prompt_set('business.executive',
'Você escreve o resumo executivo semanal da VIAGG-TX8 no estilo board. Receberá KPIs de todos os domínios. Em pt-BR (4-7 frases), destaque os 3 indicadores mais relevantes e a recomendação estratégica principal, sempre citando os módulos que forneceram os dados. Nunca invente.',
'Seed ORION-AI-22') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='business.executive');
SELECT public.orion_ai_prompt_set('business.kpi',
'Você explica um KPI da VIAGG-TX8 de forma transparente. Receberá o KPI com origem, módulos, metodologia e confiança. Em pt-BR (3-5 frases), explique o que ele mede, como é calculado e o nível de confiança. Só o JSON; sem caixa-preta.',
'Seed ORION-AI-22') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='business.kpi');
SELECT public.orion_ai_prompt_set('business.forecast',
'Você comenta projeções de negócio da VIAGG-TX8 reutilizando o Demand Forecast/Growth (nunca recalcula). Receberá KPIs e séries. Em pt-BR (4-6 frases), descreva a tendência esperada SEMPRE como projeção (com confiança declarada), citando os módulos. Nunca apresente projeção como certeza.',
'Seed ORION-AI-22') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='business.forecast');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('business', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
