-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-09 — CONVERSION & ATTRIBUTION AI v2.0 (Revenue Intelligence)
--
-- Fecha o ciclo publicidade→receita: espinha de TOUCHPOINTS
-- (jornada), 5 modelos de atribuição comparáveis, funil real,
-- CAC/LTV/ROI com fontes citadas. REGRAS ABSOLUTAS: nunca recalcula
-- financeiro (lê pay_* e promotion_purchases como fontes), nunca
-- altera ledger/pagamentos — apenas observa, correlaciona e atribui.
-- HONESTIDADE: cliques reais dependem de instrumentação no front
-- (conversion_track já pronto p/ adoção); receita sem touchpoint de
-- campanha é atribuída a "organico_direto" — nunca inventado.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_touchpoints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid,
  session_id     text,
  trace_id       uuid,
  correlation_id text,
  tipo           text NOT NULL,   -- view|clique|cadastro|contato|pedido|pagamento|entrega|avaliacao|publicacao
  origem         text NOT NULL DEFAULT 'organico_direto', -- campanha|publicacao_grupo|organico_direto|harvest
  campanha_id    uuid,
  pacote_id      uuid,
  listing_id     uuid,
  publisher_ref  text,
  cidade         text,
  canal          text,
  categoria      text,
  valor          numeric(12,2),
  dados          jsonb DEFAULT '{}'::jsonb,
  chave          text UNIQUE,     -- idempotência do harvest
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_user ON public.orion_touchpoints (user_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_otp_tipo ON public.orion_touchpoints (tipo);
ALTER TABLE public.orion_touchpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS otp_admin ON public.orion_touchpoints;
CREATE POLICY otp_admin ON public.orion_touchpoints
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_touchpoints FROM authenticated, anon;

-- Porta de rastreio (front/edges adotam incrementalmente)
CREATE OR REPLACE FUNCTION public.conversion_track(
  p_tipo text, p_origem text DEFAULT 'organico_direto',
  p_campanha uuid DEFAULT NULL, p_pacote uuid DEFAULT NULL, p_listing uuid DEFAULT NULL,
  p_cidade text DEFAULT NULL, p_canal text DEFAULT NULL, p_categoria text DEFAULT NULL,
  p_valor numeric DEFAULT NULL, p_session text DEFAULT NULL, p_trace uuid DEFAULT NULL,
  p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  -- qualquer usuário autenticado pode registrar a PRÓPRIA jornada
  INSERT INTO orion_touchpoints (user_id, tipo, origem, campanha_id, pacote_id, listing_id,
    cidade, canal, categoria, valor, session_id, trace_id, dados)
  VALUES (auth.uid(), p_tipo, p_origem, p_campanha, p_pacote, p_listing,
    p_cidade, p_canal, p_categoria, p_valor, p_session, p_trace, p_dados)
  RETURNING id INTO v;
  RETURN v;
END; $$;
GRANT EXECUTE ON FUNCTION public.conversion_track(text, text, uuid, uuid, uuid, text, text, text, numeric, text, uuid, jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- HARVEST: deriva touchpoints do que JÁ existe (idempotente por chave)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conversion_harvest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n1 int; n2 int; n3 int; n4 int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- pagamentos (receita real; fonte: pay_payment_orders — NUNCA recalculada)
  INSERT INTO orion_touchpoints (user_id, tipo, origem, valor, categoria, criado_em, chave, dados)
  SELECT payer_owner_id, 'pagamento', 'harvest', amount, product_type, paid_at,
         'pay:'||id, jsonb_build_object('order_id', id)
  FROM pay_payment_orders WHERE status='paid' AND paid_at IS NOT NULL
  ON CONFLICT (chave) DO NOTHING;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- cadastros
  INSERT INTO orion_touchpoints (user_id, tipo, origem, criado_em, chave)
  SELECT id, 'cadastro', 'harvest', created_at, 'user:'||id FROM auth.users
  ON CONFLICT (chave) DO NOTHING;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  -- publicações confirmadas em grupos (exposição real; Dispatcher)
  INSERT INTO orion_touchpoints (tipo, origem, campanha_id, pacote_id, listing_id,
    cidade, canal, criado_em, chave)
  SELECT 'publicacao', 'publicacao_grupo', campanha_id, pacote_id, listing_id,
    cidade, canal, confirmada_em, 'disp:'||id
  FROM orion_dispatch_queue WHERE status='confirmada'
  ON CONFLICT (chave) DO NOTHING;
  GET DIAGNOSTICS n3 = ROW_COUNT;

  -- contatos em anúncios (conversão de interesse), se a tabela existir
  n4 := 0;
  IF to_regclass('public.contact_intentions') IS NOT NULL THEN
    EXECUTE $h$INSERT INTO orion_touchpoints (user_id, tipo, origem, listing_id, criado_em, chave)
      SELECT user_id, 'contato', 'harvest', listing_id, created_at, 'ci:'||id
      FROM contact_intentions ON CONFLICT (chave) DO NOTHING$h$;
    GET DIAGNOSTICS n4 = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pagamentos', n1, 'cadastros', n2,
    'publicacoes', n3, 'contatos', n4,
    'total', (SELECT count(*) FROM orion_touchpoints));
END; $$;
GRANT EXECUTE ON FUNCTION public.conversion_harvest() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- ATRIBUIÇÃO: 5 modelos comparáveis (janela 30d por pagamento)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conversion_attribution(p_modelo text DEFAULT 'last_click')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pg RECORD; tp RECORD; v_alloc jsonb := '{}'::jsonb;
  v_n int; v_i int; v_peso numeric; v_soma numeric; v_key text;
  v_total numeric := 0; v_atribuida numeric := 0;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  IF p_modelo NOT IN ('first_click','last_click','linear','time_decay','data_driven') THEN
    RAISE EXCEPTION 'Modelo inválido: %', p_modelo;
  END IF;

  FOR pg IN SELECT * FROM orion_touchpoints WHERE tipo='pagamento' AND valor IS NOT NULL LOOP
    v_total := v_total + pg.valor;
    -- touchpoints de mídia do MESMO usuário nos 30d anteriores
    SELECT count(*) INTO v_n FROM orion_touchpoints t
     WHERE t.user_id = pg.user_id AND t.tipo IN ('view','clique','publicacao','contato')
       AND t.campanha_id IS NOT NULL
       AND t.criado_em BETWEEN pg.criado_em - interval '30 days' AND pg.criado_em;
    IF v_n = 0 THEN
      v_key := 'organico_direto';
      v_alloc := jsonb_set(v_alloc, ARRAY[v_key],
        to_jsonb(coalesce((v_alloc->>v_key)::numeric,0) + pg.valor));
      CONTINUE;
    END IF;

    v_atribuida := v_atribuida + pg.valor;
    v_i := 0;
    -- soma de pesos p/ time_decay e data_driven
    SELECT CASE p_modelo
      WHEN 'time_decay' THEN sum(exp(-extract(epoch FROM pg.criado_em - t.criado_em)/86400/7))
      WHEN 'data_driven' THEN sum(CASE t.tipo WHEN 'clique' THEN 3 WHEN 'contato' THEN 4
                                              WHEN 'publicacao' THEN 2 ELSE 1 END)
      ELSE NULL END INTO v_soma
    FROM orion_touchpoints t
    WHERE t.user_id = pg.user_id AND t.tipo IN ('view','clique','publicacao','contato')
      AND t.campanha_id IS NOT NULL
      AND t.criado_em BETWEEN pg.criado_em - interval '30 days' AND pg.criado_em;

    FOR tp IN SELECT * FROM orion_touchpoints t
      WHERE t.user_id = pg.user_id AND t.tipo IN ('view','clique','publicacao','contato')
        AND t.campanha_id IS NOT NULL
        AND t.criado_em BETWEEN pg.criado_em - interval '30 days' AND pg.criado_em
      ORDER BY t.criado_em LOOP
      v_i := v_i + 1;
      v_peso := CASE p_modelo
        WHEN 'first_click' THEN CASE WHEN v_i = 1 THEN 1 ELSE 0 END
        WHEN 'last_click'  THEN CASE WHEN v_i = v_n THEN 1 ELSE 0 END
        WHEN 'linear'      THEN 1.0 / v_n
        WHEN 'time_decay'  THEN exp(-extract(epoch FROM pg.criado_em - tp.criado_em)/86400/7) / v_soma
        WHEN 'data_driven' THEN (CASE tp.tipo WHEN 'clique' THEN 3 WHEN 'contato' THEN 4
                                              WHEN 'publicacao' THEN 2 ELSE 1 END) / v_soma
      END;
      IF v_peso > 0 THEN
        v_key := 'campanha:'||tp.campanha_id;
        v_alloc := jsonb_set(v_alloc, ARRAY[v_key],
          to_jsonb(round(coalesce((v_alloc->>v_key)::numeric,0) + pg.valor * v_peso, 2)));
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('modelo', p_modelo, 'alocacao', v_alloc,
    'receita_total', v_total, 'receita_atribuida_campanhas', v_atribuida,
    'receita_organica_direta', v_total - v_atribuida,
    'janela', '30 dias antes do pagamento',
    'nota', 'data_driven v1 = pesos por tipo de toque (heurística declarada); calibra com histórico');
END; $$;
GRANT EXECUTE ON FUNCTION public.conversion_attribution(text) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- APIs de métricas (fontes citadas; nada financeiro recalculado)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conversion_funnel()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'views',      (SELECT coalesce(sum(views),0) FROM publication_metrics),
    'cliques',    (SELECT coalesce(sum(cliques),0) FROM publication_metrics),
    'publicacoes',(SELECT count(*) FROM orion_touchpoints WHERE tipo='publicacao'),
    'cadastros',  (SELECT count(*) FROM orion_touchpoints WHERE tipo='cadastro'),
    'contatos',   (SELECT count(*) FROM orion_touchpoints WHERE tipo='contato'),
    'pedidos',    (SELECT count(*) FROM pay_payment_orders),
    'pagamentos', (SELECT count(*) FROM pay_payment_orders WHERE status='paid'),
    'receita',    (SELECT coalesce(sum(amount),0) FROM pay_payment_orders WHERE status='paid'),
    'fontes', 'publication_metrics + orion_touchpoints + pay_payment_orders (leitura)',
    'nota', 'views/cliques dependem do GLM registrar métricas (AI-08) — zeros são honestos');
$$;
GRANT EXECUTE ON FUNCTION public.conversion_funnel() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_cac()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'investimento_promocao_90d', (SELECT coalesce(sum(amount_brl),0) FROM promotion_purchases
      WHERE status IN ('paid','approved') AND created_at > now()-interval '90 days'),
    'novos_usuarios_90d', (SELECT count(*) FROM auth.users WHERE created_at > now()-interval '90 days'),
    'cac_proxy', CASE WHEN (SELECT count(*) FROM auth.users WHERE created_at > now()-interval '90 days') > 0
      THEN round((SELECT coalesce(sum(amount_brl),0) FROM promotion_purchases
        WHERE status IN ('paid','approved') AND created_at > now()-interval '90 days')
        / (SELECT count(*) FROM auth.users WHERE created_at > now()-interval '90 days'), 2)
      ELSE NULL END,
    'fonte', 'promotion_purchases (gasto) ÷ novos usuários (proxy declarado — sem mídia externa rastreada)',
    'confianca', 'baixa até instrumentar cliques por campanha');
$$;
GRANT EXECUTE ON FUNCTION public.conversion_cac() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_ltv()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'ltv_medio', (SELECT round(coalesce(avg(total),0),2) FROM (
      SELECT payer_owner_id, sum(amount) total FROM pay_payment_orders
      WHERE status='paid' GROUP BY 1) t),
    'ticket_medio', (SELECT round(coalesce(avg(amount),0),2) FROM pay_payment_orders WHERE status='paid'),
    'recompra_pct', (SELECT round(count(*) FILTER (WHERE n>1)*100.0/nullif(count(*),0),1) FROM (
      SELECT payer_owner_id, count(*) n FROM pay_payment_orders WHERE status='paid' GROUP BY 1) r),
    'lifetime_medio_dias', (SELECT round(coalesce(avg(extract(epoch FROM ult-pri)/86400),0),1) FROM (
      SELECT payer_owner_id, min(paid_at) pri, max(paid_at) ult FROM pay_payment_orders
      WHERE status='paid' GROUP BY 1 HAVING count(*)>1) l),
    'pagadores', (SELECT count(DISTINCT payer_owner_id) FROM pay_payment_orders WHERE status='paid'),
    'fonte', 'pay_payment_orders (leitura pura)');
$$;
GRANT EXECUTE ON FUNCTION public.conversion_ltv() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_roi()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE attr jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  attr := conversion_attribution('last_click');
  RETURN jsonb_build_object(
    'receita_total', attr->>'receita_total',
    'receita_atribuida_campanhas', attr->>'receita_atribuida_campanhas',
    'receita_organica_direta', attr->>'receita_organica_direta',
    'investimento_divulgacao', (SELECT coalesce(sum(amount_brl),0) FROM promotion_purchases
      WHERE status IN ('paid','approved')),
    'roi_campanhas', CASE WHEN (SELECT coalesce(sum(amount_brl),0) FROM promotion_purchases
        WHERE status IN ('paid','approved')) > 0
      THEN round(((attr->>'receita_atribuida_campanhas')::numeric
        - (SELECT sum(amount_brl) FROM promotion_purchases WHERE status IN ('paid','approved')))
        * 100 / (SELECT sum(amount_brl) FROM promotion_purchases WHERE status IN ('paid','approved')), 1)
      ELSE NULL END,
    'nota', 'ROI só é calculado quando há investimento pago registrado — nunca inventado',
    'modelo_padrao', 'last_click (compare os 5 em conversion_attribution)');
END; $$;
GRANT EXECUTE ON FUNCTION public.conversion_roi() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_city()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'cidade', g.cidade, 'uf', g.uf, 'growth_score', g.score,
    'publicacoes', (SELECT count(*) FROM orion_touchpoints t WHERE t.tipo='publicacao'
      AND public.orion_norm(coalesce(t.cidade,'')) = public.orion_norm(g.cidade)),
    'contatos', (SELECT count(*) FROM orion_touchpoints t2 WHERE t2.tipo='contato'
      AND public.orion_norm(coalesce(t2.cidade,'')) = public.orion_norm(g.cidade)),
    'nota_receita', 'receita por cidade via atribuição de campanha (ordens não carregam cidade)'
    ) ORDER BY g.score DESC), '[]')
  FROM orion_growth_scores g;
$$;
GRANT EXECUTE ON FUNCTION public.conversion_city() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_campaign()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'campanha', c.nome, 'cidade', c.cidade, 'status', c.status,
    'publicacoes', (SELECT count(*) FROM orion_touchpoints t
      WHERE t.campanha_id = c.id AND t.tipo='publicacao'),
    'metricas', c.metricas,
    'orcamento_previsto', c.plano->'orcamento_previsto'->>'preco_brl') ORDER BY c.criado_em DESC), '[]')
  FROM (SELECT * FROM orion_campanhas ORDER BY criado_em DESC LIMIT 15) c;
$$;
GRANT EXECUTE ON FUNCTION public.conversion_campaign() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'funil', conversion_funnel(), 'roi', conversion_roi(),
    'cac', conversion_cac(), 'ltv', conversion_ltv(),
    'prompt_keys', jsonb_build_array('conversion.executive','conversion.roi',
      'conversion.funnel','conversion.city','conversion.campaign'));
END; $$;
GRANT EXECUTE ON FUNCTION public.conversion_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_ai()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  -- contexto pronto p/ o painel enviar ao Gateway (SQL não chama IA)
  RETURN jsonb_build_object(
    'contexto', conversion_summary(),
    'comparacao_modelos', jsonb_build_object(
      'first_click', conversion_attribution('first_click')->'alocacao',
      'last_click', conversion_attribution('last_click')->'alocacao',
      'linear', conversion_attribution('linear')->'alocacao',
      'time_decay', conversion_attribution('time_decay')->'alocacao',
      'data_driven', conversion_attribution('data_driven')->'alocacao'));
END; $$;
GRANT EXECUTE ON FUNCTION public.conversion_ai() TO authenticated;

CREATE OR REPLACE FUNCTION public.conversion_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('conversion_dashboard_consultado',
      'conversion_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'funil', conversion_funnel(),
    'roi', conversion_roi(),
    'cac', conversion_cac(),
    'ltv', conversion_ltv(),
    'cidades', conversion_city(),
    'campanhas', conversion_campaign(),
    'touchpoints_total', (SELECT count(*) FROM orion_touchpoints),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.conversion_dashboard() TO authenticated;

-- Tick: harvest contínuo
CREATE OR REPLACE FUNCTION public.orion_conversion_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM conversion_harvest();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_conversion_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_conversion_tick', '7 * * * *', 'SELECT public.orion_conversion_tick()');
END $$;

-- Prompts oficiais (5)
SELECT public.orion_ai_prompt_set('conversion.executive',
'Você é o Revenue Intelligence da VIAGG-TX8 (Conversion & Attribution AI). Receberá funil, ROI, CAC, LTV e atribuição REAIS com fontes citadas. Responda em pt-BR (5-9 frases): de onde vem a receita, o que converte, onde investir/parar, sempre citando os números e as fontes do JSON. Dados proxy/indisponíveis devem ser declarados como tal. Termine com confiança.',
'Seed ORION-AI-09') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='conversion.executive');
SELECT public.orion_ai_prompt_set('conversion.roi',
'Você analisa ROI de divulgação da VIAGG-TX8. Receberá receita atribuída por modelo, investimento real e ROI. Explique em pt-BR (4-7 frases) o retorno, a diferença entre modelos de atribuição e a decisão recomendada. Se ROI for nulo por falta de investimento registrado, diga exatamente isso.',
'Seed ORION-AI-09') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='conversion.roi');
SELECT public.orion_ai_prompt_set('conversion.funnel',
'Você analisa o funil da VIAGG-TX8 (views→cliques→cadastros→contatos→pedidos→pagamentos→receita). Aponte em pt-BR (4-7 frases) onde o funil vaza, com os números do JSON; zeros por falta de instrumentação devem ser tratados como lacuna de medição, não como fracasso.',
'Seed ORION-AI-09') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='conversion.funnel');
SELECT public.orion_ai_prompt_set('conversion.city',
'Você analisa conversão por cidade da VIAGG-TX8 (growth score, publicações, contatos). Recomende em pt-BR (4-7 frases) onde concentrar esforço comercial, citando os dados; declare que receita por cidade depende de atribuição de campanha.',
'Seed ORION-AI-09') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='conversion.city');
SELECT public.orion_ai_prompt_set('conversion.campaign',
'Você analisa campanhas da VIAGG-TX8 (publicações, métricas, orçamento). Recomende em pt-BR (4-7 frases) quais campanhas aumentar/pausar com base nos dados do JSON; sem métricas suficientes, recomende o teste mínimo necessário em vez de inventar resultado.',
'Seed ORION-AI-09') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='conversion.campaign');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('conversion', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
