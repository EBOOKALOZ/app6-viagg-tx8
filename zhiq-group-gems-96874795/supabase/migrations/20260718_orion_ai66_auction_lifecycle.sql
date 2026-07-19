-- ============================================================================
-- ORION-AI-66 — Auction Lifecycle & Reputation AI v1.0 · 2026-07-18
-- ============================================================================
-- Ciclo de vida PÓS-ARREMATE: acompanha a negociação do vencedor até o
-- encerramento (status, confirmação das partes, avaliações, disputas),
-- calcula reputação/Trust Score determinístico e alimenta o dashboard admin.
--
-- ESTENDE o ecossistema de leilões (NÃO recria):
--   * O deal NASCE do encerramento: trigger em orion_auction_reports (que já
--     traz vencedor_user_id + valor_final) + backfill idempotente.
--   * Seller = auction_listings.owner_user_id (fallback merchant_stores).
--   * Reputação global via AI-20 Trust (trust_emit) — aqui só a camada de leilão.
--   * Predições DETERMINÍSTICAS (sinais reais; heurística DECLARADA sem histórico)
--     — nunca inventa; não chama LLM.
--
-- Namespace próprio: orion_alc_* · chave ORION: auction_lifecycle.
-- Segurança: RLS ON + REVOKE ALL/GRANT mínimo; funções SECURITY DEFINER com
-- guarda de admin nas de leitura agregada; REVOKE EXECUTE FROM public,anon.
-- Recomenda-nunca-executa · evidência · idempotente · SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) TABELAS
-- ─────────────────────────────────────────────────────────────────────────

-- 1.1 Deals (uma negociação por leilão encerrado com vencedor)
CREATE TABLE IF NOT EXISTS public.orion_alc_deals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        uuid NOT NULL UNIQUE,
  seller_user_id    uuid,
  buyer_user_id     uuid,
  amount            numeric NOT NULL DEFAULT 0,
  listing_type      text,
  category          text,
  city              text,
  status            text NOT NULL DEFAULT 'aguardando_contato'
                    CHECK (status IN ('aguardando_contato','contato_realizado','em_andamento',
                                      'pagamento_combinado','entregue','servico_executado',
                                      'concluida','cancelada','em_disputa')),
  -- confirmações independentes (comprador × vendedor)
  buyer_contato_at     timestamptz,
  seller_contato_at    timestamptz,
  buyer_recebido_at    timestamptz,  -- comprador confirma recebido/serviço executado
  seller_entregue_at   timestamptz,  -- vendedor confirma entregue/serviço finalizado
  buyer_concluido_at   timestamptz,
  seller_concluido_at  timestamptz,
  -- marcos derivados
  first_contact_at  timestamptz,
  concluded_at      timestamptz,
  canceled_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_alc_deals_seller ON public.orion_alc_deals(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_orion_alc_deals_buyer  ON public.orion_alc_deals(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_orion_alc_deals_status ON public.orion_alc_deals(status);

-- 1.2 Eventos (linha do tempo IMUTÁVEL — só INSERT)
CREATE TABLE IF NOT EXISTS public.orion_alc_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        uuid NOT NULL REFERENCES public.orion_alc_deals(id) ON DELETE CASCADE,
  event_type     text NOT NULL,     -- status_change | confirm | rating | dispute | system
  from_status    text,
  to_status      text,
  actor_user_id  uuid,
  party          text,              -- buyer | seller | admin | system
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_alc_events_deal ON public.orion_alc_events(deal_id, at DESC);

-- 1.3 Avaliações mútuas (1 por parte por deal)
CREATE TABLE IF NOT EXISTS public.orion_alc_ratings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        uuid NOT NULL REFERENCES public.orion_alc_deals(id) ON DELETE CASCADE,
  rater_user_id  uuid NOT NULL,
  ratee_user_id  uuid NOT NULL,
  rater_party    text NOT NULL CHECK (rater_party IN ('buyer','seller')),
  stars          int  NOT NULL CHECK (stars BETWEEN 1 AND 5),
  pontualidade   int  CHECK (pontualidade BETWEEN 1 AND 5),
  comunicacao    int  CHECK (comunicacao BETWEEN 1 AND 5),
  qualidade      int  CHECK (qualidade BETWEEN 1 AND 5),
  experiencia    int  CHECK (experiencia BETWEEN 1 AND 5),
  comment        text,
  at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, rater_party)
);
CREATE INDEX IF NOT EXISTS idx_orion_alc_ratings_ratee ON public.orion_alc_ratings(ratee_user_id);

-- 1.4 Disputas
CREATE TABLE IF NOT EXISTS public.orion_alc_disputes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           uuid NOT NULL REFERENCES public.orion_alc_deals(id) ON DELETE CASCADE,
  opened_by_user_id uuid,
  opened_by_party   text CHECK (opened_by_party IN ('buyer','seller')),
  motivo            text NOT NULL,
  evidencias        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta','em_analise','resolvida','rejeitada')),
  decisao           text,
  decided_by        uuid,
  decided_at        timestamptz,
  at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_alc_disputes_deal ON public.orion_alc_disputes(deal_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) SEGURANÇA — RLS + GRANTS (default grants dão TRUNCATE/DELETE p/ anon →
--    ignoram RLS; por isso REVOKE ALL e liberar só SELECT ao authenticated.
--    Escritas SOMENTE via RPCs SECURITY DEFINER.)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orion_alc_deals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_alc_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_alc_ratings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_alc_disputes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orion_alc_deals, public.orion_alc_events,
                     public.orion_alc_ratings, public.orion_alc_disputes FROM public, anon;
GRANT SELECT ON TABLE public.orion_alc_deals, public.orion_alc_events,
                       public.orion_alc_ratings, public.orion_alc_disputes TO authenticated;

-- Deals: participantes ou admin
DROP POLICY IF EXISTS orion_alc_deals_sel ON public.orion_alc_deals;
CREATE POLICY orion_alc_deals_sel ON public.orion_alc_deals FOR SELECT TO authenticated
  USING (seller_user_id = auth.uid() OR buyer_user_id = auth.uid() OR public.mp_is_admin());

-- Events: participantes do deal ou admin
DROP POLICY IF EXISTS orion_alc_events_sel ON public.orion_alc_events;
CREATE POLICY orion_alc_events_sel ON public.orion_alc_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orion_alc_deals d WHERE d.id = deal_id
                 AND (d.seller_user_id = auth.uid() OR d.buyer_user_id = auth.uid())) OR public.mp_is_admin());

-- Ratings: leitura pública (reputação) para usuários logados
DROP POLICY IF EXISTS orion_alc_ratings_sel ON public.orion_alc_ratings;
CREATE POLICY orion_alc_ratings_sel ON public.orion_alc_ratings FOR SELECT TO authenticated USING (true);

-- Disputes: participantes ou admin
DROP POLICY IF EXISTS orion_alc_disputes_sel ON public.orion_alc_disputes;
CREATE POLICY orion_alc_disputes_sel ON public.orion_alc_disputes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orion_alc_deals d WHERE d.id = deal_id
                 AND (d.seller_user_id = auth.uid() OR d.buyer_user_id = auth.uid())) OR public.mp_is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 3) FUNÇÕES DE LEITURA/ESCRITA (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────

-- 3.1 Abre (ou retorna) o deal de um leilão encerrado — idempotente
CREATE OR REPLACE FUNCTION public.orion_alc_open_deal(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_seller uuid; v_buyer uuid; v_amount numeric; v_id uuid;
BEGIN
  SELECT id, owner_user_id, store_id, winner_user_id, current_bid, listing_type, city, title
    INTO l FROM public.auction_listings WHERE id = p_listing_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'listing inexistente'); END IF;

  v_buyer := l.winner_user_id;
  v_seller := coalesce(l.owner_user_id, (SELECT user_id FROM public.merchant_stores WHERE id = l.store_id));
  v_amount := coalesce((SELECT valor_final FROM public.orion_auction_reports
                        WHERE listing_id = p_listing_id ORDER BY gerado_em DESC LIMIT 1), l.current_bid, 0);
  IF v_buyer IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'leilao sem vencedor'); END IF;

  INSERT INTO public.orion_alc_deals (listing_id, seller_user_id, buyer_user_id, amount, listing_type, category, city)
  VALUES (p_listing_id, v_seller, v_buyer, v_amount, coalesce(l.listing_type,'auction'), coalesce(l.listing_type,'auction'), l.city)
  ON CONFLICT (listing_id) DO UPDATE
     SET seller_user_id = coalesce(public.orion_alc_deals.seller_user_id, excluded.seller_user_id),
         buyer_user_id  = coalesce(public.orion_alc_deals.buyer_user_id, excluded.buyer_user_id),
         amount         = GREATEST(public.orion_alc_deals.amount, excluded.amount),
         updated_at     = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'deal_id', v_id, 'seller', v_seller, 'buyer', v_buyer, 'amount', v_amount);
END$$;

-- 3.2 Backfill: cria deals p/ leilões encerrados com vencedor que ainda não têm deal
CREATE OR REPLACE FUNCTION public.orion_alc_sync_deals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT al.id FROM public.auction_listings al
     WHERE al.winner_user_id IS NOT NULL
       AND coalesce(al.status,'') IN ('ended','encerrado','closed','sold')
       AND NOT EXISTS (SELECT 1 FROM public.orion_alc_deals d WHERE d.listing_id = al.id)
     LIMIT 500
  LOOP
    PERFORM public.orion_alc_open_deal(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'criados', v_n, 'em', now());
END$$;

-- 3.3 Guard interno: resolve o ator e valida que é participante/admin/serviço
CREATE OR REPLACE FUNCTION public.orion_alc_actor(p_deal_id uuid, p_user_id uuid, OUT v_actor uuid, OUT v_party text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_priv boolean;
BEGIN
  SELECT * INTO d FROM public.orion_alc_deals WHERE id = p_deal_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'deal inexistente'; END IF;
  v_priv := public.mp_is_admin() OR session_user = 'postgres' OR coalesce(auth.role(),'') = 'service_role';
  v_actor := coalesce(p_user_id, auth.uid());
  IF v_actor IS NULL THEN RAISE EXCEPTION 'sem ator (login necessario)'; END IF;
  IF v_actor <> coalesce(auth.uid(), v_actor) AND NOT v_priv THEN
    RAISE EXCEPTION 'ator diferente do usuario autenticado';
  END IF;
  IF    v_actor = d.buyer_user_id  THEN v_party := 'buyer';
  ELSIF v_actor = d.seller_user_id THEN v_party := 'seller';
  ELSIF v_priv THEN v_party := 'admin';
  ELSE RAISE EXCEPTION 'ator nao participa deste deal';
  END IF;
END$$;

-- 3.4 Muda status (participante ou admin) + evento
CREATE OR REPLACE FUNCTION public.orion_alc_set_status(p_deal_id uuid, p_status text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_actor uuid; v_party text;
BEGIN
  IF p_status NOT IN ('aguardando_contato','contato_realizado','em_andamento','pagamento_combinado',
                      'entregue','servico_executado','concluida','cancelada','em_disputa') THEN
    RAISE EXCEPTION 'status invalido: %', p_status;
  END IF;
  SELECT * INTO v_actor, v_party FROM public.orion_alc_actor(p_deal_id, p_user_id);
  SELECT * INTO d FROM public.orion_alc_deals WHERE id = p_deal_id;

  UPDATE public.orion_alc_deals
     SET status = p_status,
         concluded_at = CASE WHEN p_status='concluida' THEN now() ELSE concluded_at END,
         canceled_at  = CASE WHEN p_status='cancelada' THEN now() ELSE canceled_at END,
         updated_at = now()
   WHERE id = p_deal_id;

  INSERT INTO public.orion_alc_events (deal_id, event_type, from_status, to_status, actor_user_id, party)
  VALUES (p_deal_id, 'status_change', d.status, p_status, v_actor, v_party);

  RETURN jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', p_status);
END$$;

-- 3.5 Confirmação independente das partes (contato | entrega | conclusao)
CREATE OR REPLACE FUNCTION public.orion_alc_confirm(p_deal_id uuid, p_kind text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_actor uuid; v_party text; v_new_status text;
BEGIN
  IF p_kind NOT IN ('contato','entrega','conclusao') THEN RAISE EXCEPTION 'kind invalido: %', p_kind; END IF;
  SELECT * INTO v_actor, v_party FROM public.orion_alc_actor(p_deal_id, p_user_id);
  IF v_party = 'admin' THEN RAISE EXCEPTION 'admin nao confirma pelas partes'; END IF;

  -- grava o timestamp correspondente à parte + tipo
  UPDATE public.orion_alc_deals SET
    buyer_contato_at    = CASE WHEN p_kind='contato'   AND v_party='buyer'  THEN coalesce(buyer_contato_at, now())    ELSE buyer_contato_at END,
    seller_contato_at   = CASE WHEN p_kind='contato'   AND v_party='seller' THEN coalesce(seller_contato_at, now())   ELSE seller_contato_at END,
    buyer_recebido_at   = CASE WHEN p_kind='entrega'   AND v_party='buyer'  THEN coalesce(buyer_recebido_at, now())   ELSE buyer_recebido_at END,
    seller_entregue_at  = CASE WHEN p_kind='entrega'   AND v_party='seller' THEN coalesce(seller_entregue_at, now())  ELSE seller_entregue_at END,
    buyer_concluido_at  = CASE WHEN p_kind='conclusao' AND v_party='buyer'  THEN coalesce(buyer_concluido_at, now())  ELSE buyer_concluido_at END,
    seller_concluido_at = CASE WHEN p_kind='conclusao' AND v_party='seller' THEN coalesce(seller_concluido_at, now()) ELSE seller_concluido_at END,
    updated_at = now()
  WHERE id = p_deal_id;

  SELECT * INTO d FROM public.orion_alc_deals WHERE id = p_deal_id;

  -- primeiro contato
  IF d.first_contact_at IS NULL AND (d.buyer_contato_at IS NOT NULL OR d.seller_contato_at IS NOT NULL) THEN
    UPDATE public.orion_alc_deals SET first_contact_at = now() WHERE id = p_deal_id AND first_contact_at IS NULL;
  END IF;

  -- transições automáticas por dupla confirmação
  v_new_status := d.status;
  IF d.buyer_contato_at IS NOT NULL AND d.seller_contato_at IS NOT NULL AND d.status = 'aguardando_contato' THEN
    v_new_status := 'contato_realizado';
  END IF;
  IF d.buyer_concluido_at IS NOT NULL AND d.seller_concluido_at IS NOT NULL THEN
    v_new_status := 'concluida';
  END IF;
  IF v_new_status <> d.status THEN
    UPDATE public.orion_alc_deals
       SET status = v_new_status,
           concluded_at = CASE WHEN v_new_status='concluida' THEN now() ELSE concluded_at END,
           updated_at = now()
     WHERE id = p_deal_id;
  END IF;

  INSERT INTO public.orion_alc_events (deal_id, event_type, from_status, to_status, actor_user_id, party, detail)
  VALUES (p_deal_id, 'confirm', d.status, v_new_status, v_actor, v_party, jsonb_build_object('kind', p_kind));

  RETURN jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'party', v_party, 'kind', p_kind, 'status', v_new_status);
END$$;

-- 3.6 Avaliação mútua (só após conclusão) — 1 por parte
CREATE OR REPLACE FUNCTION public.orion_alc_rate(
  p_deal_id uuid, p_stars int, p_pontualidade int DEFAULT NULL, p_comunicacao int DEFAULT NULL,
  p_qualidade int DEFAULT NULL, p_experiencia int DEFAULT NULL, p_comment text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_actor uuid; v_party text; v_ratee uuid;
BEGIN
  SELECT * INTO v_actor, v_party FROM public.orion_alc_actor(p_deal_id, p_user_id);
  IF v_party = 'admin' THEN RAISE EXCEPTION 'admin nao avalia'; END IF;
  SELECT * INTO d FROM public.orion_alc_deals WHERE id = p_deal_id;
  IF d.status <> 'concluida' THEN RAISE EXCEPTION 'so avalia negociacao concluida'; END IF;
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN RAISE EXCEPTION 'stars 1..5'; END IF;
  v_ratee := CASE WHEN v_party='buyer' THEN d.seller_user_id ELSE d.buyer_user_id END;

  INSERT INTO public.orion_alc_ratings (deal_id, rater_user_id, ratee_user_id, rater_party, stars,
                                        pontualidade, comunicacao, qualidade, experiencia, comment)
  VALUES (p_deal_id, v_actor, v_ratee, v_party, p_stars, p_pontualidade, p_comunicacao, p_qualidade, p_experiencia, p_comment)
  ON CONFLICT (deal_id, rater_party) DO UPDATE
     SET stars=excluded.stars, pontualidade=excluded.pontualidade, comunicacao=excluded.comunicacao,
         qualidade=excluded.qualidade, experiencia=excluded.experiencia, comment=excluded.comment, at=now();

  INSERT INTO public.orion_alc_events (deal_id, event_type, actor_user_id, party, detail)
  VALUES (p_deal_id, 'rating', v_actor, v_party, jsonb_build_object('stars', p_stars, 'ratee', v_ratee));

  -- emite p/ AI-20 Trust (reputação global) — best-effort, não aborta
  BEGIN PERFORM public.trust_emit('user', v_ratee::text, 'auction_rating', p_stars::numeric,
                                  jsonb_build_object('deal', p_deal_id, 'party', v_party));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'ratee', v_ratee, 'stars', p_stars);
END$$;

-- 3.7 Abre disputa (participante) → status em_disputa + evento
CREATE OR REPLACE FUNCTION public.orion_alc_open_dispute(
  p_deal_id uuid, p_motivo text, p_evidencias jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid; v_party text; v_id uuid; v_prev text;
BEGIN
  SELECT * INTO v_actor, v_party FROM public.orion_alc_actor(p_deal_id, p_user_id);
  IF v_party = 'admin' THEN RAISE EXCEPTION 'admin registra decisao, nao abre disputa'; END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'motivo obrigatorio'; END IF;

  INSERT INTO public.orion_alc_disputes (deal_id, opened_by_user_id, opened_by_party, motivo, evidencias)
  VALUES (p_deal_id, v_actor, v_party, p_motivo, coalesce(p_evidencias,'[]'::jsonb))
  RETURNING id INTO v_id;

  SELECT status INTO v_prev FROM public.orion_alc_deals WHERE id = p_deal_id;
  UPDATE public.orion_alc_deals SET status='em_disputa', updated_at=now() WHERE id = p_deal_id;

  INSERT INTO public.orion_alc_events (deal_id, event_type, from_status, to_status, actor_user_id, party, detail)
  VALUES (p_deal_id, 'dispute', v_prev, 'em_disputa', v_actor, v_party, jsonb_build_object('dispute_id', v_id, 'motivo', p_motivo));

  -- Integração ORION Security AI (best-effort; declarado — não acopla forte)
  BEGIN PERFORM public.trust_emit('user', v_actor::text, 'auction_dispute_opened', -1::numeric,
                                  jsonb_build_object('deal', p_deal_id, 'dispute', v_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'dispute_id', v_id, 'deal_id', p_deal_id);
END$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) REPUTAÇÃO + TRUST SCORE (determinístico, explicável — read-only)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_alc_reputation(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  as_buyer jsonb; as_seller jsonb; v_trust jsonb;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id obrigatorio'; END IF;
  IF NOT public.mp_is_admin() AND auth.uid() <> p_user_id
     AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o proprio usuario ou admin';
  END IF;

  -- Comprador
  SELECT jsonb_build_object(
    'arremates',      count(*),
    'concluidas',     count(*) FILTER (WHERE status='concluida'),
    'canceladas',     count(*) FILTER (WHERE status='cancelada'),
    'em_disputa',     count(*) FILTER (WHERE status='em_disputa'),
    'indice_pagamento', CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE status IN ('pagamento_combinado','entregue','servico_executado','concluida'))*100.0/count(*)) ELSE 0 END,
    'indice_conclusao', CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE status='concluida')*100.0/count(*)) ELSE 0 END
  ) INTO as_buyer FROM public.orion_alc_deals WHERE buyer_user_id = p_user_id;

  -- Vendedor
  SELECT jsonb_build_object(
    'vendas',         count(*),
    'concluidas',     count(*) FILTER (WHERE status='concluida'),
    'canceladas',     count(*) FILTER (WHERE status='cancelada'),
    'em_disputa',     count(*) FILTER (WHERE status='em_disputa'),
    'indice_entrega', CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE seller_entregue_at IS NOT NULL)*100.0/count(*)) ELSE 0 END,
    'indice_conclusao', CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE status='concluida')*100.0/count(*)) ELSE 0 END,
    'tempo_medio_resposta_h', round(coalesce(avg(EXTRACT(epoch FROM (first_contact_at - created_at))/3600) FILTER (WHERE first_contact_at IS NOT NULL),0)::numeric,1)
  ) INTO as_seller FROM public.orion_alc_deals WHERE seller_user_id = p_user_id;

  -- Avaliações recebidas
  SELECT jsonb_build_object(
    'avaliacoes', count(*),
    'media',      round(coalesce(avg(stars),0)::numeric,2),
    'pontualidade', round(coalesce(avg(pontualidade),0)::numeric,2),
    'comunicacao',  round(coalesce(avg(comunicacao),0)::numeric,2),
    'qualidade',    round(coalesce(avg(qualidade),0)::numeric,2),
    'experiencia',  round(coalesce(avg(experiencia),0)::numeric,2)
  ) INTO v_trust FROM public.orion_alc_ratings WHERE ratee_user_id = p_user_id;

  RETURN jsonb_build_object(
    'user_id', p_user_id, 'como_comprador', as_buyer, 'como_vendedor', as_seller,
    'avaliacoes_recebidas', v_trust, 'gerado_em', now());
END$$;

-- Trust Score de leilão 0-100 (explicável)
CREATE OR REPLACE FUNCTION public.orion_alc_trust_score(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deals int; v_conc int; v_canc int; v_disp int; v_media numeric; v_avals int;
  v_score numeric; v_base numeric := 60;
BEGIN
  IF NOT public.mp_is_admin() AND auth.uid() <> p_user_id
     AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o proprio usuario ou admin';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE status='concluida'),
         count(*) FILTER (WHERE status='cancelada'), count(*) FILTER (WHERE status='em_disputa')
    INTO v_deals, v_conc, v_canc, v_disp
    FROM public.orion_alc_deals WHERE buyer_user_id=p_user_id OR seller_user_id=p_user_id;
  SELECT round(coalesce(avg(stars),0)::numeric,2), count(*) INTO v_media, v_avals
    FROM public.orion_alc_ratings WHERE ratee_user_id=p_user_id;

  -- Componentes explicáveis (base 60 sem histórico = neutro DECLARADO)
  v_score := v_base
    + CASE WHEN v_deals>0 THEN (v_conc*1.0/v_deals)*25 ELSE 0 END        -- +25 por taxa de conclusão
    + CASE WHEN v_avals>0 THEN (v_media-3)*8 ELSE 0 END                   -- ±16 pela média (3=neutro)
    - v_canc*3                                                            -- -3 por cancelamento
    - v_disp*6                                                            -- -6 por disputa
    + LEAST(v_deals,10)*0.5;                                              -- +até 5 por frequência
  v_score := GREATEST(0, LEAST(100, round(v_score)));

  RETURN jsonb_build_object(
    'user_id', p_user_id, 'trust_score', v_score,
    'base', CASE WHEN v_deals=0 AND v_avals=0 THEN 'sem historico — score neutro DECLARADO' ELSE 'calculado sobre historico real' END,
    'evidencia', jsonb_build_object('deals', v_deals, 'concluidas', v_conc, 'canceladas', v_canc,
                                    'disputas', v_disp, 'avaliacoes', v_avals, 'media', v_media),
    'gerado_em', now());
END$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) MÉTRICAS + DASHBOARD (admin) + PREDIÇÃO
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_alc_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'total',          (SELECT count(*) FROM public.orion_alc_deals),
    'em_andamento',   (SELECT count(*) FROM public.orion_alc_deals WHERE status IN ('aguardando_contato','contato_realizado','em_andamento','pagamento_combinado','entregue','servico_executado')),
    'concluidas',     (SELECT count(*) FROM public.orion_alc_deals WHERE status='concluida'),
    'canceladas',     (SELECT count(*) FROM public.orion_alc_deals WHERE status='cancelada'),
    'em_disputa',     (SELECT count(*) FROM public.orion_alc_deals WHERE status='em_disputa'),
    'taxa_sucesso',   (SELECT CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE status='concluida')*100.0/count(*)) ELSE 0 END FROM public.orion_alc_deals),
    'taxa_cancelamento', (SELECT CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE status='cancelada')*100.0/count(*)) ELSE 0 END FROM public.orion_alc_deals),
    'tempo_medio_1o_contato_h', (SELECT round(coalesce(avg(EXTRACT(epoch FROM (first_contact_at-created_at))/3600) FILTER (WHERE first_contact_at IS NOT NULL),0)::numeric,1) FROM public.orion_alc_deals),
    'tempo_medio_conclusao_h',  (SELECT round(coalesce(avg(EXTRACT(epoch FROM (concluded_at-created_at))/3600) FILTER (WHERE concluded_at IS NOT NULL),0)::numeric,1) FROM public.orion_alc_deals),
    'indice_satisfacao', (SELECT round(coalesce(avg(stars),0)::numeric,2) FROM public.orion_alc_ratings),
    'valor_movimentado', (SELECT coalesce(sum(amount),0) FROM public.orion_alc_deals WHERE status='concluida'),
    'receita_por_categoria', (SELECT coalesce(jsonb_object_agg(coalesce(category,'(sem)'), v),'{}'::jsonb)
        FROM (SELECT category, sum(amount) v FROM public.orion_alc_deals WHERE status='concluida' GROUP BY category) x),
    'receita_por_regiao', (SELECT coalesce(jsonb_object_agg(coalesce(city,'(sem)'), v),'{}'::jsonb)
        FROM (SELECT city, sum(amount) v FROM public.orion_alc_deals WHERE status='concluida' GROUP BY city) x),
    'gerado_em', now());
END$$;

CREATE OR REPLACE FUNCTION public.orion_alc_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'metrics', public.orion_alc_metrics(),
    'disputas_abertas', (SELECT count(*) FROM public.orion_alc_disputes WHERE status IN ('aberta','em_analise')),
    'ranking_vendedores', (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',seller_user_id,'deals',n,'concluidas',c,'valor',v) ORDER BY c DESC, v DESC),'[]'::jsonb)
        FROM (SELECT seller_user_id, count(*) n, count(*) FILTER (WHERE status='concluida') c, coalesce(sum(amount) FILTER (WHERE status='concluida'),0) v
              FROM public.orion_alc_deals WHERE seller_user_id IS NOT NULL GROUP BY seller_user_id ORDER BY c DESC LIMIT 10) x),
    'ranking_compradores', (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',buyer_user_id,'deals',n,'concluidas',c) ORDER BY n DESC),'[]'::jsonb)
        FROM (SELECT buyer_user_id, count(*) n, count(*) FILTER (WHERE status='concluida') c
              FROM public.orion_alc_deals WHERE buyer_user_id IS NOT NULL GROUP BY buyer_user_id ORDER BY n DESC LIMIT 10) x),
    'em_andamento', (SELECT coalesce(jsonb_agg(jsonb_build_object('deal_id',id,'listing_id',listing_id,'status',status,'amount',amount,'cidade',city,'desde',created_at) ORDER BY created_at DESC),'[]'::jsonb)
        FROM (SELECT id,listing_id,status,amount,city,created_at FROM public.orion_alc_deals
              WHERE status NOT IN ('concluida','cancelada') ORDER BY created_at DESC LIMIT 20) x),
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n),'{}'::jsonb)
        FROM (SELECT status, count(*) n FROM public.orion_alc_deals GROUP BY status) x),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
END$$;

-- Predição determinística por deal (probabilidades explicáveis a partir de sinais reais)
CREATE OR REPLACE FUNCTION public.orion_alc_predict(p_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_actor uuid; v_party text;
  v_seller_conc numeric; v_buyer_conc numeric; v_disp int; v_prob int; v_cancel int; v_disprisk int;
BEGIN
  SELECT * INTO d FROM public.orion_alc_deals WHERE id = p_deal_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'deal inexistente'; END IF;
  IF NOT public.mp_is_admin() AND auth.uid() NOT IN (coalesce(d.buyer_user_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(d.seller_user_id,'00000000-0000-0000-0000-000000000000'::uuid))
     AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas participantes ou admin';
  END IF;

  SELECT coalesce(round(count(*) FILTER (WHERE status='concluida')*100.0/NULLIF(count(*),0)),50)
    INTO v_seller_conc FROM public.orion_alc_deals WHERE seller_user_id=d.seller_user_id AND id<>p_deal_id;
  SELECT coalesce(round(count(*) FILTER (WHERE status='concluida')*100.0/NULLIF(count(*),0)),50)
    INTO v_buyer_conc FROM public.orion_alc_deals WHERE buyer_user_id=d.buyer_user_id AND id<>p_deal_id;
  SELECT count(*) INTO v_disp FROM public.orion_alc_disputes WHERE deal_id=p_deal_id;

  -- sinais do próprio deal
  v_prob := round((coalesce(v_seller_conc,50)+coalesce(v_buyer_conc,50))/2.0);
  IF d.first_contact_at IS NOT NULL THEN v_prob := LEAST(100, v_prob + 15); END IF;
  IF d.status IN ('pagamento_combinado','entregue','servico_executado') THEN v_prob := LEAST(100, v_prob + 20); END IF;
  IF d.status='concluida' THEN v_prob := 100; END IF;
  IF d.status IN ('cancelada','em_disputa') THEN v_prob := GREATEST(0, v_prob - 40); END IF;
  v_cancel  := GREATEST(0, LEAST(100, 100 - v_prob));
  v_disprisk := LEAST(100, v_disp*40 + GREATEST(0, 30 - round((coalesce(v_seller_conc,50)+coalesce(v_buyer_conc,50))/4.0)));

  RETURN jsonb_build_object(
    'deal_id', p_deal_id,
    'prob_conclusao', v_prob,
    'risco_cancelamento', v_cancel,
    'risco_disputa', v_disprisk,
    'potencial_recompra', LEAST(100, round(coalesce(v_buyer_conc,50))),
    'base', 'deterministico sobre historico real das partes; sem historico = 50 neutro DECLARADO',
    'evidencia', jsonb_build_object('seller_conclusao_pct', v_seller_conc, 'buyer_conclusao_pct', v_buyer_conc,
                                    'status', d.status, 'primeiro_contato', d.first_contact_at IS NOT NULL, 'disputas', v_disp),
    'gerado_em', now());
END$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) TRIGGER (deal nasce do relatório de encerramento) + REALTIME + CRON
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_alc_report_deal_tg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.orion_alc_open_deal(NEW.listing_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; -- nunca aborta o encerramento
END$$;
DROP TRIGGER IF EXISTS trg_orion_alc_report_deal ON public.orion_auction_reports;
CREATE TRIGGER trg_orion_alc_report_deal AFTER INSERT ON public.orion_auction_reports
  FOR EACH ROW EXECUTE FUNCTION public.orion_alc_report_deal_tg();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orion_alc_deals; EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_alc_sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_alc_sync');
    PERFORM cron.schedule('orion_alc_sync', '*/10 * * * *', 'SELECT public.orion_alc_sync_deals();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) PERMISSÕES DAS FUNÇÕES (REVOKE public/anon; GRANT mínimo)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'orion_alc_open_deal(uuid)','orion_alc_sync_deals()','orion_alc_actor(uuid,uuid)',
    'orion_alc_set_status(uuid,text,uuid)','orion_alc_confirm(uuid,text,uuid)',
    'orion_alc_rate(uuid,int,int,int,int,int,text,uuid)','orion_alc_open_dispute(uuid,text,jsonb,uuid)',
    'orion_alc_reputation(uuid)','orion_alc_trust_score(uuid)','orion_alc_metrics()',
    'orion_alc_dashboard()','orion_alc_predict(uuid)'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon;', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role;', f);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) SELFTEST (COMANDO TESTE) — cria dados sentinela, valida, limpa
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_alc_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_listing uuid := '00000000-0000-0000-00a1-c00000000066';
  v_seller  uuid := '00000000-0000-0000-00a1-c000000005e1';
  v_buyer   uuid := '00000000-0000-0000-00a1-c00000000b02';
  v_deal    uuid; v_pass int := 0; v_fail int := 0; v_notes jsonb := '[]'::jsonb; r jsonb;
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores/serviço';
  END IF;

  -- limpeza prévia (idempotente)
  DELETE FROM public.orion_alc_deals WHERE listing_id = v_listing;

  -- cria deal sentinela direto (sem depender de auction_listings)
  INSERT INTO public.orion_alc_deals (listing_id, seller_user_id, buyer_user_id, amount, listing_type, category, city, status)
  VALUES (v_listing, v_seller, v_buyer, 100, 'auction', 'auction', 'TESTE-CUIABA', 'aguardando_contato')
  RETURNING id INTO v_deal;

  -- confirm contato (as duas partes) → contato_realizado
  PERFORM public.orion_alc_confirm(v_deal, 'contato', v_buyer);
  PERFORM public.orion_alc_confirm(v_deal, 'contato', v_seller);
  IF (SELECT status FROM public.orion_alc_deals WHERE id=v_deal) = 'contato_realizado' THEN v_pass:=v_pass+1;
  ELSE v_fail:=v_fail+1; v_notes := v_notes || to_jsonb('contato_realizado falhou'::text); END IF;

  -- conclusão pelas duas partes → concluida
  PERFORM public.orion_alc_confirm(v_deal, 'conclusao', v_buyer);
  PERFORM public.orion_alc_confirm(v_deal, 'conclusao', v_seller);
  IF (SELECT status FROM public.orion_alc_deals WHERE id=v_deal) = 'concluida' THEN v_pass:=v_pass+1;
  ELSE v_fail:=v_fail+1; v_notes := v_notes || to_jsonb('conclusao falhou'::text); END IF;

  -- avaliação mútua
  PERFORM public.orion_alc_rate(v_deal, 5, 5, 5, 5, 5, 'otimo', v_buyer);
  PERFORM public.orion_alc_rate(v_deal, 4, NULL, NULL, NULL, NULL, NULL, v_seller);
  IF (SELECT count(*) FROM public.orion_alc_ratings WHERE deal_id=v_deal) = 2 THEN v_pass:=v_pass+1;
  ELSE v_fail:=v_fail+1; v_notes := v_notes || to_jsonb('ratings != 2'::text); END IF;

  -- reputação do vendedor (média recebida = 5, do comprador)
  r := public.orion_alc_reputation(v_seller);
  IF (r->'avaliacoes_recebidas'->>'avaliacoes')::int = 1 THEN v_pass:=v_pass+1;
  ELSE v_fail:=v_fail+1; v_notes := v_notes || to_jsonb('reputacao vendedor'::text); END IF;

  -- trust score calculável
  r := public.orion_alc_trust_score(v_buyer);
  IF (r->>'trust_score') IS NOT NULL THEN v_pass:=v_pass+1;
  ELSE v_fail:=v_fail+1; v_notes := v_notes || to_jsonb('trust_score null'::text); END IF;

  -- predição
  r := public.orion_alc_predict(v_deal);
  IF (r->>'prob_conclusao')::int = 100 THEN v_pass:=v_pass+1;
  ELSE v_fail:=v_fail+1; v_notes := v_notes || to_jsonb('predict conclusao<>100'::text); END IF;

  -- dashboard/metrics não explodem
  PERFORM public.orion_alc_dashboard(); v_pass:=v_pass+1;

  -- disputa
  PERFORM public.orion_alc_open_dispute(v_deal, 'teste', '[]'::jsonb, v_buyer);
  IF (SELECT status FROM public.orion_alc_deals WHERE id=v_deal) = 'em_disputa' THEN v_pass:=v_pass+1;
  ELSE v_fail:=v_fail+1; v_notes := v_notes || to_jsonb('disputa'::text); END IF;

  -- limpeza (CASCADE apaga eventos/ratings/disputas)
  DELETE FROM public.orion_alc_deals WHERE listing_id = v_listing;

  RETURN jsonb_build_object('modulo','ORION-AI-66 Auction Lifecycle & Reputation',
    'passed', v_pass, 'failed', v_fail, 'ok', (v_fail=0), 'notas', v_notes, 'em', now());
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.orion_alc_deals WHERE listing_id = v_listing;
  RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
END$$;
REVOKE ALL ON FUNCTION public.orion_alc_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_alc_selftest() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────────────────
SELECT jsonb_build_object(
  'tabelas', (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_alc_%'),
  'funcoes', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'orion_alc_%'),
  'trigger_ok', (SELECT count(*) FROM pg_trigger WHERE tgname='trg_orion_alc_report_deal'),
  'cron_ok', (SELECT count(*) FROM cron.job WHERE jobname='orion_alc_sync'),
  'selftest', public.orion_alc_selftest()
) AS verificacao;
