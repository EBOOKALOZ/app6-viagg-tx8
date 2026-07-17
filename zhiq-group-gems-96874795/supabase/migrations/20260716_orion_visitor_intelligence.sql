-- ============================================================================
-- ORION-AI-39 — VISITOR INTELLIGENCE AI v1.0
-- ============================================================================
-- Inteligencia de visitantes: analisa/compreende/preve o comportamento de TODOS
--   os visitantes (mesmo antes do cadastro), so com dados tecnicos/comportamentais.
--   NUNCA cria perfil com dado inventado. Toda classificacao tem EVIDENCIA.
--
-- Fonte real: marketplace_product_click_events (anon_id/visitor_user_id/city/
--   source/product_id/created_at) = 17 visitantes anonimos + 4 logados, 239
--   eventos, ~2 meses. Complementa com advertiser_contact_intentions e pedidos.
--
-- PRIVACIDADE: usa apenas identificador anonimo (anon_id) / user_id, cidade,
--   source e timing. NAO armazena nome/telefone/PII. NAO usa atributos sensiveis.
--   device/browser/OS/idioma/timezone/referrer/campanha e ORIGEM EXTERNA
--   (Google/ChatGPT/...) exigem instrumentacao do front -> DECLARADOS (nulos).
--
-- Anti-colisao AI-38 e demais: tabelas orion_visitors/visitor_*, funcoes
--   visitor_*/analyze_visitor, chave visitor_intelligence, painel /admin/orion-visitors.
--
-- Idempotente / auditavel. SECURITY DEFINER + guarda. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_visitors (
  visitor_id       text        PRIMARY KEY,
  session_id       text,
  first_seen       timestamptz,
  last_seen        timestamptz,
  device_type      text,        -- DECLARADO (front)
  browser          text,        -- DECLARADO
  operating_system text,        -- DECLARADO
  country          text,
  state            text,
  city             text,
  language         text,        -- DECLARADO
  timezone         text,        -- DECLARADO
  source           text,
  medium           text,
  campaign         text,        -- DECLARADO
  referrer         text,        -- DECLARADO
  is_logged        boolean      NOT NULL DEFAULT false,
  user_id          uuid,
  dias_ativos      integer      NOT NULL DEFAULT 0,
  eventos          integer      NOT NULL DEFAULT 0,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  atualizado_em    timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_visitors IS
  'ORION-AI-39: visitantes (anonimos/logados) a partir de sinais reais. Privacidade: sem PII; device/referrer/campanha declarados.';
CREATE INDEX IF NOT EXISTS ix_orion_visitors_last ON public.orion_visitors (last_seen DESC);

CREATE TABLE IF NOT EXISTS public.orion_visitor_navigation (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id        text        NOT NULL,
  page              text        NOT NULL,
  category          text,
  entity_type       text,
  entity_id         text,
  timestamp         timestamptz NOT NULL DEFAULT now(),
  duration          integer,     -- DECLARADO (front)
  scroll_percent    integer,     -- DECLARADO (front)
  clicks            integer      NOT NULL DEFAULT 0,
  interaction_score integer      NOT NULL DEFAULT 0,
  CONSTRAINT orion_visnav_uq UNIQUE (visitor_id, page)
);
COMMENT ON TABLE public.orion_visitor_navigation IS 'ORION-AI-39: navegacao por visitante/pagina (agregada de clicks). duration/scroll declarados (front).';
CREATE INDEX IF NOT EXISTS ix_orion_visnav_vis ON public.orion_visitor_navigation (visitor_id);

CREATE TABLE IF NOT EXISTS public.orion_visitor_predictions (
  visitor_id             text        PRIMARY KEY,
  purchase_probability   integer     NOT NULL DEFAULT 0,
  merchant_probability   integer     NOT NULL DEFAULT 0,
  motoboy_probability    integer     NOT NULL DEFAULT 0,
  moto_taxi_probability  integer     NOT NULL DEFAULT 0,
  advertiser_probability integer     NOT NULL DEFAULT 0,
  abandonment_probability integer    NOT NULL DEFAULT 0,
  return_probability     integer     NOT NULL DEFAULT 0,
  vs                     integer     NOT NULL DEFAULT 0,   -- Visitor Score
  vis                    integer     NOT NULL DEFAULT 0,   -- Visitor Intent Score
  cp                     integer     NOT NULL DEFAULT 0,   -- Conversion Probability
  es                     integer     NOT NULL DEFAULT 0,   -- Engagement Score
  nds                    integer     NOT NULL DEFAULT 0,   -- Navigation Depth Score
  rp                     integer     NOT NULL DEFAULT 0,   -- Return Probability
  confidence             integer     NOT NULL DEFAULT 0,
  evidencia              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_visitor_predictions IS 'ORION-AI-39: predicoes + scores por visitante, sempre com evidencia. merchant/motoboy/moto_taxi declarados (sem sinal distintivo).';

CREATE TABLE IF NOT EXISTS public.orion_visitor_segments (
  visitor_id  text        PRIMARY KEY,
  segment     text        NOT NULL,
  evidence    text        NOT NULL,
  confidence  integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_visitor_segments IS 'ORION-AI-39: segmento primario por visitante (comportamento observado, nunca suposicao).';
CREATE INDEX IF NOT EXISTS ix_orion_visseg_seg ON public.orion_visitor_segments (segment);

CREATE TABLE IF NOT EXISTS public.orion_conversion_funnel (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id  text        NOT NULL,
  etapa       text        NOT NULL,   -- visitante|pesquisa|produto|contato|compra|retorno
  timestamp   timestamptz NOT NULL DEFAULT now(),
  conversao   boolean     NOT NULL DEFAULT false,
  abandono    boolean     NOT NULL DEFAULT false,
  CONSTRAINT orion_funnel_uq UNIQUE (visitor_id, etapa)
);
COMMENT ON TABLE public.orion_conversion_funnel IS 'ORION-AI-39: funil por visitante (etapas reais observadas).';

-- ----------------------------------------------------------------------------
-- 2) RLS — leitura admin
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_visitors','orion_visitor_navigation','orion_visitor_predictions','orion_visitor_segments','orion_conversion_funnel'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visitor_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'visitor_intelligence', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — visitor_build: visitantes + navegacao + predicoes + segmentos + funil
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visitor_build(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace,'vis_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_v int := 0; v_n int := 0; v_p int := 0; v_s int := 0; v_f int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'visitor_build: acesso negado (somente admin/service)';
  END IF;

  -- base: eventos de clique com identificador de visitante (anon ou logado)
  DROP TABLE IF EXISTS _ev;
  CREATE TEMP TABLE _ev ON COMMIT DROP AS
  SELECT CASE WHEN visitor_user_id IS NOT NULL THEN 'user:'||visitor_user_id ELSE 'anon:'||coalesce(anon_id::text,'?') END vk,
    visitor_user_id, product_id, city, source, status, credits_charged, metadata, created_at
  FROM public.marketplace_product_click_events
  WHERE anon_id IS NOT NULL OR visitor_user_id IS NOT NULL;

  -- 4.1 VISITANTES
  INSERT INTO public.orion_visitors (visitor_id, first_seen, last_seen, city, source, is_logged, user_id, dias_ativos, eventos, atualizado_em)
  SELECT vk, min(created_at), max(created_at), max(city), max(source),
    bool_or(visitor_user_id IS NOT NULL), max(visitor_user_id::text)::uuid,
    count(DISTINCT created_at::date), count(*), now()
  FROM _ev GROUP BY vk
  ON CONFLICT (visitor_id) DO UPDATE SET last_seen=excluded.last_seen, city=excluded.city, source=excluded.source,
    is_logged=excluded.is_logged, user_id=excluded.user_id, dias_ativos=excluded.dias_ativos, eventos=excluded.eventos, atualizado_em=now();
  GET DIAGNOSTICS v_v = ROW_COUNT;

  -- 4.2 NAVEGACAO (por visitante/produto)
  INSERT INTO public.orion_visitor_navigation (visitor_id, page, entity_type, entity_id, timestamp, clicks, interaction_score)
  SELECT vk, 'produto:'||product_id, 'produto', product_id::text, max(created_at), count(*), least(count(*)*20,100)
  FROM _ev WHERE product_id IS NOT NULL GROUP BY vk, product_id
  ON CONFLICT (visitor_id, page) DO UPDATE SET timestamp=excluded.timestamp, clicks=excluded.clicks, interaction_score=excluded.interaction_score;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- 4.3 PREDICOES + SCORES (com evidencia)
  WITH stat AS (
    SELECT vk, count(*) n, count(DISTINCT product_id) prods, count(DISTINCT created_at::date) dias,
      count(*) FILTER (WHERE credits_charged>0 OR lower(coalesce(status,'')) IN ('paid','converted','unlocked','completed')) conv,
      count(*) FILTER (WHERE metadata ? 'advertiser_account_id') adv,
      extract(day FROM (now()-max(created_at)))::int recency,
      bool_or(visitor_user_id IS NOT NULL) logado
    FROM _ev GROUP BY vk
  )
  INSERT INTO public.orion_visitor_predictions
    (visitor_id, purchase_probability, merchant_probability, motoboy_probability, moto_taxi_probability,
     advertiser_probability, abandonment_probability, return_probability, vs, vis, cp, es, nds, rp, confidence, evidencia, updated_at)
  SELECT s.vk,
    least(s.conv*40 + s.n*3 + CASE WHEN s.dias>1 THEN 15 ELSE 0 END, 100),   -- purchase
    0, 0, 0,                                                                   -- merchant/motoboy/moto_taxi DECLARADOS (sem sinal)
    least(s.adv*15, 100),                                                      -- advertiser (clicou conteudo de anunciante)
    greatest(0, 100 - least(s.n*10 + s.conv*30, 100)),                        -- abandonment
    least(s.dias*25 + CASE WHEN s.recency<=7 THEN 20 ELSE 0 END, 100),        -- return
    round(0.30*least(s.n*10,100) + 0.20*least(s.prods*15,100) + 0.20*least(s.n*8 + s.conv*20,100)
        + 0.15*least(s.conv*40+s.n*3,100) + 0.15*least(s.dias*25,100))::int,  -- VS
    least(s.n*8 + s.conv*20, 100),                                            -- VIS (intent)
    least(s.conv*40 + s.n*3 + CASE WHEN s.dias>1 THEN 15 ELSE 0 END, 100),    -- CP
    least(s.n*10, 100),                                                       -- ES
    least(s.prods*15, 100),                                                   -- NDS
    least(s.dias*25 + CASE WHEN s.recency<=7 THEN 20 ELSE 0 END, 100),        -- RP
    least(40 + s.n*6, 100),                                                   -- confidence (mais dados = mais confianca)
    jsonb_build_object('cliques',s.n,'produtos',s.prods,'dias_ativos',s.dias,'conversoes',s.conv,
      'clicou_anunciante',s.adv,'recencia_dias',s.recency,'logado',s.logado,
      'nota_probabilidades','merchant/motoboy/moto_taxi=0 DECLARADO (sem sinal distintivo na navegacao)'),
    now()
  FROM stat s
  ON CONFLICT (visitor_id) DO UPDATE SET
    purchase_probability=excluded.purchase_probability, advertiser_probability=excluded.advertiser_probability,
    abandonment_probability=excluded.abandonment_probability, return_probability=excluded.return_probability,
    vs=excluded.vs, vis=excluded.vis, cp=excluded.cp, es=excluded.es, nds=excluded.nds, rp=excluded.rp,
    confidence=excluded.confidence, evidencia=excluded.evidencia, updated_at=now();
  GET DIAGNOSTICS v_p = ROW_COUNT;

  -- 4.4 SEGMENTO primario (comportamento observado)
  WITH stat AS (
    SELECT vk, count(*) n, count(DISTINCT created_at::date) dias,
      count(*) FILTER (WHERE credits_charged>0 OR lower(coalesce(status,'')) IN ('paid','converted','unlocked','completed')) conv,
      count(*) FILTER (WHERE metadata ? 'advertiser_account_id') adv, bool_or(visitor_user_id IS NOT NULL) logado
    FROM _ev GROUP BY vk
  )
  INSERT INTO public.orion_visitor_segments (visitor_id, segment, evidence, confidence, updated_at)
  SELECT vk,
    CASE WHEN conv>0 AND n>=5 THEN 'alto_valor'
         WHEN conv>0 THEN 'comprador'
         WHEN adv>0 THEN 'anunciante'
         WHEN dias>1 AND n>=5 THEN 'recorrente'
         WHEN n>=5 THEN 'explorador'
         WHEN n BETWEEN 2 AND 4 THEN 'indeciso'
         WHEN dias>1 THEN 'recorrente'
         ELSE 'novo' END,
    'cliques='||n||' dias='||dias||' conversoes='||conv||' anunciante='||adv,
    least(40 + n*6, 100), now()
  FROM stat
  ON CONFLICT (visitor_id) DO UPDATE SET segment=excluded.segment, evidence=excluded.evidence, confidence=excluded.confidence, updated_at=now();
  GET DIAGNOSTICS v_s = ROW_COUNT;

  -- 4.5 FUNIL (etapas reais por visitante)
  INSERT INTO public.orion_conversion_funnel (visitor_id, etapa, timestamp, conversao, abandono)
  SELECT vk, 'produto', max(created_at),
    bool_or(credits_charged>0 OR lower(coalesce(status,'')) IN ('paid','converted','unlocked','completed')),
    NOT bool_or(credits_charged>0 OR lower(coalesce(status,'')) IN ('paid','converted','unlocked','completed'))
  FROM _ev GROUP BY vk
  ON CONFLICT (visitor_id, etapa) DO UPDATE SET timestamp=excluded.timestamp, conversao=excluded.conversao, abandono=excluded.abandono;
  GET DIAGNOSTICS v_f = ROW_COUNT;

  PERFORM public.visitor_emit('visitor.updated', jsonb_build_object('visitantes',v_v,'navegacao',v_n,'predicoes',v_p,'segmentos',v_s,'funil',v_f,'trace',v_trace));
  RETURN jsonb_build_object('ok',true,'visitantes',v_v,'navegacao',v_n,'predicoes',v_p,'segmentos',v_s,'funil',v_f,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 5) analyze_visitor(visitor_id) — VS + segmento + CP + evidencias + recomendacoes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analyze_visitor(p_visitor text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'visitor_id', p_visitor,
    'segmento', (SELECT segment FROM public.orion_visitor_segments WHERE visitor_id=p_visitor),
    'visitor_score', pr.vs, 'visitor_intent_score', pr.vis, 'conversion_probability', pr.cp,
    'engagement', pr.es, 'navigation_depth', pr.nds, 'return_probability', pr.rp,
    'purchase_probability', pr.purchase_probability, 'abandonment_probability', pr.abandonment_probability,
    'confidence', pr.confidence, 'evidencia', pr.evidencia,
    'recomendacoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',a) ORDER BY a),'[]'::jsonb) FROM (VALUES
       (CASE WHEN pr.cp>=60 THEN 'Alta intencao: oferecer contato/checkout facilitado' END),
       (CASE WHEN pr.abandonment_probability>=60 THEN 'Risco de abandono: recomendar conteudo relacionado (AI-35)' END),
       (CASE WHEN pr.rp>=60 THEN 'Bom retorno: nutrir com novidades da cidade' END)
     ) t(a) WHERE a IS NOT NULL),
    'navegacao', (SELECT coalesce(jsonb_agg(jsonb_build_object('page',page,'clicks',clicks) ORDER BY clicks DESC),'[]'::jsonb)
                  FROM public.orion_visitor_navigation WHERE visitor_id=p_visitor))
  FROM public.orion_visitor_predictions pr WHERE pr.visitor_id=p_visitor;
$$;

-- ----------------------------------------------------------------------------
-- 6) VISOES agregadas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visitor_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'visitantes_total', (SELECT count(*) FROM public.orion_visitors),
    'online_5min', (SELECT count(*) FROM public.orion_visitors WHERE last_seen > now()-interval '5 minutes'),
    'hoje', (SELECT count(*) FROM public.orion_visitors WHERE last_seen::date=current_date),
    'recorrentes', (SELECT count(*) FROM public.orion_visitors WHERE dias_ativos>1),
    'novos', (SELECT count(*) FROM public.orion_visitors WHERE dias_ativos<=1),
    'logados', (SELECT count(*) FROM public.orion_visitors WHERE is_logged),
    'eventos_por_visitante', (SELECT coalesce(round(avg(eventos),1),0) FROM public.orion_visitors),
    'vs_medio', (SELECT coalesce(round(avg(vs))::int,0) FROM public.orion_visitor_predictions),
    'vis_medio', (SELECT coalesce(round(avg(vis))::int,0) FROM public.orion_visitor_predictions),
    'cp_medio', (SELECT coalesce(round(avg(cp))::int,0) FROM public.orion_visitor_predictions),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.visitor_segments()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(segment, n),'{}'::jsonb) FROM (SELECT segment, count(*) n FROM public.orion_visitor_segments GROUP BY segment) x;
$$;

CREATE OR REPLACE FUNCTION public.visitor_sources()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_source', (SELECT coalesce(jsonb_object_agg(coalesce(source,'(direto)'), n),'{}'::jsonb) FROM (SELECT source, count(*) n FROM public.orion_visitors GROUP BY source) x),
    'por_cidade', (SELECT coalesce(jsonb_object_agg(coalesce(city,'(sem)'), n),'{}'::jsonb) FROM (SELECT city, count(*) n FROM public.orion_visitors GROUP BY city) x),
    'nota_origem_externa', 'Origem externa (Google/ChatGPT/redes) exige instrumentacao de referrer no front — DECLARADO. Aqui: sources internos de clique.');
$$;

CREATE OR REPLACE FUNCTION public.visitor_navigation_top()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'paginas_mais_visitadas', (SELECT coalesce(jsonb_agg(jsonb_build_object('page',page,'clicks',c,'visitantes',v) ORDER BY c DESC),'[]'::jsonb)
       FROM (SELECT page, sum(clicks) c, count(DISTINCT visitor_id) v FROM public.orion_visitor_navigation GROUP BY page ORDER BY c DESC LIMIT 10) x),
    'profundidade_media', (SELECT coalesce(round(avg(nds))::int,0) FROM public.orion_visitor_predictions),
    'nota_heatmap', 'scroll/permanencia/heatmap por area exigem instrumentacao do front — DECLARADO. Aqui: cliques/paginas reais.');
$$;

CREATE OR REPLACE FUNCTION public.visitor_funnel()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'visitante', (SELECT count(*) FROM public.orion_visitors),
    'pesquisa', (SELECT count(DISTINCT termo_norm) FROM public.orion_search_queries),
    'produto', (SELECT count(DISTINCT visitor_id) FROM public.orion_visitor_navigation),
    'contato', (SELECT count(*) FROM public.advertiser_contact_intentions),
    'compra', (SELECT count(*) FROM public.orion_conversion_funnel WHERE conversao),
    'nota', 'contato agregado (aci sem vinculo ao anon_id — DECLARADO); demais por visitante real.',
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.visitor_predictions_agg()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'prob_compra_media', (SELECT coalesce(round(avg(purchase_probability))::int,0) FROM public.orion_visitor_predictions),
    'prob_abandono_media', (SELECT coalesce(round(avg(abandonment_probability))::int,0) FROM public.orion_visitor_predictions),
    'prob_retorno_media', (SELECT coalesce(round(avg(return_probability))::int,0) FROM public.orion_visitor_predictions),
    'alto_valor', (SELECT count(*) FROM public.orion_visitor_predictions WHERE cp>=60),
    'risco_abandono', (SELECT count(*) FROM public.orion_visitor_predictions WHERE abandonment_probability>=60),
    'top_intencao', (SELECT coalesce(jsonb_agg(jsonb_build_object('visitor',visitor_id,'cp',cp,'vs',vs) ORDER BY cp DESC),'[]'::jsonb)
       FROM (SELECT visitor_id, cp, vs FROM public.orion_visitor_predictions ORDER BY cp DESC LIMIT 8) x));
$$;

CREATE OR REPLACE FUNCTION public.visitor_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'visitantes', (SELECT count(*) FROM public.orion_visitors),
    'navegacao_registros', (SELECT count(*) FROM public.orion_visitor_navigation),
    'predicoes', (SELECT count(*) FROM public.orion_visitor_predictions),
    'segmentos', (SELECT count(*) FROM public.orion_visitor_segments),
    'funil_registros', (SELECT count(*) FROM public.orion_conversion_funnel),
    'eventos', (SELECT count(*) FROM public.orion_eventos WHERE tipo LIKE 'visitor.%'));
$$;

CREATE OR REPLACE FUNCTION public.visitor_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('score',public.visitor_score(),'segments',public.visitor_segments(),
    'sources',public.visitor_sources(),'navigation',public.visitor_navigation_top(),
    'funnel',public.visitor_funnel(),'predictions',public.visitor_predictions_agg(),'metrics',public.visitor_metrics());
$$;

CREATE OR REPLACE FUNCTION public.visitor_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.visitor_summary();
  PERFORM public.visitor_emit('visitor.score', jsonb_build_object('vs', v->'score'->'vs_medio'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 7) TICK */3
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_visitor_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.visitor_build('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;

-- ----------------------------------------------------------------------------
-- 8) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.visitor_build(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analyze_visitor(text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_score()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_segments()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_sources()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_navigation_top()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_funnel()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_predictions_agg()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_metrics()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_summary()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_dashboard()            TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9) PROMPT REGISTRY (5 prompts)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('visitor.behavior',
 'Voce e o ORION Visitor Intelligence. Explique o comportamento de um visitante a partir das evidencias (cliques, produtos, dias ativos, conversoes). Nunca invente atributos; use so o observado. Respeite privacidade — sem dados pessoais.',
 'ORION-AI-39 seed');
SELECT public.orion_ai_prompt_set('visitor.abandonment',
 'Voce e o ORION Visitor Intelligence. Explique por que um visitante tende ao abandono (baixo engajamento, sem retorno) com base nos dados. Sugira acao de retencao sem supor atributos sensiveis.',
 'ORION-AI-39 seed');
SELECT public.orion_ai_prompt_set('visitor.interest',
 'Voce e o ORION Visitor Intelligence. Explique o interesse de um visitante (produtos/categorias mais clicados) apenas com base na navegacao observada.',
 'ORION-AI-39 seed');
SELECT public.orion_ai_prompt_set('visitor.purchase_intent',
 'Voce e o ORION Visitor Intelligence. Avalie a intencao de compra de um visitante (cliques, recorrencia, conversoes) e explique o Conversion Probability, sempre com evidencia.',
 'ORION-AI-39 seed');
SELECT public.orion_ai_prompt_set('visitor.next_content',
 'Voce e o ORION Visitor Intelligence. Sugira os proximos conteudos para um visitante com base na navegacao e no grafo (AI-34) e recomendacoes (AI-35). Nunca invente; baseie-se no comportamento.',
 'ORION-AI-39 seed');

-- ----------------------------------------------------------------------------
-- 10) MODEL PREF + CRON */3
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('visitor_intelligence','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_visitor_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_visitor_tick');
    PERFORM cron.schedule('orion_visitor_tick','*/3 * * * *','SELECT public.orion_visitor_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_visitor_tick');
--   DROP FUNCTION IF EXISTS public.orion_visitor_tick, public.visitor_dashboard, public.visitor_summary,
--     public.visitor_metrics, public.visitor_predictions_agg, public.visitor_funnel, public.visitor_navigation_top,
--     public.visitor_sources, public.visitor_segments, public.visitor_score, public.analyze_visitor(text),
--     public.visitor_build(text), public.visitor_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_conversion_funnel, public.orion_visitor_segments,
--     public.orion_visitor_predictions, public.orion_visitor_navigation, public.orion_visitors;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='visitor_intelligence';
-- ============================================================================
