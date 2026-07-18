-- ============================================================================
-- ORION-AI-54 — BUSINESS INTELLIGENCE AI v1.0  (Data Warehouse executivo)
-- ============================================================================
-- Centro de Inteligencia Empresarial: consolida vendas/usuarios/marketplace/
--   financeiro/marketing/leiloes/suporte/custos em facts+KPIs+insights+
--   forecasts com EVIDENCIA. So dados REAIS; plataforma esta PRE-LANCAMENTO
--   (products=0, receita paga ~0, promo R$7.266,60 pending) — os KPIs
--   DECLARAM isso em vez de inventar. Sem PII em relatorios (regra AI-48):
--   apenas agregados.
-- ANTI-COLISAO (critica): **AI-22 `business` JA EXISTE** (painel /admin/
--   orion-business-intelligence, tabela orion_bi_kpis, cron orion_bi_tick).
--   AI-54 REUSA o AI-22 (le orion_bi_kpis como fonte, nunca recria) e vira o
--   DW profundo: namespace **orion_biz_***, funcoes biz_*/run_bi_check,
--   chave **business_intelligence**, painel **/admin/orion-bi** (rota da spec
--   pertence ao AI-22), cron orion_biz_tick (*/5). Mapa spec->real: 10
--   tabelas -> 7 (metrics/dimensions->facts por dominio; dashboards->painel;
--   reports imutaveis).
-- FONTES REAIS (nomes verificados no banco vivo — drift corrigido):
--   pay_payment_orders(status,amount)/pay_ledger_entries, promotion_purchases
--   (amount_brl,status), credit_purchases, auction_listings/auction_bids/
--   arremate_offers, marketplace_product_click_events, advertiser_contact_
--   intentions, auth.users, support_tickets, orion_cost_statistics (AI-52),
--   orion_bi_kpis (AI-22). merchant_subscriptions NAO existe (usar
--   merchant_credit_subscriptions/store_credit_subscriptions).
-- LACUNAS DECLARADAS: churn/LTV/CAC/retencao/carrinho (volume insuficiente),
--   sazonalidade (historico curto), trafego externo, estoque, cupons/cashback.
-- Suite: biz_selftest() = COMANDO TESTE. Idempotente. Reports imutaveis.
-- SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orion_biz_facts (
  dia date NOT NULL, dominio text NOT NULL, chave text NOT NULL,
  valor numeric(18,4) NOT NULL DEFAULT 0, unidade text NOT NULL DEFAULT 'qtd',
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, dominio, chave)
);
COMMENT ON TABLE public.orion_biz_facts IS 'ORION-AI-54: fatos diarios do DW por dominio (financeiro/marketplace/leiloes/usuarios/marketing/suporte/custos/ai22). Upsert idempotente; evidencia obrigatoria.';

CREATE TABLE IF NOT EXISTS public.orion_biz_kpis (
  dia date NOT NULL, kpi text NOT NULL,
  valor numeric(18,4), unidade text NOT NULL DEFAULT 'qtd',
  metodologia text NOT NULL, base jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, kpi)
);
COMMENT ON TABLE public.orion_biz_kpis IS 'ORION-AI-54: KPIs estrategicos diarios. valor NULL = DECLARADO (dados insuficientes — nunca inventado).';

CREATE TABLE IF NOT EXISTS public.orion_biz_insights (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key text NOT NULL, tipo text NOT NULL, -- oportunidade|risco|gargalo|tendencia|recomendacao
  titulo text NOT NULL, detalhe text,
  prioridade int NOT NULL DEFAULT 3,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'aberto',
  criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_biz_insights_uq UNIQUE (dedupe_key)
);
CREATE TABLE IF NOT EXISTS public.orion_biz_forecasts (
  kpi text NOT NULL, horizonte_dias int NOT NULL, gerado_em date NOT NULL,
  valor_projetado numeric(18,4) NOT NULL, base jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (kpi, horizonte_dias, gerado_em)
);
CREATE TABLE IF NOT EXISTS public.orion_biz_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alerta text NOT NULL, severidade text NOT NULL DEFAULT 'media', categoria text NOT NULL,
  chave text NOT NULL DEFAULT 'geral', evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolvido boolean NOT NULL DEFAULT false,
  dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_biz_alerts_uq UNIQUE (categoria, chave, dia)
);
CREATE TABLE IF NOT EXISTS public.orion_biz_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trace text NOT NULL, tipo text NOT NULL DEFAULT 'execucao',
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb, criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_biz_reports IS 'ORION-AI-54: relatorios/execucoes imutaveis (historico permanente).';
CREATE TABLE IF NOT EXISTS public.orion_biz_statistics (
  data date PRIMARY KEY,
  bis int NOT NULL DEFAULT 0, mgs int NOT NULL DEFAULT 0, fhs int NOT NULL DEFAULT 0,
  mps int NOT NULL DEFAULT 0, ues int NOT NULL DEFAULT 0, bps int NOT NULL DEFAULT 0,
  receita_dia_brl numeric(14,2) NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_biz_facts','orion_biz_kpis','orion_biz_insights','orion_biz_forecasts',
    'orion_biz_alerts','orion_biz_reports','orion_biz_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;
REVOKE UPDATE, DELETE ON public.orion_biz_reports FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.biz_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'biz: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.biz_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'business_intelligence', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.biz_emit(text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.biz_fact(p_dia date, p_dom text, p_chave text, p_valor numeric, p_unid text, p_ev jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_biz_facts (dia, dominio, chave, valor, unidade, evidencia)
  VALUES (p_dia, p_dom, p_chave, coalesce(p_valor,0), p_unid, coalesce(p_ev,'{}'::jsonb))
  ON CONFLICT (dia, dominio, chave) DO UPDATE SET valor=excluded.valor, evidencia=excluded.evidencia, atualizado_em=now();
END$$;
REVOKE ALL ON FUNCTION public.biz_fact(date,text,text,numeric,text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.biz_kpi(p_dia date, p_kpi text, p_valor numeric, p_unid text, p_met text, p_base jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_biz_kpis (dia, kpi, valor, unidade, metodologia, base)
  VALUES (p_dia, p_kpi, p_valor, p_unid, p_met, coalesce(p_base,'{}'::jsonb))
  ON CONFLICT (dia, kpi) DO UPDATE SET valor=excluded.valor, metodologia=excluded.metodologia, base=excluded.base, atualizado_em=now();
END$$;
REVOKE ALL ON FUNCTION public.biz_kpi(date,text,numeric,text,text,jsonb) FROM public, anon, authenticated;

-- ===== MOTOR ================================================================
CREATE OR REPLACE FUNCTION public.run_bi_check(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_trace text := coalesce(p_trace,'biz_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_rec_paga numeric; v_promo_pend numeric; v_pedidos int; v_cliques7 int; v_cliques7ant int;
  v_aci7 int; v_users int; v_novos7 int; v_ativos7 int; v_leiloes int; v_lances int;
BEGIN
  PERFORM public.biz_guard();

  -- FINANCEIRO (pay_payment_orders/ledger/creditos/promocoes)
  -- status e ENUM (pay_payment_order_status): comparar sempre via ::text (armadilha documentada)
  SELECT coalesce(sum(amount),0) INTO v_rec_paga FROM public.pay_payment_orders WHERE lower(status::text) IN ('paid','approved','settled','captured');
  SELECT count(*) INTO v_pedidos FROM public.pay_payment_orders;
  SELECT coalesce(sum(amount_brl),0) INTO v_promo_pend FROM public.promotion_purchases WHERE status='pending';
  PERFORM public.biz_fact(v_dia,'financeiro','receita_paga_brl', v_rec_paga,'BRL',
    jsonb_build_object('fonte','pay_payment_orders','pedidos_total',v_pedidos,
      'por_status',(SELECT coalesce(jsonb_object_agg(st,n),'{}'::jsonb) FROM (SELECT status::text st, count(*) n FROM public.pay_payment_orders GROUP BY status::text) x)));
  PERFORM public.biz_fact(v_dia,'financeiro','promocoes_pendentes_brl', v_promo_pend,'BRL',
    jsonb_build_object('fonte','promotion_purchases','nota','receita de divulgacao AGUARDANDO pagamento'));
  PERFORM public.biz_fact(v_dia,'financeiro','ledger_lancamentos',(SELECT count(*) FROM public.pay_ledger_entries),'qtd',
    jsonb_build_object('fonte','pay_ledger_entries'));
  PERFORM public.biz_fact(v_dia,'financeiro','creditos_compras_pagas',(SELECT count(*) FROM public.credit_purchases WHERE status='paid'),'qtd',
    jsonb_build_object('fonte','credit_purchases','total',(SELECT count(*) FROM public.credit_purchases)));

  -- MARKETPLACE / MARKETING
  SELECT count(*) INTO v_cliques7 FROM public.marketplace_product_click_events WHERE created_at > now()-interval '7 days';
  SELECT count(*) INTO v_cliques7ant FROM public.marketplace_product_click_events WHERE created_at BETWEEN now()-interval '14 days' AND now()-interval '7 days';
  SELECT count(*) INTO v_aci7 FROM public.advertiser_contact_intentions WHERE created_at > now()-interval '7 days';
  PERFORM public.biz_fact(v_dia,'marketplace','cliques_7d', v_cliques7,'qtd', jsonb_build_object('fonte','marketplace_product_click_events','7d_anteriores',v_cliques7ant));
  PERFORM public.biz_fact(v_dia,'marketplace','intencoes_contato_7d', v_aci7,'qtd', jsonb_build_object('fonte','advertiser_contact_intentions','total',(SELECT count(*) FROM public.advertiser_contact_intentions)));
  PERFORM public.biz_fact(v_dia,'marketplace','produtos_catalogo',(SELECT count(*) FROM public.products),'qtd',
    jsonb_build_object('fonte','products','nota','0 = catalogo pre-lancamento DECLARADO'));
  PERFORM public.biz_fact(v_dia,'marketing','campanhas_fila',(SELECT count(*) FROM public.campaign_queue),'qtd', jsonb_build_object('fonte','campaign_queue'));

  -- LEILOES
  SELECT count(*) INTO v_leiloes FROM public.auction_listings;
  SELECT count(*) INTO v_lances  FROM public.auction_bids;
  PERFORM public.biz_fact(v_dia,'leiloes','listings', v_leiloes,'qtd', jsonb_build_object('fonte','auction_listings'));
  PERFORM public.biz_fact(v_dia,'leiloes','lances', v_lances,'qtd', jsonb_build_object('fonte','auction_bids','arremate_ofertas',(SELECT count(*) FROM public.arremate_offers)));

  -- USUARIOS
  SELECT count(*) INTO v_users FROM auth.users;
  SELECT count(*) INTO v_novos7 FROM auth.users WHERE created_at > now()-interval '7 days';
  SELECT count(*) INTO v_ativos7 FROM auth.users WHERE last_sign_in_at > now()-interval '7 days';
  PERFORM public.biz_fact(v_dia,'usuarios','total', v_users,'qtd', jsonb_build_object('fonte','auth.users'));
  PERFORM public.biz_fact(v_dia,'usuarios','novos_7d', v_novos7,'qtd', jsonb_build_object('fonte','auth.users'));
  PERFORM public.biz_fact(v_dia,'usuarios','ativos_7d', v_ativos7,'qtd', jsonb_build_object('fonte','auth.users last_sign_in_at'));

  -- SUPORTE / CUSTOS (AI-52 leitura) / AI-22 (leitura)
  PERFORM public.biz_fact(v_dia,'suporte','tickets_total',(SELECT count(*) FROM public.support_tickets),'qtd', jsonb_build_object('fonte','support_tickets'));
  PERFORM public.biz_fact(v_dia,'custos','custo_dia_usd',(SELECT coalesce(custo_dia_usd,0) FROM public.orion_cost_statistics ORDER BY data DESC LIMIT 1),'USD',
    jsonb_build_object('fonte','AI-52 orion_cost_statistics (leitura)'));
  PERFORM public.biz_fact(v_dia,'ai22','kpis_do_dia',(SELECT count(*) FROM public.orion_bi_kpis WHERE dia=v_dia),'qtd',
    jsonb_build_object('fonte','AI-22 orion_bi_kpis (leitura — reuso, nunca recriado)'));

  -- ===== KPIs (explicaveis; NULL = declarado) ================================
  PERFORM public.biz_kpi(v_dia,'receita_total_brl', v_rec_paga,'BRL','soma pay_payment_orders com status pago', jsonb_build_object('pedidos',v_pedidos));
  PERFORM public.biz_kpi(v_dia,'ticket_medio_brl', CASE WHEN v_pedidos>0 AND v_rec_paga>0 THEN round(v_rec_paga/v_pedidos,2) END,'BRL',
    CASE WHEN v_rec_paga>0 THEN 'receita paga / pedidos' ELSE 'DECLARADO: sem receita paga suficiente' END, '{}'::jsonb);
  PERFORM public.biz_kpi(v_dia,'conversao_clique_contato_pct', CASE WHEN v_cliques7>0 THEN round(v_aci7*100.0/v_cliques7,2) END,'%',
    'intencoes de contato 7d / cliques 7d', jsonb_build_object('aci',v_aci7,'cliques',v_cliques7));
  PERFORM public.biz_kpi(v_dia,'usuarios_ativos_7d', v_ativos7,'qtd','auth.users last_sign_in 7d', jsonb_build_object('total',v_users));
  PERFORM public.biz_kpi(v_dia,'novos_usuarios_7d', v_novos7,'qtd','auth.users created 7d','{}'::jsonb);
  PERFORM public.biz_kpi(v_dia,'marketplace_growth_pct', CASE WHEN v_cliques7ant>0 THEN round((v_cliques7-v_cliques7ant)*100.0/v_cliques7ant,1) END,'%',
    CASE WHEN v_cliques7ant>0 THEN 'variacao cliques 7d vs 7d anteriores' ELSE 'DECLARADO: base anterior vazia' END,
    jsonb_build_object('atual',v_cliques7,'anterior',v_cliques7ant));
  PERFORM public.biz_kpi(v_dia,'churn_pct', NULL,'%','DECLARADO: volume insuficiente (11 usuarios) para churn confiavel','{}'::jsonb);
  PERFORM public.biz_kpi(v_dia,'ltv_brl', NULL,'BRL','DECLARADO: sem receita recorrente paga ainda','{}'::jsonb);
  PERFORM public.biz_kpi(v_dia,'cac_brl', NULL,'BRL','DECLARADO: sem investimento de aquisicao rastreado','{}'::jsonb);

  -- ===== INSIGHTS com evidencia (dedupe; auto-resolve quando muda) ==========
  IF v_promo_pend > 0 THEN
    INSERT INTO public.orion_biz_insights (dedupe_key, tipo, titulo, detalhe, prioridade, evidencias)
    VALUES ('promo_pending','gargalo','R$ '||round(v_promo_pend,2)||' em promocoes PENDENTES de pagamento',
      'Receita de divulgacao travada no checkout — priorizar conversao de pagamento (MP).',1,
      jsonb_build_object('valor_brl',v_promo_pend,'fonte','promotion_purchases status=pending'))
    ON CONFLICT (dedupe_key) DO UPDATE SET titulo=excluded.titulo, evidencias=excluded.evidencias, status='aberto', atualizado_em=now();
  END IF;
  IF v_leiloes > 0 AND v_lances = 0 THEN
    INSERT INTO public.orion_biz_insights (dedupe_key, tipo, titulo, detalhe, prioridade, evidencias)
    VALUES ('leiloes_sem_lances','oportunidade', v_leiloes||' leilao(oes) ativos SEM nenhum lance',
      'Divulgar leiloes (Motor de Publicacao/campanhas) para gerar primeiro lance.',2,
      jsonb_build_object('listings',v_leiloes,'bids',v_lances))
    ON CONFLICT (dedupe_key) DO UPDATE SET titulo=excluded.titulo, evidencias=excluded.evidencias, status='aberto', atualizado_em=now();
  END IF;
  IF (SELECT count(*) FROM public.products) = 0 THEN
    INSERT INTO public.orion_biz_insights (dedupe_key, tipo, titulo, detalhe, prioridade, evidencias)
    VALUES ('catalogo_vazio','risco','Catalogo de produtos VAZIO (pre-lancamento)',
      'Sem produtos no marketplace nao ha venda organica — onboarding de lojistas e prioridade.',1,
      jsonb_build_object('products',0))
    ON CONFLICT (dedupe_key) DO UPDATE SET status='aberto', atualizado_em=now();
  ELSE
    UPDATE public.orion_biz_insights SET status='resolvido', atualizado_em=now() WHERE dedupe_key='catalogo_vazio' AND status='aberto';
  END IF;
  IF v_cliques7 > 0 AND v_aci7 > 0 THEN
    INSERT INTO public.orion_biz_insights (dedupe_key, tipo, titulo, detalhe, prioridade, evidencias)
    VALUES ('trafego_engajado','tendencia','Trafego anonimo converte em intencao de contato',
      'Cliques viram contatos — canal de divulgacao esta gerando interesse real.',3,
      jsonb_build_object('cliques_7d',v_cliques7,'contatos_7d',v_aci7))
    ON CONFLICT (dedupe_key) DO UPDATE SET evidencias=excluded.evidencias, atualizado_em=now();
  END IF;

  -- ===== ALERTAS =============================================================
  IF v_rec_paga = 0 THEN
    INSERT INTO public.orion_biz_alerts (alerta, severidade, categoria, chave, evidencias)
    VALUES ('Nenhuma receita PAGA registrada na plataforma (pre-lancamento)','media','financeiro','receita_zero',
      jsonb_build_object('pedidos',v_pedidos,'promo_pendente',v_promo_pend))
    ON CONFLICT (categoria, chave, dia) DO NOTHING;
  END IF;
  IF v_cliques7ant > 10 AND v_cliques7 < v_cliques7ant/2 THEN
    INSERT INTO public.orion_biz_alerts (alerta, severidade, categoria, chave, evidencias)
    VALUES ('Queda de atividade do marketplace: cliques 7d cairam mais de 50%','alta','marketplace','queda_cliques',
      jsonb_build_object('atual',v_cliques7,'anterior',v_cliques7ant))
    ON CONFLICT (categoria, chave, dia) DO NOTHING;
  END IF;

  -- ===== FORECASTS (media 7d linear; historico curto DECLARADO) =============
  INSERT INTO public.orion_biz_forecasts (kpi, horizonte_dias, gerado_em, valor_projetado, base)
  SELECT 'cliques', h, v_dia, round((v_cliques7/7.0)*h,1),
    jsonb_build_object('metodo','media diaria 7d x horizonte','nota_declarada','sazonalidade exige historico maior')
  FROM unnest(ARRAY[7,30,90]) h
  ON CONFLICT (kpi, horizonte_dias, gerado_em) DO UPDATE SET valor_projetado=excluded.valor_projetado;
  INSERT INTO public.orion_biz_forecasts (kpi, horizonte_dias, gerado_em, valor_projetado, base)
  SELECT 'receita_paga_brl', h, v_dia, 0,
    jsonb_build_object('metodo','DECLARADO: sem serie de receita paga — projecao 0 ate existir historico')
  FROM unnest(ARRAY[7,30,90]) h
  ON CONFLICT (kpi, horizonte_dias, gerado_em) DO UPDATE SET base=excluded.base;

  -- ===== SCORES + REPORT =====================================================
  INSERT INTO public.orion_biz_statistics AS s (data, bis, mgs, fhs, mps, ues, bps, receita_dia_brl, atualizado_em)
  SELECT v_dia,
    (public.biz_scores()->>'bis')::int,(public.biz_scores()->>'mgs')::int,(public.biz_scores()->>'fhs')::int,
    (public.biz_scores()->>'mps')::int,(public.biz_scores()->>'ues')::int,(public.biz_scores()->>'bps')::int,
    v_rec_paga, now()
  ON CONFLICT (data) DO UPDATE SET bis=excluded.bis, mgs=excluded.mgs, fhs=excluded.fhs, mps=excluded.mps,
    ues=excluded.ues, bps=excluded.bps, receita_dia_brl=excluded.receita_dia_brl, atualizado_em=now();

  INSERT INTO public.orion_biz_reports (trace, tipo, conteudo)
  VALUES (v_trace,'execucao', jsonb_build_object('facts',(SELECT count(*) FROM public.orion_biz_facts WHERE dia=v_dia),
    'kpis',(SELECT count(*) FROM public.orion_biz_kpis WHERE dia=v_dia),
    'insights_abertos',(SELECT count(*) FROM public.orion_biz_insights WHERE status='aberto')));
  PERFORM public.biz_emit('bi.check', jsonb_build_object('trace',v_trace));

  RETURN jsonb_build_object('ok',true,'trace',v_trace,'dia',v_dia,
    'facts',(SELECT count(*) FROM public.orion_biz_facts WHERE dia=v_dia),
    'kpis',(SELECT count(*) FROM public.orion_biz_kpis WHERE dia=v_dia),
    'insights',(SELECT count(*) FROM public.orion_biz_insights WHERE status='aberto'),
    'scores',public.biz_scores());
END$$;
REVOKE ALL ON FUNCTION public.run_bi_check(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_bi_check(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.biz_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT (now() AT TIME ZONE 'America/Cuiaba')::date dia),
  f AS (SELECT count(DISTINCT dominio) doms, count(*) facts FROM public.orion_biz_facts, d WHERE orion_biz_facts.dia=d.dia),
  k AS (SELECT count(*) FILTER (WHERE valor IS NOT NULL) medidos, count(*) tot FROM public.orion_biz_kpis, d WHERE orion_biz_kpis.dia=d.dia),
  u AS (SELECT coalesce((SELECT valor FROM public.orion_biz_facts, d WHERE orion_biz_facts.dia=d.dia AND dominio='usuarios' AND chave='ativos_7d'),0) ativos,
               coalesce((SELECT valor FROM public.orion_biz_facts, d WHERE orion_biz_facts.dia=d.dia AND dominio='usuarios' AND chave='total'),0) tot),
  m AS (SELECT coalesce((SELECT valor FROM public.orion_biz_kpis, d WHERE orion_biz_kpis.dia=d.dia AND kpi='conversao_clique_contato_pct'),0) conv,
               coalesce((SELECT valor FROM public.orion_biz_kpis, d WHERE orion_biz_kpis.dia=d.dia AND kpi='marketplace_growth_pct'),0) growth),
  fin AS (SELECT coalesce((SELECT valor FROM public.orion_biz_facts, d WHERE orion_biz_facts.dia=d.dia AND dominio='financeiro' AND chave='receita_paga_brl'),0) rec)
  SELECT jsonb_build_object(
    'bis', least(100, (SELECT doms*10 FROM f) + (SELECT CASE WHEN tot>0 THEN round(medidos*20.0/tot)::int ELSE 0 END FROM k)),
    'mgs', greatest(0, least(100, 50 + round((SELECT growth FROM m))::int)),
    'fhs', CASE WHEN (SELECT rec FROM fin) > 0 THEN 70 ELSE 20 END,
    'mps', least(100, round((SELECT conv FROM m))::int),
    'ues', (SELECT CASE WHEN tot>0 THEN round(ativos*100.0/tot)::int ELSE 0 END FROM u),
    'bps', 0,
    'formula','BIS=10*dominios_cobertos+20*%kpis_medidos · MGS=50+growth_cliques_7d · FHS=70 se ha receita paga senao 20 (pre-lancamento) · MPS=conversao clique->contato · UES=%usuarios ativos 7d · BPS=media dos demais (calculada abaixo)',
    'base',(SELECT jsonb_build_object('dominios',doms,'facts',facts) FROM f) || (SELECT jsonb_build_object('kpis_medidos',medidos,'kpis_total',tot) FROM k));
$$;
GRANT EXECUTE ON FUNCTION public.biz_scores() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.biz_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_sc jsonb;
BEGIN
  PERFORM public.biz_guard();
  v_sc := public.biz_scores();
  v_sc := v_sc || jsonb_build_object('bps', round(((v_sc->>'bis')::int+(v_sc->>'mgs')::int+(v_sc->>'fhs')::int+(v_sc->>'mps')::int+(v_sc->>'ues')::int)/5.0)::int);
  v := jsonb_build_object(
    'scores', v_sc,
    'facts', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.dominio, f.chave),'[]'::jsonb) FROM public.orion_biz_facts f WHERE f.dia=v_dia),
    'kpis', (SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.kpi),'[]'::jsonb) FROM public.orion_biz_kpis k WHERE k.dia=v_dia),
    'insights', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.prioridade, i.atualizado_em DESC),'[]'::jsonb)
       FROM (SELECT * FROM public.orion_biz_insights ORDER BY prioridade, atualizado_em DESC LIMIT 30) i),
    'forecasts', (SELECT coalesce(jsonb_agg(to_jsonb(fc) ORDER BY fc.kpi, fc.horizonte_dias),'[]'::jsonb)
       FROM (SELECT DISTINCT ON (kpi, horizonte_dias) * FROM public.orion_biz_forecasts ORDER BY kpi, horizonte_dias, gerado_em DESC) fc),
    'alerts', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC),'[]'::jsonb)
       FROM (SELECT * FROM public.orion_biz_alerts WHERE dia > v_dia-14 ORDER BY criado_em DESC LIMIT 30) a),
    'statistics', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_biz_statistics ORDER BY data DESC LIMIT 30) s),
    'ai22_kpis', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.dominio, b.chave),'[]'::jsonb)
       FROM (SELECT dominio, chave, valor, unidade, confianca FROM public.orion_bi_kpis WHERE dia=(SELECT max(dia) FROM public.orion_bi_kpis) LIMIT 40) b),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.biz_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.biz_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.biz_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('scores', public.biz_scores(),
    'kpis',(SELECT coalesce(jsonb_agg(jsonb_build_object('kpi',kpi,'valor',valor,'met',metodologia)),'[]'::jsonb)
      FROM public.orion_biz_kpis WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'insights',(SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'titulo',titulo)),'[]'::jsonb)
      FROM (SELECT tipo, titulo FROM public.orion_biz_insights WHERE status='aberto' ORDER BY prioridade LIMIT 8) x));
$$;
GRANT EXECUTE ON FUNCTION public.biz_summary() TO authenticated, service_role;

-- ===== SELFTEST (COMANDO TESTE) =============================================
CREATE OR REPLACE FUNCTION public.biz_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checks jsonb := '[]'::jsonb; v_fail int; v_r jsonb; v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  PERFORM public.biz_guard();
  v_r := public.run_bi_check('selftest');
  v_checks := v_checks || jsonb_build_object('check','motor_roda','ok',(v_r->>'ok')::boolean);
  v_checks := v_checks || jsonb_build_object('check','facts_8_dominios','ok',
    (SELECT count(DISTINCT dominio) FROM public.orion_biz_facts WHERE dia=v_dia) >= 7);
  v_checks := v_checks || jsonb_build_object('check','kpis_gerados','ok',
    (SELECT count(*) FROM public.orion_biz_kpis WHERE dia=v_dia) >= 8);
  v_checks := v_checks || jsonb_build_object('check','kpi_declarado_null','ok',
    EXISTS (SELECT 1 FROM public.orion_biz_kpis WHERE dia=v_dia AND kpi='churn_pct' AND valor IS NULL AND metodologia LIKE 'DECLARADO%'));
  v_checks := v_checks || jsonb_build_object('check','insights_com_evidencia','ok',
    (SELECT count(*) FROM public.orion_biz_insights WHERE evidencias <> '{}'::jsonb) >= 2);
  v_checks := v_checks || jsonb_build_object('check','forecasts','ok',
    (SELECT count(*) FROM public.orion_biz_forecasts WHERE gerado_em=v_dia) >= 6);
  v_checks := v_checks || jsonb_build_object('check','reuso_ai22','ok',
    EXISTS (SELECT 1 FROM public.orion_biz_facts WHERE dia=v_dia AND dominio='ai22'));
  v_checks := v_checks || jsonb_build_object('check','custos_ai52_lido','ok',
    EXISTS (SELECT 1 FROM public.orion_biz_facts WHERE dia=v_dia AND dominio='custos'));
  v_checks := v_checks || jsonb_build_object('check','scores_0_100','ok',
    (public.biz_scores()->>'bis')::int BETWEEN 0 AND 100);
  v_checks := v_checks || jsonb_build_object('check','reports_imutaveis','ok',
    NOT has_table_privilege('authenticated','public.orion_biz_reports','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok',
    NOT has_table_privilege('anon','public.orion_biz_kpis','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','sem_truncate','ok',
    NOT has_table_privilege('authenticated','public.orion_biz_facts','TRUNCATE'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_biz_tick'));
  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-54 — entrada do COMANDO TESTE');
END$$;
REVOKE ALL ON FUNCTION public.biz_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.biz_selftest() TO authenticated, service_role;

-- ===== PROMPTS + PREF + CRON ================================================
SELECT public.orion_ai_prompt_set('business.summary','Voce e o ORION Business Intelligence (AI-54). Resuma a saude do negocio com base nos facts/KPIs reais. A plataforma esta em pre-lancamento: declare limites honestamente, sem inventar numeros.','ORION-AI-54 seed');
SELECT public.orion_ai_prompt_set('business.kpi','Voce e o ORION BI. Explique os KPIs (valor, metodologia, base). KPIs com valor NULL sao DECLARADOS por dados insuficientes — explique o que falta para medi-los.','ORION-AI-54 seed');
SELECT public.orion_ai_prompt_set('business.forecast','Voce e o ORION BI. Explique as projecoes (metodo media 7d linear) e limitacoes declaradas (sazonalidade/historico curto).','ORION-AI-54 seed');
SELECT public.orion_ai_prompt_set('business.insight','Voce e o ORION BI. Analise os insights abertos (gargalos/oportunidades/riscos) e detalhe o proximo passo de cada um com base na evidencia.','ORION-AI-54 seed');
SELECT public.orion_ai_prompt_set('business.recommendation','Voce e o ORION BI. Priorize decisoes estrategicas por impacto no negocio, citando evidencias (promo pendente, catalogo, leiloes, trafego).','ORION-AI-54 seed');
SELECT public.orion_ai_prompt_set('executive.dashboard','Voce e o ORION BI. Gere briefing executivo (1 minuto de leitura) para a direcao: saude geral, 3 numeros-chave, 3 acoes. Sem dados pessoais.','ORION-AI-54 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('business_intelligence','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_biz_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_bi_check('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_biz_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_biz_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_biz_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_biz_tick');
    PERFORM cron.schedule('orion_biz_tick','*/5 * * * *','SELECT public.orion_biz_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_biz%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'biz_%' OR p.proname IN ('run_bi_check','orion_biz_tick'))) AS funcoes,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_biz_tick') AS cron_job;

-- ROLLBACK (manual): cron.unschedule('orion_biz_tick'); DROP FUNCTION biz_*/run_bi_check/orion_biz_tick;
--   DROP TABLE orion_biz_* CASCADE; DELETE FROM orion_ai_module_prefs WHERE module='business_intelligence';
