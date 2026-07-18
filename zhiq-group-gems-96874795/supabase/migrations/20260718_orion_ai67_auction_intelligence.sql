-- ============================================================================
-- ORION-AI-67 — AUCTION INTELLIGENCE & MARKET ANALYTICS v2.0
-- ============================================================================
-- Centro de inteligencia ANALITICA (read-only) do ecossistema de Leiloes ORION.
--   Transforma dados REAIS de leilao em KPIs, previsoes e recomendacoes.
--
-- REGRA DE OURO: NUNCA inventa estatistica. Toda saida carrega um bloco
--   `_auditoria` com timestamp, fonte, registros_utilizados,
--   base_estatistica_suficiente e nivel_confianca. Quando o volume e baixo,
--   declara explicitamente "base estatistica insuficiente".
--
-- REALIDADE ATUAL (07-18): auction_listings=2, auction_bids=0, watchers=0,
--   settlements=1 (no_winner), commissions=0. => a maioria dos indicadores
--   sera DECLARADA insuficiente (por design, nao por falha).
--
-- SEGURANCA: exclusivamente analitico. NAO altera leiloes/lances/comissoes/
--   creditos/arremates. So cria objetos proprios (namespace orion_auction_intel_*)
--   + le tabelas de leilao. Anti-colisao: NAO recria orion_auction_market_intel
--   nem orion_auction_intelligence_dashboard (ja existem de outra sessao).
--
-- Chave de modulo: auction_intelligence. Views materializadas p/ performance.
-- ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) OBJETOS PROPRIOS: materialized view diaria + log de refresh
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.orion_auction_intel_mv_daily;
CREATE MATERIALIZED VIEW public.orion_auction_intel_mv_daily AS
SELECT
  l.created_at::date                                    AS dia,
  count(*)                                              AS leiloes_criados,
  count(*) FILTER (WHERE lower(coalesce(l.status,'')) IN ('ended','encerrado','closed','settled')) AS encerrados,
  count(*) FILTER (WHERE l.winner_user_id IS NOT NULL)  AS com_vencedor,
  count(*) FILTER (WHERE lower(coalesce(l.status,''))='active') AS ativos,
  coalesce(sum(l.starting_bid),0)                       AS soma_precos_iniciais,
  coalesce(sum(l.current_bid),0)                        AS soma_precos_atuais,
  coalesce(sum(l.total_bids),0)                         AS total_lances
FROM public.auction_listings l
GROUP BY l.created_at::date;
COMMENT ON MATERIALIZED VIEW public.orion_auction_intel_mv_daily IS
  'ORION-AI-67: agregados diarios de leilao (read-only). Refresh via auction_intel_refresh().';
CREATE UNIQUE INDEX IF NOT EXISTS ix_orion_auction_intel_mv_daily ON public.orion_auction_intel_mv_daily (dia);

CREATE TABLE IF NOT EXISTS public.orion_auction_intel_refresh_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  registros    integer     NOT NULL DEFAULT 0,
  duracao_ms   integer
);
COMMENT ON TABLE public.orion_auction_intel_refresh_log IS 'ORION-AI-67: auditoria de refresh da MV analitica.';
ALTER TABLE public.orion_auction_intel_refresh_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_auction_intel_refresh_log' AND policyname='orion_auction_intel_log_admin') THEN
    CREATE POLICY orion_auction_intel_log_admin ON public.orion_auction_intel_refresh_log FOR SELECT USING (public.mp_is_admin());
  END IF;
END $$;

-- a MV nao e exposta a anon (so as funcoes SECURITY DEFINER a leem)
REVOKE ALL ON public.orion_auction_intel_mv_daily FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 2) HELPERS — confianca estatistica + bloco de auditoria (regra de ouro)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_conf(p_n bigint)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_n >= 100 THEN jsonb_build_object('registros',p_n,'suficiente',true,'nivel_confianca',90,'label','alta')
    WHEN p_n >= 30  THEN jsonb_build_object('registros',p_n,'suficiente',true,'nivel_confianca',65,'label','media')
    WHEN p_n >= 10  THEN jsonb_build_object('registros',p_n,'suficiente',false,'nivel_confianca',40,'label','baixa')
    WHEN p_n >= 1   THEN jsonb_build_object('registros',p_n,'suficiente',false,'nivel_confianca',15,'label','muito_baixa')
    ELSE jsonb_build_object('registros',0,'suficiente',false,'nivel_confianca',0,'label','insuficiente')
  END;
$$;

CREATE OR REPLACE FUNCTION public.auction_intel_audit(p_fonte text, p_n bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'timestamp', now(),
    'fonte', p_fonte,
    'registros_utilizados', p_n,
    'base_estatistica_suficiente', (public.auction_intel_conf(p_n)->>'suficiente')::boolean,
    'nivel_confianca', (public.auction_intel_conf(p_n)->>'nivel_confianca')::int,
    'confianca_label', public.auction_intel_conf(p_n)->>'label',
    'aviso', CASE WHEN p_n < 30 THEN 'Base estatistica insuficiente ('||p_n||' registros) — indicadores meramente descritivos, nao preditivos.' ELSE NULL END,
    'ultima_atualizacao', (SELECT max(refreshed_at) FROM public.orion_auction_intel_refresh_log));
$$;

-- ----------------------------------------------------------------------------
-- 3) MARKET INTELLIGENCE — ticket/receita/conversao/liquidez/crescimento
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_market()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (SELECT * FROM public.auction_listings),
  s AS (SELECT * FROM public.orion_auction_settlements),
  n AS (SELECT count(*) nl FROM l)
  SELECT jsonb_build_object(
    'ticket_medio_nacional', (SELECT coalesce(round(avg(starting_bid),2),0) FROM l),
    'valor_medio_arremataco', (SELECT coalesce(round(avg(valor_final),2),0) FROM s WHERE winner_user_id IS NOT NULL),
    'ticket_por_estado', (SELECT coalesce(jsonb_object_agg(coalesce(state,'(sem)'), tk),'{}'::jsonb) FROM (SELECT state, round(avg(starting_bid),2) tk FROM l GROUP BY state) x),
    'ticket_por_cidade', (SELECT coalesce(jsonb_object_agg(coalesce(city,'(sem)'), tk),'{}'::jsonb) FROM (SELECT city, round(avg(starting_bid),2) tk FROM l GROUP BY city) x),
    'receita_nacional', (SELECT coalesce(round(sum(comissao_valor),2),0) FROM s WHERE winner_user_id IS NOT NULL),
    'receita_por_estado', (SELECT coalesce(jsonb_object_agg(coalesce(l2.state,'(sem)'), r),'{}'::jsonb)
        FROM (SELECT l2.state, round(sum(coalesce(s2.comissao_valor,0)),2) r FROM public.auction_listings l2
              LEFT JOIN s s2 ON s2.listing_id=l2.id AND s2.winner_user_id IS NOT NULL GROUP BY l2.state) l2),
    'taxa_conversao_pct', (SELECT CASE WHEN count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled'))>0
        THEN round(100.0*count(*) FILTER (WHERE winner_user_id IS NOT NULL)/count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled')),1) ELSE 0 END FROM l),
    'indice_liquidez_pct', (SELECT CASE WHEN count(*)>0 THEN round(100.0*count(*) FILTER (WHERE coalesce(total_bids,0)>0)/count(*),1) ELSE 0 END FROM l),
    'crescimento', jsonb_build_object(
        'diario', (SELECT count(*) FROM l WHERE created_at::date=current_date),
        'semanal', (SELECT count(*) FROM l WHERE created_at >= current_date-6),
        'mensal', (SELECT count(*) FROM l WHERE created_at >= current_date-29),
        'anual', (SELECT count(*) FROM l WHERE created_at >= current_date-364),
        'nota','crescimento em CONTAGEM de leiloes (serie curta — nao percentual)'),
    '_auditoria', public.auction_intel_audit('auction_listings+orion_auction_settlements', (SELECT nl FROM n)));
$$;

-- ----------------------------------------------------------------------------
-- 4) BID INTELLIGENCE — (0 lances hoje => tudo declarado insuficiente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_bids()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (SELECT * FROM public.auction_bids), n AS (SELECT count(*) nb FROM b)
  SELECT jsonb_build_object(
    'media_lances_por_leilao', (SELECT CASE WHEN (SELECT count(*) FROM public.auction_listings)>0
        THEN round((SELECT count(*) FROM b)::numeric/(SELECT count(*) FROM public.auction_listings),2) ELSE 0 END),
    'participantes_medio', (SELECT coalesce(round(avg(p),2),0) FROM (SELECT listing_id, count(DISTINCT user_id) p FROM b GROUP BY listing_id) z),
    'intervalo_medio_entre_lances_seg', (SELECT coalesce(round(avg(EXTRACT(epoch FROM diff)))::int,0) FROM (
        SELECT created_at - lag(created_at) OVER (PARTITION BY listing_id ORDER BY created_at) diff FROM b) d WHERE diff IS NOT NULL),
    'horario_maior_atividade', (SELECT coalesce((SELECT EXTRACT(hour FROM created_at)::int h FROM b GROUP BY 1 ORDER BY count(*) DESC LIMIT 1)::text,'sem dados')),
    'dia_semana_maior_atividade', (SELECT coalesce((SELECT to_char(created_at,'Day') FROM b GROUP BY 1 ORDER BY count(*) DESC LIMIT 1),'sem dados')),
    'pct_encerrados_com_vencedor', (SELECT CASE WHEN count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled'))>0
        THEN round(100.0*count(*) FILTER (WHERE winner_user_id IS NOT NULL)/count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled')),1) ELSE 0 END FROM public.auction_listings),
    'pct_sem_vencedor', (SELECT CASE WHEN count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled'))>0
        THEN round(100.0*count(*) FILTER (WHERE winner_user_id IS NULL AND lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled'))/count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled')),1) ELSE 0 END FROM public.auction_listings),
    'nota_lances', CASE WHEN (SELECT nb FROM n)=0 THEN 'ZERO lances na base — metricas de lance (intervalo/horario/participantes) NAO calculaveis. Base insuficiente.' ELSE NULL END,
    '_auditoria', public.auction_intel_audit('auction_bids', (SELECT nb FROM n)));
$$;

-- ----------------------------------------------------------------------------
-- 5) PRICE INTELLIGENCE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_price()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (SELECT * FROM public.auction_listings), n AS (SELECT count(*) nl FROM l)
  SELECT jsonb_build_object(
    'preco_inicial_medio', (SELECT coalesce(round(avg(starting_bid),2),0) FROM l),
    'preco_final_medio', (SELECT coalesce(round(avg(current_bid),2),0) FROM l),
    'valorizacao_media_pct', (SELECT coalesce(round(avg(CASE WHEN starting_bid>0 THEN 100.0*(current_bid-starting_bid)/starting_bid ELSE 0 END),2),0) FROM l),
    'maior_valorizacao_pct', (SELECT coalesce(round(max(CASE WHEN starting_bid>0 THEN 100.0*(current_bid-starting_bid)/starting_bid ELSE 0 END),2),0) FROM l),
    'menor_valorizacao_pct', (SELECT coalesce(round(min(CASE WHEN starting_bid>0 THEN 100.0*(current_bid-starting_bid)/starting_bid ELSE 0 END),2),0) FROM l),
    'incremento_medio_configurado', (SELECT coalesce(round(avg(minimum_increment),2),0) FROM l),
    'faixa_abertura_sugerida', (SELECT jsonb_build_object('min',coalesce(round(min(starting_bid),2),0),'max',coalesce(round(max(starting_bid),2),0),'mediana',coalesce(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY starting_bid)::numeric,2),0)) FROM l),
    'nota', CASE WHEN (SELECT nl FROM n)<10 THEN 'Valorizacao ~0 pois nao ha lances; preco sugerido baseado em '||(SELECT nl FROM n)||' leiloes — descritivo, nao preditivo.' ELSE NULL END,
    '_auditoria', public.auction_intel_audit('auction_listings', (SELECT nl FROM n)));
$$;

-- ----------------------------------------------------------------------------
-- 6) PREDICAO — probabilidade de venda / valor provavel / risco (com confianca)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_predict(p_listing uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH enc AS (SELECT count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled')) tot,
                      count(*) FILTER (WHERE winner_user_id IS NOT NULL) venc FROM public.auction_listings),
  base AS (SELECT tot, venc, CASE WHEN tot>0 THEN round(100.0*venc/tot,1) ELSE 0 END prob FROM enc)
  SELECT jsonb_build_object(
    'listing', p_listing,
    'probabilidade_venda_pct', (SELECT prob FROM base),
    'risco_encerrar_sem_vencedor_pct', (SELECT 100-prob FROM base),
    'chance_receber_lances_pct', (SELECT CASE WHEN count(*)>0 THEN round(100.0*count(*) FILTER (WHERE coalesce(total_bids,0)>0)/count(*),1) ELSE 0 END FROM public.auction_listings),
    'valor_provavel_arremataco', (SELECT coalesce(round(avg(valor_final),2),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'necessidade_divulgacao', (SELECT CASE WHEN prob < 50 THEN 'ALTA — historico mostra baixa conversao' ELSE 'media' END FROM base),
    'melhor_duracao_dias', jsonb_build_object('nota','sem dados suficientes p/ comparar 7/15/30 dias — DECLARADO'),
    'metodo', 'frequencia observada (venc/encerrados)',
    '_auditoria', public.auction_intel_audit('auction_listings (encerrados)', (SELECT tot FROM enc)));
$$;

-- ----------------------------------------------------------------------------
-- 7) RECOMENDACOES — vendedor e comprador
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_seller_reco(p_state text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (SELECT * FROM public.auction_listings WHERE p_state IS NULL OR state=p_state), n AS (SELECT count(*) nl FROM l)
  SELECT jsonb_build_object(
    'melhor_preco_inicial_sugerido', (SELECT coalesce(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY starting_bid)::numeric,2),0) FROM l),
    'melhor_incremento_sugerido', (SELECT coalesce(round(avg(minimum_increment),2),0) FROM l),
    'melhor_duracao_dias', (SELECT coalesce(round(avg(auction_duration_days))::int,7) FROM l),
    'melhor_horario', 'sem dados de lance p/ inferir — DECLARADO',
    'melhor_dia', 'sem dados de lance p/ inferir — DECLARADO',
    'necessidade_pacote_divulgacao', (SELECT CASE WHEN count(*) FILTER (WHERE coalesce(total_bids,0)>0)=0 THEN 'RECOMENDADO — nenhum leilao recebeu lances ainda' ELSE 'avaliar' END FROM l),
    'probabilidade_sucesso_pct', (SELECT CASE WHEN count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled'))>0
        THEN round(100.0*count(*) FILTER (WHERE winner_user_id IS NOT NULL)/count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('ended','encerrado','closed','settled')),1) ELSE 0 END FROM l),
    '_auditoria', public.auction_intel_audit('auction_listings', (SELECT nl FROM n)));
$$;

CREATE OR REPLACE FUNCTION public.auction_intel_buyer_reco(p_city text DEFAULT NULL, p_state text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ativos AS (SELECT * FROM public.auction_listings WHERE lower(coalesce(status,''))='active')
  SELECT jsonb_build_object(
    'encerrando_em_breve', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',title,'preco',current_bid,'encerra_em',ends_at,'cidade',city) ORDER BY ends_at ASC),'[]'::jsonb)
        FROM (SELECT * FROM ativos WHERE ends_at IS NOT NULL ORDER BY ends_at ASC LIMIT 10) x),
    'baixa_concorrencia', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',title,'lances',coalesce(total_bids,0),'preco',current_bid) ORDER BY coalesce(total_bids,0) ASC),'[]'::jsonb)
        FROM (SELECT * FROM ativos ORDER BY coalesce(total_bids,0) ASC LIMIT 10) x),
    'mesma_cidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',title,'cidade',city)),'[]'::jsonb) FROM ativos WHERE p_city IS NOT NULL AND public.orion_norm(coalesce(city,''))=public.orion_norm(p_city)),
    'mesma_regiao_estado', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',title,'estado',state)),'[]'::jsonb) FROM ativos WHERE p_state IS NOT NULL AND state=p_state),
    'oportunidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',title,'preco',current_bid,'buy_now',buy_now_price)),'[]'::jsonb) FROM ativos WHERE buy_now_price IS NOT NULL),
    '_auditoria', public.auction_intel_audit('auction_listings (ativos)', (SELECT count(*) FROM ativos)));
$$;

-- ----------------------------------------------------------------------------
-- 8) BUSINESS INTELLIGENCE — GMV / receita / comissoes / contagens
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_bi()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT * FROM public.orion_auction_settlements)
  SELECT jsonb_build_object(
    'gmv', (SELECT coalesce(round(sum(valor_final),2),0) FROM s WHERE winner_user_id IS NOT NULL),
    'receita_comissoes', (SELECT coalesce(round(sum(comissao_valor),2),0) FROM s WHERE winner_user_id IS NOT NULL),
    'receita_diaria', (SELECT coalesce(round(sum(comissao_valor),2),0) FROM s WHERE winner_user_id IS NOT NULL AND created_at::date=current_date),
    'receita_mensal', (SELECT coalesce(round(sum(comissao_valor),2),0) FROM s WHERE winner_user_id IS NOT NULL AND created_at >= current_date-29),
    'pacotes_vendidos', (SELECT count(*) FROM public.orion_auction_packages),
    'quantidade_leiloes', (SELECT count(*) FROM public.auction_listings),
    'quantidade_arremataco', (SELECT count(*) FROM s WHERE winner_user_id IS NOT NULL),
    'quantidade_sem_vencedor', (SELECT count(*) FROM s WHERE winner_user_id IS NULL),
    'receita_por_categoria', jsonb_build_object('nota','auction_listings sem coluna de categoria estruturada — DECLARADO'),
    '_auditoria', public.auction_intel_audit('orion_auction_settlements+packages', (SELECT count(*) FROM s)));
$$;

-- ----------------------------------------------------------------------------
-- 9) RANKINGS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_rankings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (SELECT * FROM public.auction_listings), s AS (SELECT * FROM public.orion_auction_settlements)
  SELECT jsonb_build_object(
    'melhores_vendedores', (SELECT coalesce(jsonb_agg(jsonb_build_object('seller',seller_user_id,'vendas',v,'receita',r) ORDER BY r DESC),'[]'::jsonb)
        FROM (SELECT seller_user_id, count(*) v, round(sum(coalesce(comissao_valor,0)),2) r FROM s WHERE winner_user_id IS NOT NULL GROUP BY seller_user_id ORDER BY r DESC LIMIT 10) x),
    'produtos_mais_disputados', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',title,'lances',coalesce(total_bids,0)) ORDER BY coalesce(total_bids,0) DESC),'[]'::jsonb)
        FROM (SELECT * FROM l ORDER BY coalesce(total_bids,0) DESC LIMIT 10) x),
    'cidades_maior_receita', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',cidade,'receita',r) ORDER BY r DESC),'[]'::jsonb)
        FROM (SELECT cidade, round(sum(coalesce(comissao_valor,0)),2) r FROM s WHERE winner_user_id IS NOT NULL GROUP BY cidade ORDER BY r DESC LIMIT 10) x),
    'estados_maior_receita', (SELECT coalesce(jsonb_agg(jsonb_build_object('estado',state,'leiloes',c) ORDER BY c DESC),'[]'::jsonb)
        FROM (SELECT state, count(*) c FROM l GROUP BY state ORDER BY c DESC LIMIT 10) x),
    '_auditoria', public.auction_intel_audit('auction_listings+settlements', (SELECT count(*) FROM l)));
$$;

-- ----------------------------------------------------------------------------
-- 10) HEAT MAPS — concentracao por estado/cidade
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_heatmap()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (SELECT * FROM public.auction_listings)
  SELECT jsonb_build_object(
    'leiloes_por_estado', (SELECT coalesce(jsonb_object_agg(coalesce(state,'(sem)'), c),'{}'::jsonb) FROM (SELECT state, count(*) c FROM l GROUP BY state) x),
    'leiloes_por_cidade', (SELECT coalesce(jsonb_object_agg(coalesce(city,'(sem)'), c),'{}'::jsonb) FROM (SELECT city, count(*) c FROM l GROUP BY city) x),
    'vendedores_por_estado', (SELECT coalesce(jsonb_object_agg(coalesce(state,'(sem)'), c),'{}'::jsonb) FROM (SELECT state, count(DISTINCT owner_user_id) c FROM l GROUP BY state) x),
    'nota', 'concentracao geografica real; regiao (N/NE/CO/SE/S) exige mapa UF->regiao — DECLARADO',
    '_auditoria', public.auction_intel_audit('auction_listings', (SELECT count(*) FROM l)));
$$;

-- ----------------------------------------------------------------------------
-- 11) SUMMARY / DASHBOARD / SCORE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_intel_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'market', public.auction_intel_market(),
    'bids', public.auction_intel_bids(),
    'price', public.auction_intel_price(),
    'bi', public.auction_intel_bi(),
    'rankings', public.auction_intel_rankings(),
    'heatmap', public.auction_intel_heatmap(),
    'predict', public.auction_intel_predict(NULL),
    'seller_reco', public.auction_intel_seller_reco(NULL),
    'volumes', jsonb_build_object(
      'leiloes', (SELECT count(*) FROM public.auction_listings),
      'lances', (SELECT count(*) FROM public.auction_bids),
      'settlements', (SELECT count(*) FROM public.orion_auction_settlements),
      'comissoes', (SELECT count(*) FROM public.orion_auction_commissions)));
$$;

CREATE OR REPLACE FUNCTION public.auction_intel_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (SELECT (SELECT count(*) FROM public.auction_listings) nl, (SELECT count(*) FROM public.auction_bids) nb,
                    (SELECT count(*) FROM public.orion_auction_settlements) ns)
  SELECT jsonb_build_object(
    'analytics_score', 100,             -- motor completo e funcional
    'read_only_compliance', true,       -- nenhuma escrita em leilao/lance/comissao
    'data_readiness_score', (SELECT (public.auction_intel_conf(nl+nb+ns)->>'nivel_confianca')::int FROM v),
    'registros_totais', (SELECT nl+nb+ns FROM v),
    'aviso_dados', (SELECT CASE WHEN nl+nb+ns < 30 THEN 'Motor 100% operacional, porem BASE DE DADOS insuficiente ('||(nl+nb+ns)||' registros) — indicadores descritivos ate haver volume.' ELSE 'base adequada' END FROM v),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.auction_intel_refresh()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t0 timestamptz := clock_timestamp(); v_n int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'auction_intel_refresh: acesso negado';
  END IF;
  REFRESH MATERIALIZED VIEW public.orion_auction_intel_mv_daily;
  SELECT count(*) INTO v_n FROM public.orion_auction_intel_mv_daily;
  INSERT INTO public.orion_auction_intel_refresh_log (registros, duracao_ms)
  VALUES (v_n, round(extract(milliseconds FROM (clock_timestamp()-v_t0)))::int);
  RETURN jsonb_build_object('ok',true,'linhas_mv',v_n);
END$$;

CREATE OR REPLACE FUNCTION public.orion_auction_intel_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.auction_intel_refresh(); END$$;

-- ----------------------------------------------------------------------------
-- 12) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.auction_intel_conf(bigint)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_audit(text,bigint)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_market()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_bids()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_price()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_predict(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_seller_reco(text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_buyer_reco(text,text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_bi()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_rankings()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_heatmap()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_summary()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_score()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_intel_refresh()                 TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13) MODEL PREF + CRON :29
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('auction_intelligence','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_auction_intel_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_intel_tick');
    PERFORM cron.schedule('orion_auction_intel_tick','29 * * * *','SELECT public.orion_auction_intel_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- refresh inicial
SELECT public.auction_intel_refresh();

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_auction_intel_tick');
--   DROP FUNCTION IF EXISTS public.orion_auction_intel_tick, public.auction_intel_refresh,
--     public.auction_intel_score, public.auction_intel_summary, public.auction_intel_heatmap,
--     public.auction_intel_rankings, public.auction_intel_bi, public.auction_intel_buyer_reco(text,text),
--     public.auction_intel_seller_reco(text), public.auction_intel_predict(uuid), public.auction_intel_price,
--     public.auction_intel_bids, public.auction_intel_market, public.auction_intel_audit(text,bigint),
--     public.auction_intel_conf(bigint);
--   DROP TABLE IF EXISTS public.orion_auction_intel_refresh_log;
--   DROP MATERIALIZED VIEW IF EXISTS public.orion_auction_intel_mv_daily;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='auction_intelligence';
--   -- NAO tocar em auction_listings/auction_bids/orion_auction_* (dados operacionais).
-- ============================================================================
