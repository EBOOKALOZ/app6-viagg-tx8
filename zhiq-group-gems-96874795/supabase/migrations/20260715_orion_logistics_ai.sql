-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-27 — LOGISTICS AI v1.0
--   O Centro Inteligente de Operações Logísticas da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-27). Cérebro operacional
-- de entregas/fretes/viagens/motoboys: prevê demanda, otimiza cobertura,
-- identifica gargalos e orienta expansão — via Logistics Score (0-100) e
-- Logistics Opportunity Score por cidade. ANALISA/RECOMENDA — NUNCA
-- despacha corrida/entrega/frete. Execução segue Dispatcher/Automation.
-- Read-only. IA só via Gateway.
--
-- NÃO substitui Dispatcher/Automation/Pricing/Forecast — reutiliza todos.
--
-- Fontes REAIS (read-only): advertiser_contact_intentions (demanda
-- freight/travel por cidade), marketplace_product_click_events (demanda),
-- freight_listings/travel_listings (oferta de fretes/viagens),
-- public_rides (corridas), motoboy_profiles/motoboy_presence (oferta de
-- entregadores), orion_growth_scores (crescimento). delivery_orders VAZIA
-- → tempos/eficiência de entrega DECLARADOS; motoboy_presence.city_id é
-- referência (não nome) → distribuição geográfica de motoboy DECLARADA.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_logistics_recommendations, orion_logistics_scores CASCADE;
--   DROP FUNCTION public.logistics_emit, logistics_generate, logistics_coverage,
--     logistics_motoboys, logistics_heatmap, logistics_freight_travel,
--     logistics_scores, logistics_recommendations, logistics_score,
--     logistics_metrics, logistics_summary, logistics_dashboard, orion_logistics_tick CASCADE;
--   SELECT cron.unschedule('orion_logistics_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'logistics.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='logistics';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_logistics_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidade           text NOT NULL,
  uf               text,
  logistics_score  int NOT NULL DEFAULT 50,     -- saúde logística 0-100
  opportunity_score int NOT NULL DEFAULT 50,     -- Logistics Opportunity Score 0-100
  demanda          int NOT NULL DEFAULT 0,
  oferta_motoboys  int NOT NULL DEFAULT 0,
  motoboys_online  int NOT NULL DEFAULT 0,
  crescimento      numeric,
  fatores          jsonb NOT NULL DEFAULT '{}',
  sinal            text,                          -- equilibrado|falta_entregadores|alta_oportunidade|baixa_demanda
  recomendacao     text,
  confianca        int NOT NULL DEFAULT 60,
  modulos          jsonb NOT NULL DEFAULT '[]',
  dia              date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_logistics_score_unico UNIQUE (cidade, dia)
);
CREATE INDEX IF NOT EXISTS idx_ols_opp ON public.orion_logistics_scores (opportunity_score DESC, dia DESC);
COMMENT ON TABLE public.orion_logistics_scores IS
  'ORION-AI-27: Logistics Score + Logistics Opportunity Score por cidade/dia, explicável. Recomenda; nunca despacha.';
ALTER TABLE public.orion_logistics_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ols_admin ON public.orion_logistics_scores;
CREATE POLICY ols_admin ON public.orion_logistics_scores FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_logistics_scores FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_logistics_recommendations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL,                 -- captacao_motoboys|expansao|reposicionamento|cobertura
  escopo      text NOT NULL DEFAULT 'cidade',
  escopo_ref  text NOT NULL DEFAULT '',
  titulo      text NOT NULL,
  score       int NOT NULL DEFAULT 50,
  fatores     jsonb NOT NULL DEFAULT '{}',
  modulos     jsonb NOT NULL DEFAULT '[]',
  motivo      text,
  confianca   int NOT NULL DEFAULT 60,
  dia         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_logistics_rec_unico UNIQUE (tipo, escopo_ref, dia)
);
CREATE INDEX IF NOT EXISTS idx_olr_score ON public.orion_logistics_recommendations (score DESC, dia DESC);
COMMENT ON TABLE public.orion_logistics_recommendations IS
  'ORION-AI-27: recomendações estratégicas de logística (captação/expansão/cobertura), explicáveis. Sugere; nunca executa.';
ALTER TABLE public.orion_logistics_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olr_admin ON public.orion_logistics_recommendations;
CREATE POLICY olr_admin ON public.orion_logistics_recommendations FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_logistics_recommendations FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.logistics_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'logistics_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- OFERTA DE ENTREGADORES / COBERTURA (read-only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.logistics_motoboys()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cadastrados', (SELECT count(*) FROM motoboy_profiles),
    'aprovados', (SELECT count(*) FROM motoboys WHERE aprovado),
    'online_agora', (SELECT count(*) FROM motoboy_presence WHERE is_online),
    'presencas', (SELECT count(*) FROM motoboy_presence),
    'ultimo_visto', (SELECT to_char(max(last_seen) AT TIME ZONE 'America/Cuiaba','DD/MM HH24:MI') FROM motoboy_presence),
    'nota', 'Distribuição geográfica por cidade depende de mapear city_id→nome (declarado).',
    'modulos', jsonb_build_array('logistics','dispatcher'));
$$;
GRANT EXECUTE ON FUNCTION public.logistics_motoboys() TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_coverage()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cidades_com_demanda', (SELECT count(*) FROM (
        SELECT city FROM advertiser_contact_intentions WHERE listing_module IN ('freight','travel') AND city IS NOT NULL
        UNION SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL) c),
    'motoboys_online', (SELECT count(*) FROM motoboy_presence WHERE is_online),
    'cidades_presenca', (SELECT count(DISTINCT city_id) FROM motoboy_presence WHERE city_id IS NOT NULL),
    'nota', 'Cobertura = demanda por cidade x oferta de entregadores; delivery_orders vazia → tempos declarados.',
    'modulos', jsonb_build_array('logistics','dispatcher','marketplace'));
$$;
GRANT EXECUTE ON FUNCTION public.logistics_coverage() TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_freight_travel()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'fretes', jsonb_build_object('anuncios', (SELECT count(*) FROM freight_listings),
      'demanda_30d', (SELECT count(*) FROM advertiser_contact_intentions WHERE listing_module='freight' AND created_at > now()-interval '30 days'),
      'por_cidade', (SELECT coalesce(jsonb_object_agg(coalesce(city,'?'), n),'{}') FROM (SELECT city, count(*) n FROM freight_listings GROUP BY 1) f)),
    'viagens', jsonb_build_object('anuncios', (SELECT count(*) FROM travel_listings),
      'demanda_30d', (SELECT count(*) FROM advertiser_contact_intentions WHERE listing_module='travel' AND created_at > now()-interval '30 days')),
    'corridas', jsonb_build_object('public_rides', (SELECT count(*) FROM public_rides)),
    'modulos', jsonb_build_array('logistics','marketplace','forecast'));
$$;
GRANT EXECUTE ON FUNCTION public.logistics_freight_travel() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR: Logistics Score + Opportunity Score por cidade (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.logistics_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; v_r int := 0; v_x int; v_motoboys int; v_online int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT count(*) INTO v_motoboys FROM motoboy_profiles;
  SELECT count(*) INTO v_online   FROM motoboy_presence WHERE is_online;

  -- SCORES por cidade (demanda logística real vs oferta global de entregadores)
  WITH dem AS (
    SELECT cidade, sum(n) demanda FROM (
      SELECT city cidade, count(*) n FROM advertiser_contact_intentions
        WHERE listing_module IN ('freight','travel') AND city IS NOT NULL AND created_at > now()-interval '30 days' GROUP BY city
      UNION ALL
      SELECT city cidade, count(*) n FROM marketplace_product_click_events
        WHERE city IS NOT NULL AND created_at > now()-interval '30 days' GROUP BY city
      UNION ALL
      SELECT city cidade, count(*) n FROM freight_listings WHERE city IS NOT NULL GROUP BY city
    ) u GROUP BY cidade
  ), maxd AS (SELECT greatest(max(demanda),1) md FROM dem)
  INSERT INTO orion_logistics_scores (cidade, uf, logistics_score, opportunity_score, demanda, oferta_motoboys, motoboys_online, crescimento, fatores, sinal, recomendacao, confianca, modulos)
  SELECT d.cidade,
    (SELECT uf FROM orion_growth_scores g WHERE orion_norm(g.cidade)=orion_norm(d.cidade) LIMIT 1),
    ls, opp, d.demanda, v_motoboys, v_online,
    (SELECT score FROM orion_growth_scores g WHERE orion_norm(g.cidade)=orion_norm(d.cidade) LIMIT 1),
    jsonb_build_object('demanda_30d', d.demanda, 'demanda_norm', round(dn,2), 'motoboys_online', v_online,
      'escassez', round(escassez,2), 'crescimento_norm', round(cn,2)),
    CASE WHEN d.demanda>0 AND v_online=0 THEN 'falta_entregadores'
         WHEN opp>=60 THEN 'alta_oportunidade'
         WHEN d.demanda<=1 THEN 'baixa_demanda' ELSE 'equilibrado' END,
    CASE WHEN opp>=60 THEN 'Alta oportunidade logística em '||d.cidade||' — captar entregadores e avaliar expansão.'
         WHEN v_online=0 THEN 'Sem entregadores online em '||d.cidade||' — priorizar captação.'
         ELSE 'Operação equilibrada em '||d.cidade||' — monitorar demanda.' END,
    least(90, 40 + d.demanda*3),
    jsonb_build_array('logistics','dispatcher','forecast','growth','marketplace')
  FROM (
    SELECT d.cidade, d.demanda,
      (d.demanda::numeric/md) dn,
      (1 - least(v_online::numeric / greatest(d.demanda,1), 1)) escassez,
      coalesce((SELECT score FROM orion_growth_scores g WHERE orion_norm(g.cidade)=orion_norm(d.cidade) LIMIT 1),50)/100.0 cn,
      round(50*(d.demanda::numeric/md) + 30*(1 - least(v_online::numeric/greatest(d.demanda,1),1)) + 20*(coalesce((SELECT score FROM orion_growth_scores g WHERE orion_norm(g.cidade)=orion_norm(d.cidade) LIMIT 1),50)/100.0)) opp,
      round(40*(1 - (1 - least(v_online::numeric/greatest(d.demanda,1),1))) + 30*least(v_online/5.0,1)*100/100.0*1 + 30*(coalesce((SELECT score FROM orion_growth_scores g WHERE orion_norm(g.cidade)=orion_norm(d.cidade) LIMIT 1),50)/100.0)) ls
    FROM dem d CROSS JOIN maxd
  ) d
  ON CONFLICT (cidade, dia) DO UPDATE SET
    logistics_score=excluded.logistics_score, opportunity_score=excluded.opportunity_score,
    demanda=excluded.demanda, oferta_motoboys=excluded.oferta_motoboys, motoboys_online=excluded.motoboys_online,
    crescimento=excluded.crescimento, fatores=excluded.fatores, sinal=excluded.sinal,
    recomendacao=excluded.recomendacao, confianca=excluded.confianca, criado_em=now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- RECOMENDAÇÕES estratégicas: top cidades por oportunidade → captação de motoboys
  INSERT INTO orion_logistics_recommendations (tipo, escopo, escopo_ref, titulo, score, fatores, modulos, motivo, confianca)
  SELECT 'captacao_motoboys', 'cidade', cidade,
    'Captar entregadores em '||cidade,
    opportunity_score,
    jsonb_build_object('demanda', demanda, 'motoboys_online', motoboys_online, 'opportunity_score', opportunity_score),
    jsonb_build_array('logistics','growth','marketing'),
    'Cidade com Logistics Opportunity Score '||opportunity_score||' (demanda '||demanda||', '||motoboys_online||' online) — priorizar captação/expansão.',
    confianca
  FROM orion_logistics_scores
  WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date AND opportunity_score >= 55
  ORDER BY opportunity_score DESC LIMIT 8
  ON CONFLICT (tipo, escopo_ref, dia) DO UPDATE SET
    score=excluded.score, fatores=excluded.fatores, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_r = ROW_COUNT;

  PERFORM logistics_emit('logistics.updated', jsonb_build_object('cidades', v_n, 'recomendacoes', v_r));
  IF v_r > 0 THEN PERFORM logistics_emit('logistics.coverage', jsonb_build_object('oportunidades', v_r)); END IF;
  RETURN jsonb_build_object('ok', true, 'cidades', v_n, 'recomendacoes', v_r);
END; $$;
GRANT EXECUTE ON FUNCTION public.logistics_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.logistics_scores()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.opportunity_score DESC), '[]')
  FROM (SELECT DISTINCT ON (cidade) cidade, uf, logistics_score, opportunity_score, demanda, motoboys_online, crescimento, fatores, sinal, recomendacao, confianca
        FROM orion_logistics_scores ORDER BY cidade, dia DESC) s;
$$;
GRANT EXECUTE ON FUNCTION public.logistics_scores() TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_heatmap()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'demanda', demanda,
        'motoboys_online', motoboys_online, 'logistics_score', logistics_score, 'opportunity_score', opportunity_score,
        'temperatura', CASE WHEN demanda >= 20 THEN 'quente' WHEN demanda >= 5 THEN 'morna' ELSE 'fria' END, 'sinal', sinal)
        ORDER BY demanda DESC), '[]')
      FROM (SELECT DISTINCT ON (cidade) cidade, demanda, motoboys_online, logistics_score, opportunity_score, sinal
            FROM orion_logistics_scores ORDER BY cidade, dia DESC) h),
    'niveis', jsonb_build_array('cidade'),
    'nota', 'Heatmap por cidade (bairro/região requerem geo de motoboy por city_id→nome — declarado).',
    'modulos', jsonb_build_array('logistics','marketplace','growth'));
$$;
GRANT EXECUTE ON FUNCTION public.logistics_heatmap() TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_recommendations(p_limite int DEFAULT 20)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.score DESC), '[]')
  FROM (SELECT tipo, escopo, escopo_ref, titulo, score, fatores, modulos, motivo, confianca
        FROM orion_logistics_recommendations WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
        ORDER BY score DESC LIMIT least(p_limite,50)) r;
$$;
GRANT EXECUTE ON FUNCTION public.logistics_recommendations(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_cid int; v_online int; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) INTO v_cid FROM orion_logistics_scores WHERE dia=v_hoje;
  SELECT count(*) INTO v_online FROM motoboy_presence WHERE is_online;
  comp := jsonb_build_object(
    'saude_media', coalesce((SELECT round(avg(logistics_score)) FROM orion_logistics_scores WHERE dia=v_hoje), 50),
    'cobertura', CASE WHEN v_online>0 THEN least(100, v_online*20) ELSE 20 END,
    'oportunidades_mapeadas', least(100, v_cid*20),
    'governanca', 100);
  RETURN jsonb_build_object(
    'logistics_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'cidades_analisadas', v_cid, 'motoboys_online', v_online,
    'formula', 'saude_media+cobertura+oportunidades+governanca — analisa/recomenda; nunca despacha');
END; $$;
GRANT EXECUTE ON FUNCTION public.logistics_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cidades', (SELECT count(DISTINCT cidade) FROM orion_logistics_scores),
    'recomendacoes', (SELECT count(*) FROM orion_logistics_recommendations),
    'motoboys_cadastrados', (SELECT count(*) FROM motoboy_profiles),
    'motoboys_online', (SELECT count(*) FROM motoboy_presence WHERE is_online),
    'fretes', (SELECT count(*) FROM freight_listings), 'viagens', (SELECT count(*) FROM travel_listings),
    'corridas', (SELECT count(*) FROM public_rides));
$$;
GRANT EXECUTE ON FUNCTION public.logistics_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', logistics_score(), 'scores_cidade', logistics_scores(),
    'cobertura', logistics_coverage(), 'motoboys', logistics_motoboys(), 'recomendacoes', logistics_recommendations(15),
    'prompt_keys', jsonb_build_array('logistics.coverage','logistics.forecast','logistics.balance','logistics.recommendation','logistics.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.logistics_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('logistics_dashboard_consultado',
    'logistics_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', logistics_score(),
    'metrics', logistics_metrics(),
    'heatmap', logistics_heatmap(),
    'scores_cidade', logistics_scores(),
    'cobertura', logistics_coverage(),
    'motoboys', logistics_motoboys(),
    'fretes_viagens', logistics_freight_travel(),
    'recomendacoes', logistics_recommendations(20),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.logistics_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_logistics_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM logistics_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_logistics_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_logistics_tick', '27 * * * *', 'SELECT public.orion_logistics_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('logistics.coverage',
'Você é o ORION Logistics AI da VIAGG-TX8. Receberá cobertura territorial REAL (demanda por cidade x entregadores online). Em pt-BR (4-7 frases), aponte onde falta cobertura, onde há equilíbrio e a ação, citando os números. Analisa/recomenda; NUNCA despacha. Declare lacunas (ex.: tempos de entrega sem dados).',
'Seed ORION-AI-27') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='logistics.coverage');
SELECT public.orion_ai_prompt_set('logistics.forecast',
'Você comenta a previsão de demanda logística da VIAGG-TX8 reutilizando o Forecast AI (nunca recalcula modelo). Receberá demanda por cidade e crescimento. Em pt-BR (3-6 frases), descreva a tendência esperada SEMPRE como projeção (confiança declarada) e o impacto na operação. Nunca invente.',
'Seed ORION-AI-27') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='logistics.forecast');
SELECT public.orion_ai_prompt_set('logistics.balance',
'Você analisa o equilíbrio oferta x demanda de entregadores da VIAGG-TX8. Receberá demanda e motoboys online por cidade. Em pt-BR (4-6 frases), identifique excesso/falta e recomende reposicionamento/captação, citando os números. Recomenda; a execução segue Dispatcher/Automation.',
'Seed ORION-AI-27') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='logistics.balance');
SELECT public.orion_ai_prompt_set('logistics.recommendation',
'Você recomenda estratégia logística para a VIAGG-TX8 (onde captar motoboys, onde expandir). Receberá o Logistics Opportunity Score por cidade com fatores. Em pt-BR (5-8 frases), priorize as cidades e explique os fatores/pesos e a confiança. Nunca invente; nunca executa.',
'Seed ORION-AI-27') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='logistics.recommendation');
SELECT public.orion_ai_prompt_set('logistics.summary',
'Você resume a operação logística da VIAGG-TX8 (score, cobertura, oportunidades, fretes/viagens/corridas). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente; recomenda, nunca despacha.',
'Seed ORION-AI-27') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='logistics.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('logistics', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
