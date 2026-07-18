-- ============================================================================
-- COMANDO LEILÃO — Auction Command Center (agregação admin) · 2026-07-17
-- ============================================================================
-- Motor operacional do módulo de leilões. ESTENDE o que já existe (não recria):
--   * dados: auction_listings / auction_bids (reais)
--   * motor: orion_auction_* (Fase 1 — close/vencedor/consumo/relatório/auditoria/sugestões)
--   * fraude: AI-41 Fraud Detection (orion_fraud_*) — NÃO recriar tabela de fraude aqui
--   * cobrança/comissão: orion_auction_credit_consumption (créditos consumidos no leilão)
--
-- Adiciona só as RPCs de LEITURA que o Command Center precisa (admin-guarded):
--   auction_command_dashboard() · auction_statistics() · auction_ranking() · auction_command_report()
-- Read-only; nenhuma escrita. Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ── Estatísticas (indicadores principais) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.auction_statistics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'ativos',        (SELECT count(*) FROM public.auction_listings WHERE coalesce(status,'active') IN ('active','ativo','published','live')),
    'agendados',     (SELECT count(*) FROM public.auction_listings WHERE starts_at > now() OR status IN ('scheduled','agendado')),
    'encerrados',    (SELECT count(*) FROM public.auction_listings WHERE status IN ('ended','encerrado','closed')),
    'cancelados',    (SELECT count(*) FROM public.auction_listings WHERE status IN ('canceled','cancelled','cancelado')),
    'com_vencedor',  (SELECT count(*) FROM public.auction_listings WHERE winner_user_id IS NOT NULL),
    'total_lances',  (SELECT count(*) FROM public.auction_bids),
    'maior_lance',   (SELECT coalesce(max(amount_cents),0)/100.0 FROM public.auction_bids),
    'usuarios_ativos',(SELECT count(DISTINCT user_id) FROM public.auction_bids),
    'valor_movimentado', (SELECT coalesce(sum(coalesce(current_bid, starting_bid, 0)),0) FROM public.auction_listings WHERE winner_user_id IS NOT NULL),
    'taxa_conversao', (SELECT CASE WHEN e>0 THEN round(w*100.0/e) ELSE 0 END
                       FROM (SELECT count(*) FILTER (WHERE status IN ('ended','encerrado','closed')) e,
                                    count(*) FILTER (WHERE winner_user_id IS NOT NULL) w FROM public.auction_listings) x),
    'tempo_medio_horas', (SELECT coalesce(round(avg(EXTRACT(epoch FROM (ends_at - starts_at))/3600))::int,0)
                          FROM public.auction_listings WHERE ends_at IS NOT NULL AND starts_at IS NOT NULL),
    'receita_creditos', (SELECT coalesce(sum(creditos),0) FROM public.orion_auction_credit_consumption),
    'comissao_creditos', (SELECT coalesce(sum(creditos) FILTER (WHERE tipo='encerramento'),0) FROM public.orion_auction_credit_consumption),
    'fraudes_detectadas', 0,
    'nota_fraude', 'Fraude de leilão é coberta pelo AI-41 Fraud Detection (orion_fraud_*) — DECLARADO; contagem específica de leilão entra quando houver detector dedicado.',
    'gerado_em', now());
END$$;
GRANT EXECUTE ON FUNCTION public.auction_statistics() TO authenticated, service_role;

-- ── Ranking (top categorias / cidades / vendedores) ────────────────────────
CREATE OR REPLACE FUNCTION public.auction_ranking()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'top_cidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',coalesce(city,'(sem)'),'leiloes',n) ORDER BY n DESC),'[]'::jsonb)
       FROM (SELECT city, count(*) n FROM public.auction_listings GROUP BY city ORDER BY n DESC LIMIT 10) x),
    'top_vendedores', (SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor',owner_user_id,'leiloes',n,'valor',v) ORDER BY n DESC),'[]'::jsonb)
       FROM (SELECT owner_user_id, count(*) n, coalesce(sum(coalesce(current_bid,starting_bid,0)),0) v
             FROM public.auction_listings WHERE owner_user_id IS NOT NULL GROUP BY owner_user_id ORDER BY n DESC LIMIT 10) x),
    'top_leiloes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'titulo',title,'lances',total_bids,'valor',coalesce(current_bid,starting_bid,0)) ORDER BY total_bids DESC),'[]'::jsonb)
       FROM (SELECT id, title, total_bids, current_bid, starting_bid FROM public.auction_listings ORDER BY total_bids DESC NULLS LAST LIMIT 10) x));
END$$;
GRANT EXECUTE ON FUNCTION public.auction_ranking() TO authenticated, service_role;

-- ── Dashboard (agrega tudo + últimos leilões + últimos lances) ─────────────
CREATE OR REPLACE FUNCTION public.auction_command_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'stats', public.auction_statistics(),
    'ranking', public.auction_ranking(),
    'ultimos_leiloes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'titulo',title,'status',status,'tipo',listing_type,'valor_atual',coalesce(current_bid,starting_bid,0),
        'lances',total_bids,'cidade',city,'fim',ends_at) ORDER BY created_at DESC),'[]'::jsonb)
       FROM (SELECT id,title,status,listing_type,current_bid,starting_bid,total_bids,city,ends_at,created_at
             FROM public.auction_listings ORDER BY created_at DESC LIMIT 15) x),
    'ultimos_lances', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'listing_id',listing_id,'valor',amount_cents/100.0,'quando',created_at,'vencendo',is_winning) ORDER BY created_at DESC),'[]'::jsonb)
       FROM (SELECT listing_id,amount_cents,created_at,is_winning FROM public.auction_bids ORDER BY created_at DESC LIMIT 15) x),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(coalesce(listing_type,'auction'), n),'{}'::jsonb)
       FROM (SELECT listing_type, count(*) n FROM public.auction_listings GROUP BY listing_type) x),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
END$$;
GRANT EXECUTE ON FUNCTION public.auction_command_dashboard() TO authenticated, service_role;

-- ── Verificação (esperado: 3 funções) ──────────────────────────────────────
SELECT count(*) AS funcoes_command_center
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('auction_statistics','auction_ranking','auction_command_dashboard');

-- ============================================================================
-- ROLLBACK: DROP FUNCTION IF EXISTS public.auction_command_dashboard,
--   public.auction_ranking, public.auction_statistics;
-- ============================================================================
