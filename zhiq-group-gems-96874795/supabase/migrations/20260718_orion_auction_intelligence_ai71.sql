-- ============================================================================
-- ORION-AI-71 — Auction Intelligence AI v1.0 (Score/Alertas/Vendedor) · 2026-07-18
-- ============================================================================
-- ESTENDE o AI-67 (predict/market/intel). Adiciona a camada estratégica:
--   * Score do Leilão 0-100 (decomposto, sobre sinais REAIS + lacunas declaradas)
--   * Telemetria (histórico de score) + motor de ALERTAS inteligentes
--   * Dashboard do VENDEDOR (score/probabilidade/valor previsto/sugestões)
--   * Sugestões de baixa performance
-- READ-ONLY nas leituras; ticks só gravam telemetria/alertas (não movem dinheiro).
-- Sinais inexistentes no schema (favoritos/compartilhamentos/perguntas/mensagens)
-- são DECLARADOS — nunca inventados. Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ── 1) SCORE do leilão (0-100) + probabilidade + valor previsto + sugestões ─
CREATE OR REPLACE FUNCTION public.orion_auction_score(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_views int; v_bidders int; v_bids int; v_hours numeric; v_vel numeric;
  v_seller_arr int; v_pred jsonb; v_score int; v_int int; v_part int; v_act int; v_hist int; v_fresh int;
  v_sug jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing;
  IF v_l IS NULL THEN RETURN jsonb_build_object('erro','leilão inexistente'); END IF;

  v_views   := coalesce((SELECT max(views_count) FROM public.auction_conversion_metrics WHERE listing_id = p_listing), 0);
  v_bidders := (SELECT count(DISTINCT user_id) FROM public.auction_bids WHERE listing_id = p_listing);
  v_bids    := coalesce(v_l.total_bids, (SELECT count(*) FROM public.auction_bids WHERE listing_id = p_listing));
  v_hours   := GREATEST(1, EXTRACT(epoch FROM (now() - coalesce(v_l.starts_at, now())))/3600.0);
  v_vel     := v_bids / v_hours;
  v_seller_arr := (SELECT count(*) FROM public.orion_auction_settlements
                    WHERE seller_user_id = v_l.owner_user_id AND winner_user_id IS NOT NULL);
  v_pred := public.orion_auction_predict(p_listing);

  v_int   := LEAST(25, v_views*2 + coalesce(v_l.watchers_count,0)*3);
  v_part  := LEAST(25, v_bidders*8);
  v_act   := LEAST(25, v_bids*4 + floor(v_vel*5)::int);
  v_hist  := LEAST(15, v_seller_arr*5);
  v_fresh := CASE WHEN v_l.ends_at > now() THEN 10 ELSE 0 END;
  v_score := LEAST(100, v_int + v_part + v_act + v_hist + v_fresh);

  IF v_score < 60 THEN
    IF v_bids = 0 THEN v_sug := v_sug || jsonb_build_array('Reduza o lance mínimo para destravar os primeiros lances'); END IF;
    IF v_views < 10 THEN v_sug := v_sug || jsonb_build_array('Impulsione o anúncio para ganhar visibilidade'); END IF;
    IF v_l.product_image_url IS NULL THEN v_sug := v_sug || jsonb_build_array('Adicione fotos do produto'); END IF;
    IF coalesce(length(v_l.description),0) < 40 THEN v_sug := v_sug || jsonb_build_array('Amplie a descrição do produto'); END IF;
    v_sug := v_sug || jsonb_build_array('Considere ampliar a duração do leilão');
  END IF;

  RETURN jsonb_build_object(
    'listing_id', p_listing, 'titulo', v_l.title, 'score', v_score,
    'label', CASE WHEN v_score>=80 THEN 'Alta chance de venda' WHEN v_score>=60 THEN 'Boa oportunidade' ELSE 'Necessita melhorias' END,
    'probabilidade_venda_pct', (v_pred->>'chance_venda_pct')::int,
    'valor_previsto', (v_pred->>'valor_provavel')::numeric,
    'confianca', v_pred->>'confianca',
    'breakdown', jsonb_build_object('interesse',v_int,'participacao',v_part,'atividade',v_act,'historico_vendedor',v_hist,'frescor',v_fresh),
    'sinais', jsonb_build_object('views',v_views,'watchers',coalesce(v_l.watchers_count,0),
        'licitantes',v_bidders,'lances',v_bids,'velocidade_lances_h',round(v_vel,2)),
    'sinais_indisponiveis', jsonb_build_array('favoritos','compartilhamentos','perguntas','mensagens'),
    'sugestoes', v_sug, 'gerado_em', now());
END$$;

-- ── 2) Telemetria: histórico de score ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_auction_score_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id     uuid NOT NULL,
  score          int,
  probabilidade  int,
  valor_previsto numeric,
  sinais         jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_orion_score_hist ON public.orion_auction_score_history (listing_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.orion_auction_score_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_s jsonb; v_n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.auction_listings
    WHERE coalesce(status,'active') IN ('active','ativo','published','live') AND ends_at > now() LIMIT 500
  LOOP
    v_s := public.orion_auction_score(r.id);
    INSERT INTO public.orion_auction_score_history (listing_id, score, probabilidade, valor_previsto, sinais)
    VALUES (r.id, (v_s->>'score')::int, (v_s->>'probabilidade_venda_pct')::int,
            (v_s->>'valor_previsto')::numeric, v_s->'sinais');
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'snapshots', v_n, 'em', now());
END$$;

-- ── 3) Motor de ALERTAS inteligentes ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_auction_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL,
  seller_user_id uuid,
  tipo        text NOT NULL,      -- encerrando|baixo_interesse|visitantes_sem_lances|alta_concorrencia|novo_maior_lance
  severidade  text NOT NULL DEFAULT 'info',
  mensagem    text,
  dados       jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_orion_alerts_listing ON public.orion_auction_alerts (listing_id, tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_alerts_seller  ON public.orion_auction_alerts (seller_user_id, created_at DESC);

-- gera alerta se não houver um do mesmo tipo nas últimas 6h (anti-spam)
CREATE OR REPLACE FUNCTION public.orion_auction_alert_emit(p_listing uuid, p_seller uuid, p_tipo text, p_sev text, p_msg text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orion_auction_alerts
                  WHERE listing_id = p_listing AND tipo = p_tipo AND created_at > now() - interval '6 hour') THEN
    INSERT INTO public.orion_auction_alerts (listing_id, seller_user_id, tipo, severidade, mensagem, dados)
    VALUES (p_listing, p_seller, p_tipo, p_sev, p_msg, coalesce(p_dados,'{}'::jsonb));
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.orion_auction_alert_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_views int; v_bidders int; v_bids int; v_min numeric; v_n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.auction_listings
    WHERE coalesce(status,'active') IN ('active','ativo','published','live') AND ends_at > now() LIMIT 500
  LOOP
    v_views   := coalesce((SELECT max(views_count) FROM public.auction_conversion_metrics WHERE listing_id = r.id),0);
    v_bidders := (SELECT count(DISTINCT user_id) FROM public.auction_bids WHERE listing_id = r.id);
    v_bids    := coalesce(r.total_bids, 0);
    v_min     := EXTRACT(epoch FROM (r.ends_at - now()))/60.0;

    IF v_min <= 15 THEN
      PERFORM public.orion_auction_alert_emit(r.id, r.owner_user_id, 'encerrando', 'alta',
        'Leilão nos últimos minutos', jsonb_build_object('minutos', round(v_min,1))); v_n:=v_n+1; END IF;
    IF v_bids = 0 AND coalesce(r.watchers_count,0) = 0 AND now() - r.starts_at > interval '24 hour' THEN
      PERFORM public.orion_auction_alert_emit(r.id, r.owner_user_id, 'baixo_interesse', 'media',
        'Baixo interesse — considere impulsionar/ajustar', '{}'::jsonb); v_n:=v_n+1; END IF;
    IF v_views >= 10 AND v_bids = 0 THEN
      PERFORM public.orion_auction_alert_emit(r.id, r.owner_user_id, 'visitantes_sem_lances', 'media',
        'Muitos visitantes, nenhum lance — reduza o lance mínimo', jsonb_build_object('views', v_views)); v_n:=v_n+1; END IF;
    IF v_bidders >= 5 THEN
      PERFORM public.orion_auction_alert_emit(r.id, r.owner_user_id, 'alta_concorrencia', 'info',
        'Alta concorrência neste leilão', jsonb_build_object('licitantes', v_bidders)); v_n:=v_n+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'alertas_avaliados', v_n, 'em', now());
END$$;

-- ── 4) Dashboard do VENDEDOR (seus leilões: score/prob/valor/sugestões) ─────
CREATE OR REPLACE FUNCTION public.orion_auction_seller_dashboard(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := coalesce(p_user, auth.uid());
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('erro','sem usuário'); END IF;
  RETURN jsonb_build_object(
    'usuario', v_user,
    'leiloes', (SELECT coalesce(jsonb_agg(public.orion_auction_score(id) ORDER BY id),'[]'::jsonb)
        FROM (SELECT id FROM public.auction_listings
              WHERE owner_user_id = v_user AND coalesce(status,'active') IN ('active','ativo','published','live')
              ORDER BY ends_at LIMIT 50) x),
    'alertas', (SELECT coalesce(jsonb_agg(jsonb_build_object('listing',listing_id,'tipo',tipo,'sev',severidade,'msg',mensagem,'em',created_at) ORDER BY created_at DESC),'[]'::jsonb)
        FROM (SELECT * FROM public.orion_auction_alerts WHERE seller_user_id = v_user ORDER BY created_at DESC LIMIT 30) a),
    'resumo', jsonb_build_object(
        'ativos', (SELECT count(*) FROM public.auction_listings WHERE owner_user_id=v_user AND coalesce(status,'active') IN ('active','ativo','published','live')),
        'arremates', (SELECT count(*) FROM public.orion_auction_settlements WHERE seller_user_id=v_user AND winner_user_id IS NOT NULL),
        'receita_arrematada', (SELECT coalesce(sum(valor_final),0) FROM public.orion_auction_settlements WHERE seller_user_id=v_user AND winner_user_id IS NOT NULL)),
    'gerado_em', now());
END$$;

-- ── 5) Crons (telemetria + alertas a cada 10 min) ──────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_auction_score_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_score_tick');
    PERFORM cron.unschedule('orion_auction_alert_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_alert_tick');
    PERFORM cron.schedule('orion_auction_score_tick', '*/10 * * * *', 'SELECT public.orion_auction_score_tick();');
    PERFORM cron.schedule('orion_auction_alert_tick', '*/10 * * * *', 'SELECT public.orion_auction_alert_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron: %', SQLERRM;
END$$;

-- ── 6) RLS + permissões (ORION) ────────────────────────────────────────────
ALTER TABLE public.orion_auction_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_auction_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY orion_score_hist_read ON public.orion_auction_score_history FOR SELECT TO authenticated
    USING (public.mp_is_admin() OR listing_id IN (SELECT id FROM public.auction_listings WHERE owner_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY orion_alerts_read ON public.orion_auction_alerts FOR SELECT TO authenticated
    USING (public.mp_is_admin() OR seller_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON TABLE public.orion_auction_score_history FROM anon, public;
REVOKE ALL ON TABLE public.orion_auction_alerts FROM anon, public;
GRANT SELECT ON TABLE public.orion_auction_score_history TO authenticated;
GRANT SELECT ON TABLE public.orion_auction_alerts TO authenticated;

REVOKE ALL ON FUNCTION public.orion_auction_score(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_seller_dashboard(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_score_tick() FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_alert_tick() FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_alert_emit(uuid,uuid,text,text,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_auction_score(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_seller_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_score_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_alert_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_alert_emit(uuid,uuid,text,text,text,jsonb) TO service_role;

-- ── 7) Verificação ─────────────────────────────────────────────────────────
SELECT jsonb_build_object(
  'funcoes', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
     AND p.proname IN ('orion_auction_score','orion_auction_seller_dashboard','orion_auction_score_tick','orion_auction_alert_tick','orion_auction_alert_emit')),  -- espera 5
  'tabelas', (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
     AND table_name IN ('orion_auction_score_history','orion_auction_alerts')),  -- espera 2
  'crons', (SELECT count(*) FROM cron.job WHERE jobname IN ('orion_auction_score_tick','orion_auction_alert_tick')),  -- espera 2
  'score_pneu', public.orion_auction_score('cdf88ee7-8c65-4ecb-b37d-23aad7070c7f')
) AS verificacao;
