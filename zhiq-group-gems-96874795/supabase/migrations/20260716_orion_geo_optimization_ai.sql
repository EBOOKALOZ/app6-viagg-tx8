-- ============================================================================
-- ORION-AI-33 — GEO OPTIMIZATION AI v1.0  (Generative Engine Optimization)
-- ============================================================================
-- 2a camada do ORION DISCOVERY ECOSYSTEM. Prepara cada anuncio para ser
--   compreendido por mecanismos de busca modernos e sistemas de IA que usam
--   conteudo estruturado e padroes abertos.
--
-- NAO tenta controlar respostas de ChatGPT/Gemini/Claude/Copilot. Aumenta a
--   PROBABILIDADE de descoberta via padroes tecnicos + contexto semantico.
--
-- PRINCIPIO: toda otimizacao e COMPLEMENTAR. Nunca altera titulo/descricao/
--   preco/atributos informados pelo usuario. Read-only sobre a fonte.
--
-- Diferencial: VIAGG GEO Index (VGI) — consolida GEO Score + Content Quality +
--   Discovery + Semantic (estes REUTILIZADOS do AI-32 orion_search_scores) ->
--   classificacao Platinum/Gold/Silver/Bronze + plano de melhoria.
--   Gera dados estruturados REAIS: JSON-LD (schema.org), Open Graph, Twitter
--   Cards; FAQ (so com dados reais); contexto semantico; landing intelligence.
--
-- Reuso EXCLUSIVO: AI Gateway, Prompt Registry, Event Bus, AI-32 Search &
--   Discovery, AI-18 Marketplace, AI-23 Marketing, AI-25 Sales, AI-22 BI,
--   AI-29 Innovation, AI-30 Executive, AI-01 Publisher. Sem motor paralelo.
--
-- Prepara o terreno para o AI-34 Knowledge Graph AI (usara estas estruturas).
-- Idempotente / auditavel / versionado. SECURITY DEFINER + guarda. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_geo_scores (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade_tipo     text        NOT NULL,             -- 'listing' | 'produto'
  entidade_id       text        NOT NULL,
  titulo            text,
  categoria         text,
  cidade            text,
  geo_score         integer     NOT NULL DEFAULT 0,   -- preparo estrutural/semantico p/ descoberta
  content_quality_score integer NOT NULL DEFAULT 0,   -- qualidade do conteudo cadastrado
  discovery_score   integer     NOT NULL DEFAULT 0,   -- REUSADO do AI-32
  semantic_score    integer     NOT NULL DEFAULT 0,   -- REUSADO do AI-32
  vgi               integer     NOT NULL DEFAULT 0,   -- VIAGG GEO Index (consolidado)
  classificacao     text,                             -- platinum|gold|silver|bronze
  fatores           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  structured_data   jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- JSON-LD + OG + Twitter Cards
  contexto          jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- contexto semantico/relacoes
  faq               jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- FAQ gerada (so com dados reais)
  plano             jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- plano de melhoria estrutural
  trace_id          text,
  dia               date        NOT NULL DEFAULT current_date,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_geo_scores_uq UNIQUE (entidade_tipo, entidade_id, dia)
);
COMMENT ON TABLE public.orion_geo_scores IS
  'ORION-AI-33: GEO/Content Quality/VGI + dados estruturados (JSON-LD/OG/Twitter) + FAQ + contexto por anuncio/dia. Complementar; nunca altera a fonte.';

CREATE INDEX IF NOT EXISTS ix_orion_geo_scores_dia   ON public.orion_geo_scores (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_geo_scores_vgi   ON public.orion_geo_scores (vgi);
CREATE INDEX IF NOT EXISTS ix_orion_geo_scores_class ON public.orion_geo_scores (classificacao);
CREATE INDEX IF NOT EXISTS ix_orion_geo_scores_cat   ON public.orion_geo_scores (categoria);

CREATE TABLE IF NOT EXISTS public.orion_geo_recommendations (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade_tipo  text        NOT NULL,
  entidade_id    text        NOT NULL,
  titulo         text,
  categoria      text,
  acao           text        NOT NULL,
  impacto        integer     NOT NULL DEFAULT 0,
  motivo         text,
  dia            date        NOT NULL DEFAULT current_date,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_geo_recs_uq UNIQUE (entidade_tipo, entidade_id, acao, dia)
);
COMMENT ON TABLE public.orion_geo_recommendations IS
  'ORION-AI-33: recomendacoes de enriquecimento estrutural por anuncio, sempre justificadas.';

CREATE INDEX IF NOT EXISTS ix_orion_geo_recs_dia ON public.orion_geo_recommendations (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_geo_recs_imp ON public.orion_geo_recommendations (impacto DESC);

-- ----------------------------------------------------------------------------
-- 2) RLS — leitura admin
-- ----------------------------------------------------------------------------
ALTER TABLE public.orion_geo_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_geo_recommendations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_geo_scores' AND policyname='orion_geo_scores_admin_read') THEN
    CREATE POLICY orion_geo_scores_admin_read ON public.orion_geo_scores FOR SELECT USING (public.mp_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_geo_recommendations' AND policyname='orion_geo_recs_admin_read') THEN
    CREATE POLICY orion_geo_recs_admin_read ON public.orion_geo_recommendations FOR SELECT USING (public.mp_is_admin());
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.geo_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados)
  VALUES (p_tipo, 'geo_optimization', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — geo_generate: GEO Score + Content Quality + VGI + structured data
--    + FAQ + contexto + plano. Reutiliza Discovery/Semantic do AI-32.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.geo_generate(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'geo_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_list int := 0; v_prod int := 0; v_recs int := 0;
BEGIN
  IF session_user <> 'postgres'
     AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'geo_generate: acesso negado (somente admin/service)';
  END IF;

  -- 4.1 ADVERTISER_LISTINGS (ricos) -----------------------------------------
  WITH base AS (
    SELECT l.id::text AS eid, l.title, l.description, l.category, l.city, l.price,
      l.cover_image_url, l.condition, l.warranty, l.has_invoice,
      (CASE WHEN l.cover_image_url IS NOT NULL AND l.cover_image_url<>'' THEN 1.0 ELSE 0 END) f_img,
      (CASE WHEN length(coalesce(l.description,''))>=60 THEN 1.0
            WHEN length(coalesce(l.description,''))>=15 THEN 0.6
            WHEN length(coalesce(l.description,''))>0  THEN 0.3 ELSE 0 END) f_desc,
      (CASE WHEN coalesce(l.category,'')<>'' THEN 1.0 ELSE 0 END) f_cat,
      (CASE WHEN l.price IS NOT NULL AND l.price>0 THEN 1.0 ELSE 0 END) f_preco,
      (CASE WHEN coalesce(l.city,'')<>'' THEN 1.0 ELSE 0 END) f_loc,
      (CASE WHEN length(coalesce(l.title,''))>=20 THEN 1.0
            WHEN length(coalesce(l.title,''))>=8  THEN 0.6 ELSE 0.3 END) f_titulo,
      (CASE WHEN lower(coalesce(l.ai_status,'')) IN ('approved','aprovado','ok')
             OR lower(coalesce(l.moderation_status,'')) IN ('approved','active','aprovado') THEN 1.0 ELSE 0 END) f_mod,
      (CASE WHEN coalesce(l.condition,'')<>'' THEN 1.0 ELSE 0 END) f_cond,
      (SELECT count(DISTINCT w) FROM regexp_split_to_table(regexp_replace(lower(coalesce(l.title,'')||' '||coalesce(l.description,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w) WHERE length(w)>=3) distintas,
      ss.discovery_score AS disc32, ss.semantic_score AS sem32
    FROM public.advertiser_listings l
    LEFT JOIN LATERAL (
      SELECT discovery_score, semantic_score FROM public.orion_search_scores s
      WHERE s.entidade_tipo='listing' AND s.entidade_id = l.id::text
      ORDER BY s.dia DESC LIMIT 1
    ) ss ON true
  ),
  scored AS (
    SELECT b.*,
      least(b.distintas/20.0,1) AS riqueza,
      round((least(b.distintas/20.0,1)*0.18 + (b.f_titulo+b.f_desc+b.f_cat+b.f_preco)/4*0.18
           + (b.f_cat+b.f_loc+b.f_preco)/3*0.15 + (b.f_img+b.f_desc+b.f_titulo+b.f_cat+b.f_preco+b.f_loc)/6*0.17
           + b.f_mod*0.12 + b.f_cat*0.10 + b.f_desc*0.10)*100)::int AS geo,
      round((b.f_titulo*0.20 + b.f_desc*0.25 + b.f_cond*0.15 + b.f_img*0.20 + b.f_loc*0.10 + b.f_cat*0.10)*100)::int AS cq
    FROM base b
  ),
  final AS (
    SELECT s.*,
      coalesce(s.disc32, s.geo) AS disc,
      coalesce(s.sem32, round(s.riqueza*100)::int) AS sem,
      round(0.35*s.geo + 0.25*s.cq + 0.20*coalesce(s.disc32,s.geo) + 0.20*coalesce(s.sem32, round(s.riqueza*100)::int))::int AS vgi
    FROM scored s
  )
  INSERT INTO public.orion_geo_scores
    (entidade_tipo, entidade_id, titulo, categoria, cidade,
     geo_score, content_quality_score, discovery_score, semantic_score, vgi, classificacao,
     fatores, structured_data, contexto, faq, plano, trace_id, dia)
  SELECT 'listing', f.eid, f.title, f.category, f.city,
     f.geo, f.cq, f.disc, f.sem, f.vgi,
     CASE WHEN f.vgi>=85 THEN 'platinum' WHEN f.vgi>=70 THEN 'gold' WHEN f.vgi>=50 THEN 'silver' ELSE 'bronze' END,
     jsonb_build_object('riqueza_semantica',f.riqueza,'metadados',(f.f_titulo+f.f_desc+f.f_cat+f.f_preco)/4,
       'estrutura',(f.f_cat+f.f_loc+f.f_preco)/3,'completude',(f.f_img+f.f_desc+f.f_titulo+f.f_cat+f.f_preco+f.f_loc)/6,
       'consistencia',f.f_mod,'contexto',f.f_cat,'qualidade_textual',f.f_desc,'palavras_distintas',f.distintas,
       'discovery_ai32',f.disc32,'semantic_ai32',f.sem32,
       'pesos','geo=riqueza.18/meta.18/estrut.15/compl.17/consist.12/ctx.10/txt.10; vgi=geo.35/cq.25/disc.20/sem.20'),
     -- structured_data: JSON-LD (schema.org) + Open Graph + Twitter Cards (so campos reais)
     jsonb_strip_nulls(jsonb_build_object(
       'json_ld', jsonb_strip_nulls(jsonb_build_object(
         '@context','https://schema.org','@type','Product',
         'name', nullif(f.title,''),
         'description', nullif(left(coalesce(f.description,''),480),''),
         'category', nullif(f.category,''),
         'image', nullif(f.cover_image_url,''),
         'areaServed', nullif(f.city,''),
         'itemCondition', CASE WHEN coalesce(f.condition,'')<>'' THEN 'https://schema.org/'||CASE WHEN lower(f.condition) LIKE '%nov%' THEN 'NewCondition' ELSE 'UsedCondition' END ELSE NULL END,
         'offers', CASE WHEN f.price>0 THEN jsonb_build_object('@type','Offer','price',f.price,'priceCurrency','BRL','availability','https://schema.org/InStock') ELSE NULL END)),
       'open_graph', jsonb_strip_nulls(jsonb_build_object(
         'og:type','product','og:title',nullif(f.title,''),
         'og:description', nullif(left(coalesce(f.description,''),200),''),
         'og:image', nullif(f.cover_image_url,''))),
       'twitter_card', jsonb_strip_nulls(jsonb_build_object(
         'twitter:card', CASE WHEN coalesce(f.cover_image_url,'')<>'' THEN 'summary_large_image' ELSE 'summary' END,
         'twitter:title', nullif(f.title,''),
         'twitter:description', nullif(left(coalesce(f.description,''),200),''))))),
     -- contexto semantico (relacoes reais)
     jsonb_strip_nulls(jsonb_build_object(
       'categoria', nullif(f.category,''), 'cidade', nullif(f.city,''), 'marketplace','viagg',
       'cadeia', jsonb_build_array('Anúncio', nullif(f.category,''), nullif(f.city,''), 'Marketplace VIAGG'),
       'termos_relacionados', (SELECT coalesce(jsonb_agg(DISTINCT w),'[]'::jsonb)
          FROM regexp_split_to_table(regexp_replace(lower(coalesce(f.title,'')||' '||coalesce(f.category,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w)
          WHERE length(w)>=4))),
     -- FAQ: so perguntas com dado real
     (SELECT coalesce(jsonb_agg(jsonb_build_object('pergunta',p,'resposta',r)),'[]'::jsonb)
      FROM (VALUES
        ('O que é este anúncio?', nullif(f.title,'')),
        ('Em qual cidade está disponível?', nullif(f.city,'')),
        ('Qual é o preço?', CASE WHEN f.price>0 THEN 'R$ '||replace(to_char(f.price,'FM999999990.00'),'.',',') ELSE NULL END),
        ('Qual é a condição do item?', nullif(f.condition,'')),
        ('Possui nota fiscal?', CASE WHEN f.has_invoice THEN 'Sim, acompanha nota fiscal.' ELSE NULL END),
        ('Possui garantia?', CASE WHEN coalesce(f.warranty,'')<>'' THEN 'Garantia informada: '||f.warranty ELSE NULL END)
      ) q(p,r) WHERE r IS NOT NULL),
     -- plano de melhoria estrutural
     (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'impacto',imp,'motivo',motivo) ORDER BY imp DESC),'[]'::jsonb)
      FROM (VALUES
        ('Adicionar imagem de capa',                          round((1-f.f_img)*20)::int,   'Imagem alimenta og:image/Twitter Card e a descoberta'),
        ('Completar a descrição (contexto e características)', round((1-f.f_desc)*20)::int,  'Descrição rica melhora JSON-LD, FAQ e riqueza semântica'),
        ('Informar marca e modelo',                           round((1-f.f_cond)*14)::int,  'Marca/modelo estruturam o schema.org e as relações'),
        ('Melhorar o título',                                 round((1-f.f_titulo)*12)::int,'Título descritivo vira name do Product e melhora metadados'),
        ('Definir a categoria',                               round((1-f.f_cat)*12)::int,   'Categoria conecta contexto e categorias relacionadas'),
        ('Informar o preço',                                  round((1-f.f_preco)*11)::int, 'Preço habilita o bloco Offer do schema.org'),
        ('Informar a cidade/localização',                     round((1-f.f_loc)*11)::int,   'Localização vira areaServed e melhora landing por cidade')
      ) v(acao,imp,motivo) WHERE imp >= 3),
     v_trace, current_date
  FROM final f
  ON CONFLICT (entidade_tipo, entidade_id, dia) DO UPDATE SET
     titulo=excluded.titulo, categoria=excluded.categoria, cidade=excluded.cidade,
     geo_score=excluded.geo_score, content_quality_score=excluded.content_quality_score,
     discovery_score=excluded.discovery_score, semantic_score=excluded.semantic_score,
     vgi=excluded.vgi, classificacao=excluded.classificacao, fatores=excluded.fatores,
     structured_data=excluded.structured_data, contexto=excluded.contexto,
     faq=excluded.faq, plano=excluded.plano, trace_id=excluded.trace_id;
  GET DIAGNOSTICS v_list = ROW_COUNT;

  -- 4.2 MERCHANT_PRODUTOS (pobres — lacuna declarada) -----------------------
  WITH base AS (
    SELECT p.id::text AS eid, p.nome AS title, p.descricao AS description, p.preco AS price, p.imagem_url,
      (CASE WHEN p.imagem_url IS NOT NULL AND p.imagem_url<>'' THEN 1.0 ELSE 0 END) f_img,
      (CASE WHEN length(coalesce(p.descricao,''))>=60 THEN 1.0
            WHEN length(coalesce(p.descricao,''))>=15 THEN 0.6
            WHEN length(coalesce(p.descricao,''))>0  THEN 0.3 ELSE 0 END) f_desc,
      (CASE WHEN p.preco IS NOT NULL AND p.preco>0 THEN 1.0 ELSE 0 END) f_preco,
      (CASE WHEN length(coalesce(p.nome,''))>=20 THEN 1.0
            WHEN length(coalesce(p.nome,''))>=8  THEN 0.6 ELSE 0.3 END) f_titulo,
      (SELECT count(DISTINCT w) FROM regexp_split_to_table(regexp_replace(lower(coalesce(p.nome,'')||' '||coalesce(p.descricao,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w) WHERE length(w)>=3) distintas,
      ss.discovery_score AS disc32, ss.semantic_score AS sem32
    FROM public.merchant_products p
    LEFT JOIN LATERAL (
      SELECT discovery_score, semantic_score FROM public.orion_search_scores s
      WHERE s.entidade_tipo='produto' AND s.entidade_id = p.id::text
      ORDER BY s.dia DESC LIMIT 1
    ) ss ON true
  ),
  scored AS (
    SELECT b.*, least(b.distintas/20.0,1) AS riqueza,
      round((least(b.distintas/20.0,1)*0.20 + (b.f_titulo+b.f_desc)/2*0.30 + b.f_img*0.25 + b.f_preco*0.25)*100)::int AS geo,
      round((b.f_titulo*0.30 + b.f_desc*0.35 + b.f_img*0.25 + b.f_preco*0.10)*100)::int AS cq
    FROM base b
  ),
  final AS (
    SELECT s.*, coalesce(s.disc32,s.geo) AS disc, coalesce(s.sem32, round(s.riqueza*100)::int) AS sem,
      round(0.35*s.geo + 0.25*s.cq + 0.20*coalesce(s.disc32,s.geo) + 0.20*coalesce(s.sem32, round(s.riqueza*100)::int))::int AS vgi
    FROM scored s
  )
  INSERT INTO public.orion_geo_scores
    (entidade_tipo, entidade_id, titulo, categoria, cidade,
     geo_score, content_quality_score, discovery_score, semantic_score, vgi, classificacao,
     fatores, structured_data, contexto, faq, plano, trace_id, dia)
  SELECT 'produto', f.eid, f.title, '(loja) sem categoria estruturada', NULL,
     f.geo, f.cq, f.disc, f.sem, f.vgi,
     CASE WHEN f.vgi>=85 THEN 'platinum' WHEN f.vgi>=70 THEN 'gold' WHEN f.vgi>=50 THEN 'silver' ELSE 'bronze' END,
     jsonb_build_object('riqueza_semantica',f.riqueza,'metadados',(f.f_titulo+f.f_desc)/2,'imagens',f.f_img,'preco',f.f_preco,
       'palavras_distintas',f.distintas,'discovery_ai32',f.disc32,'semantic_ai32',f.sem32,
       'lacuna','merchant_products sem categoria/cidade/atributos estruturados (declarado)'),
     jsonb_strip_nulls(jsonb_build_object(
       'json_ld', jsonb_strip_nulls(jsonb_build_object(
         '@context','https://schema.org','@type','Product',
         'name', nullif(f.title,''),
         'description', nullif(left(coalesce(f.description,''),480),''),
         'image', nullif(f.imagem_url,''),
         'offers', CASE WHEN f.price>0 THEN jsonb_build_object('@type','Offer','price',f.price,'priceCurrency','BRL','availability','https://schema.org/InStock') ELSE NULL END)),
       'open_graph', jsonb_strip_nulls(jsonb_build_object('og:type','product','og:title',nullif(f.title,''),
         'og:description', nullif(left(coalesce(f.description,''),200),''),'og:image', nullif(f.imagem_url,''))),
       'twitter_card', jsonb_strip_nulls(jsonb_build_object(
         'twitter:card', CASE WHEN coalesce(f.imagem_url,'')<>'' THEN 'summary_large_image' ELSE 'summary' END,
         'twitter:title', nullif(f.title,''))))),
     jsonb_strip_nulls(jsonb_build_object('marketplace','viagg','cadeia', jsonb_build_array('Produto de loja','Marketplace VIAGG'),
       'termos_relacionados', (SELECT coalesce(jsonb_agg(DISTINCT w),'[]'::jsonb)
          FROM regexp_split_to_table(regexp_replace(lower(coalesce(f.title,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w) WHERE length(w)>=4))),
     (SELECT coalesce(jsonb_agg(jsonb_build_object('pergunta',p,'resposta',r)),'[]'::jsonb)
      FROM (VALUES
        ('O que é este produto?', nullif(f.title,'')),
        ('Qual é o preço?', CASE WHEN f.price>0 THEN 'R$ '||replace(to_char(f.price,'FM999999990.00'),'.',',') ELSE NULL END)
      ) q(p,r) WHERE r IS NOT NULL),
     (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'impacto',imp,'motivo',motivo) ORDER BY imp DESC),'[]'::jsonb)
      FROM (VALUES
        ('Adicionar imagem do produto',   round((1-f.f_img)*30)::int,   'Imagem alimenta og:image e a descoberta'),
        ('Completar a descrição',         round((1-f.f_desc)*30)::int,  'Descrição rica melhora JSON-LD e FAQ'),
        ('Melhorar o nome do produto',    round((1-f.f_titulo)*25)::int,'Nome vira name do schema.org Product'),
        ('Informar o preço',              round((1-f.f_preco)*15)::int, 'Preço habilita o bloco Offer')
      ) v(acao,imp,motivo) WHERE imp >= 3),
     v_trace, current_date
  FROM final f
  ON CONFLICT (entidade_tipo, entidade_id, dia) DO UPDATE SET
     titulo=excluded.titulo, geo_score=excluded.geo_score, content_quality_score=excluded.content_quality_score,
     discovery_score=excluded.discovery_score, semantic_score=excluded.semantic_score,
     vgi=excluded.vgi, classificacao=excluded.classificacao, fatores=excluded.fatores,
     structured_data=excluded.structured_data, contexto=excluded.contexto,
     faq=excluded.faq, plano=excluded.plano, trace_id=excluded.trace_id;
  GET DIAGNOSTICS v_prod = ROW_COUNT;

  -- 4.3 Expande o plano em recomendacoes (idempotente)
  INSERT INTO public.orion_geo_recommendations (entidade_tipo, entidade_id, titulo, categoria, acao, impacto, motivo, dia)
  SELECT g.entidade_tipo, g.entidade_id, g.titulo, g.categoria, e->>'acao', (e->>'impacto')::int, e->>'motivo', g.dia
  FROM public.orion_geo_scores g
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(g.plano,'[]'::jsonb)) e
  WHERE g.dia = current_date
  ON CONFLICT (entidade_tipo, entidade_id, acao, dia) DO UPDATE SET
     impacto=excluded.impacto, motivo=excluded.motivo, titulo=excluded.titulo, categoria=excluded.categoria;
  GET DIAGNOSTICS v_recs = ROW_COUNT;

  PERFORM public.geo_emit('geo.updated', jsonb_build_object('listings',v_list,'produtos',v_prod,'recomendacoes',v_recs,'trace',v_trace));
  PERFORM public.geo_emit('geo.metadata.generated', jsonb_build_object('anuncios',v_list+v_prod,'trace',v_trace));

  RETURN jsonb_build_object('ok',true,'listings',v_list,'produtos',v_prod,'anuncios',v_list+v_prod,'recomendacoes',v_recs,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 5) CONSULTAS — structured data, contexto, landing, gaps, quality, score...
-- ----------------------------------------------------------------------------
-- 5.1 Dados estruturados de um anuncio (para export / landing)
CREATE OR REPLACE FUNCTION public.geo_structured_data(p_tipo text, p_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('entidade',p_tipo||':'||p_id,'titulo',titulo,'vgi',vgi,'classificacao',classificacao,
    'structured_data',structured_data,'faq',faq,'contexto',contexto)
  FROM public.orion_geo_scores
  WHERE entidade_tipo=p_tipo AND entidade_id=p_id ORDER BY dia DESC LIMIT 1;
$$;

-- 5.2 Landing Page Intelligence — agrega dados estruturados por escopo
CREATE OR REPLACE FUNCTION public.geo_landing(p_escopo text DEFAULT 'cidade')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT * FROM public.orion_geo_scores WHERE dia=(SELECT max(dia) FROM public.orion_geo_scores))
  SELECT jsonb_build_object(
    'escopo', p_escopo,
    'por_cidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',cidade,'anuncios',n,'vgi_medio',v,'platinum_gold',pg) ORDER BY n DESC),'[]'::jsonb)
       FROM (SELECT coalesce(cidade,'(sem cidade)') cidade, count(*) n, round(avg(vgi))::int v,
                    count(*) FILTER (WHERE classificacao IN ('platinum','gold')) pg
             FROM hoje GROUP BY 1 ORDER BY n DESC LIMIT 15) c),
    'por_categoria', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',categoria,'anuncios',n,'vgi_medio',v) ORDER BY n DESC),'[]'::jsonb)
       FROM (SELECT coalesce(categoria,'(sem categoria)') categoria, count(*) n, round(avg(vgi))::int v
             FROM hoje GROUP BY 1 ORDER BY n DESC LIMIT 15) k),
    'nota','O módulo NÃO cria páginas; fornece dados estruturados agregados para quem as gera.',
    'gerado_em', now());
$$;

-- 5.3 Gap detection estrutural
CREATE OR REPLACE FUNCTION public.geo_gaps()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT * FROM public.orion_geo_scores WHERE dia=(SELECT max(dia) FROM public.orion_geo_scores))
  SELECT jsonb_build_object(
    'anuncios_pobres', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'vgi',vgi,'classificacao',classificacao) ORDER BY vgi ASC),'[]'::jsonb)
       FROM hoje WHERE vgi < 50),
    'sem_atributos', (SELECT count(*) FROM hoje WHERE (fatores->>'contexto')::numeric < 1 OR classificacao='bronze'),
    'categorias_incompletas', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',categoria,'vgi_medio',v) ORDER BY v ASC),'[]'::jsonb)
       FROM (SELECT coalesce(categoria,'(sem categoria)') categoria, round(avg(vgi))::int v FROM hoje GROUP BY 1 HAVING avg(vgi) < 60 ORDER BY v ASC LIMIT 10) c),
    'descricoes_insuficientes', (SELECT count(*) FROM hoje WHERE (fatores->>'qualidade_textual')::numeric < 0.6),
    'gerado_em', now());
$$;

-- 5.4 Qualidade de conteudo (overview)
CREATE OR REPLACE FUNCTION public.geo_quality()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT * FROM public.orion_geo_scores WHERE dia=(SELECT max(dia) FROM public.orion_geo_scores))
  SELECT jsonb_build_object(
    'content_quality_medio', (SELECT coalesce(round(avg(content_quality_score))::int,0) FROM hoje),
    'geo_medio', (SELECT coalesce(round(avg(geo_score))::int,0) FROM hoje),
    'com_imagem', (SELECT count(*) FROM hoje WHERE structured_data->'open_graph' ? 'og:image'),
    'com_faq', (SELECT count(*) FROM hoje WHERE jsonb_array_length(coalesce(faq,'[]'::jsonb)) >= 2),
    'com_json_ld', (SELECT count(*) FROM hoje WHERE structured_data ? 'json_ld'),
    'gerado_em', now());
$$;

-- 5.5 Score geral (VGI ecosystem + distribuicao Platinum/Gold/Silver/Bronze)
CREATE OR REPLACE FUNCTION public.geo_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT * FROM public.orion_geo_scores WHERE dia=(SELECT max(dia) FROM public.orion_geo_scores))
  SELECT jsonb_build_object(
    'geo_ecosystem_score', (SELECT coalesce(round(avg(vgi))::int,0) FROM hoje),
    'geo_medio', (SELECT coalesce(round(avg(geo_score))::int,0) FROM hoje),
    'content_quality_medio', (SELECT coalesce(round(avg(content_quality_score))::int,0) FROM hoje),
    'anuncios', (SELECT count(*) FROM hoje),
    'distribuicao', jsonb_build_object(
      'platinum',(SELECT count(*) FROM hoje WHERE classificacao='platinum'),
      'gold',(SELECT count(*) FROM hoje WHERE classificacao='gold'),
      'silver',(SELECT count(*) FROM hoje WHERE classificacao='silver'),
      'bronze',(SELECT count(*) FROM hoje WHERE classificacao='bronze')),
    'gerado_em', now());
$$;

-- 5.6 Recomendacoes agregadas
CREATE OR REPLACE FUNCTION public.geo_recommendations()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'top_acoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'anuncios',n,'impacto_medio',imp) ORDER BY imp DESC),'[]'::jsonb)
       FROM (SELECT acao, count(*) n, round(avg(impacto))::int imp FROM public.orion_geo_recommendations
             WHERE dia=(SELECT max(dia) FROM public.orion_geo_recommendations) GROUP BY acao ORDER BY imp DESC LIMIT 10) a),
    'total', (SELECT count(*) FROM public.orion_geo_recommendations WHERE dia=(SELECT max(dia) FROM public.orion_geo_recommendations)),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.geo_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'scores_total', (SELECT count(*) FROM public.orion_geo_scores),
    'recomendacoes_total', (SELECT count(*) FROM public.orion_geo_recommendations),
    'ultimo_dia', (SELECT max(dia) FROM public.orion_geo_scores),
    'eventos_geo', (SELECT count(*) FROM public.orion_eventos WHERE tipo LIKE 'geo.%'));
$$;

CREATE OR REPLACE FUNCTION public.geo_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('score',public.geo_score(),'quality',public.geo_quality(),
    'gaps',public.geo_gaps(),'landing',public.geo_landing('cidade'),
    'recommendations',public.geo_recommendations(),'metrics',public.geo_metrics());
$$;

CREATE OR REPLACE FUNCTION public.geo_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.geo_summary();
  PERFORM public.geo_emit('geo.score', jsonb_build_object('vgi', v->'score'->'geo_ecosystem_score'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 6) CRON TICK :13
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_geo_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.geo_generate('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  PERFORM public.geo_emit('geo.recommendation', jsonb_build_object('total',(SELECT count(*) FROM public.orion_geo_recommendations WHERE dia=current_date)));
END$$;

-- ----------------------------------------------------------------------------
-- 7) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.geo_generate(text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_structured_data(text,text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_landing(text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_gaps()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_quality()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_score()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_recommendations()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_metrics()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_summary()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_dashboard()                 TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8) PROMPT REGISTRY (5 prompts)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('geo.context',
 'Voce e o ORION GEO Optimization AI. Gere contexto semantico COMPLEMENTAR para um anuncio (categoria, marca, cidade, marketplace, produtos semelhantes/complementares) baseado apenas nos dados fornecidos. Nunca altere o conteudo original nem invente atributos ausentes.',
 'ORION-AI-33 seed');
SELECT public.orion_ai_prompt_set('geo.optimize',
 'Voce e o consultor GEO do ORION. Transforme os pontos fracos estruturais de um anuncio em acoes concretas de enriquecimento (marca, modelo, atributos, imagens, medidas, titulo), cada uma com justificativa e impacto esperado. Otimizacao sempre complementar — preserve o conteudo do anunciante.',
 'ORION-AI-33 seed');
SELECT public.orion_ai_prompt_set('geo.metadata',
 'Voce e o gerador de metadados do ORION. A partir dos campos reais de um anuncio, descreva como preencher JSON-LD (schema.org), Open Graph e Twitter Cards. Use apenas padroes publicos e dados existentes; nunca fabrique valores.',
 'ORION-AI-33 seed');
SELECT public.orion_ai_prompt_set('geo.quality',
 'Voce e o avaliador de qualidade de conteudo do ORION. Avalie titulo, descricao, atributos, imagens, localizacao e categoria de um anuncio e explique objetivamente o que eleva a qualidade estrutural. Nunca invente dados ausentes — declare o que falta.',
 'ORION-AI-33 seed');
SELECT public.orion_ai_prompt_set('geo.summary',
 'Voce e o ORION GEO Optimization AI. Resuma o estado de preparacao para descoberta da plataforma: VIAGG GEO Index, distribuicao Platinum/Gold/Silver/Bronze, anuncios pobres e as 3 acoes de maior impacto estrutural. Seja direto, explicavel e honesto sobre lacunas.',
 'ORION-AI-33 seed');

-- ----------------------------------------------------------------------------
-- 9) MODEL PREF
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code)
VALUES ('geo_optimization','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10) CRON
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_geo_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_geo_tick');
    PERFORM cron.schedule('orion_geo_tick','13 * * * *','SELECT public.orion_geo_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_geo_tick');
--   DROP FUNCTION IF EXISTS public.orion_geo_tick, public.geo_dashboard, public.geo_summary,
--     public.geo_metrics, public.geo_recommendations, public.geo_score, public.geo_quality,
--     public.geo_gaps, public.geo_landing(text), public.geo_structured_data(text,text),
--     public.geo_generate(text), public.geo_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_geo_recommendations, public.orion_geo_scores;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='geo_optimization';
-- ============================================================================
