-- ============================================================================
-- ORION-AI-32 — SEARCH & DISCOVERY AI v1.0  (ORION DISCOVERY ECOSYSTEM)
-- ============================================================================
-- Missao: maximizar a DESCOBRIBILIDADE dos anuncios da VIAGG-TX8.
--   Nunca altera o conteudo original do anunciante. Apenas enriquece,
--   estrutura, relaciona, classifica e recomenda (read-only sobre a fonte).
--
-- Motor proprietario: VIAGG Discovery Engine (VDE) — consolida 4 scores
--   explicaveis por anuncio (0-100): Discovery / AI Discovery / Search /
--   Semantic — e gera um plano de otimizacao priorizado por impacto.
--
-- Reuso EXCLUSIVO (sem infraestrutura paralela): AI Gateway, Prompt Registry,
--   Event Bus (orion_eventos), AI-18 Marketplace (orion_market_insights),
--   AI-20 Trust, AI-22 BI, AI-23 Marketing, AI-25 Sales, AI-26 Customer,
--   AI-29 Innovation, AI-30 Executive.
--
-- DEPENDENCIA DECLARADA PENDENTE: AI-31 Knowledge & Learning AI ainda NAO
--   existe como modulo proprio (o orion_knowledge/knowledge_engine pertence ao
--   AI-14 Strategy Suite). Os eventos knowledge.* serao consumidos quando o
--   AI-31 for construido. Nada e inventado — a lacuna e declarada.
--
-- LACUNA DE DADOS DECLARADA: nao ha telemetria de buscas reais de usuario
--   (search_events). orion_search_queries e o alvo de instrumentacao; por ora
--   e alimentada apenas por sondagens semanticas (search_semantic). Search
--   analytics de "pesquisas que nao encontram" fica PARCIAL ate o front logar.
--
-- Idempotente / auditavel / versionado. SECURITY DEFINER + guarda admin.
-- ROLLBACK (fim do arquivo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------

-- 1.1 Scores de descoberta por anuncio (VDE) — recomputados por dia (upsert)
CREATE TABLE IF NOT EXISTS public.orion_search_scores (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade_tipo    text        NOT NULL,                 -- 'listing' | 'produto'
  entidade_id      text        NOT NULL,
  titulo           text,
  categoria        text,
  cidade           text,
  discovery_score  integer     NOT NULL DEFAULT 0,       -- qualidade/completude p/ busca interna
  ai_discovery_score integer   NOT NULL DEFAULT 0,       -- preparo p/ compreensao por IA/indexacao
  search_score     integer     NOT NULL DEFAULT 0,       -- findability (palavras-chave/titulo/categoria)
  semantic_score   integer     NOT NULL DEFAULT 0,       -- riqueza semantica/contexto
  vde_score        integer     NOT NULL DEFAULT 0,       -- VIAGG Discovery Engine (consolidado)
  visibilidade     text,                                 -- excelente|bom|regular|invisivel
  fatores          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  pontos_fortes    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pontos_fracos    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  plano            jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- plano de otimizacao priorizado
  trace_id         text,
  dia              date        NOT NULL DEFAULT current_date,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_search_scores_uq UNIQUE (entidade_tipo, entidade_id, dia)
);
COMMENT ON TABLE public.orion_search_scores IS
  'ORION-AI-32: scores de descobribilidade (VDE) por anuncio/dia. Read-only sobre a fonte; nunca altera o anuncio.';

CREATE INDEX IF NOT EXISTS ix_orion_search_scores_dia  ON public.orion_search_scores (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_search_scores_vde  ON public.orion_search_scores (vde_score);
CREATE INDEX IF NOT EXISTS ix_orion_search_scores_cat  ON public.orion_search_scores (categoria);

-- 1.2 Recomendacoes de otimizacao (expandidas do plano) — por anuncio/acao/dia
CREATE TABLE IF NOT EXISTS public.orion_search_recommendations (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade_tipo  text        NOT NULL,
  entidade_id    text        NOT NULL,
  titulo         text,
  categoria      text,
  acao           text        NOT NULL,
  impacto        integer     NOT NULL DEFAULT 0,         -- impacto esperado 0-100
  motivo         text,
  dia            date        NOT NULL DEFAULT current_date,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_search_recs_uq UNIQUE (entidade_tipo, entidade_id, acao, dia)
);
COMMENT ON TABLE public.orion_search_recommendations IS
  'ORION-AI-32: recomendacoes de otimizacao de descoberta por anuncio, sempre justificadas.';

CREATE INDEX IF NOT EXISTS ix_orion_search_recs_dia ON public.orion_search_recommendations (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_search_recs_imp ON public.orion_search_recommendations (impacto DESC);

-- 1.3 Registro de buscas / sondagens semanticas (alvo de instrumentacao futura)
CREATE TABLE IF NOT EXISTS public.orion_search_queries (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  termo        text        NOT NULL,
  termo_norm   text        NOT NULL,
  cidade       text        NOT NULL DEFAULT '',
  resultados   integer     NOT NULL DEFAULT 0,
  origem       text        NOT NULL DEFAULT 'probe',     -- probe|frontend|api
  dia          date        NOT NULL DEFAULT current_date,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_search_queries_uq UNIQUE (termo_norm, cidade, dia)
);
COMMENT ON TABLE public.orion_search_queries IS
  'ORION-AI-32: log de termos de busca. Hoje alimentado por sondagens (search_semantic); alvo de instrumentacao do front (search_events) — LACUNA declarada.';

CREATE INDEX IF NOT EXISTS ix_orion_search_queries_dia ON public.orion_search_queries (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_search_queries_res ON public.orion_search_queries (resultados);

-- ----------------------------------------------------------------------------
-- 2) RLS — leitura restrita a admin (dados analiticos)
-- ----------------------------------------------------------------------------
ALTER TABLE public.orion_search_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_search_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_search_queries         ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_search_scores' AND policyname='orion_search_scores_admin_read') THEN
    CREATE POLICY orion_search_scores_admin_read ON public.orion_search_scores FOR SELECT USING (public.mp_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_search_recommendations' AND policyname='orion_search_recs_admin_read') THEN
    CREATE POLICY orion_search_recs_admin_read ON public.orion_search_recommendations FOR SELECT USING (public.mp_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_search_queries' AND policyname='orion_search_queries_admin_read') THEN
    CREATE POLICY orion_search_queries_admin_read ON public.orion_search_queries FOR SELECT USING (public.mp_is_admin());
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS — emissor
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_emit(p_tipo text, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados)
  VALUES (p_tipo, 'search_discovery', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  NULL; -- Event Bus nunca derruba o motor
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — VIAGG Discovery Engine (VDE): pontua todos os anuncios
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_generate(p_trace text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'search_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_list  int := 0;
  v_prod  int := 0;
  v_recs  int := 0;
BEGIN
  -- Guarda: bloqueia escrita fora de admin/service/cron
  IF session_user <> 'postgres'
     AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'search_generate: acesso negado (somente admin/service)';
  END IF;

  -- 4.1 ANUNCIOS RICOS (advertiser_listings) --------------------------------
  WITH base AS (
    SELECT l.id::text AS eid, l.title, l.description, l.category, l.city, l.price,
      (CASE WHEN l.cover_image_url IS NOT NULL AND l.cover_image_url<>'' THEN 1.0 ELSE 0 END) f_img,
      (CASE WHEN length(coalesce(l.description,''))>=60 THEN 1.0
            WHEN length(coalesce(l.description,''))>=15 THEN 0.6
            WHEN length(coalesce(l.description,''))>0  THEN 0.3 ELSE 0 END) f_desc,
      (CASE WHEN coalesce(l.category,'')<>'' THEN 1.0 ELSE 0 END) f_cat,
      (CASE WHEN l.price IS NOT NULL AND l.price>0 THEN 1.0 ELSE 0 END) f_preco,
      (CASE WHEN coalesce(l.city,'')<>'' THEN 1.0 ELSE 0 END) f_loc,
      (CASE WHEN length(coalesce(l.title,''))>=20 THEN 1.0
            WHEN length(coalesce(l.title,''))>=8  THEN 0.6 ELSE 0.3 END) f_titulo,
      (CASE WHEN l.is_promoted THEN 1.0 ELSE 0 END) f_promo,
      (CASE WHEN lower(coalesce(l.ai_status,'')) IN ('approved','aprovado','ok')
             OR lower(coalesce(l.moderation_status,'')) IN ('approved','active','aprovado') THEN 1.0 ELSE 0 END) f_mod,
      (CASE WHEN coalesce(l.condition,'')<>'' THEN 1.0 ELSE 0 END) f_cond,
      (CASE WHEN coalesce(l.ai_status,'')<>'' THEN 1.0 ELSE 0.4 END) f_consist,
      (SELECT count(*) FROM regexp_split_to_table(regexp_replace(lower(coalesce(l.title,'')||' '||coalesce(l.description,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w) WHERE length(w)>=3) palavras,
      (SELECT count(DISTINCT w) FROM regexp_split_to_table(regexp_replace(lower(coalesce(l.title,'')||' '||coalesce(l.description,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w) WHERE length(w)>=3) distintas
    FROM public.advertiser_listings l
  ),
  scored AS (
    SELECT b.*,
      round((f_img*0.20 + f_desc*0.20 + f_titulo*0.12 + f_cat*0.10 + f_preco*0.10 + f_loc*0.10 + f_mod*0.13 + f_promo*0.05)*100)::int discovery,
      round(((f_cat+f_preco+f_loc)/3*0.30 + (f_titulo+f_desc)/2*0.30 + (f_cond+f_img+f_mod)/3*0.25 + f_consist*0.15)*100)::int ai_disc,
      round((least(palavras/18.0,1)*0.50 + f_titulo*0.30 + f_cat*0.20)*100)::int searchs,
      round((least(distintas/20.0,1)*0.50 + f_cat*0.25 + f_desc*0.25)*100)::int semantic
    FROM base b
  )
  INSERT INTO public.orion_search_scores
    (entidade_tipo, entidade_id, titulo, categoria, cidade,
     discovery_score, ai_discovery_score, search_score, semantic_score, vde_score,
     visibilidade, fatores, pontos_fortes, pontos_fracos, plano, trace_id, dia)
  SELECT 'listing', s.eid, s.title, s.category, s.city,
     s.discovery, s.ai_disc, s.searchs, s.semantic,
     round(0.35*s.discovery + 0.25*s.ai_disc + 0.20*s.searchs + 0.20*s.semantic)::int AS vde,
     CASE WHEN round(0.35*s.discovery+0.25*s.ai_disc+0.20*s.searchs+0.20*s.semantic) >= 80 THEN 'excelente'
          WHEN round(0.35*s.discovery+0.25*s.ai_disc+0.20*s.searchs+0.20*s.semantic) >= 60 THEN 'bom'
          WHEN round(0.35*s.discovery+0.25*s.ai_disc+0.20*s.searchs+0.20*s.semantic) >= 40 THEN 'regular'
          ELSE 'invisivel' END,
     jsonb_build_object(
       'imagem',s.f_img,'descricao',s.f_desc,'titulo',s.f_titulo,'categoria',s.f_cat,
       'preco',s.f_preco,'localizacao',s.f_loc,'moderacao',s.f_mod,'promocao',s.f_promo,
       'atributos',s.f_cond,'palavras',s.palavras,'palavras_distintas',s.distintas,
       'pesos','discovery=img.20/desc.20/tit.12/cat.10/preco.10/loc.10/mod.13/promo.05; vde=disc.35/aidisc.25/search.20/sem.20'),
     (SELECT coalesce(jsonb_agg(lbl ORDER BY fv DESC),'[]'::jsonb) FROM (VALUES
        ('Foto de capa',s.f_img),('Descricao completa',s.f_desc),('Titulo descritivo',s.f_titulo),
        ('Categoria definida',s.f_cat),('Preco informado',s.f_preco),('Localizacao',s.f_loc),
        ('Verificado/moderado',s.f_mod),('Em destaque',s.f_promo)) t(lbl,fv) WHERE fv>=0.8),
     (SELECT coalesce(jsonb_agg(lbl ORDER BY fv ASC),'[]'::jsonb) FROM (VALUES
        ('Foto de capa',s.f_img),('Descricao',s.f_desc),('Titulo',s.f_titulo),
        ('Categoria',s.f_cat),('Preco',s.f_preco),('Localizacao',s.f_loc),
        ('Verificacao/moderacao',s.f_mod),('Atributos',s.f_cond)) t(lbl,fv) WHERE fv<0.5),
     (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'impacto',imp,'motivo',motivo) ORDER BY imp DESC),'[]'::jsonb)
      FROM (VALUES
        ('Adicionar foto de capa',                                   round((1-s.f_img)*20)::int,   'Anuncios com foto recebem muito mais cliques'),
        ('Enriquecer a descricao com palavras-chave e contexto',     round((1-s.f_desc)*20)::int,  'Descricao completa melhora busca interna e indexacao'),
        ('Melhorar o titulo (mais descritivo, com marca/modelo)',    round((1-s.f_titulo)*12)::int,'Titulo rico aumenta a correspondencia de busca'),
        ('Definir a categoria correta',                              round((1-s.f_cat)*10)::int,   'Categoria conecta o anuncio a buscas e relacoes'),
        ('Informar o preco',                                         round((1-s.f_preco)*10)::int, 'Preco e filtro de busca e sinal de qualidade'),
        ('Informar a cidade/localizacao',                            round((1-s.f_loc)*10)::int,   'Localizacao melhora a descoberta regional'),
        ('Concluir a verificacao/moderacao (RIDV)',                  round((1-s.f_mod)*13)::int,   'Anuncios verificados ganham relevancia e confianca'),
        ('Informar atributos (condicao, garantia, nota fiscal)',     round((1-s.f_cond)*8)::int,   'Atributos estruturados melhoram a leitura por IA')
      ) v(acao,imp,motivo) WHERE imp >= 3),
     v_trace, current_date
  FROM scored s
  ON CONFLICT (entidade_tipo, entidade_id, dia) DO UPDATE SET
     titulo=excluded.titulo, categoria=excluded.categoria, cidade=excluded.cidade,
     discovery_score=excluded.discovery_score, ai_discovery_score=excluded.ai_discovery_score,
     search_score=excluded.search_score, semantic_score=excluded.semantic_score,
     vde_score=excluded.vde_score, visibilidade=excluded.visibilidade,
     fatores=excluded.fatores, pontos_fortes=excluded.pontos_fortes,
     pontos_fracos=excluded.pontos_fracos, plano=excluded.plano, trace_id=excluded.trace_id;
  GET DIAGNOSTICS v_list = ROW_COUNT;

  -- 4.2 PRODUTOS DE LOJA (merchant_products) — menos estruturados (gap declarado)
  WITH base AS (
    SELECT p.id::text AS eid, p.nome AS title, p.descricao AS description, p.preco AS price,
      (CASE WHEN p.imagem_url IS NOT NULL AND p.imagem_url<>'' THEN 1.0 ELSE 0 END) f_img,
      (CASE WHEN length(coalesce(p.descricao,''))>=60 THEN 1.0
            WHEN length(coalesce(p.descricao,''))>=15 THEN 0.6
            WHEN length(coalesce(p.descricao,''))>0  THEN 0.3 ELSE 0 END) f_desc,
      (CASE WHEN p.preco IS NOT NULL AND p.preco>0 THEN 1.0 ELSE 0 END) f_preco,
      (CASE WHEN length(coalesce(p.nome,''))>=20 THEN 1.0
            WHEN length(coalesce(p.nome,''))>=8  THEN 0.6 ELSE 0.3 END) f_titulo,
      (SELECT count(*) FROM regexp_split_to_table(regexp_replace(lower(coalesce(p.nome,'')||' '||coalesce(p.descricao,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w) WHERE length(w)>=3) palavras,
      (SELECT count(DISTINCT w) FROM regexp_split_to_table(regexp_replace(lower(coalesce(p.nome,'')||' '||coalesce(p.descricao,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') AS w(w) WHERE length(w)>=3) distintas
    FROM public.merchant_products p
  ),
  scored AS (
    SELECT b.*,
      round((f_img*0.30 + f_desc*0.30 + f_titulo*0.25 + f_preco*0.15)*100)::int discovery,
      round(((f_titulo+f_desc)/2*0.40 + f_img*0.30 + f_preco*0.30)*100)::int ai_disc,
      round((least(palavras/18.0,1)*0.60 + f_titulo*0.40)*100)::int searchs,
      round((least(distintas/20.0,1)*0.60 + f_desc*0.40)*100)::int semantic
    FROM base b
  )
  INSERT INTO public.orion_search_scores
    (entidade_tipo, entidade_id, titulo, categoria, cidade,
     discovery_score, ai_discovery_score, search_score, semantic_score, vde_score,
     visibilidade, fatores, pontos_fortes, pontos_fracos, plano, trace_id, dia)
  SELECT 'produto', s.eid, s.title, '(loja) sem categoria estruturada', NULL,
     s.discovery, s.ai_disc, s.searchs, s.semantic,
     round(0.35*s.discovery + 0.25*s.ai_disc + 0.20*s.searchs + 0.20*s.semantic)::int,
     CASE WHEN round(0.35*s.discovery+0.25*s.ai_disc+0.20*s.searchs+0.20*s.semantic) >= 80 THEN 'excelente'
          WHEN round(0.35*s.discovery+0.25*s.ai_disc+0.20*s.searchs+0.20*s.semantic) >= 60 THEN 'bom'
          WHEN round(0.35*s.discovery+0.25*s.ai_disc+0.20*s.searchs+0.20*s.semantic) >= 40 THEN 'regular'
          ELSE 'invisivel' END,
     jsonb_build_object('imagem',s.f_img,'descricao',s.f_desc,'titulo',s.f_titulo,'preco',s.f_preco,
       'palavras',s.palavras,'palavras_distintas',s.distintas,
       'lacuna','merchant_products sem categoria/cidade/moderacao estruturadas (declarado)'),
     (SELECT coalesce(jsonb_agg(lbl ORDER BY fv DESC),'[]'::jsonb) FROM (VALUES
        ('Imagem',s.f_img),('Descricao',s.f_desc),('Nome/titulo',s.f_titulo),('Preco',s.f_preco)) t(lbl,fv) WHERE fv>=0.8),
     (SELECT coalesce(jsonb_agg(lbl ORDER BY fv ASC),'[]'::jsonb) FROM (VALUES
        ('Imagem',s.f_img),('Descricao',s.f_desc),('Nome/titulo',s.f_titulo),('Preco',s.f_preco)) t(lbl,fv) WHERE fv<0.5),
     (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'impacto',imp,'motivo',motivo) ORDER BY imp DESC),'[]'::jsonb)
      FROM (VALUES
        ('Adicionar imagem do produto',                    round((1-s.f_img)*30)::int,   'Produtos com foto convertem muito mais'),
        ('Enriquecer a descricao',                         round((1-s.f_desc)*30)::int,  'Descricao rica melhora busca e conversao'),
        ('Melhorar o nome do produto',                     round((1-s.f_titulo)*25)::int,'Nome descritivo aumenta a correspondencia de busca'),
        ('Informar o preco',                               round((1-s.f_preco)*15)::int, 'Preco e filtro de busca e sinal de qualidade')
      ) v(acao,imp,motivo) WHERE imp >= 3),
     v_trace, current_date
  FROM scored s
  ON CONFLICT (entidade_tipo, entidade_id, dia) DO UPDATE SET
     titulo=excluded.titulo, discovery_score=excluded.discovery_score,
     ai_discovery_score=excluded.ai_discovery_score, search_score=excluded.search_score,
     semantic_score=excluded.semantic_score, vde_score=excluded.vde_score,
     visibilidade=excluded.visibilidade, fatores=excluded.fatores,
     pontos_fortes=excluded.pontos_fortes, pontos_fracos=excluded.pontos_fracos,
     plano=excluded.plano, trace_id=excluded.trace_id;
  GET DIAGNOSTICS v_prod = ROW_COUNT;

  -- 4.3 Expande o plano de cada anuncio em recomendacoes (idempotente)
  INSERT INTO public.orion_search_recommendations
    (entidade_tipo, entidade_id, titulo, categoria, acao, impacto, motivo, dia)
  SELECT sc.entidade_tipo, sc.entidade_id, sc.titulo, sc.categoria,
         e->>'acao', (e->>'impacto')::int, e->>'motivo', sc.dia
  FROM public.orion_search_scores sc
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(sc.plano,'[]'::jsonb)) e
  WHERE sc.dia = current_date
  ON CONFLICT (entidade_tipo, entidade_id, acao, dia) DO UPDATE SET
     impacto=excluded.impacto, motivo=excluded.motivo, titulo=excluded.titulo, categoria=excluded.categoria;
  GET DIAGNOSTICS v_recs = ROW_COUNT;

  PERFORM public.search_emit('search.updated', jsonb_build_object(
    'listings',v_list,'produtos',v_prod,'recomendacoes',v_recs,'trace',v_trace));
  PERFORM public.search_emit('search.score', jsonb_build_object('anuncios',v_list+v_prod,'trace',v_trace));

  RETURN jsonb_build_object('ok',true,'listings',v_list,'produtos',v_prod,
    'anuncios',v_list+v_prod,'recomendacoes',v_recs,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 5) SEMANTIC ENGINE — expansao semantica orientada a dados (search_semantic)
--    Retorna termos/categorias relacionados a partir dos anuncios reais e
--    registra a busca (log). Expansao profunda usa Prompt Registry search.semantic
--    no momento da consulta (Gateway) — aqui a base e sempre dado real.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_semantic(p_termo text, p_cidade text DEFAULT NULL, p_origem text DEFAULT 'probe')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm text := public.orion_norm(coalesce(p_termo,''));
  v_res  int := 0;
  v_cats jsonb;
  v_rel  jsonb;
BEGIN
  IF coalesce(trim(p_termo),'') = '' THEN
    RETURN jsonb_build_object('ok',false,'motivo','termo vazio');
  END IF;

  -- anuncios que casam com o termo (titulo/descricao/categoria) — busca por intencao
  WITH hits AS (
    SELECT l.category AS categoria,
           lower(coalesce(l.title,'')||' '||coalesce(l.description,'')) AS texto
    FROM public.advertiser_listings l
    WHERE public.orion_norm(coalesce(l.title,'')||' '||coalesce(l.description,'')||' '||coalesce(l.category,'')) LIKE '%'||v_norm||'%'
    UNION ALL
    SELECT '(loja)', lower(coalesce(p.nome,'')||' '||coalesce(p.descricao,''))
    FROM public.merchant_products p
    WHERE public.orion_norm(coalesce(p.nome,'')||' '||coalesce(p.descricao,'')) LIKE '%'||v_norm||'%'
  )
  SELECT count(*),
         coalesce(jsonb_agg(DISTINCT categoria) FILTER (WHERE categoria IS NOT NULL AND categoria<>''),'[]'::jsonb)
    INTO v_res, v_cats FROM hits;

  -- termos co-ocorrentes (top palavras dos anuncios que casaram) — relacoes reais
  SELECT coalesce(jsonb_agg(w ORDER BY c DESC),'[]'::jsonb) INTO v_rel FROM (
    SELECT w, count(*) c FROM (
      SELECT regexp_split_to_table(regexp_replace(lower(coalesce(l.title,'')||' '||coalesce(l.description,'')),'[^a-z0-9à-ú ]',' ','g'),'\s+') w
      FROM public.advertiser_listings l
      WHERE public.orion_norm(coalesce(l.title,'')||' '||coalesce(l.description,'')||' '||coalesce(l.category,'')) LIKE '%'||v_norm||'%'
    ) t
    WHERE length(w)>=4 AND w <> v_norm AND w NOT IN ('para','com','uma','como','por','dos','das','que','sem','mais','todos','viagg')
    GROUP BY w ORDER BY c DESC LIMIT 12
  ) r;

  -- registra a busca (log/gap) — idempotente por termo/cidade/dia
  INSERT INTO public.orion_search_queries (termo, termo_norm, cidade, resultados, origem, dia)
  VALUES (left(p_termo,200), v_norm, coalesce(nullif(trim(p_cidade),''),''), v_res, coalesce(p_origem,'probe'), current_date)
  ON CONFLICT (termo_norm, cidade, dia) DO UPDATE SET resultados=excluded.resultados, origem=excluded.origem;

  IF v_res = 0 THEN
    PERFORM public.search_emit('search.discovery', jsonb_build_object('tipo','busca_sem_resultado','termo',p_termo));
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'termo',p_termo,'termo_norm',v_norm,'resultados',v_res,
    'categorias_relacionadas',v_cats,'termos_relacionados',v_rel,
    'nota', CASE WHEN v_res=0 THEN 'Sem resultado — oportunidade de sortimento (gap de descoberta)'
                 ELSE 'Expansao semantica profunda disponivel via Prompt Registry (search.semantic) no Gateway' END);
END$$;

-- ----------------------------------------------------------------------------
-- 6) SEARCH GAP DETECTION — demanda (aci + cliques) x oferta (anuncios)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_gaps()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH demanda_cidade AS (
    SELECT public.orion_norm(coalesce(city,'')) cid, count(*) n
    FROM public.advertiser_contact_intentions
    WHERE coalesce(city,'')<>'' GROUP BY 1
  ),
  oferta_cidade AS (
    SELECT public.orion_norm(coalesce(city,'')) cid, count(*) n
    FROM public.advertiser_listings WHERE coalesce(city,'')<>'' GROUP BY 1
  ),
  gaps_cidade AS (
    SELECT d.cid AS cidade, d.n AS demanda, coalesce(o.n,0) AS oferta,
           round((d.n::numeric / (coalesce(o.n,0)+1)),2) AS pressao
    FROM demanda_cidade d LEFT JOIN oferta_cidade o ON o.cid=d.cid
    ORDER BY pressao DESC, demanda DESC LIMIT 10
  ),
  sem_resultado AS (
    SELECT termo, resultados FROM public.orion_search_queries
    WHERE resultados=0 ORDER BY dia DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'gaps_por_cidade', (SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) FROM gaps_cidade g),
    'buscas_sem_resultado', (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM sem_resultado s),
    'demanda_total', (SELECT count(*) FROM public.advertiser_contact_intentions),
    'oferta_total', (SELECT count(*) FROM public.advertiser_listings),
    'lacuna_categoria', 'demanda por categoria depende de instrumentacao de busca (search_events) — DECLARADO',
    'gerado_em', now()
  );
$$;

-- ----------------------------------------------------------------------------
-- 7) SEARCH ANALYTICS — anuncios invisiveis, distribuicao, buscas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_analytics()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (
    SELECT * FROM public.orion_search_scores WHERE dia = (SELECT max(dia) FROM public.orion_search_scores)
  )
  SELECT jsonb_build_object(
    'anuncios', (SELECT count(*) FROM hoje),
    'vde_medio', (SELECT coalesce(round(avg(vde_score))::int,0) FROM hoje),
    'discovery_medio', (SELECT coalesce(round(avg(discovery_score))::int,0) FROM hoje),
    'ai_discovery_medio', (SELECT coalesce(round(avg(ai_discovery_score))::int,0) FROM hoje),
    'distribuicao', jsonb_build_object(
      'excelente',(SELECT count(*) FROM hoje WHERE visibilidade='excelente'),
      'bom',(SELECT count(*) FROM hoje WHERE visibilidade='bom'),
      'regular',(SELECT count(*) FROM hoje WHERE visibilidade='regular'),
      'invisivel',(SELECT count(*) FROM hoje WHERE visibilidade='invisivel')),
    'invisiveis', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'vde',vde_score,'pontos_fracos',pontos_fracos) ORDER BY vde_score ASC),'[]'::jsonb)
                   FROM hoje WHERE vde_score < 40),
    'buscas_registradas', (SELECT count(*) FROM public.orion_search_queries),
    'buscas_sem_resultado', (SELECT count(*) FROM public.orion_search_queries WHERE resultados=0),
    'lacuna_telemetria', 'pesquisas de usuario reais dependem de instrumentacao do front (search_events) — PARCIAL/DECLARADO',
    'gerado_em', now()
  );
$$;

-- ----------------------------------------------------------------------------
-- 8) SEARCH OPPORTUNITY — anuncios de maior potencial (alto ganho possivel)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_opportunities()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (
    SELECT * FROM public.orion_search_scores WHERE dia = (SELECT max(dia) FROM public.orion_search_scores)
  )
  SELECT jsonb_build_object(
    'maior_potencial', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'titulo',titulo,'categoria',categoria,'vde',vde_score,
        'ganho_estimado',(100 - vde_score),
        'top_acao',(plano->0->>'acao'),'impacto',(plano->0->>'impacto')) ORDER BY (100-vde_score) DESC),'[]'::jsonb)
      FROM hoje WHERE vde_score < 70 LIMIT 10),
    'quase_la', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'vde',vde_score) ORDER BY vde_score DESC),'[]'::jsonb)
                 FROM hoje WHERE vde_score BETWEEN 60 AND 79),
    'top_recomendacoes_agregadas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'anuncios',n,'impacto_medio',imp) ORDER BY imp DESC),'[]'::jsonb)
      FROM (SELECT acao, count(*) n, round(avg(impacto))::int imp
            FROM public.orion_search_recommendations
            WHERE dia=(SELECT max(dia) FROM public.orion_search_recommendations)
            GROUP BY acao ORDER BY imp DESC LIMIT 8) a),
    'gerado_em', now()
  );
$$;

-- ----------------------------------------------------------------------------
-- 9) SEARCH SCORE (saude geral de descoberta) + metrics + summary
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_score()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (
    SELECT * FROM public.orion_search_scores WHERE dia = (SELECT max(dia) FROM public.orion_search_scores)
  )
  SELECT jsonb_build_object(
    'discovery_ecosystem_score', (SELECT coalesce(round(avg(vde_score))::int,0) FROM hoje),
    'anuncios', (SELECT count(*) FROM hoje),
    'excelentes', (SELECT count(*) FROM hoje WHERE vde_score>=80),
    'invisiveis', (SELECT count(*) FROM hoje WHERE vde_score<40),
    'discovery_medio', (SELECT coalesce(round(avg(discovery_score))::int,0) FROM hoje),
    'ai_discovery_medio', (SELECT coalesce(round(avg(ai_discovery_score))::int,0) FROM hoje),
    'search_medio', (SELECT coalesce(round(avg(search_score))::int,0) FROM hoje),
    'semantic_medio', (SELECT coalesce(round(avg(semantic_score))::int,0) FROM hoje),
    'gerado_em', now()
  );
$$;

CREATE OR REPLACE FUNCTION public.search_metrics()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'scores_total', (SELECT count(*) FROM public.orion_search_scores),
    'recomendacoes_total', (SELECT count(*) FROM public.orion_search_recommendations),
    'buscas_total', (SELECT count(*) FROM public.orion_search_queries),
    'ultimo_dia', (SELECT max(dia) FROM public.orion_search_scores),
    'eventos_search', (SELECT count(*) FROM public.orion_eventos WHERE tipo LIKE 'search.%')
  );
$$;

CREATE OR REPLACE FUNCTION public.search_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'score', public.search_score(),
    'analytics', public.search_analytics(),
    'gaps', public.search_gaps(),
    'opportunities', public.search_opportunities(),
    'metrics', public.search_metrics()
  );
$$;

-- Dashboard consolidado (registra trace + evento)
CREATE OR REPLACE FUNCTION public.search_dashboard()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.search_summary();
  PERFORM public.search_emit('search.analytics', jsonb_build_object('vde', v->'score'->'discovery_ecosystem_score'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 10) CRON TICK — regenera scores + emite resumo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_search_tick()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.search_generate('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  PERFORM public.search_emit('search.recommendation', jsonb_build_object(
    'total',(SELECT count(*) FROM public.orion_search_recommendations WHERE dia=current_date)));
END$$;

-- ----------------------------------------------------------------------------
-- 11) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.search_generate(text)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_semantic(text, text, text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_gaps()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_analytics()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_opportunities()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_score()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_metrics()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_summary()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_dashboard()                     TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12) PROMPT REGISTRY (6 prompts) — sem sobrescrever (WHERE NOT EXISTS interno)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('search.discovery',
 'Voce e o ORION Search & Discovery AI. Avalie a descobribilidade de um anuncio a partir dos fatores fornecidos (imagem, descricao, titulo, categoria, preco, localizacao, moderacao, atributos). Explique de forma objetiva os pontos fortes e fracos e recomende melhorias priorizadas por impacto. Nunca invente dados; use apenas o que foi informado.',
 'ORION-AI-32 seed');
SELECT public.orion_ai_prompt_set('search.semantic',
 'Voce e o motor semantico do ORION. Dado um termo de busca, gere termos, sinonimos e categorias relacionadas por INTENCAO (nao apenas correspondencia exata). Ex.: "notebook gamer" -> computador, laptop, gaming, rtx, intel, amd, hardware. Responda de forma compacta e estruturada.',
 'ORION-AI-32 seed');
SELECT public.orion_ai_prompt_set('search.analytics',
 'Voce e o analista de busca do ORION. A partir das metricas de descoberta (anuncios invisiveis, distribuicao de VDE, buscas sem resultado), destaque o que mais limita a descoberta da plataforma e o que priorizar. Declare explicitamente lacunas de telemetria.',
 'ORION-AI-32 seed');
SELECT public.orion_ai_prompt_set('search.recommendation',
 'Voce e o consultor de descoberta do ORION. Para um anuncio, transforme os pontos fracos em acoes concretas, cada uma com justificativa e impacto esperado. Sempre preserve o conteudo original do anunciante — apenas recomende.',
 'ORION-AI-32 seed');
SELECT public.orion_ai_prompt_set('search.opportunity',
 'Voce e o radar de oportunidades de descoberta do ORION. Identifique os anuncios de maior potencial (maior ganho de descoberta possivel), categorias/cidades com demanda reprimida e buscas sem resultado (gaps de sortimento). Baseie-se apenas em dados reais.',
 'ORION-AI-32 seed');
SELECT public.orion_ai_prompt_set('search.summary',
 'Voce e o ORION Search & Discovery AI. Resuma o estado da descoberta da plataforma: score do ecossistema, anuncios invisiveis, principais oportunidades e as 3 acoes de maior impacto. Seja direto, explicavel e honesto sobre lacunas.',
 'ORION-AI-32 seed');

-- ----------------------------------------------------------------------------
-- 13) MODEL PREF (Gateway) — modulo search_discovery
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code)
VALUES ('search_discovery','gpt-5-mini')
ON CONFLICT (module) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 14) CRON — orion_search_tick :11 de cada hora
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_search_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_search_tick');
    PERFORM cron.schedule('orion_search_tick','11 * * * *','SELECT public.orion_search_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_search_tick');
--   DROP FUNCTION IF EXISTS public.orion_search_tick, public.search_dashboard,
--     public.search_summary, public.search_metrics, public.search_score,
--     public.search_opportunities, public.search_analytics, public.search_gaps,
--     public.search_semantic(text,text,text), public.search_generate(text),
--     public.search_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_search_queries, public.orion_search_recommendations,
--     public.orion_search_scores;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='search_discovery';
-- ============================================================================
