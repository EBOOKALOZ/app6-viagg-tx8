-- ============================================================================
-- ORION-AI-34 — KNOWLEDGE GRAPH AI v1.0  (coracao semantico do Discovery)
-- ============================================================================
-- Constroi automaticamente um GRAFO DE CONHECIMENTO reutilizando EXCLUSIVAMENTE
--   dados existentes. Nunca inventa entidade. Nunca cria relacao artificial.
--   TODA ligacao tem evidencia (origem/destino/tipo/confianca/evidencia).
--   Read-only sobre o marketplace: apenas DESCOBRE e organiza relacoes.
--
-- IMPORTANTE (anti-colisao): NAO confundir com o AI-14, que ja tem a tabela
--   `orion_knowledge` e a funcao `knowledge_engine`. Este modulo usa nomes
--   PROPRIOS: orion_knowledge_entities / orion_knowledge_relations, funcoes
--   knowledge_* (nenhuma chamada knowledge_engine) e chave `knowledge_graph`.
--
-- Diferencial: VIAGG Knowledge Index (VKI) — consolida Knowledge Graph Score +
--   Discovery(AI-32) + GEO(AI-33) + Semantic(AI-32) -> classificacao
--   💎 Expertamente / 🥇 Muito / 🥈 Bem / 🥉 Pouco Conectada + relacoes a fortalecer.
--
-- Reuso EXCLUSIVO: AI Gateway, Prompt Registry, Event Bus, AI-32 Search &
--   Discovery, AI-33 GEO, AI-18 Marketplace, AI-23 Marketing, AI-25 Sales,
--   AI-22 BI, AI-30 Executive, AI-01 Publisher. Sem motor paralelo.
--
-- Idempotente / auditavel / versionado. SECURITY DEFINER + guarda. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_knowledge_entities (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_key      text        NOT NULL,             -- 'listing:<uuid>', 'categoria:<norm>', ...
  entity_type     text        NOT NULL,             -- anuncio|produto|categoria|cidade|estado|loja|lojista
  rotulo          text,
  atributos       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  grau            integer     NOT NULL DEFAULT 0,   -- numero de relacoes (conectividade)
  kg_score        integer     NOT NULL DEFAULT 0,   -- Knowledge Graph Score (0-100)
  entity_quality_score integer NOT NULL DEFAULT 0,
  discovery_score integer     NOT NULL DEFAULT 0,   -- REUSADO do AI-32 (so produto/anuncio)
  geo_score       integer     NOT NULL DEFAULT 0,   -- REUSADO do AI-33
  semantic_score  integer     NOT NULL DEFAULT 0,   -- REUSADO do AI-32
  vki             integer     NOT NULL DEFAULT 0,   -- VIAGG Knowledge Index (consolidado)
  classificacao   text,                             -- expert|muito|bem|pouco
  trace_id        text,
  dia             date        NOT NULL DEFAULT current_date,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_kg_entities_uq UNIQUE (entity_key, dia)
);
COMMENT ON TABLE public.orion_knowledge_entities IS
  'ORION-AI-34: entidades do grafo de conhecimento (produto/categoria/cidade/loja...). So dados reais; nunca inventa.';

CREATE INDEX IF NOT EXISTS ix_orion_kg_ent_dia   ON public.orion_knowledge_entities (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_kg_ent_type  ON public.orion_knowledge_entities (entity_type);
CREATE INDEX IF NOT EXISTS ix_orion_kg_ent_vki   ON public.orion_knowledge_entities (vki);

CREATE TABLE IF NOT EXISTS public.orion_knowledge_relations (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origem_key   text        NOT NULL,
  destino_key  text        NOT NULL,
  tipo         text        NOT NULL,                -- pertence_a|localiza_se_em|da_loja|no_estado|similar_a|relacionada_a|do_lojista
  confianca    numeric     NOT NULL DEFAULT 1.0,    -- 0..1
  evidencia    text        NOT NULL,                -- SEMPRE preenchida (nunca relacao sem evidencia)
  dia          date        NOT NULL DEFAULT current_date,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_kg_rel_uq UNIQUE (origem_key, destino_key, tipo, dia)
);
COMMENT ON TABLE public.orion_knowledge_relations IS
  'ORION-AI-34: relacoes do grafo, cada uma com origem/destino/tipo/confianca/evidencia. Nunca relacao sem evidencia.';

CREATE INDEX IF NOT EXISTS ix_orion_kg_rel_dia  ON public.orion_knowledge_relations (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_kg_rel_org  ON public.orion_knowledge_relations (origem_key);
CREATE INDEX IF NOT EXISTS ix_orion_kg_rel_dst  ON public.orion_knowledge_relations (destino_key);
CREATE INDEX IF NOT EXISTS ix_orion_kg_rel_tipo ON public.orion_knowledge_relations (tipo);

-- ----------------------------------------------------------------------------
-- 2) RLS — leitura admin
-- ----------------------------------------------------------------------------
ALTER TABLE public.orion_knowledge_entities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_knowledge_relations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_knowledge_entities' AND policyname='orion_kg_ent_admin_read') THEN
    CREATE POLICY orion_kg_ent_admin_read ON public.orion_knowledge_entities FOR SELECT USING (public.mp_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_knowledge_relations' AND policyname='orion_kg_rel_admin_read') THEN
    CREATE POLICY orion_kg_rel_admin_read ON public.orion_knowledge_relations FOR SELECT USING (public.mp_is_admin());
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados)
  VALUES (p_tipo, 'knowledge_graph', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — knowledge_generate: constroi entidades + relacoes + scores + VKI
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_generate(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'kg_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_ent int := 0; v_rel int := 0;
BEGIN
  IF session_user <> 'postgres'
     AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'knowledge_generate: acesso negado (somente admin/service)';
  END IF;

  -- =========================== ENTIDADES ===================================
  -- 4.1 Anuncios (advertiser_listings)
  INSERT INTO public.orion_knowledge_entities (entity_key, entity_type, rotulo, atributos, trace_id, dia)
  SELECT 'listing:'||l.id, 'anuncio', l.title,
    jsonb_build_object('categoria',l.category,'cidade',l.city,'preco',l.price,
      'completude', ((CASE WHEN coalesce(l.cover_image_url,'')<>'' THEN 1 ELSE 0 END
                    + CASE WHEN length(coalesce(l.description,''))>=15 THEN 1 ELSE 0 END
                    + CASE WHEN coalesce(l.category,'')<>'' THEN 1 ELSE 0 END
                    + CASE WHEN l.price>0 THEN 1 ELSE 0 END
                    + CASE WHEN coalesce(l.city,'')<>'' THEN 1 ELSE 0 END)::numeric/5),
      'profundidade', 0.9),
    v_trace, current_date
  FROM public.advertiser_listings l
  ON CONFLICT (entity_key, dia) DO UPDATE SET rotulo=excluded.rotulo, atributos=excluded.atributos, trace_id=excluded.trace_id;

  -- 4.2 Produtos de loja (merchant_products)
  INSERT INTO public.orion_knowledge_entities (entity_key, entity_type, rotulo, atributos, trace_id, dia)
  SELECT 'produto:'||p.id, 'produto', p.nome,
    jsonb_build_object('preco',p.preco,
      'completude', ((CASE WHEN coalesce(p.imagem_url,'')<>'' THEN 1 ELSE 0 END
                    + CASE WHEN length(coalesce(p.descricao,''))>=15 THEN 1 ELSE 0 END
                    + CASE WHEN coalesce(p.nome,'')<>'' THEN 1 ELSE 0 END
                    + CASE WHEN p.preco>0 THEN 1 ELSE 0 END)::numeric/4),
      'profundidade', 0.6),
    v_trace, current_date
  FROM public.merchant_products p
  ON CONFLICT (entity_key, dia) DO UPDATE SET rotulo=excluded.rotulo, atributos=excluded.atributos, trace_id=excluded.trace_id;

  -- 4.3 Categorias (dos anuncios)
  INSERT INTO public.orion_knowledge_entities (entity_key, entity_type, rotulo, atributos, trace_id, dia)
  SELECT 'categoria:'||public.orion_norm(c), 'categoria', max(c),
    jsonb_build_object('completude',1.0,'profundidade',0.5), v_trace, current_date
  FROM (SELECT category c FROM public.advertiser_listings WHERE coalesce(category,'')<>'') s
  GROUP BY public.orion_norm(c)
  ON CONFLICT (entity_key, dia) DO UPDATE SET rotulo=excluded.rotulo, trace_id=excluded.trace_id;

  -- 4.4 Cidades (listings + stores + aci)
  INSERT INTO public.orion_knowledge_entities (entity_key, entity_type, rotulo, atributos, trace_id, dia)
  SELECT 'cidade:'||public.orion_norm(c), 'cidade', max(c),
    jsonb_build_object('completude',1.0,'profundidade',0.4), v_trace, current_date
  FROM (
    SELECT city c FROM public.advertiser_listings WHERE coalesce(city,'')<>''
    UNION ALL SELECT coalesce(nullif(city,''),cidade) FROM public.merchant_stores WHERE coalesce(city,cidade,'')<>''
    UNION ALL SELECT city FROM public.advertiser_contact_intentions WHERE coalesce(city,'')<>''
  ) s WHERE public.orion_norm(c)<>''
  GROUP BY public.orion_norm(c)
  ON CONFLICT (entity_key, dia) DO UPDATE SET rotulo=excluded.rotulo, trace_id=excluded.trace_id;

  -- 4.5 Lojas (merchant_stores)
  INSERT INTO public.orion_knowledge_entities (entity_key, entity_type, rotulo, atributos, trace_id, dia)
  SELECT 'loja:'||st.id, 'loja', coalesce(nullif(st.nome_loja,''),st.store_name,'Loja'),
    jsonb_build_object('cidade',coalesce(nullif(st.city,''),st.cidade),'estado',st.estado,
      'completude', ((CASE WHEN coalesce(st.nome_loja,st.store_name,'')<>'' THEN 1 ELSE 0 END
                    + CASE WHEN coalesce(st.city,st.cidade,'')<>'' THEN 1 ELSE 0 END
                    + CASE WHEN coalesce(st.estado,'')<>'' THEN 1 ELSE 0 END
                    + CASE WHEN st.categoria_id IS NOT NULL THEN 1 ELSE 0 END)::numeric/4),
      'profundidade', 0.7),
    v_trace, current_date
  FROM public.merchant_stores st
  ON CONFLICT (entity_key, dia) DO UPDATE SET rotulo=excluded.rotulo, atributos=excluded.atributos, trace_id=excluded.trace_id;

  -- 4.6 Estados (das lojas)
  INSERT INTO public.orion_knowledge_entities (entity_key, entity_type, rotulo, atributos, trace_id, dia)
  SELECT 'estado:'||public.orion_norm(e), 'estado', max(e),
    jsonb_build_object('completude',1.0,'profundidade',0.3), v_trace, current_date
  FROM (SELECT estado e FROM public.merchant_stores WHERE coalesce(estado,'')<>'') s
  GROUP BY public.orion_norm(e)
  ON CONFLICT (entity_key, dia) DO UPDATE SET rotulo=excluded.rotulo, trace_id=excluded.trace_id;

  -- 4.7 Lojistas (donos das lojas)
  INSERT INTO public.orion_knowledge_entities (entity_key, entity_type, rotulo, atributos, trace_id, dia)
  SELECT 'lojista:'||st.user_id, 'lojista', 'Lojista '||left(st.user_id::text,8),
    jsonb_build_object('completude',0.5,'profundidade',0.4), v_trace, current_date
  FROM (SELECT DISTINCT user_id FROM public.merchant_stores WHERE user_id IS NOT NULL) st
  ON CONFLICT (entity_key, dia) DO UPDATE SET trace_id=excluded.trace_id;

  GET DIAGNOSTICS v_ent = ROW_COUNT;
  SELECT count(*) INTO v_ent FROM public.orion_knowledge_entities WHERE dia=current_date;

  -- =========================== RELACOES ====================================
  -- 4.8 Anuncio -> Categoria (pertence_a)
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT 'listing:'||l.id, 'categoria:'||public.orion_norm(l.category), 'pertence_a', 1.0,
    'advertiser_listings.category = '||l.category, current_date
  FROM public.advertiser_listings l WHERE coalesce(l.category,'')<>''
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  -- 4.9 Anuncio -> Cidade (localiza_se_em)
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT 'listing:'||l.id, 'cidade:'||public.orion_norm(l.city), 'localiza_se_em', 1.0,
    'advertiser_listings.city = '||l.city, current_date
  FROM public.advertiser_listings l WHERE coalesce(l.city,'')<>''
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  -- 4.10 Produto -> Loja (da_loja) via user_id
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT 'produto:'||p.id, 'loja:'||st.id, 'da_loja', 1.0,
    'merchant_products.user_id = merchant_stores.user_id', current_date
  FROM public.merchant_products p JOIN public.merchant_stores st ON st.user_id = p.user_id
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  -- 4.11 Loja -> Cidade (localiza_se_em)
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT 'loja:'||st.id, 'cidade:'||public.orion_norm(coalesce(nullif(st.city,''),st.cidade)), 'localiza_se_em', 1.0,
    'merchant_stores.city/cidade', current_date
  FROM public.merchant_stores st WHERE coalesce(st.city,st.cidade,'')<>''
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  -- 4.12 Cidade -> Estado (no_estado) via loja
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT DISTINCT 'cidade:'||public.orion_norm(coalesce(nullif(st.city,''),st.cidade)), 'estado:'||public.orion_norm(st.estado), 'no_estado', 1.0,
    'merchant_stores relaciona cidade e estado', current_date
  FROM public.merchant_stores st
  WHERE coalesce(st.city,st.cidade,'')<>'' AND coalesce(st.estado,'')<>''
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  -- 4.13 Loja -> Lojista (do_lojista)
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT 'loja:'||st.id, 'lojista:'||st.user_id, 'do_lojista', 1.0,
    'merchant_stores.user_id', current_date
  FROM public.merchant_stores st WHERE st.user_id IS NOT NULL
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  -- 4.14 Anuncio -> Anuncio Similar (similar_a) — mesma categoria (dedup por par)
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT 'listing:'||a.id, 'listing:'||b.id, 'similar_a', 0.7,
    'mesma categoria: '||a.category, current_date
  FROM public.advertiser_listings a
  JOIN public.advertiser_listings b ON public.orion_norm(a.category)=public.orion_norm(b.category) AND a.id <> b.id
  WHERE coalesce(a.category,'')<>''
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  -- 4.15 Categoria -> Categoria Relacionada (relacionada_a) — co-ocorrencia na mesma cidade
  INSERT INTO public.orion_knowledge_relations (origem_key, destino_key, tipo, confianca, evidencia, dia)
  SELECT 'categoria:'||public.orion_norm(a.category), 'categoria:'||public.orion_norm(b.category), 'relacionada_a',
         least(0.4 + 0.15*count(*), 0.95),
         'co-ocorrem em '||count(DISTINCT public.orion_norm(a.city))||' cidade(s)', current_date
  FROM public.advertiser_listings a
  JOIN public.advertiser_listings b
    ON public.orion_norm(a.city)=public.orion_norm(b.city) AND public.orion_norm(a.category) <> public.orion_norm(b.category)
  WHERE coalesce(a.category,'')<>'' AND coalesce(b.category,'')<>'' AND coalesce(a.city,'')<>''
  GROUP BY public.orion_norm(a.category), public.orion_norm(b.category)
  ON CONFLICT (origem_key, destino_key, tipo, dia) DO UPDATE SET confianca=excluded.confianca, evidencia=excluded.evidencia;

  SELECT count(*) INTO v_rel FROM public.orion_knowledge_relations WHERE dia=current_date;

  -- =========================== SCORES ======================================
  -- 4.16 grau (conectividade) por entidade
  UPDATE public.orion_knowledge_entities e SET grau = coalesce(g.n,0)
  FROM (
    SELECT k, count(*) n FROM (
      SELECT origem_key k FROM public.orion_knowledge_relations WHERE dia=current_date
      UNION ALL SELECT destino_key FROM public.orion_knowledge_relations WHERE dia=current_date
    ) t GROUP BY k
  ) g WHERE e.dia=current_date AND e.entity_key = g.k;

  -- 4.17 reusa Discovery/GEO/Semantic do AI-32/AI-33 para entidades produto/anuncio
  UPDATE public.orion_knowledge_entities e SET
    discovery_score = coalesce(ss.discovery_score,0),
    semantic_score  = coalesce(ss.semantic_score,0),
    geo_score       = coalesce(gs.geo_score,0)
  FROM (SELECT e2.id, split_part(e2.entity_key,':',1) tp, split_part(e2.entity_key,':',2) rid
        FROM public.orion_knowledge_entities e2 WHERE e2.dia=current_date AND e2.entity_type IN ('anuncio','produto')) x
  LEFT JOIN LATERAL (SELECT discovery_score, semantic_score FROM public.orion_search_scores s
        WHERE s.entidade_tipo = CASE WHEN x.tp='listing' THEN 'listing' ELSE 'produto' END
          AND s.entidade_id = x.rid ORDER BY s.dia DESC LIMIT 1) ss ON true
  LEFT JOIN LATERAL (SELECT geo_score FROM public.orion_geo_scores g
        WHERE g.entidade_tipo = CASE WHEN x.tp='listing' THEN 'listing' ELSE 'produto' END
          AND g.entidade_id = x.rid ORDER BY g.dia DESC LIMIT 1) gs ON true
  WHERE e.id = x.id;

  -- 4.18 Knowledge Graph Score + Entity Quality + VKI + classificacao
  UPDATE public.orion_knowledge_entities e SET
    kg_score = round((least(e.grau/4.0,1)*0.40 + coalesce((e.atributos->>'completude')::numeric,0)*0.25
             + (CASE WHEN e.grau>0 THEN 1 ELSE 0 END)*0.20 + coalesce((e.atributos->>'profundidade')::numeric,0)*0.15)*100)::int,
    entity_quality_score = round((coalesce((e.atributos->>'completude')::numeric,0)*0.60 + least(e.grau/4.0,1)*0.40)*100)::int
  WHERE e.dia=current_date;

  UPDATE public.orion_knowledge_entities e SET
    vki = CASE WHEN e.entity_type IN ('anuncio','produto')
               THEN round(0.35*e.kg_score + 0.25*coalesce(nullif(e.discovery_score,0),e.kg_score)
                        + 0.20*coalesce(nullif(e.geo_score,0),e.kg_score) + 0.20*coalesce(nullif(e.semantic_score,0),e.kg_score))::int
               ELSE round(0.60*e.kg_score + 0.40*e.entity_quality_score)::int END
  WHERE e.dia=current_date;

  UPDATE public.orion_knowledge_entities e SET
    classificacao = CASE WHEN e.vki>=85 THEN 'expert' WHEN e.vki>=70 THEN 'muito' WHEN e.vki>=50 THEN 'bem' ELSE 'pouco' END
  WHERE e.dia=current_date;

  PERFORM public.knowledge_emit('knowledge.updated', jsonb_build_object('entidades',v_ent,'relacoes',v_rel,'trace',v_trace));
  PERFORM public.knowledge_emit('knowledge.graph', jsonb_build_object('entidades',v_ent,'relacoes',v_rel,'trace',v_trace));

  RETURN jsonb_build_object('ok',true,'entidades',v_ent,'relacoes',v_rel,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 5) CONSULTAS
-- ----------------------------------------------------------------------------
-- 5.1 Entidades relacionadas a uma entidade (grafo — com evidencia)
CREATE OR REPLACE FUNCTION public.knowledge_related(p_entity_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT max(dia) dia FROM public.orion_knowledge_relations)
  SELECT jsonb_build_object(
    'entidade', p_entity_key,
    'relacoes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'destino', CASE WHEN r.origem_key=p_entity_key THEN r.destino_key ELSE r.origem_key END,
        'rotulo', ent.rotulo, 'tipo', r.tipo, 'confianca', r.confianca, 'evidencia', r.evidencia) ORDER BY r.confianca DESC),'[]'::jsonb)
      FROM public.orion_knowledge_relations r
      LEFT JOIN public.orion_knowledge_entities ent
        ON ent.entity_key = CASE WHEN r.origem_key=p_entity_key THEN r.destino_key ELSE r.origem_key END AND ent.dia=(SELECT dia FROM d)
      WHERE r.dia=(SELECT dia FROM d) AND (r.origem_key=p_entity_key OR r.destino_key=p_entity_key)));
$$;

-- 5.2 Graph analytics
CREATE OR REPLACE FUNCTION public.knowledge_analytics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ent AS (SELECT * FROM public.orion_knowledge_entities WHERE dia=(SELECT max(dia) FROM public.orion_knowledge_entities))
  SELECT jsonb_build_object(
    'categorias_mais_conectadas', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',rotulo,'grau',grau) ORDER BY grau DESC),'[]'::jsonb)
       FROM (SELECT rotulo, grau FROM ent WHERE entity_type='categoria' ORDER BY grau DESC LIMIT 10) c),
    'cidades_concentracao', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',rotulo,'grau',grau) ORDER BY grau DESC),'[]'::jsonb)
       FROM (SELECT rotulo, grau FROM ent WHERE entity_type='cidade' ORDER BY grau DESC LIMIT 10) c),
    'entidades_por_tipo', (SELECT coalesce(jsonb_object_agg(entity_type, n),'{}'::jsonb)
       FROM (SELECT entity_type, count(*) n FROM ent GROUP BY entity_type) t),
    'pouco_conectadas', (SELECT count(*) FROM ent WHERE grau <= 1),
    'grau_medio', (SELECT coalesce(round(avg(grau),2),0) FROM ent),
    'gerado_em', now());
$$;

-- 5.3 Knowledge gap detection
CREATE OR REPLACE FUNCTION public.knowledge_gaps()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ent AS (SELECT * FROM public.orion_knowledge_entities WHERE dia=(SELECT max(dia) FROM public.orion_knowledge_entities))
  SELECT jsonb_build_object(
    'entidades_orfas', (SELECT coalesce(jsonb_agg(jsonb_build_object('entidade',rotulo,'tipo',entity_type) ORDER BY entity_type),'[]'::jsonb)
       FROM ent WHERE grau=0),
    'anuncios_sem_categoria', (SELECT count(*) FROM public.advertiser_listings WHERE coalesce(category,'')=''),
    'produtos_sem_categoria', (SELECT count(*) FROM ent WHERE entity_type='produto'),
    'cidades_sem_cobertura', (SELECT coalesce(jsonb_agg(rotulo),'[]'::jsonb) FROM ent WHERE entity_type='cidade' AND grau <= 1),
    'nota_leiloes', 'Leilões não disponíveis na plataforma — entidade declarada ausente.',
    'nota_estado_listings', 'advertiser_listings não possui coluna de estado — cidade→estado deriva só de merchant_stores (declarado).',
    'gerado_em', now());
$$;

-- 5.4 Knowledge Graph Score (saude do grafo + VKI ecosystem)
CREATE OR REPLACE FUNCTION public.knowledge_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ent AS (SELECT * FROM public.orion_knowledge_entities WHERE dia=(SELECT max(dia) FROM public.orion_knowledge_entities))
  SELECT jsonb_build_object(
    'knowledge_graph_score_medio', (SELECT coalesce(round(avg(kg_score))::int,0) FROM ent),
    'vki_ecosystem', (SELECT coalesce(round(avg(vki))::int,0) FROM ent),
    'entidades', (SELECT count(*) FROM ent),
    'relacoes', (SELECT count(*) FROM public.orion_knowledge_relations WHERE dia=(SELECT max(dia) FROM public.orion_knowledge_relations)),
    'orfas', (SELECT count(*) FROM ent WHERE grau=0),
    'distribuicao', jsonb_build_object(
      'expert',(SELECT count(*) FROM ent WHERE classificacao='expert'),
      'muito',(SELECT count(*) FROM ent WHERE classificacao='muito'),
      'bem',(SELECT count(*) FROM ent WHERE classificacao='bem'),
      'pouco',(SELECT count(*) FROM ent WHERE classificacao='pouco')),
    'gerado_em', now());
$$;

-- 5.5 Recomendacoes — relacoes a fortalecer (entidades pouco conectadas com potencial)
CREATE OR REPLACE FUNCTION public.knowledge_recommendations()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ent AS (SELECT * FROM public.orion_knowledge_entities WHERE dia=(SELECT max(dia) FROM public.orion_knowledge_entities))
  SELECT jsonb_build_object(
    'fortalecer', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'entidade',rotulo,'tipo',entity_type,'grau',grau,'vki',vki,
        'acao', CASE entity_type
          WHEN 'anuncio' THEN 'Completar categoria/cidade para conectar ao grafo'
          WHEN 'produto' THEN 'Associar o produto a uma categoria e loja'
          WHEN 'categoria' THEN 'Cadastrar anúncios nesta categoria'
          WHEN 'cidade' THEN 'Captar anúncios/lojas nesta cidade'
          ELSE 'Enriquecer atributos e vínculos' END) ORDER BY grau ASC, vki ASC),'[]'::jsonb)
      FROM ent WHERE grau <= 1 LIMIT 15),
    'total_pouco_conectadas', (SELECT count(*) FROM ent WHERE classificacao='pouco'),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.knowledge_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'entidades_total', (SELECT count(*) FROM public.orion_knowledge_entities),
    'relacoes_total', (SELECT count(*) FROM public.orion_knowledge_relations),
    'ultimo_dia', (SELECT max(dia) FROM public.orion_knowledge_entities),
    'tipos_relacao', (SELECT coalesce(jsonb_object_agg(tipo,n),'{}'::jsonb) FROM (SELECT tipo, count(*) n FROM public.orion_knowledge_relations WHERE dia=(SELECT max(dia) FROM public.orion_knowledge_relations) GROUP BY tipo) t),
    'eventos_knowledge', (SELECT count(*) FROM public.orion_eventos WHERE tipo LIKE 'knowledge.%'));
$$;

CREATE OR REPLACE FUNCTION public.knowledge_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('score',public.knowledge_score(),'analytics',public.knowledge_analytics(),
    'gaps',public.knowledge_gaps(),'recommendations',public.knowledge_recommendations(),'metrics',public.knowledge_metrics());
$$;

CREATE OR REPLACE FUNCTION public.knowledge_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.knowledge_summary();
  PERFORM public.knowledge_emit('knowledge.score', jsonb_build_object('vki', v->'score'->'vki_ecosystem'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 6) CRON :15
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_knowledge_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.knowledge_generate('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  PERFORM public.knowledge_emit('knowledge.recommendation', jsonb_build_object(
    'pouco_conectadas',(SELECT count(*) FROM public.orion_knowledge_entities WHERE dia=current_date AND classificacao='pouco')));
END$$;

-- ----------------------------------------------------------------------------
-- 7) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.knowledge_generate(text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_related(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_analytics()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_gaps()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_score()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_recommendations()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_metrics()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_summary()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_dashboard()          TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8) PROMPT REGISTRY (5 prompts)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('knowledge.entities',
 'Voce e o ORION Knowledge Graph AI. Descreva as entidades do grafo (produtos, categorias, lojas, cidades, estados) e sua qualidade a partir dos dados fornecidos. Nunca invente entidades; use apenas as que existem.',
 'ORION-AI-34 seed');
SELECT public.orion_ai_prompt_set('knowledge.relations',
 'Voce e o ORION Knowledge Graph AI. Explique as relacoes do grafo (origem, destino, tipo, confianca, evidencia). Toda relacao deve ter evidencia real; nunca sugira ligacoes sem base nos dados.',
 'ORION-AI-34 seed');
SELECT public.orion_ai_prompt_set('knowledge.analytics',
 'Voce e o analista do grafo do ORION. A partir das metricas (categorias mais conectadas, concentracao por cidade, entidades orfas), destaque a estrutura do conhecimento e onde estao as lacunas. Baseie-se apenas em dados reais.',
 'ORION-AI-34 seed');
SELECT public.orion_ai_prompt_set('knowledge.recommendations',
 'Voce e o consultor do grafo do ORION. Recomende quais relacoes fortalecer usando apenas dados ja existentes (ex.: completar categoria de um anuncio, captar anuncios numa cidade). Sempre justifique e nunca crie informacao artificial.',
 'ORION-AI-34 seed');
SELECT public.orion_ai_prompt_set('knowledge.summary',
 'Voce e o ORION Knowledge Graph AI. Resuma o estado do grafo de conhecimento: entidades, relacoes, VIAGG Knowledge Index, entidades orfas e as 3 acoes de maior impacto para conectar melhor a plataforma. Seja direto e honesto sobre lacunas.',
 'ORION-AI-34 seed');

-- ----------------------------------------------------------------------------
-- 9) MODEL PREF
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code)
VALUES ('knowledge_graph','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10) CRON
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_knowledge_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_knowledge_tick');
    PERFORM cron.schedule('orion_knowledge_tick','15 * * * *','SELECT public.orion_knowledge_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_knowledge_tick');
--   DROP FUNCTION IF EXISTS public.orion_knowledge_tick, public.knowledge_dashboard,
--     public.knowledge_summary, public.knowledge_metrics, public.knowledge_recommendations,
--     public.knowledge_score, public.knowledge_gaps, public.knowledge_analytics,
--     public.knowledge_related(text), public.knowledge_generate(text), public.knowledge_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_knowledge_relations, public.orion_knowledge_entities;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='knowledge_graph';
--   -- NAO tocar em orion_knowledge nem knowledge_engine (sao do AI-14).
-- ============================================================================
