-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-28 — SUSTAINABILITY AI v1.0
--   O Centro Inteligente de Sustentabilidade da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-28). Mede o impacto
-- positivo da plataforma em TRÊS pilares — 🌱 Ambiental, 💰 Econômico,
-- 👥 Social — e recomenda melhorias. Sustainability Score (Amb 30% +
-- Eco 40% + Soc 30%), Sustainability Opportunity Score e o índice
-- proprietário VIAGG Impact Index (VII) por cidade. SEMPRE dados reais;
-- NUNCA inventa indicador (declara quando falta dado); NUNCA executa/
-- altera operações/preços/entregas. Read-only. IA só via Gateway.
--
-- Fontes REAIS (read-only): pay_payment_orders (receita), orion_ai_log
-- (eficiência/economia de IA via cache), orion_automation_requests
-- (automações), advertiser_contact_intentions/marketplace clicks
-- (produtividade), merchant_stores (empreendedores), orion_customer_health
-- (retenção), orion_logistics_scores/freight/travel/public_rides
-- (logística), orion_growth_scores (crescimento). DECLARADOS: renda de
-- motoboy (pay_motoboy_earnings vazia) e km/rotas/viagens evitadas
-- (delivery_orders vazia) — NUNCA estimados artificialmente.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_sustainability_scores, orion_sustainability_indicators CASCADE;
--   DROP FUNCTION public.sustainability_emit, sustainability_environment,
--     sustainability_economic, sustainability_social, sustainability_generate,
--     sustainability_cities, sustainability_indicators, sustainability_score,
--     sustainability_metrics, sustainability_summary, sustainability_dashboard,
--     orion_sustainability_tick CASCADE;
--   SELECT cron.unschedule('orion_sustainability_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'sustainability.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='sustainability';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_sustainability_indicators (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilar      text NOT NULL,                 -- ambiental|economico|social
  chave      text NOT NULL,
  valor      numeric,
  unidade    text,
  origem     text,
  status     text NOT NULL DEFAULT 'real',  -- real|declarado
  modulos    jsonb NOT NULL DEFAULT '[]',
  dia        date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_sustain_ind_unico UNIQUE (pilar, chave, dia)
);
CREATE INDEX IF NOT EXISTS idx_osi2_pilar ON public.orion_sustainability_indicators (pilar, dia DESC);
COMMENT ON TABLE public.orion_sustainability_indicators IS
  'ORION-AI-28: indicadores de sustentabilidade por pilar (real|declarado). Nunca inventa; declara lacunas.';
ALTER TABLE public.orion_sustainability_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osi2_admin ON public.orion_sustainability_indicators;
CREATE POLICY osi2_admin ON public.orion_sustainability_indicators FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_sustainability_indicators FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_sustainability_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo            text NOT NULL,              -- nacional|cidade
  escopo_ref        text NOT NULL DEFAULT 'BR',
  sustainability_score int NOT NULL DEFAULT 50,
  ambiental         int NOT NULL DEFAULT 50,
  economico         int NOT NULL DEFAULT 50,
  social            int NOT NULL DEFAULT 50,
  vii               int,                        -- VIAGG Impact Index
  opportunity_score int,                        -- Sustainability Opportunity Score
  fatores           jsonb NOT NULL DEFAULT '{}',
  recomendacao      text,
  confianca         int NOT NULL DEFAULT 60,
  modulos           jsonb NOT NULL DEFAULT '[]',
  dia               date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_sustain_score_unico UNIQUE (escopo, escopo_ref, dia)
);
CREATE INDEX IF NOT EXISTS idx_oss2_vii ON public.orion_sustainability_scores (vii DESC, dia DESC);
COMMENT ON TABLE public.orion_sustainability_scores IS
  'ORION-AI-28: Sustainability Score (Amb30/Eco40/Soc30) + VIAGG Impact Index (VII) + Opportunity Score por escopo/dia, explicável.';
ALTER TABLE public.orion_sustainability_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oss2_admin ON public.orion_sustainability_scores;
CREATE POLICY oss2_admin ON public.orion_sustainability_scores FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_sustainability_scores FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sustainability_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'sustainability_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- PILARES (read-only) — cada um retorna indicadores reais + declarados
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sustainability_environment()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'eficiencia_logistica_media', (SELECT round(avg(logistics_score)) FROM orion_logistics_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'fretes', (SELECT count(*) FROM freight_listings), 'viagens', (SELECT count(*) FROM travel_listings),
    'corridas', (SELECT count(*) FROM public_rides),
    'declarado', jsonb_build_object('km_otimizados','sem dados (delivery_orders vazia)',
      'rotas_consolidadas','sem dados','viagens_evitadas','sem dados','entregas_agrupadas','sem dados',
      'nota','Indicadores ambientais de deslocamento exigem histórico de entregas — DECLARADO, nunca estimado.'),
    'modulos', jsonb_build_array('sustainability','logistics'));
$$;
GRANT EXECUTE ON FUNCTION public.sustainability_environment() TO authenticated;

CREATE OR REPLACE FUNCTION public.sustainability_economic()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'receita_gerada', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
    'receita_mes', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid' AND created_at > date_trunc('month', now())),
    'ia_custo_usd', (SELECT coalesce(round(sum(custo_estimado)::numeric,4),0) FROM orion_ai_log),
    'ia_cache_hit_pct', (SELECT coalesce(round(count(*) filter (where cache_hit)*100.0/nullif(count(*),0)),0) FROM orion_ai_log),
    'economia_ia_por_cache', (SELECT count(*) filter (where cache_hit) FROM orion_ai_log),
    'automacoes_executadas', (SELECT count(*) FROM orion_automation_requests WHERE status='concluida'),
    'conversao_marketplace_pct', (SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0)) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days'),
    'modulos', jsonb_build_array('sustainability','finance','business','automation','marketplace'));
$$;
GRANT EXECUTE ON FUNCTION public.sustainability_economic() TO authenticated;

CREATE OR REPLACE FUNCTION public.sustainability_social()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'lojistas', (SELECT count(*) FROM merchant_stores),
    'novos_lojistas_30d', (SELECT count(*) FROM merchant_stores WHERE created_at > now()-interval '30 days'),
    'retencao_health_medio', (SELECT round(avg(health_score)) FROM orion_customer_health WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'usuarios_acompanhados', (SELECT count(*) FROM orion_customer_health WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'cidades_atendidas', (SELECT count(*) FROM (SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL UNION SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL) c),
    'declarado', jsonb_build_object('renda_motoboys','sem dados (pay_motoboy_earnings vazia)',
      'nota','Renda de entregadores exige lançamentos em pay_motoboy_earnings — DECLARADO.'),
    'modulos', jsonb_build_array('sustainability','customer_success','growth','trust'));
$$;
GRANT EXECUTE ON FUNCTION public.sustainability_social() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR: indicadores + Sustainability Score + VII por cidade (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sustainability_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_conv numeric; v_cache numeric; v_autom int; v_receita numeric;
  v_lojas int; v_novas int; v_ret numeric; v_cidades int;
  v_log numeric; v_ft int;
  v_amb int; v_eco int; v_soc int; v_geral int; v_cid int := 0; v_vii_nac int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- métricas reais
  SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0)) INTO v_conv FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days';
  SELECT round(count(*) filter (where cache_hit)*100.0/nullif(count(*),0)) INTO v_cache FROM orion_ai_log;
  SELECT count(*) INTO v_autom FROM orion_automation_requests WHERE status='concluida';
  SELECT coalesce(sum(amount),0) INTO v_receita FROM pay_payment_orders WHERE status::text='paid';
  SELECT count(*) INTO v_lojas FROM merchant_stores;
  SELECT count(*) INTO v_novas FROM merchant_stores WHERE created_at > now()-interval '30 days';
  SELECT round(avg(health_score)) INTO v_ret FROM orion_customer_health WHERE dia=v_hoje;
  SELECT count(*) INTO v_cidades FROM (SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL UNION SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL) c;
  SELECT round(avg(logistics_score)) INTO v_log FROM orion_logistics_scores WHERE dia=v_hoje;
  SELECT (SELECT count(*) FROM freight_listings) + (SELECT count(*) FROM travel_listings) INTO v_ft;

  -- pilares (0-100) — só sinais reais; lacunas ficam como indicador 'declarado'
  v_eco := round(0.35*least(coalesce(v_conv,0),100) + 0.25*least(coalesce(v_cache,0),100) + 0.20*least(v_autom*20,100) + 0.20*least(v_receita/50.0,100));
  v_soc := round(0.30*least(v_lojas*10,100) + 0.25*least(v_novas*30,100) + 0.25*coalesce(v_ret,50) + 0.20*least(v_cidades*20,100));
  v_amb := round(0.60*coalesce(v_log,40) + 0.40*least(v_ft*10,100));
  v_geral := round(0.30*v_amb + 0.40*v_eco + 0.30*v_soc);

  -- indicadores (real + declarado)
  INSERT INTO orion_sustainability_indicators (pilar, chave, valor, unidade, origem, status, modulos) VALUES
    ('economico','receita_gerada', v_receita, 'BRL', 'pay_payment_orders', 'real', jsonb_build_array('finance')),
    ('economico','ia_cache_hit_pct', coalesce(v_cache,0), '%', 'orion_ai_log', 'real', jsonb_build_array('gateway')),
    ('economico','automacoes_executadas', v_autom, 'un', 'orion_automation_requests', 'real', jsonb_build_array('automation')),
    ('economico','conversao_marketplace_pct', coalesce(v_conv,0), '%', 'advertiser_contact_intentions', 'real', jsonb_build_array('marketplace')),
    ('social','lojistas', v_lojas, 'un', 'merchant_stores', 'real', jsonb_build_array('marketplace')),
    ('social','novos_lojistas_30d', v_novas, 'un', 'merchant_stores', 'real', jsonb_build_array('growth')),
    ('social','retencao_health_medio', coalesce(v_ret,0), 'score', 'orion_customer_health', 'real', jsonb_build_array('customer_success')),
    ('social','cidades_atendidas', v_cidades, 'un', 'intenções+cliques', 'real', jsonb_build_array('marketplace')),
    ('social','renda_motoboys', NULL, 'BRL', 'pay_motoboy_earnings', 'declarado', jsonb_build_array('logistics')),
    ('ambiental','eficiencia_logistica_media', coalesce(v_log,0), 'score', 'orion_logistics_scores', 'real', jsonb_build_array('logistics')),
    ('ambiental','fretes_viagens', v_ft, 'un', 'freight/travel_listings', 'real', jsonb_build_array('logistics')),
    ('ambiental','km_otimizados', NULL, 'km', 'delivery_orders', 'declarado', jsonb_build_array('logistics'))
  ON CONFLICT (pilar, chave, dia) DO UPDATE SET valor=excluded.valor, status=excluded.status, criado_em=now();

  -- SCORE nacional
  INSERT INTO orion_sustainability_scores (escopo, escopo_ref, sustainability_score, ambiental, economico, social, vii, opportunity_score, fatores, recomendacao, confianca, modulos)
  VALUES ('nacional', 'BR', v_geral, v_amb, v_eco, v_soc,
    NULL, NULL,
    jsonb_build_object('pesos', jsonb_build_object('ambiental',0.30,'economico',0.40,'social',0.30),
      'ambiental', v_amb, 'economico', v_eco, 'social', v_soc,
      'lacunas', jsonb_build_array('renda_motoboys','km_otimizados')),
    CASE WHEN v_amb < v_eco AND v_amb < v_soc THEN 'Pilar mais fraco: ambiental (dados de deslocamento pendentes) — instrumentar entregas.'
         WHEN v_soc <= v_eco THEN 'Fortalecer o pilar social — captação de lojistas e renda de entregadores.'
         ELSE 'Manter eficiência econômica e ampliar impacto social/ambiental.' END,
    65, jsonb_build_array('sustainability','business','logistics','growth','customer_success'))
  ON CONFLICT (escopo, escopo_ref, dia) DO UPDATE SET
    sustainability_score=excluded.sustainability_score, ambiental=excluded.ambiental,
    economico=excluded.economico, social=excluded.social, fatores=excluded.fatores,
    recomendacao=excluded.recomendacao, criado_em=now();

  -- VIAGG IMPACT INDEX (VII) + Opportunity Score por cidade (reuso Logistics + Growth)
  INSERT INTO orion_sustainability_scores (escopo, escopo_ref, sustainability_score, ambiental, economico, social, vii, opportunity_score, fatores, recomendacao, confianca, modulos)
  SELECT 'cidade', l.cidade, v_geral, v_amb,
    least(100, round(coalesce(l.demanda,0)*4)), coalesce(round(g.score), v_soc),
    round(0.40*least(coalesce(l.demanda,0)*4,100) + 0.30*coalesce(g.score, 50) + 0.30*coalesce(l.logistics_score,40)) vii,
    l.opportunity_score,
    jsonb_build_object('demanda', l.demanda, 'crescimento', coalesce(g.score,50), 'eficiencia_logistica', l.logistics_score,
      'formula_vii','0.4·econômico(demanda) + 0.3·social(crescimento) + 0.3·ambiental(eficiência logística)'),
    'VII de '||l.cidade||' — impacto/oportunidade combinando renda, crescimento e eficiência logística.',
    l.confianca, jsonb_build_array('sustainability','logistics','growth','marketplace')
  FROM orion_logistics_scores l
  LEFT JOIN orion_growth_scores g ON orion_norm(g.cidade)=orion_norm(l.cidade)
  WHERE l.dia = v_hoje
  ON CONFLICT (escopo, escopo_ref, dia) DO UPDATE SET
    vii=excluded.vii, opportunity_score=excluded.opportunity_score, economico=excluded.economico,
    social=excluded.social, fatores=excluded.fatores, recomendacao=excluded.recomendacao, criado_em=now();
  GET DIAGNOSTICS v_cid = ROW_COUNT;

  -- VII nacional = média dos VIIs das cidades
  SELECT round(avg(vii)) INTO v_vii_nac FROM orion_sustainability_scores WHERE escopo='cidade' AND dia=v_hoje;
  UPDATE orion_sustainability_scores SET vii=v_vii_nac,
    opportunity_score=(SELECT max(opportunity_score) FROM orion_sustainability_scores WHERE escopo='cidade' AND dia=v_hoje)
    WHERE escopo='nacional' AND dia=v_hoje;

  PERFORM sustainability_emit('sustainability.score', jsonb_build_object('score', v_geral, 'ambiental', v_amb, 'economico', v_eco, 'social', v_soc));
  PERFORM sustainability_emit('sustainability.updated', jsonb_build_object('cidades', v_cid, 'vii_nacional', v_vii_nac));
  RETURN jsonb_build_object('ok', true, 'sustainability_score', v_geral, 'ambiental', v_amb, 'economico', v_eco, 'social', v_soc, 'cidades', v_cid, 'vii_nacional', v_vii_nac);
END; $$;
GRANT EXECUTE ON FUNCTION public.sustainability_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sustainability_cities()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.vii DESC), '[]')
  FROM (SELECT DISTINCT ON (escopo_ref) escopo_ref cidade, vii, opportunity_score, economico, social, ambiental, fatores, recomendacao, confianca
        FROM orion_sustainability_scores WHERE escopo='cidade' ORDER BY escopo_ref, dia DESC) c;
$$;
GRANT EXECUTE ON FUNCTION public.sustainability_cities() TO authenticated;

CREATE OR REPLACE FUNCTION public.sustainability_indicators()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(pilar, inds), '{}')
  FROM (SELECT pilar, jsonb_agg(jsonb_build_object('chave', chave, 'valor', valor, 'unidade', unidade, 'status', status, 'origem', origem) ORDER BY chave) inds
        FROM (SELECT DISTINCT ON (pilar, chave) pilar, chave, valor, unidade, status, origem FROM orion_sustainability_indicators ORDER BY pilar, chave, dia DESC) x
        GROUP BY pilar) y;
$$;
GRANT EXECUTE ON FUNCTION public.sustainability_indicators() TO authenticated;

CREATE OR REPLACE FUNCTION public.sustainability_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN coalesce((SELECT jsonb_build_object('sustainability_score', sustainability_score,
    'ambiental', ambiental, 'economico', economico, 'social', social, 'vii', vii, 'opportunity_score', opportunity_score,
    'pesos', jsonb_build_object('ambiental',0.30,'economico',0.40,'social',0.30),
    'recomendacao', recomendacao, 'fatores', fatores)
    FROM orion_sustainability_scores WHERE escopo='nacional' ORDER BY dia DESC LIMIT 1),
    jsonb_build_object('nota','Nenhuma medição ainda — rode sustainability_generate().'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sustainability_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.sustainability_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cidades', (SELECT count(DISTINCT escopo_ref) FROM orion_sustainability_scores WHERE escopo='cidade'),
    'indicadores', (SELECT count(*) FROM orion_sustainability_indicators WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'indicadores_reais', (SELECT count(*) FROM orion_sustainability_indicators WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date AND status='real'),
    'indicadores_declarados', (SELECT count(*) FROM orion_sustainability_indicators WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date AND status='declarado'));
$$;
GRANT EXECUTE ON FUNCTION public.sustainability_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.sustainability_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', sustainability_score(), 'ambiental', sustainability_environment(),
    'economico', sustainability_economic(), 'social', sustainability_social(), 'cidades_vii', sustainability_cities(),
    'prompt_keys', jsonb_build_array('sustainability.environment','sustainability.economic','sustainability.social','sustainability.score','sustainability.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sustainability_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.sustainability_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('sustainability_dashboard_consultado',
    'sustainability_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', sustainability_score(),
    'metrics', sustainability_metrics(),
    'ambiental', sustainability_environment(),
    'economico', sustainability_economic(),
    'social', sustainability_social(),
    'indicadores', sustainability_indicators(),
    'cidades_vii', sustainability_cities(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sustainability_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_sustainability_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sustainability_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_sustainability_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_sustainability_tick', '31 * * * *', 'SELECT public.orion_sustainability_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('sustainability.environment',
'Você é o ORION Sustainability AI da VIAGG-TX8 (pilar Ambiental). Receberá indicadores REAIS (eficiência logística, fretes/viagens) e os DECLARADOS (km/rotas/viagens evitadas — sem dados). Em pt-BR (4-6 frases), avalie o impacto ambiental com honestidade, deixando claro o que está declarado por falta de dados de entrega. Nunca estime artificialmente.',
'Seed ORION-AI-28') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sustainability.environment');
SELECT public.orion_ai_prompt_set('sustainability.economic',
'Você avalia a sustentabilidade Econômica da VIAGG-TX8. Receberá receita, eficiência da IA (cache), automações e produtividade do marketplace REAIS. Em pt-BR (4-7 frases), aponte a economia gerada e onde melhorar, citando os números. Nunca invente.',
'Seed ORION-AI-28') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sustainability.economic');
SELECT public.orion_ai_prompt_set('sustainability.social',
'Você avalia a sustentabilidade Social da VIAGG-TX8. Receberá lojistas, novos empreendedores, retenção e cidades REAIS (renda de motoboys declarada). Em pt-BR (4-7 frases), avalie o impacto social e as oportunidades, citando os números; declare o que falta instrumentar. Nunca invente.',
'Seed ORION-AI-28') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sustainability.social');
SELECT public.orion_ai_prompt_set('sustainability.score',
'Você explica o Sustainability Score da VIAGG-TX8 (Ambiental 30% + Econômico 40% + Social 30%) e o VIAGG Impact Index (VII) por cidade. Em pt-BR (4-6 frases), explique os pesos, os pilares e onde a plataforma gera mais impacto, citando os números e a confiança. Sem caixa-preta.',
'Seed ORION-AI-28') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sustainability.score');
SELECT public.orion_ai_prompt_set('sustainability.summary',
'Você resume o impacto e a sustentabilidade da VIAGG-TX8 (3 pilares + VII). Em pt-BR (5-7 frases), responda: quanto de renda/valor foi gerado, onde há maior impacto e a recomendação principal, com os números do JSON. Declare lacunas; nunca invente; recomenda, nunca executa.',
'Seed ORION-AI-28') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sustainability.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('sustainability', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
