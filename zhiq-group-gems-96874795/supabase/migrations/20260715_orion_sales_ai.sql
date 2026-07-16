-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-25 — SALES AI v1.0
--   O Centro Inteligente de Vendas da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-25). Enquanto o Marketing
-- AI (AI-23) ATRAI, o Sales AI CONVERTE interesse em venda: funil,
-- oportunidades pontuadas (Sales Opportunity Score 0-100), recuperação de
-- carrinho, conversão por categoria. Sempre ANALISA e RECOMENDA — nunca
-- executa/fecha venda automaticamente. Read-only. IA só via Gateway.
--
-- NÃO duplica Marketing (AI-23, atrai), Conversion (AI-09, atribuição) nem
-- Marketplace (AI-18, insights): o AI-25 é a camada de FUNIL + SCORE por
-- oportunidade, reutilizando as saídas deles + Trust + Personalization.
--
-- Fontes REAIS (read-only): advertiser_contact_intentions (leads:
-- pending_unlock = interesse ativo; unlock_paid_at = convertido),
-- store_carts (carrinhos), pay_payment_orders (compra), marketplace_product
-- _click_events (topo do funil), orion_trust_scores, orion_perso_profiles,
-- orion_market_insights.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_sales_opportunities CASCADE;
--   DROP FUNCTION public.sales_emit, sales_funnel, sales_generate,
--     sales_opportunities, sales_cart_recovery, sales_conversion, sales_score,
--     sales_metrics, sales_summary, sales_dashboard, orion_sales_tick CASCADE;
--   SELECT cron.unschedule('orion_sales_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'sales.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='sales';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELA: oportunidades pontuadas (Sales Opportunity Score)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_sales_opportunities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL,                 -- lead | carrinho
  ref            text NOT NULL,                 -- id da intenção / carrinho
  vertical       text,
  cidade         text,
  score          int NOT NULL DEFAULT 50,       -- Sales Opportunity Score 0-100
  fatores        jsonb NOT NULL DEFAULT '{}',   -- explicável (recência/demanda/conversão/engajamento)
  estagio        text NOT NULL DEFAULT 'interesse', -- interesse | negociacao | pronto_para_fechar
  valor_estimado numeric,
  modulos        jsonb NOT NULL DEFAULT '[]',
  motivo         text,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_sales_op_unico UNIQUE (tipo, ref, dia)
);
CREATE INDEX IF NOT EXISTS idx_oso_score ON public.orion_sales_opportunities (score DESC, dia DESC);
CREATE INDEX IF NOT EXISTS idx_oso_estagio ON public.orion_sales_opportunities (estagio, dia DESC);
COMMENT ON TABLE public.orion_sales_opportunities IS
  'ORION-AI-25: oportunidades de venda com Sales Opportunity Score (0-100) explicável, por dia. Recomenda; nunca fecha venda.';
ALTER TABLE public.orion_sales_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oso_admin ON public.orion_sales_opportunities;
CREATE POLICY oso_admin ON public.orion_sales_opportunities FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_sales_opportunities FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'sales_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- FUNIL DE VENDAS (read-only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_funnel()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (
    SELECT
      (SELECT count(DISTINCT coalesce(visitor_user_id::text, anon_id)) FROM marketplace_product_click_events WHERE created_at > now()-interval '30 days') visitantes,
      (SELECT count(*) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days') interesse,
      (SELECT count(*) FROM advertiser_contact_intentions WHERE status='pending_unlock') intencao_ativa,
      (SELECT count(*) FROM advertiser_contact_intentions WHERE unlock_paid_at IS NOT NULL AND created_at > now()-interval '30 days') convertido,
      (SELECT count(*) FROM pay_payment_orders WHERE status::text='paid' AND created_at > now()-interval '30 days') compra_paga
  )
  SELECT jsonb_build_object(
    'etapas', jsonb_build_object('visitantes', visitantes, 'interesse', interesse,
       'intencao_ativa', intencao_ativa, 'convertido', convertido, 'compra_paga', compra_paga),
    'taxa_visitante_para_interesse_pct', round(interesse*100.0/nullif(visitantes,0),1),
    'taxa_interesse_para_conversao_pct', round(convertido*100.0/nullif(interesse,0),1),
    'por_vertical', (SELECT coalesce(jsonb_agg(jsonb_build_object('vertical', listing_module,
        'interesse', tot, 'convertido', conv, 'taxa_pct', round(conv*100.0/nullif(tot,0),1)) ORDER BY tot DESC), '[]')
      FROM (SELECT listing_module, count(*) filter (where created_at > now()-interval '30 days') tot,
              count(*) filter (where unlock_paid_at IS NOT NULL and created_at > now()-interval '30 days') conv
            FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY 1) v),
    'origem', 'clicks→intenções→unlock→pagamento', 'modulos', jsonb_build_array('sales','marketplace','conversion','finance')
  ) FROM f;
$$;
GRANT EXECUTE ON FUNCTION public.sales_funnel() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR: pontua oportunidades (Sales Opportunity Score) — idempotente/dia
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_leads int := 0; v_carts int := 0; v_x int; v_ticket numeric;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT coalesce(nullif(round(avg(amount)),0), 80) INTO v_ticket FROM pay_payment_orders WHERE status::text='paid';

  -- LEADS: intenções ativas (pending_unlock) pontuadas
  WITH vert AS (
    SELECT listing_module,
      count(*) filter (where created_at > now()-interval '30 days') demanda,
      (count(*) filter (where unlock_paid_at IS NOT NULL))::numeric / nullif(count(*),0) conv
    FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY listing_module
  ), maxd AS (SELECT greatest(max(demanda),1) md FROM vert)
  INSERT INTO orion_sales_opportunities (tipo, ref, vertical, cidade, score, fatores, estagio, valor_estimado, modulos, motivo)
  SELECT 'lead', ref, vertical, cidade, sc,
    jsonb_build_object('recencia', round(recencia,2), 'demanda_vertical', round(demanda_norm,2),
                       'conversao_vertical', round(conv,2), 'engajamento', engaj),
    CASE WHEN sc>=70 THEN 'pronto_para_fechar' WHEN sc>=45 THEN 'negociacao' ELSE 'interesse' END,
    round(v_ticket * sc/100.0),
    jsonb_build_array('sales','marketplace','conversion','trust','personalization'),
    'Lead em '||coalesce(vertical,'?')||coalesce(' ('||cidade||')','')||': score '||sc||
      ' (recência '||round(recencia*100)||'%, demanda '||round(demanda_norm*100)||'%, conv vertical '||round(conv*100)||'%).'
  FROM (
    SELECT a.id::text ref, a.listing_module vertical, a.city cidade,
      round(40*recencia + 25*demanda_norm + 20*conv + 15*engaj) sc,
      recencia, demanda_norm, conv, engaj
    FROM (
      SELECT a.id, a.listing_module, a.city,
        (1 - least(extract(epoch FROM now()-a.created_at)/3600/168, 1)) recencia,
        (v.demanda::numeric / md) demanda_norm,
        coalesce(v.conv, 0.2) conv,
        CASE WHEN a.opened_at IS NOT NULL THEN 1.0 ELSE 0.5 END engaj
      FROM advertiser_contact_intentions a
      JOIN vert v ON v.listing_module = a.listing_module
      CROSS JOIN maxd
      WHERE a.status = 'pending_unlock'
    ) a
  ) y
  ON CONFLICT (tipo, ref, dia) DO UPDATE SET
    score=excluded.score, fatores=excluded.fatores, estagio=excluded.estagio,
    valor_estimado=excluded.valor_estimado, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  -- CARRINHOS não convertidos com itens (recuperação)
  INSERT INTO orion_sales_opportunities (tipo, ref, vertical, cidade, score, fatores, estagio, valor_estimado, modulos, motivo)
  SELECT 'carrinho', id::text, 'loja', NULL,
    least(85, 25 + coalesce(items_count,0)*10 + CASE WHEN coalesce(subtotal_amount,0)>0 THEN 20 ELSE 0 END),
    jsonb_build_object('itens', coalesce(items_count,0), 'subtotal', coalesce(subtotal_amount,0),
      'inatividade_h', round(extract(epoch FROM now()-coalesce(last_activity_at,created_at))/3600)),
    'negociacao', coalesce(subtotal_amount, 0),
    jsonb_build_array('sales','personalization'),
    'Carrinho aberto com '||coalesce(items_count,0)||' item(ns) — oportunidade de recuperação (lembrete/oferta).'
  FROM store_carts
  WHERE converted_at IS NULL AND coalesce(items_count,0) > 0
  ON CONFLICT (tipo, ref, dia) DO UPDATE SET
    score=excluded.score, fatores=excluded.fatores, valor_estimado=excluded.valor_estimado, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_carts = ROW_COUNT;

  PERFORM sales_emit('sales.pipeline', jsonb_build_object('leads', v_leads, 'carrinhos', v_carts));
  IF v_leads > 0 THEN PERFORM sales_emit('sales.opportunity', jsonb_build_object('leads_pontuados', v_leads)); END IF;
  RETURN jsonb_build_object('ok', true, 'leads', v_leads, 'carrinhos', v_carts);
END; $$;
GRANT EXECUTE ON FUNCTION public.sales_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_opportunities(p_limite int DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.score DESC), '[]')
  FROM (SELECT tipo, ref, vertical, cidade, score, fatores, estagio, valor_estimado, modulos, motivo
        FROM orion_sales_opportunities
        WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
        ORDER BY score DESC LIMIT least(p_limite,100)) o;
$$;
GRANT EXECUTE ON FUNCTION public.sales_opportunities(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_cart_recovery()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'carrinhos_abertos', (SELECT count(*) FROM store_carts WHERE converted_at IS NULL),
    'com_itens', (SELECT count(*) FROM store_carts WHERE converted_at IS NULL AND coalesce(items_count,0)>0),
    'valor_em_aberto', (SELECT coalesce(round(sum(subtotal_amount)),0) FROM store_carts WHERE converted_at IS NULL),
    'oportunidades', (SELECT sales_opportunities(50)),
    'nota', 'Recuperação = carrinho não convertido; carrinhos vazios não geram oportunidade (declarado).',
    'modulos', jsonb_build_array('sales','personalization'));
$$;
GRANT EXECUTE ON FUNCTION public.sales_cart_recovery() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_conversion()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_vertical', (SELECT coalesce(jsonb_agg(jsonb_build_object('vertical', listing_module, 'total', tot,
        'convertido', conv, 'taxa_pct', round(conv*100.0/nullif(tot,0),1)) ORDER BY tot DESC), '[]')
      FROM (SELECT listing_module, count(*) filter (where created_at > now()-interval '30 days') tot,
              count(*) filter (where unlock_paid_at IS NOT NULL and created_at > now()-interval '30 days') conv
            FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY 1) v),
    'por_cidade', (SELECT coalesce(jsonb_object_agg(city, taxa), '{}')
      FROM (SELECT city, round((count(*) filter (where unlock_paid_at IS NOT NULL))*100.0/nullif(count(*),0)) taxa
            FROM advertiser_contact_intentions WHERE city IS NOT NULL AND created_at > now()-interval '30 days' GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) c),
    'modulos', jsonb_build_array('sales','conversion','pricing'));
$$;
GRANT EXECUTE ON FUNCTION public.sales_conversion() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_hot int; v_conv numeric; v_pipe numeric; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) FILTER (WHERE score>=70) INTO v_hot FROM orion_sales_opportunities WHERE dia=v_hoje;
  SELECT coalesce(sum(valor_estimado),0) INTO v_pipe FROM orion_sales_opportunities WHERE dia=v_hoje;
  SELECT round((count(*) filter (where unlock_paid_at IS NOT NULL))*100.0/nullif(count(*),0),1) INTO v_conv
    FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days';
  comp := jsonb_build_object(
    'pipeline', least(100, (SELECT count(*) FROM orion_sales_opportunities WHERE dia=v_hoje) * 5),
    'leads_quentes', least(100, v_hot*15),
    'conversao', coalesce(v_conv, 0),
    'cobertura', CASE WHEN (SELECT count(*) FROM orion_sales_opportunities WHERE dia=v_hoje) > 0 THEN 100 ELSE 40 END);
  RETURN jsonb_build_object(
    'sales_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'leads_quentes', v_hot, 'valor_pipeline', v_pipe, 'conversao_30d_pct', v_conv,
    'formula', 'pipeline+leads_quentes+conversao+cobertura — Sales Opportunity Score prioriza; recomenda, nunca fecha venda');
END; $$;
GRANT EXECUTE ON FUNCTION public.sales_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'oportunidades', (SELECT count(*) FROM orion_sales_opportunities WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'por_estagio', (SELECT coalesce(jsonb_object_agg(estagio, n), '{}') FROM (SELECT estagio, count(*) n FROM orion_sales_opportunities WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date GROUP BY 1) e),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(tipo, n), '{}') FROM (SELECT tipo, count(*) n FROM orion_sales_opportunities WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date GROUP BY 1) t),
    'leads_ativos', (SELECT count(*) FROM advertiser_contact_intentions WHERE status='pending_unlock'));
$$;
GRANT EXECUTE ON FUNCTION public.sales_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', sales_score(), 'funil', sales_funnel(), 'conversao', sales_conversion(),
    'oportunidades', sales_opportunities(15),
    'prompt_keys', jsonb_build_array('sales.opportunity','sales.pipeline','sales.conversion','sales.recovery','sales.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sales_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('sales_dashboard_consultado',
    'sales_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', sales_score(),
    'funil', sales_funnel(),
    'oportunidades', sales_opportunities(30),
    'conversao', sales_conversion(),
    'recuperacao', sales_cart_recovery(),
    'metrics', sales_metrics(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sales_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_sales_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sales_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_sales_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_sales_tick', '43 * * * *', 'SELECT public.orion_sales_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('sales.opportunity',
'Você é o ORION Sales AI da VIAGG-TX8. Receberá oportunidades com Sales Opportunity Score (0-100), fatores (recência/demanda/conversão/engajamento), estágio e valor estimado. Em pt-BR (5-8 frases), priorize as oportunidades mais quentes e recomende a abordagem comercial, citando o score e os fatores. Recomenda; nunca fecha venda automaticamente.',
'Seed ORION-AI-25') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sales.opportunity');
SELECT public.orion_ai_prompt_set('sales.pipeline',
'Você analisa o funil de vendas da VIAGG-TX8. Receberá as etapas (visitantes→interesse→intenção→conversão→compra) e taxas. Em pt-BR (4-7 frases), aponte onde está o gargalo e o que fazer para destravar, citando os números. Só o JSON; sem inventar.',
'Seed ORION-AI-25') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sales.pipeline');
SELECT public.orion_ai_prompt_set('sales.conversion',
'Você analisa conversão comercial da VIAGG-TX8 por categoria/cidade. Receberá taxas reais. Em pt-BR (4-6 frases), diga onde a conversão é melhor/pior e a ação para elevar, citando os números. Nunca invente.',
'Seed ORION-AI-25') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sales.conversion');
SELECT public.orion_ai_prompt_set('sales.recovery',
'Você recomenda recuperação de oportunidades da VIAGG-TX8 (carrinhos abertos, leads sem fechar). Receberá os dados. Em pt-BR (3-6 frases), sugira ações de recuperação (lembrete, oferta, contato), citando itens/valor. Recomenda, não executa; declare quando não há carrinhos com itens.',
'Seed ORION-AI-25') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sales.recovery');
SELECT public.orion_ai_prompt_set('sales.summary',
'Você resume o desempenho comercial da VIAGG-TX8 (pipeline, leads quentes, conversão, funil). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente; recomenda, nunca fecha venda.',
'Seed ORION-AI-25') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='sales.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('sales', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
