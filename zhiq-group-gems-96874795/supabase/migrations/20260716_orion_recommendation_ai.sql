-- ============================================================================
-- ORION-AI-35 — RECOMMENDATION INTELLIGENCE AI v1.0
-- ============================================================================
-- Topo da cadeia do Discovery Ecosystem: AI-32 (descobre) -> AI-33 (GEO) ->
--   AI-34 (grafo) -> AI-35 (recomenda). Gera recomendacoes personalizadas,
--   explicaveis e orientadas a conversao. NUNCA recomenda conteudo aleatorio:
--   toda recomendacao possui EVIDENCIA MENSURAVEL (reason + evidence jsonb).
--
-- Motor: candidatos vem do GRAFO do AI-34 (relacoes similar_a/relacionada_a +
--   mesma cidade) + scores reais do AI-32 (discovery/semantic), AI-33 (geo/
--   content quality) e COMPORTAMENTO real (aci p/ anuncios, clicks p/ produtos).
--
-- Recommendation Score = 0.25 Semantic + 0.20 Knowledge Graph + 0.15 Discovery
--   + 0.10 GEO + 0.10 CTR + 0.10 Conversao + 0.05 Recencia + 0.05 Qualidade.
--
-- Reuso EXCLUSIVO: AI Gateway, Prompt Registry, Event Bus, AI-32, AI-33, AI-34,
--   AI-10 Health, AI-11 Performance, AI-13 Operations. Sem infraestrutura paralela.
--   ANTI-COLISAO AI-34: usa orion_recommendations/recommendation_* proprias.
--
-- Seguranca: NUNCA recomenda anuncio bloqueado/RIDV-reprovado/moderado/expirado/
--   removido/privado (filtro por listing_status/ai_status/moderation_status).
--
-- Edge Function "recommendation-engine a cada 17 min" -> realizada como pg_cron
--   orion_recommendation_tick '*/17 * * * *' com recalculo INCREMENTAL (upsert +
--   TTL 30min), nunca a tabela inteira from scratch. (sem deploy de edge sep.)
--
-- Idempotente / auditavel / versionado. SECURITY DEFINER + guarda. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_recommendations (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recommendation_type  text        NOT NULL,            -- similar|proximity|popular
  source_entity        text        NOT NULL,            -- 'listing:<id>' | 'global:home' | 'global:loja'
  target_entity        text        NOT NULL,            -- 'listing:<id>' | 'produto:<id>'
  target_type          text        NOT NULL,            -- anuncio|produto
  recommendation_score integer     NOT NULL DEFAULT 0,
  semantic_score       integer     NOT NULL DEFAULT 0,
  graph_score          integer     NOT NULL DEFAULT 0,
  geo_score            integer     NOT NULL DEFAULT 0,
  behavior_score       integer     NOT NULL DEFAULT 0,
  quality_score        integer     NOT NULL DEFAULT 0,
  confidence           integer     NOT NULL DEFAULT 0,
  reason               text,
  evidence             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  CONSTRAINT orion_rec_uq UNIQUE (source_entity, target_entity, recommendation_type)
);
COMMENT ON TABLE public.orion_recommendations IS
  'ORION-AI-35: recomendacoes com score explicavel e EVIDENCIA. Nunca aleatorio; nunca conteudo bloqueado/expirado.';

CREATE INDEX IF NOT EXISTS ix_orion_rec_score  ON public.orion_recommendations (recommendation_score DESC);
CREATE INDEX IF NOT EXISTS ix_orion_rec_src    ON public.orion_recommendations (source_entity);
CREATE INDEX IF NOT EXISTS ix_orion_rec_exp    ON public.orion_recommendations (expires_at);
CREATE INDEX IF NOT EXISTS ix_orion_rec_type   ON public.orion_recommendations (recommendation_type);

CREATE TABLE IF NOT EXISTS public.orion_user_profile (
  user_id            uuid        PRIMARY KEY,
  preferences_json   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  interest_vector    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  last_categories    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_searches      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_clicks        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_orders        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  favorite_locations jsonb       NOT NULL DEFAULT '[]'::jsonb,
  behavior_score     integer     NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_user_profile IS
  'ORION-AI-35: perfil comportamental do usuario a partir de sinais reais (clicks/aci). RLS: cada usuario ve so o seu.';

CREATE TABLE IF NOT EXISTS public.orion_recommendation_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid,
  target_entity text,
  event_type    text        NOT NULL,   -- view|click|dismiss|conversion|purchase|share|favorite
  contexto      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_recommendation_events IS 'ORION-AI-35: telemetria de recomendacoes (view/click/conversion...).';
CREATE INDEX IF NOT EXISTS ix_orion_rec_ev_dia ON public.orion_recommendation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_rec_ev_usr ON public.orion_recommendation_events (user_id);

CREATE TABLE IF NOT EXISTS public.recommendation_cache (
  cache_key   text        PRIMARY KEY,
  payload     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
COMMENT ON TABLE public.recommendation_cache IS 'ORION-AI-35: cache inteligente TTL 30min; invalidado por novo/edicao/remocao/mudanca de score.';

CREATE TABLE IF NOT EXISTS public.recommendation_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trace_id    text,
  modelo      text,
  score_medio integer,
  evidencias  integer,
  tokens      integer     NOT NULL DEFAULT 0,
  latencia_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.recommendation_logs IS 'ORION-AI-35: logs de execucao (tempo/modelo/score/evidencias/tokens/latencia).';

-- ----------------------------------------------------------------------------
-- 2) RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.orion_recommendations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_user_profile            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_recommendation_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_cache          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_logs           ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_recommendations' AND policyname='orion_rec_read') THEN
    CREATE POLICY orion_rec_read ON public.orion_recommendations FOR SELECT USING (public.mp_is_admin() OR auth.role()='authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_user_profile' AND policyname='orion_rec_profile_self') THEN
    CREATE POLICY orion_rec_profile_self ON public.orion_user_profile FOR SELECT USING (public.mp_is_admin() OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_recommendation_events' AND policyname='orion_rec_ev_read') THEN
    CREATE POLICY orion_rec_ev_read ON public.orion_recommendation_events FOR SELECT USING (public.mp_is_admin() OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recommendation_logs' AND policyname='orion_rec_logs_admin') THEN
    CREATE POLICY orion_rec_logs_admin ON public.recommendation_logs FOR SELECT USING (public.mp_is_admin());
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recommendation_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados)
  VALUES (p_tipo, 'recommendation_ai', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) PERFIL DO USUARIO — a partir de sinais reais (clicks + aci)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recommendation_profile_build()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'recommendation_profile_build: acesso negado';
  END IF;

  INSERT INTO public.orion_user_profile (user_id, last_clicks, favorite_locations, behavior_score, updated_at)
  SELECT c.visitor_user_id,
    to_jsonb(count(*)),
    (SELECT coalesce(jsonb_agg(DISTINCT city) FILTER (WHERE city IS NOT NULL AND city<>''),'[]'::jsonb)
       FROM public.marketplace_product_click_events c2 WHERE c2.visitor_user_id=c.visitor_user_id),
    least(count(*)*5,100),
    now()
  FROM public.marketplace_product_click_events c
  WHERE c.visitor_user_id IS NOT NULL
  GROUP BY c.visitor_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    last_clicks=excluded.last_clicks, favorite_locations=excluded.favorite_locations,
    behavior_score=excluded.behavior_score, updated_at=now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 5) MOTOR — recommendation_build: gera recomendacoes com evidencia (incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recommendation_build(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'rec_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_sim int := 0; v_prox int := 0; v_pop int := 0; v_prod int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'recommendation_build: acesso negado (somente admin/service)';
  END IF;

  -- entidades-alvo seguras (nunca bloqueado/expirado/reprovado) com scores + comportamento
  DROP TABLE IF EXISTS _tgt;
  CREATE TEMP TABLE _tgt ON COMMIT DROP AS
  WITH sec AS (
    SELECT l.* FROM public.advertiser_listings l
    WHERE lower(coalesce(l.listing_status,'active')) NOT IN ('expired','removed','deleted','draft','blocked','inactive')
      AND lower(coalesce(l.ai_status,'approved'))    NOT IN ('rejected','reprovado','blocked')
      AND lower(coalesce(l.moderation_status,'approved')) NOT IN ('rejected','blocked','removed')
  ),
  beh AS (
    SELECT listing_id,
      least(count(*)*20,100) ctr,
      least(count(*) FILTER (WHERE unlock_paid_at IS NOT NULL OR lower(coalesce(status,'')) IN ('paid','unlocked','converted','completed'))*33,100) conv
    FROM public.advertiser_contact_intentions WHERE listing_id IS NOT NULL GROUP BY listing_id
  )
  SELECT s.id, s.title, s.category, s.city, s.created_at,
    coalesce(ss.discovery_score,0) disc, coalesce(ss.semantic_score,0) sem,
    coalesce(gs.geo_score,0) geo, coalesce(gs.content_quality_score,0) qual,
    coalesce(b.ctr,0) ctr, coalesce(b.conv,0) conv,
    greatest(0, 100 - extract(day FROM (now()-s.created_at))::int*2) recencia
  FROM sec s
  LEFT JOIN LATERAL (SELECT discovery_score,semantic_score FROM public.orion_search_scores WHERE entidade_tipo='listing' AND entidade_id=s.id::text ORDER BY dia DESC LIMIT 1) ss ON true
  LEFT JOIN LATERAL (SELECT geo_score,content_quality_score FROM public.orion_geo_scores WHERE entidade_tipo='listing' AND entidade_id=s.id::text ORDER BY dia DESC LIMIT 1) gs ON true
  LEFT JOIN beh b ON b.listing_id = s.id;

  -- 5.1 SIMILAR — do grafo AI-34 (relacao similar_a) — evidencia forte
  INSERT INTO public.orion_recommendations
    (recommendation_type, source_entity, target_entity, target_type,
     recommendation_score, semantic_score, graph_score, geo_score, behavior_score, quality_score, confidence, reason, evidence, created_at, expires_at)
  SELECT 'similar', 'listing:'||a.id, 'listing:'||t.id, 'anuncio',
     round(0.25*t.sem + 0.20*(r.confianca*100) + 0.15*t.disc + 0.10*t.geo + 0.10*t.ctr + 0.10*t.conv + 0.05*t.recencia + 0.05*t.qual)::int,
     t.sem, round(r.confianca*100)::int, t.geo, round((t.ctr+t.conv)/2)::int, t.qual,
     round((0.4 + 0.1*((t.sem>0)::int+(t.disc>0)::int+(t.geo>0)::int+(t.ctr>0)::int+(t.conv>0)::int+(t.qual>0)::int))*100)::int,
     'Similar por categoria "'||coalesce(a.category,'?')||'" (relação do grafo AI-34)',
     jsonb_build_object('grafo','similar_a','confianca',r.confianca,'categoria',a.category,
       'semantic',t.sem,'discovery',t.disc,'geo',t.geo,'ctr',t.ctr,'conversao',t.conv,'qualidade',t.qual),
     now(), now()+interval '30 minutes'
  FROM _tgt a
  JOIN public.orion_knowledge_relations r ON r.dia=(SELECT max(dia) FROM public.orion_knowledge_relations)
       AND r.tipo='similar_a' AND r.origem_key='listing:'||a.id
  JOIN _tgt t ON 'listing:'||t.id = r.destino_key
  ON CONFLICT (source_entity, target_entity, recommendation_type) DO UPDATE SET
     recommendation_score=excluded.recommendation_score, semantic_score=excluded.semantic_score,
     graph_score=excluded.graph_score, geo_score=excluded.geo_score, behavior_score=excluded.behavior_score,
     quality_score=excluded.quality_score, confidence=excluded.confidence, reason=excluded.reason,
     evidence=excluded.evidence, created_at=now(), expires_at=now()+interval '30 minutes';
  GET DIAGNOSTICS v_sim = ROW_COUNT;

  -- 5.2 PROXIMITY — mesma cidade (evidencia geografica), exclui pares ja "similar"
  INSERT INTO public.orion_recommendations
    (recommendation_type, source_entity, target_entity, target_type,
     recommendation_score, semantic_score, graph_score, geo_score, behavior_score, quality_score, confidence, reason, evidence, created_at, expires_at)
  SELECT 'proximity', 'listing:'||a.id, 'listing:'||t.id, 'anuncio',
     round(0.25*t.sem + 0.20*40 + 0.15*t.disc + 0.10*t.geo + 0.10*t.ctr + 0.10*t.conv + 0.05*t.recencia + 0.05*t.qual)::int,
     t.sem, 40, t.geo, round((t.ctr+t.conv)/2)::int, t.qual,
     round((0.4 + 0.1*((t.sem>0)::int+(t.disc>0)::int+(t.geo>0)::int+(t.ctr>0)::int+(t.conv>0)::int+(t.qual>0)::int))*100)::int,
     'Na mesma cidade "'||coalesce(a.city,'?')||'"',
     jsonb_build_object('grafo','mesma_cidade','cidade',a.city,'semantic',t.sem,'discovery',t.disc,'geo',t.geo,'ctr',t.ctr,'conversao',t.conv),
     now(), now()+interval '30 minutes'
  FROM _tgt a
  JOIN _tgt t ON public.orion_norm(t.city)=public.orion_norm(a.city) AND t.id<>a.id AND coalesce(a.city,'')<>''
  WHERE NOT EXISTS (SELECT 1 FROM public.orion_knowledge_relations r
     WHERE r.dia=(SELECT max(dia) FROM public.orion_knowledge_relations) AND r.tipo='similar_a'
       AND r.origem_key='listing:'||a.id AND r.destino_key='listing:'||t.id)
  ON CONFLICT (source_entity, target_entity, recommendation_type) DO UPDATE SET
     recommendation_score=excluded.recommendation_score, semantic_score=excluded.semantic_score,
     geo_score=excluded.geo_score, behavior_score=excluded.behavior_score, quality_score=excluded.quality_score,
     confidence=excluded.confidence, reason=excluded.reason, evidence=excluded.evidence,
     created_at=now(), expires_at=now()+interval '30 minutes';
  GET DIAGNOSTICS v_prox = ROW_COUNT;

  -- 5.3 POPULAR (Home) — ranking global por score+comportamento
  INSERT INTO public.orion_recommendations
    (recommendation_type, source_entity, target_entity, target_type,
     recommendation_score, semantic_score, graph_score, geo_score, behavior_score, quality_score, confidence, reason, evidence, created_at, expires_at)
  SELECT 'popular', 'global:home', 'listing:'||t.id, 'anuncio',
     round(0.25*t.sem + 0.20*50 + 0.15*t.disc + 0.10*t.geo + 0.10*t.ctr + 0.10*t.conv + 0.05*t.recencia + 0.05*t.qual)::int,
     t.sem, 50, t.geo, round((t.ctr+t.conv)/2)::int, t.qual,
     round((0.4 + 0.1*((t.sem>0)::int+(t.disc>0)::int+(t.geo>0)::int+(t.ctr>0)::int+(t.conv>0)::int+(t.qual>0)::int))*100)::int,
     'Popular/relevante na plataforma',
     jsonb_build_object('base','descobribilidade+comportamento','discovery',t.disc,'ctr',t.ctr,'conversao',t.conv,'geo',t.geo),
     now(), now()+interval '30 minutes'
  FROM _tgt t
  ON CONFLICT (source_entity, target_entity, recommendation_type) DO UPDATE SET
     recommendation_score=excluded.recommendation_score, semantic_score=excluded.semantic_score,
     geo_score=excluded.geo_score, behavior_score=excluded.behavior_score, quality_score=excluded.quality_score,
     confidence=excluded.confidence, reason=excluded.reason, evidence=excluded.evidence,
     created_at=now(), expires_at=now()+interval '30 minutes';
  GET DIAGNOSTICS v_pop = ROW_COUNT;

  -- 5.4 POPULAR (Loja) — produtos por cliques reais
  INSERT INTO public.orion_recommendations
    (recommendation_type, source_entity, target_entity, target_type,
     recommendation_score, semantic_score, graph_score, geo_score, behavior_score, quality_score, confidence, reason, evidence, created_at, expires_at)
  SELECT 'popular', 'global:loja', 'produto:'||p.id, 'produto',
     round(0.25*coalesce(ss.semantic_score,0) + 0.20*50 + 0.15*coalesce(ss.discovery_score,0)
         + 0.10*coalesce(gs.geo_score,0) + 0.10*least(coalesce(cl.n,0)*10,100) + 0.10*least(coalesce(cl.conv,0)*33,100)
         + 0.05*50 + 0.05*coalesce(gs.content_quality_score,0))::int,
     coalesce(ss.semantic_score,0), 50, coalesce(gs.geo_score,0), least(coalesce(cl.n,0)*10,100)::int, coalesce(gs.content_quality_score,0),
     round((0.4 + 0.1*((coalesce(ss.semantic_score,0)>0)::int+(coalesce(ss.discovery_score,0)>0)::int+(coalesce(gs.geo_score,0)>0)::int+(coalesce(cl.n,0)>0)::int))*100)::int,
     'Produto com cliques reais na loja',
     jsonb_build_object('cliques',coalesce(cl.n,0),'conversoes',coalesce(cl.conv,0),'discovery',coalesce(ss.discovery_score,0),'geo',coalesce(gs.geo_score,0)),
     now(), now()+interval '30 minutes'
  FROM public.merchant_products p
  LEFT JOIN LATERAL (SELECT discovery_score,semantic_score FROM public.orion_search_scores WHERE entidade_tipo='produto' AND entidade_id=p.id::text ORDER BY dia DESC LIMIT 1) ss ON true
  LEFT JOIN LATERAL (SELECT geo_score,content_quality_score FROM public.orion_geo_scores WHERE entidade_tipo='produto' AND entidade_id=p.id::text ORDER BY dia DESC LIMIT 1) gs ON true
  LEFT JOIN (SELECT product_id, count(*) n, count(*) FILTER (WHERE credits_charged>0 OR lower(coalesce(status,'')) IN ('paid','converted','unlocked','completed')) conv
             FROM public.marketplace_product_click_events WHERE product_id IS NOT NULL GROUP BY product_id) cl ON cl.product_id = p.id
  ON CONFLICT (source_entity, target_entity, recommendation_type) DO UPDATE SET
     recommendation_score=excluded.recommendation_score, semantic_score=excluded.semantic_score,
     geo_score=excluded.geo_score, behavior_score=excluded.behavior_score, quality_score=excluded.quality_score,
     confidence=excluded.confidence, reason=excluded.reason, evidence=excluded.evidence,
     created_at=now(), expires_at=now()+interval '30 minutes';
  GET DIAGNOSTICS v_prod = ROW_COUNT;

  -- invalida cache (mudanca de score)
  DELETE FROM public.recommendation_cache;
  PERFORM public.recommendation_emit('recommendation.updated', jsonb_build_object(
    'similar',v_sim,'proximity',v_prox,'popular_home',v_pop,'popular_loja',v_prod,'trace',v_trace));

  RETURN jsonb_build_object('ok',true,'similar',v_sim,'proximity',v_prox,'popular_home',v_pop,'popular_loja',v_prod,
    'total',v_sim+v_prox+v_pop+v_prod,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 6) generate_recommendations(user, context, location, device, limit) — Top N
--    cache-first; re-filtra seguranca no read; personaliza por perfil.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_recommendations(
  p_user uuid DEFAULT NULL, p_context text DEFAULT 'home',
  p_location text DEFAULT NULL, p_device text DEFAULT 'web', p_limit int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text := 'rec:'||coalesce(p_user::text,'anon')||':'||coalesce(p_context,'home')||':'||coalesce(public.orion_norm(p_location),'-')||':'||p_limit;
  v_cached jsonb; v_res jsonb; v_t0 timestamptz := clock_timestamp();
BEGIN
  -- cache-first (TTL 30min)
  SELECT payload INTO v_cached FROM public.recommendation_cache WHERE cache_key=v_key AND expires_at > now();
  IF v_cached IS NOT NULL THEN
    RETURN v_cached || jsonb_build_object('cache',true);
  END IF;

  WITH src AS (
    SELECT * FROM public.orion_recommendations
    WHERE expires_at > now()
      AND (source_entity = CASE WHEN p_context='loja' THEN 'global:loja' ELSE 'global:home' END
           OR recommendation_type='popular')
  ),
  -- re-filtro de seguranca: alvo listing precisa continuar ativo/aprovado
  seguro AS (
    SELECT r.* FROM src r
    WHERE r.target_type='produto'
       OR EXISTS (SELECT 1 FROM public.advertiser_listings l
                  WHERE 'listing:'||l.id = r.target_entity
                    AND lower(coalesce(l.listing_status,'active')) NOT IN ('expired','removed','deleted','draft','blocked','inactive')
                    AND lower(coalesce(l.ai_status,'approved')) NOT IN ('rejected','reprovado','blocked')
                    AND lower(coalesce(l.moderation_status,'approved')) NOT IN ('rejected','blocked','removed'))
  ),
  -- boost por localizacao do contexto (+8) e por categoria preferida do usuario (+10)
  rankeado AS (
    SELECT s.*,
      s.recommendation_score
        + CASE WHEN p_location IS NOT NULL AND (s.evidence->>'cidade') IS NOT NULL
                AND public.orion_norm(s.evidence->>'cidade')=public.orion_norm(p_location) THEN 8 ELSE 0 END
        + CASE WHEN p_user IS NOT NULL AND EXISTS (
                 SELECT 1 FROM public.orion_user_profile up
                 WHERE up.user_id=p_user AND up.last_categories ? coalesce(s.evidence->>'categoria','')) THEN 10 ELSE 0 END
        AS score_final
    FROM seguro s
  )
  SELECT jsonb_build_object(
    'ok',true,'cache',false,'contexto',p_context,'usuario',p_user,'localizacao',p_location,'device',p_device,
    'recomendacoes', coalesce(jsonb_agg(jsonb_build_object(
        'target',target_entity,'tipo',target_type,'recommendation_type',recommendation_type,
        'score',score_final,'confidence',confidence,'reason',reason,'evidence',evidence) ORDER BY score_final DESC),'[]'::jsonb)
  ) INTO v_res
  FROM (SELECT DISTINCT ON (target_entity) * FROM rankeado ORDER BY target_entity, score_final DESC) d
  WHERE true;

  -- top N
  v_res := jsonb_set(v_res,'{recomendacoes}',
    (SELECT coalesce(jsonb_agg(e ORDER BY (e->>'score')::int DESC),'[]'::jsonb)
     FROM (SELECT e FROM jsonb_array_elements(v_res->'recomendacoes') e ORDER BY (e->>'score')::int DESC LIMIT p_limit) x));

  INSERT INTO public.recommendation_cache (cache_key, payload, expires_at)
  VALUES (v_key, v_res, now()+interval '30 minutes')
  ON CONFLICT (cache_key) DO UPDATE SET payload=excluded.payload, created_at=now(), expires_at=excluded.expires_at;

  INSERT INTO public.recommendation_logs (trace_id, modelo, score_medio, evidencias, tokens, latencia_ms)
  VALUES ('gen_'||to_char(now(),'HH24MISS'), 'deterministic',
    (SELECT coalesce(round(avg((e->>'score')::int))::int,0) FROM jsonb_array_elements(v_res->'recomendacoes') e),
    jsonb_array_length(v_res->'recomendacoes'), 0,
    round(extract(milliseconds FROM (clock_timestamp()-v_t0)))::int);

  RETURN v_res;
END$$;

-- ----------------------------------------------------------------------------
-- 7) EVENTOS + EXPLAIN + ANALYTICS + RIS + HEALTH
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recommendation_event(p_user uuid, p_target text, p_type text, p_ctx jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_recommendation_events (user_id, target_entity, event_type, contexto)
  VALUES (p_user, p_target, p_type, coalesce(p_ctx,'{}'::jsonb));
  PERFORM public.recommendation_emit('recommendation.event', jsonb_build_object('tipo',p_type,'target',p_target));
END$$;

CREATE OR REPLACE FUNCTION public.recommendation_explain(p_source text, p_target text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('source',source_entity,'target',target_entity,'tipo',recommendation_type,
    'score',recommendation_score,'confidence',confidence,'reason',reason,'evidence',evidence,
    'componentes',jsonb_build_object('semantic',semantic_score,'graph',graph_score,'geo',geo_score,'behavior',behavior_score,'quality',quality_score))
  FROM public.orion_recommendations WHERE source_entity=p_source AND target_entity=p_target ORDER BY recommendation_score DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.recommendation_analytics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (SELECT * FROM public.orion_recommendations WHERE expires_at > now())
  SELECT jsonb_build_object(
    'top', (SELECT coalesce(jsonb_agg(jsonb_build_object('target',target_entity,'score',recommendation_score,'tipo',recommendation_type,'reason',reason) ORDER BY recommendation_score DESC),'[]'::jsonb)
            FROM (SELECT * FROM r ORDER BY recommendation_score DESC LIMIT 10) t),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(recommendation_type,n),'{}'::jsonb) FROM (SELECT recommendation_type, count(*) n FROM r GROUP BY recommendation_type) x),
    'categorias_fortes', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',cat,'score_medio',s) ORDER BY s DESC),'[]'::jsonb)
       FROM (SELECT evidence->>'categoria' cat, round(avg(recommendation_score))::int s FROM r WHERE (evidence->>'categoria') IS NOT NULL GROUP BY 1 ORDER BY s DESC LIMIT 5) c),
    'categorias_fracas', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',cat,'score_medio',s) ORDER BY s ASC),'[]'::jsonb)
       FROM (SELECT evidence->>'categoria' cat, round(avg(recommendation_score))::int s FROM r WHERE (evidence->>'categoria') IS NOT NULL GROUP BY 1 ORDER BY s ASC LIMIT 5) c),
    'eventos', (SELECT coalesce(jsonb_object_agg(event_type,n),'{}'::jsonb) FROM (SELECT event_type, count(*) n FROM public.orion_recommendation_events GROUP BY event_type) e),
    'gerado_em', now());
$$;

-- Recommendation Intelligence Score (RIS) — metricas reais + lacunas declaradas
CREATE OR REPLACE FUNCTION public.recommendation_score_ris()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (SELECT * FROM public.orion_recommendations),
  frescas AS (SELECT * FROM r WHERE expires_at > now()),
  ent AS (SELECT count(*) n FROM public.orion_knowledge_entities WHERE dia=(SELECT max(dia) FROM public.orion_knowledge_entities) AND entity_type IN ('anuncio','produto')),
  cov AS (SELECT count(DISTINCT target_entity) c FROM frescas),
  m AS (
    SELECT
      coalesce(round(avg(recommendation_score))::int,0) score_medio,
      coalesce(round(avg(confidence))::int,0) conf_medio,
      count(*) total,
      count(*) FILTER (WHERE expires_at > now()) fresh,
      count(DISTINCT evidence->>'categoria') diversidade
    FROM r
  )
  SELECT jsonb_build_object(
    'ris', (SELECT round(0.35*m.score_medio + 0.20*m.conf_medio
                 + 0.20*least((SELECT c FROM cov)::numeric/greatest((SELECT n FROM ent),1)*100,100)   -- coverage
                 + 0.15*least(m.diversidade*20,100)                                                    -- diversity
                 + 0.10*(CASE WHEN m.total>0 THEN m.fresh::numeric/m.total*100 ELSE 0 END))::int FROM m), -- freshness
    'score_medio', (SELECT score_medio FROM m),
    'confianca_media', (SELECT conf_medio FROM m),
    'coverage_pct', (SELECT round(least((SELECT c FROM cov)::numeric/greatest((SELECT n FROM ent),1)*100,100))::int),
    'diversidade_categorias', (SELECT diversidade FROM m),
    'freshness_pct', (SELECT CASE WHEN total>0 THEN round(fresh::numeric/total*100)::int ELSE 0 END FROM m),
    'total_recomendacoes', (SELECT total FROM m),
    'lacunas_declaradas', 'Precision/Recall/Accuracy/Novelty exigem ground-truth (rótulos de clique-conversão por recomendação) — telemetria orion_recommendation_events ainda inicial; DECLARADO.',
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.recommendation_health()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ris AS (SELECT public.recommendation_score_ris() r)
  SELECT jsonb_build_object(
    'ris', (SELECT (r->>'ris')::int FROM ris),
    'status', (SELECT CASE WHEN (r->>'ris')::int >= 70 AND (r->>'freshness_pct')::int >= 50 THEN 'verde'
                           WHEN (r->>'ris')::int >= 45 THEN 'amarelo' ELSE 'vermelho' END FROM ris),
    'freshness_pct', (SELECT (r->>'freshness_pct')::int FROM ris),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.recommendation_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'recomendacoes_total', (SELECT count(*) FROM public.orion_recommendations),
    'frescas', (SELECT count(*) FROM public.orion_recommendations WHERE expires_at > now()),
    'perfis', (SELECT count(*) FROM public.orion_user_profile),
    'eventos', (SELECT count(*) FROM public.orion_recommendation_events),
    'cache_entradas', (SELECT count(*) FROM public.recommendation_cache WHERE expires_at > now()),
    'logs', (SELECT count(*) FROM public.recommendation_logs),
    'latencia_media_ms', (SELECT coalesce(round(avg(latencia_ms))::int,0) FROM public.recommendation_logs),
    'eventos_bus', (SELECT count(*) FROM public.orion_eventos WHERE tipo LIKE 'recommendation.%'));
$$;

CREATE OR REPLACE FUNCTION public.recommendation_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ris',public.recommendation_score_ris(),'health',public.recommendation_health(),
    'analytics',public.recommendation_analytics(),'metrics',public.recommendation_metrics());
$$;

CREATE OR REPLACE FUNCTION public.recommendation_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.recommendation_summary();
  PERFORM public.recommendation_emit('recommendation.score', jsonb_build_object('ris', v->'ris'->'ris'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 8) TICK incremental :*/17
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_recommendation_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recommendation_profile_build();
  PERFORM public.recommendation_build('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  DELETE FROM public.recommendation_cache WHERE expires_at < now();          -- limpa cache expirado
  DELETE FROM public.orion_recommendations WHERE expires_at < now() - interval '2 hours'; -- housekeeping
  PERFORM public.recommendation_emit('recommendation.recommendation', jsonb_build_object(
    'frescas',(SELECT count(*) FROM public.orion_recommendations WHERE expires_at > now())));
END$$;

-- ----------------------------------------------------------------------------
-- 9) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.recommendation_build(text)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_profile_build()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_recommendations(uuid,text,text,text,int)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_event(uuid,text,text,jsonb)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_explain(text,text)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_analytics()                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_score_ris()                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_health()                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_metrics()                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_summary()                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recommendation_dashboard()                              TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10) PROMPT REGISTRY (5 prompts)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('rec.explain',
 'Voce e o ORION Recommendation AI. Explique de forma clara por que um item foi recomendado, usando a evidencia fornecida (relacao do grafo, scores de descoberta/GEO/semantica, CTR e conversao reais). Nunca invente motivos alem da evidencia.',
 'ORION-AI-35 seed');
SELECT public.orion_ai_prompt_set('rec.why_not',
 'Voce e o ORION Recommendation AI. Explique por que um item NAO foi recomendado (baixa relevancia, sem relacao no grafo, baixa descobribilidade, bloqueado/moderado/expirado). Baseie-se apenas nos dados.',
 'ORION-AI-35 seed');
SELECT public.orion_ai_prompt_set('rec.detect_bad',
 'Voce e o auditor de recomendacoes do ORION. Dada uma lista de recomendacoes com evidencias, aponte quais parecem fracas ou sem evidencia suficiente e por que. Nunca aprove recomendacao sem evidencia mensuravel.',
 'ORION-AI-35 seed');
SELECT public.orion_ai_prompt_set('rec.detect_repetition',
 'Voce e o ORION Recommendation AI. Detecte repeticao/redundancia em uma lista de recomendacoes (mesmo alvo, mesma categoria em excesso) e sugira o que remover para variar.',
 'ORION-AI-35 seed');
SELECT public.orion_ai_prompt_set('rec.diversify',
 'Voce e o ORION Recommendation AI. Reordene/selecione recomendacoes para maximizar diversidade (categorias, cidades, tipos) mantendo relevancia, sem introduzir itens sem evidencia.',
 'ORION-AI-35 seed');

-- ----------------------------------------------------------------------------
-- 11) MODEL PREF + CRON */17
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code)
VALUES ('recommendation_ai','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_recommendation_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_recommendation_tick');
    PERFORM cron.schedule('orion_recommendation_tick','*/17 * * * *','SELECT public.orion_recommendation_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_recommendation_tick');
--   DROP FUNCTION IF EXISTS public.orion_recommendation_tick, public.recommendation_dashboard,
--     public.recommendation_summary, public.recommendation_metrics, public.recommendation_health,
--     public.recommendation_score_ris, public.recommendation_analytics, public.recommendation_explain(text,text),
--     public.recommendation_event(uuid,text,text,jsonb), public.generate_recommendations(uuid,text,text,text,int),
--     public.recommendation_build(text), public.recommendation_profile_build, public.recommendation_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.recommendation_logs, public.recommendation_cache,
--     public.orion_recommendation_events, public.orion_user_profile, public.orion_recommendations;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='recommendation_ai';
-- ============================================================================
