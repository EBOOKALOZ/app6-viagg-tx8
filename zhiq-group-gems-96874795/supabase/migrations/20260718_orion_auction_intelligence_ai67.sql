-- ============================================================================
-- ORION-AI-67 — Auction Intelligence & Market Analytics v1.0 · 2026-07-18
-- ============================================================================
-- Motor analítico READ-ONLY do ecossistema de leilões. REUSA os dados reais
-- (auction_listings, auction_bids, orion_auction_settlements[AI-65],
-- orion_auction_reports/suggestions[FASE 1]) — NÃO cria dado, NÃO move dinheiro.
--
-- Honestidade: com pouco histórico, cada função DECLARA a base e a confiança
-- (nunca inventa números). Recomenda — nunca executa.
-- Nota de esquema: auction_listings NÃO tem coluna de categoria de produto;
-- usamos listing_type como proxy e cidade/estado (colunas reais) para geografia.
--
-- Funções: market_intel · bid_intel · price_intel · predict(listing) ·
--          buyer_recos(user) · intelligence_dashboard (consolida + KPIs).
-- REVOKE anon; dashboard = admin. Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ── 1) Inteligência de MERCADO (geografia + tipo + conversão + liquidez) ────
CREATE OR REPLACE FUNCTION public.orion_auction_market_intel()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tot int;
BEGIN
  SELECT count(*) INTO v_tot FROM public.auction_listings;
  RETURN jsonb_build_object(
    'ticket_medio_nacional', (SELECT coalesce(round(avg(valor_final),2),0)
        FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'ticket_por_cidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',coalesce(cidade,'(sem)'),'ticket',t,'arremates',n) ORDER BY t DESC),'[]'::jsonb)
        FROM (SELECT cidade, round(avg(valor_final),2) t, count(*) n FROM public.orion_auction_settlements
              WHERE winner_user_id IS NOT NULL GROUP BY cidade ORDER BY t DESC LIMIT 15) x),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(coalesce(listing_type,'auction'), n),'{}'::jsonb)
        FROM (SELECT listing_type, count(*) n FROM public.auction_listings GROUP BY listing_type) x),
    'atividade_por_cidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',coalesce(city,'(sem)'),'leiloes',n) ORDER BY n DESC),'[]'::jsonb)
        FROM (SELECT city, count(*) n FROM public.auction_listings GROUP BY city ORDER BY n DESC LIMIT 15) x),
    'atividade_por_estado', (SELECT coalesce(jsonb_agg(jsonb_build_object('estado',coalesce(state,'(sem)'),'leiloes',n) ORDER BY n DESC),'[]'::jsonb)
        FROM (SELECT state, count(*) n FROM public.auction_listings GROUP BY state ORDER BY n DESC LIMIT 15) x),
    'taxa_conversao', (SELECT CASE WHEN e>0 THEN round(w*100.0/e) ELSE 0 END FROM (
        SELECT count(*) FILTER (WHERE status IN ('ended','encerrado','closed')) e,
               count(*) FILTER (WHERE winner_user_id IS NOT NULL) w FROM public.auction_listings) z),
    'indice_liquidez_por_tipo', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',coalesce(listing_type,'auction'),
          'liquidez_pct', CASE WHEN n>0 THEN round(v*100.0/n) ELSE 0 END) ),'[]'::jsonb)
        FROM (SELECT listing_type, count(*) n, count(*) FILTER (WHERE winner_user_id IS NOT NULL) v
              FROM public.auction_listings GROUP BY listing_type) x),
    'base', jsonb_build_object('leiloes', v_tot,
        'obs', CASE WHEN v_tot < 20 THEN 'Amostra pequena — indicadores diretos, sem projeção (declarado).' ELSE 'ok' END,
        'lacuna', 'Categoria de produto não existe em auction_listings; usar product_id→catálogo p/ nível categoria.'),
    'gerado_em', now());
END$$;

-- ── 2) Inteligência de LANCES (horários, dias, intervalo, duração ideal) ────
CREATE OR REPLACE FUNCTION public.orion_auction_bid_intel()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.auction_bids;
  RETURN jsonb_build_object(
    'total_lances', v_n,
    'media_lances_por_leilao', (SELECT coalesce(round(avg(total_bids),1),0) FROM public.auction_listings),
    'por_hora', (SELECT coalesce(jsonb_object_agg(h::text, n),'{}'::jsonb) FROM (
        SELECT EXTRACT(hour FROM created_at AT TIME ZONE 'America/Cuiaba')::int h, count(*) n
        FROM public.auction_bids GROUP BY 1 ORDER BY 1) x),
    'por_dia_semana', (SELECT coalesce(jsonb_object_agg(d::text, n),'{}'::jsonb) FROM (
        SELECT EXTRACT(dow FROM created_at AT TIME ZONE 'America/Cuiaba')::int d, count(*) n
        FROM public.auction_bids GROUP BY 1 ORDER BY 1) x),
    'intervalo_medio_seg_entre_lances', (SELECT coalesce(round(avg(dt))::int,0) FROM (
        SELECT EXTRACT(epoch FROM (created_at - lag(created_at) OVER (PARTITION BY listing_id ORDER BY created_at))) dt
        FROM public.auction_bids) y WHERE dt IS NOT NULL),
    'duracao_ideal_dias', (SELECT coalesce(jsonb_agg(jsonb_build_object('duracao',auction_duration_days,
          'conversao_pct', CASE WHEN n>0 THEN round(w*100.0/n) ELSE 0 END, 'n', n) ORDER BY auction_duration_days),'[]'::jsonb)
        FROM (SELECT auction_duration_days, count(*) n, count(*) FILTER (WHERE winner_user_id IS NOT NULL) w
              FROM public.auction_listings WHERE auction_duration_days IS NOT NULL GROUP BY auction_duration_days) x),
    'base', CASE WHEN v_n < 30 THEN 'Poucos lances — padrões horário/dia são indicativos (declarado).' ELSE 'ok' END,
    'gerado_em', now());
END$$;

-- ── 3) Inteligência de PREÇOS (inicial/final, valorização, deságio) ─────────
CREATE OR REPLACE FUNCTION public.orion_auction_price_intel()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL;
  RETURN jsonb_build_object(
    'preco_inicial_medio', (SELECT coalesce(round(avg(valor_inicial),2),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'preco_final_medio',   (SELECT coalesce(round(avg(valor_final),2),0)   FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'valorizacao_media_pct', (SELECT coalesce(round(avg(CASE WHEN valor_inicial>0 THEN (valor_final-valor_inicial)*100.0/valor_inicial END)),0)
        FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'maior_valorizacao_pct', (SELECT coalesce(round(max(CASE WHEN valor_inicial>0 THEN (valor_final-valor_inicial)*100.0/valor_inicial END)),0)
        FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'menor_valorizacao_pct', (SELECT coalesce(round(min(CASE WHEN valor_inicial>0 THEN (valor_final-valor_inicial)*100.0/valor_inicial END)),0)
        FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'preco_sugerido_por_tipo', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',coalesce(listing_type,'auction'),'preco_inicial_sugerido',p) ORDER BY listing_type),'[]'::jsonb)
        FROM (SELECT listing_type, round(avg(coalesce(starting_bid,0)),2) p FROM public.auction_listings GROUP BY listing_type) x),
    'base', jsonb_build_object('arremates', v_n, 'confianca', CASE WHEN v_n=0 THEN 'sem_historico' WHEN v_n<10 THEN 'baixa' ELSE 'media' END,
        'obs', CASE WHEN v_n=0 THEN 'Ainda sem arremates concluídos — valorização será calculada quando houver liquidações (nunca estimada sem base).' ELSE 'ok' END),
    'gerado_em', now());
END$$;

-- ── 4) PREDIÇÃO por leilão (valor provável, chance de venda, risco) ─────────
-- Baseada em sinais REAIS do próprio leilão + média do tipo. Declara confiança.
CREATE OR REPLACE FUNCTION public.orion_auction_predict(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_bids int; v_watch int; v_val_med numeric; v_hist int;
  v_chance int; v_risco int; v_provavel numeric; v_horas numeric;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing;
  IF v_l IS NULL THEN RETURN jsonb_build_object('erro','leilão inexistente'); END IF;
  SELECT count(*) INTO v_bids  FROM public.auction_bids WHERE listing_id = p_listing;
  v_watch := coalesce(v_l.watchers_count,0);
  v_horas := GREATEST(0, EXTRACT(epoch FROM (v_l.ends_at - now()))/3600.0);

  SELECT count(*), avg(CASE WHEN valor_inicial>0 THEN (valor_final-valor_inicial)/valor_inicial END)
    INTO v_hist, v_val_med FROM public.orion_auction_settlements
    WHERE winner_user_id IS NOT NULL;

  -- valor provável: lance atual projetado pela valorização média (se houver histórico)
  v_provavel := round(coalesce(v_l.current_bid, v_l.starting_bid, 0)
                  * (1 + coalesce(v_val_med,0)), 2);
  -- chance de venda (heurística sinais reais): lances + watchers + tempo
  v_chance := LEAST(95, v_bids*20 + LEAST(v_watch,10)*3 + CASE WHEN v_horas>0 THEN 10 ELSE 0 END);
  -- risco de baixa participação / cancelamento
  v_risco  := GREATEST(0, 70 - v_bids*25 - LEAST(v_watch,10)*2);

  RETURN jsonb_build_object(
    'listing_id', p_listing,
    'valor_provavel', v_provavel,
    'chance_venda_pct', v_chance,
    'risco_baixa_participacao_pct', v_risco,
    'lances_atuais', v_bids, 'watchers', v_watch, 'horas_restantes', round(v_horas,1),
    'confianca', CASE WHEN coalesce(v_hist,0)=0 THEN 'baixa (sem histórico)' WHEN v_hist<10 THEN 'media' ELSE 'alta' END,
    'evidencia', jsonb_build_object('valorizacao_media_hist', round(coalesce(v_val_med,0)*100,1), 'arremates_hist', coalesce(v_hist,0)),
    'nota', 'Recomendação preditiva sobre sinais reais; sem histórico, o valor provável repete o lance atual (não inventa).',
    'gerado_em', now());
END$$;

-- ── 5) Recomendações ao COMPRADOR (oportunidades personalizadas) ───────────
CREATE OR REPLACE FUNCTION public.orion_auction_buyer_recos(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := coalesce(p_user, auth.uid());
BEGIN
  RETURN jsonb_build_object(
    'encerrando_em_breve', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'titulo',title,'fim',ends_at,'lance_atual',coalesce(current_bid,starting_bid)) ORDER BY ends_at),'[]'::jsonb)
        FROM (SELECT id,title,ends_at,current_bid,starting_bid FROM public.auction_listings
              WHERE coalesce(status,'active') IN ('active','ativo','published','live') AND ends_at>now()
              ORDER BY ends_at LIMIT 8) x),
    'baixa_concorrencia', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'titulo',title,'lances',coalesce(total_bids,0),'lance_atual',coalesce(current_bid,starting_bid)) ORDER BY coalesce(total_bids,0)),'[]'::jsonb)
        FROM (SELECT id,title,total_bids,current_bid,starting_bid FROM public.auction_listings
              WHERE coalesce(status,'active') IN ('active','ativo','published','live') AND ends_at>now()
              ORDER BY coalesce(total_bids,0) ASC, ends_at ASC LIMIT 8) x),
    'oportunidades_compra_ja', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'titulo',title,'buy_now',buy_now_price,'lance_atual',coalesce(current_bid,starting_bid),
          'desconto_pct', CASE WHEN buy_now_price>0 AND current_bid IS NOT NULL THEN round((buy_now_price-current_bid)*100.0/buy_now_price) END) ORDER BY ends_at),'[]'::jsonb)
        FROM (SELECT id,title,buy_now_price,current_bid,starting_bid,ends_at FROM public.auction_listings
              WHERE coalesce(status,'active') IN ('active','ativo','published','live') AND ends_at>now() AND buy_now_price IS NOT NULL
              ORDER BY ends_at LIMIT 6) x),
    'nas_suas_cidades', CASE WHEN v_user IS NULL THEN '[]'::jsonb ELSE (
        SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'titulo',l.title,'cidade',l.city,'fim',l.ends_at) ORDER BY l.ends_at),'[]'::jsonb)
        FROM public.auction_listings l
        WHERE coalesce(l.status,'active') IN ('active','ativo','published','live') AND l.ends_at>now()
          AND l.city IN (SELECT DISTINCT al.city FROM public.auction_bids b JOIN public.auction_listings al ON al.id=b.listing_id WHERE b.user_id=v_user)
        LIMIT 8) END,
    'personalizado', v_user IS NOT NULL,
    'gerado_em', now());
END$$;

-- ── 6) Dashboard consolidado de INTELIGÊNCIA (admin) + KPIs + rankings ──────
CREATE OR REPLACE FUNCTION public.orion_auction_intelligence_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'gmv_leiloes', (SELECT coalesce(sum(valor_final),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
      'comissao_arrecadada', (SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE creditos_ok),
      'comissao_potencial', (SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
      'ticket_medio', (SELECT coalesce(round(avg(valor_final),2),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
      'tempo_medio_venda_h', (SELECT coalesce(round(avg(duracao_segundos)/3600.0,1),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
      'taxa_conversao', (SELECT CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE winner_user_id IS NOT NULL)*100.0/count(*)) ELSE 0 END FROM public.orion_auction_settlements),
      'receita_pacotes_divulgacao', (SELECT coalesce(sum(creditos),0) FROM public.orion_auction_credit_consumption WHERE tipo <> 'encerramento')
    ),
    'receita_por_periodo', jsonb_build_object(
      'dia',    (SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE created_at >= now()-interval '1 day'),
      'semana', (SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE created_at >= now()-interval '7 day'),
      'mes',    (SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE created_at >= now()-interval '30 day'),
      'ano',    (SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE created_at >= now()-interval '365 day')
    ),
    'mercado', public.orion_auction_market_intel(),
    'lances',  public.orion_auction_bid_intel(),
    'precos',  public.orion_auction_price_intel(),
    'heatmap', (SELECT coalesce(jsonb_agg(jsonb_build_object('estado',coalesce(state,'(sem)'),'cidade',coalesce(city,'(sem)'),'leiloes',n,'arremates',w) ORDER BY n DESC),'[]'::jsonb)
        FROM (SELECT state, city, count(*) n, count(*) FILTER (WHERE winner_user_id IS NOT NULL) w
              FROM public.auction_listings GROUP BY state, city ORDER BY n DESC LIMIT 30) x),
    'rankings', jsonb_build_object(
      'produtos_disputados', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',title,'lances',coalesce(total_bids,0)) ORDER BY total_bids DESC NULLS LAST),'[]'::jsonb)
          FROM (SELECT title, total_bids FROM public.auction_listings ORDER BY total_bids DESC NULLS LAST LIMIT 10) x),
      'maiores_arremates', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'valor',valor_final) ORDER BY valor_final DESC),'[]'::jsonb)
          FROM (SELECT titulo, valor_final FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL ORDER BY valor_final DESC LIMIT 10) x)
    ),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
END$$;

-- ── 7) Permissões (REVOKE anon; intel p/ authenticated; dashboard = admin) ──
REVOKE ALL ON FUNCTION public.orion_auction_market_intel() FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_bid_intel() FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_price_intel() FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_predict(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_buyer_recos(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_intelligence_dashboard() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.orion_auction_market_intel() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_bid_intel() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_price_intel() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_predict(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_buyer_recos(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_intelligence_dashboard() TO authenticated, service_role;

-- ── 8) Verificação (espera 6 funções) ──────────────────────────────────────
SELECT count(*) AS funcoes_ai67
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
   ('orion_auction_market_intel','orion_auction_bid_intel','orion_auction_price_intel',
    'orion_auction_predict','orion_auction_buyer_recos','orion_auction_intelligence_dashboard');
