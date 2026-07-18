-- ============================================================================
-- ORION-AI-73 — Dynamic Pricing AI v1.0 · 2026-07-18
-- ============================================================================
-- Precificação dinâmica para LEILÕES (estende AI-67 price_intel / AI-71 score /
-- orion_auction_suggest; namespace isolado orion_dprice_* p/ não colidir c/ AI-15).
-- Entrega o que é NOVO: faixa de mercado por comparáveis, recomendação de preço,
-- SIMULADOR de cenários (what-if preço/reserva/duração → prob/tempo/receita),
-- alertas de preço e dashboard. READ-ONLY (não altera anúncios, não move dinheiro).
-- HONESTO: com poucos comparáveis, declara a base/confiança (nunca inventa).
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ── Histórico de alterações de preço (telemetria/auditoria) ─────────────────
CREATE TABLE IF NOT EXISTS public.orion_dprice_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL,
  campo       text NOT NULL,          -- starting_bid|reserve_price|buy_now_price|duration
  valor_antigo numeric,
  valor_novo   numeric,
  origem      text,                    -- ia|vendedor|admin
  ator        uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_orion_dprice_hist ON public.orion_dprice_history (listing_id, created_at DESC);

-- ── 1) Valor de mercado por comparáveis (tipo + cidade) ─────────────────────
CREATE OR REPLACE FUNCTION public.orion_dprice_market(p_listing_type text DEFAULT 'auction', p_city text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int; v_vend int; v_merc numeric;
BEGIN
  SELECT count(*) INTO v_n FROM public.auction_listings
   WHERE coalesce(listing_type,'auction') = p_listing_type AND (p_city IS NULL OR city = p_city);
  -- valor de mercado: média dos VENDIDOS (settlement); senão média dos preços iniciais dos comparáveis
  SELECT count(*), avg(valor_final) INTO v_vend, v_merc FROM public.orion_auction_settlements s
    JOIN public.auction_listings l ON l.id = s.listing_id
   WHERE s.winner_user_id IS NOT NULL AND coalesce(l.listing_type,'auction') = p_listing_type
     AND (p_city IS NULL OR l.city = p_city);
  IF v_merc IS NULL THEN
    SELECT avg(coalesce(current_bid, starting_bid)) INTO v_merc FROM public.auction_listings
     WHERE coalesce(listing_type,'auction') = p_listing_type AND (p_city IS NULL OR city = p_city);
  END IF;

  RETURN jsonb_build_object(
    'listing_type', p_listing_type, 'cidade', coalesce(p_city,'(todas)'),
    'comparaveis', v_n, 'vendidos', coalesce(v_vend,0),
    'valor_mercado', round(coalesce(v_merc,0),2),
    'minimo', (SELECT round(min(coalesce(current_bid,starting_bid)),2) FROM public.auction_listings WHERE coalesce(listing_type,'auction')=p_listing_type AND (p_city IS NULL OR city=p_city)),
    'maximo', (SELECT round(max(coalesce(current_bid,starting_bid)),2) FROM public.auction_listings WHERE coalesce(listing_type,'auction')=p_listing_type AND (p_city IS NULL OR city=p_city)),
    'base', CASE WHEN coalesce(v_vend,0) > 0 THEN 'vendas concluídas'
                 WHEN v_n >= 3 THEN 'preços de anúncios comparáveis'
                 ELSE 'amostra insuficiente — referência fraca (declarado)' END,
    'confianca', CASE WHEN coalesce(v_vend,0) >= 10 THEN 'alta' WHEN v_n >= 5 THEN 'media' ELSE 'baixa' END);
END$$;

-- ── 2) Recomendação de preço para um leilão (faixa + competitividade + prob) ─
CREATE OR REPLACE FUNCTION public.orion_dprice_recommend(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_mkt jsonb; v_mv numeric; v_atual numeric; v_score jsonb; v_comp text;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing;
  IF v_l IS NULL THEN RETURN jsonb_build_object('erro','leilão inexistente'); END IF;
  v_mkt := public.orion_dprice_market(coalesce(v_l.listing_type,'auction'), v_l.city);
  v_mv  := (v_mkt->>'valor_mercado')::numeric;
  v_atual := coalesce(v_l.current_bid, v_l.starting_bid, 0);
  v_score := public.orion_auction_score(p_listing);

  v_comp := CASE WHEN v_mv = 0 THEN 'indefinida'
                 WHEN v_atual <= v_mv*0.95 THEN 'Alta'
                 WHEN v_atual <= v_mv*1.10 THEN 'Média'
                 ELSE 'Baixa' END;

  RETURN jsonb_build_object(
    'listing_id', p_listing, 'titulo', v_l.title, 'preco_atual', v_atual,
    'valor_mercado', v_mv,
    'faixa_recomendada', jsonb_build_object(
       'minimo',  round(v_mv*0.90,2), 'ideal', round(v_mv,2),
       'premium', round(v_mv*1.15,2), 'maximo', round(v_mv*1.30,2)),
    'preco_inicial_sugerido_leilao', round(v_mv*0.70,2),   -- leilão abre abaixo p/ atrair lances
    'competitividade', v_comp,
    'situacao', CASE WHEN v_mv=0 THEN 'sem referência'
                     WHEN v_atual > v_mv*1.20 THEN 'supervalorizado'
                     WHEN v_atual < v_mv*0.70 THEN 'subvalorizado'
                     ELSE 'dentro do mercado' END,
    'probabilidade_venda_7d_pct', (v_score->>'probabilidade_venda_pct')::int,
    'mercado', v_mkt, 'gerado_em', now());
END$$;

-- ── 3) SIMULADOR de cenários (what-if: preço/reserva/duração) ───────────────
CREATE OR REPLACE FUNCTION public.orion_dprice_simulate(
  p_listing uuid, p_new_starting numeric DEFAULT NULL,
  p_new_reserve numeric DEFAULT NULL, p_new_duration_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_mkt jsonb; v_mv numeric; v_start numeric; v_dur int;
  v_base int; v_prob int; v_ratio numeric; v_tempo numeric; v_receita numeric; v_rank text;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing;
  IF v_l IS NULL THEN RETURN jsonb_build_object('erro','leilão inexistente'); END IF;
  v_mkt := public.orion_dprice_market(coalesce(v_l.listing_type,'auction'), v_l.city);
  v_mv  := nullif((v_mkt->>'valor_mercado')::numeric,0);
  v_start := coalesce(p_new_starting, v_l.starting_bid, 0);
  v_dur   := coalesce(p_new_duration_days, v_l.auction_duration_days, 7);

  v_base := (public.orion_auction_score(p_listing)->>'probabilidade_venda_pct')::int;
  -- fatores heurísticos DECLARADOS (sem modelo histórico): preço vs mercado + duração + reserva
  v_ratio := CASE WHEN v_mv IS NULL THEN 1 ELSE v_start / v_mv END;
  v_prob := v_base
          + CASE WHEN v_ratio <= 0.7 THEN 25 WHEN v_ratio <= 0.9 THEN 12 WHEN v_ratio <= 1.1 THEN 0 WHEN v_ratio <= 1.3 THEN -12 ELSE -25 END
          + CASE WHEN v_dur >= 30 THEN 12 WHEN v_dur >= 15 THEN 6 ELSE 0 END
          + CASE WHEN p_new_reserve IS NOT NULL AND v_mv IS NOT NULL AND p_new_reserve > v_mv THEN -15 ELSE 0 END;
  v_prob := GREATEST(5, LEAST(95, v_prob));
  v_tempo := round(GREATEST(0.5, v_dur * (1 - v_prob/100.0)), 1);
  v_receita := round(coalesce(v_mv, v_start) * v_prob/100.0, 2);
  v_rank := CASE WHEN v_ratio <= 0.9 THEN 'sobe (mais competitivo)' WHEN v_ratio <= 1.1 THEN 'estável' ELSE 'cai (menos competitivo)' END;

  RETURN jsonb_build_object(
    'listing_id', p_listing,
    'cenario', jsonb_build_object('preco_inicial', v_start, 'reserva', p_new_reserve, 'duracao_dias', v_dur),
    'probabilidade_venda_pct', v_prob,
    'tempo_estimado_dias', v_tempo,
    'receita_esperada', v_receita,
    'impacto_ranking', v_rank,
    'base', 'heurística declarada (preço×mercado + duração + reserva); refina com histórico de vendas',
    'valor_mercado', v_mv, 'gerado_em', now());
END$$;

-- ── 4) Alertas de preço (acima/abaixo do mercado) — reusa orion_auction_alerts
CREATE OR REPLACE FUNCTION public.orion_dprice_alert_scan(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_rec jsonb; v_sit text; v_n int := 0;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing;
  IF v_l IS NULL THEN RETURN jsonb_build_object('erro','inexistente'); END IF;
  v_rec := public.orion_dprice_recommend(p_listing);
  v_sit := v_rec->>'situacao';
  IF v_sit = 'supervalorizado' THEN
    PERFORM public.orion_auction_alert_emit(p_listing, v_l.owner_user_id, 'preco_acima_mercado', 'media',
      'Preço acima do mercado — reduza para ganhar competitividade', jsonb_build_object('valor_mercado', v_rec->'valor_mercado')); v_n:=1;
  ELSIF v_sit = 'subvalorizado' THEN
    PERFORM public.orion_auction_alert_emit(p_listing, v_l.owner_user_id, 'preco_abaixo_mercado', 'info',
      'Preço abaixo do mercado — há espaço para valorizar', jsonb_build_object('valor_mercado', v_rec->'valor_mercado')); v_n:=1;
  END IF;
  RETURN jsonb_build_object('ok', true, 'situacao', v_sit, 'alertas', v_n);
END$$;

-- ── 5) Dashboard admin (Dynamic Pricing Center) ────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_dprice_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'preco_medio_por_tipo', (SELECT coalesce(jsonb_object_agg(coalesce(listing_type,'auction'), p),'{}'::jsonb)
        FROM (SELECT listing_type, round(avg(coalesce(current_bid,starting_bid)),2) p FROM public.auction_listings GROUP BY listing_type) x),
    'preco_medio_por_cidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',coalesce(city,'(sem)'),'preco',p) ORDER BY p DESC),'[]'::jsonb)
        FROM (SELECT city, round(avg(coalesce(current_bid,starting_bid)),2) p FROM public.auction_listings GROUP BY city ORDER BY p DESC LIMIT 15) x),
    'tempo_medio_venda_h', (SELECT coalesce(round(avg(duracao_segundos)/3600.0,1),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'acima_do_mercado', (SELECT count(*) FROM public.auction_listings l
        WHERE coalesce(l.current_bid,l.starting_bid) > 1.2 * nullif((public.orion_dprice_market(coalesce(l.listing_type,'auction'), l.city)->>'valor_mercado')::numeric,0)),
    'abaixo_do_mercado', (SELECT count(*) FROM public.auction_listings l
        WHERE coalesce(l.current_bid,l.starting_bid) < 0.7 * nullif((public.orion_dprice_market(coalesce(l.listing_type,'auction'), l.city)->>'valor_mercado')::numeric,0)),
    'taxa_conversao', (SELECT CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE winner_user_id IS NOT NULL)*100.0/count(*)) ELSE 0 END FROM public.orion_auction_settlements),
    'alteracoes_preco_registradas', (SELECT count(*) FROM public.orion_dprice_history),
    'gerado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
END$$;

-- ── 6) RLS + permissões ────────────────────────────────────────────────────
ALTER TABLE public.orion_dprice_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY orion_dprice_hist_read ON public.orion_dprice_history FOR SELECT TO authenticated
    USING (public.mp_is_admin() OR listing_id IN (SELECT id FROM public.auction_listings WHERE owner_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON TABLE public.orion_dprice_history FROM anon, public;
GRANT SELECT ON TABLE public.orion_dprice_history TO authenticated;

REVOKE ALL ON FUNCTION public.orion_dprice_market(text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_dprice_recommend(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_dprice_simulate(uuid,numeric,numeric,int) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_dprice_alert_scan(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_dprice_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_dprice_market(text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_dprice_recommend(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_dprice_simulate(uuid,numeric,numeric,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_dprice_alert_scan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_dprice_dashboard() TO authenticated, service_role;

-- ── 7) Verificação (5 fn + 1 tabela) + prova nos dados reais ───────────────
SELECT jsonb_build_object(
  'funcoes', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
     AND p.proname IN ('orion_dprice_market','orion_dprice_recommend','orion_dprice_simulate','orion_dprice_alert_scan','orion_dprice_dashboard')),
  'tabela', (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='orion_dprice_history'),
  'recommend_pneu', public.orion_dprice_recommend('cdf88ee7-8c65-4ecb-b37d-23aad7070c7f'),
  'simulate_pneu_metade', public.orion_dprice_simulate('cdf88ee7-8c65-4ecb-b37d-23aad7070c7f', 95, NULL, 30)
) AS verificacao;
