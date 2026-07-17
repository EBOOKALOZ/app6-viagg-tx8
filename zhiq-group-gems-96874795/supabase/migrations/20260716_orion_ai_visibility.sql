-- ============================================================================
-- ORION-AI-36 — AI VISIBILITY & ANSWER INTELLIGENCE v1.0
-- ============================================================================
-- Camada de MEDICAO do Discovery Ecosystem: mede/explica/aumenta a presenca da
--   plataforma em IAs generativas (ChatGPT/Gemini/Claude/Perplexity/Copilot) e
--   busca tradicional. NAO controla respostas de modelos — maximiza a
--   PROBABILIDADE de ser encontrado/compreendido/citado via padroes abertos.
--
-- Answer Intelligence Engine: consolida (read-only) AI-32 (discovery/semantic),
--   AI-33 (GEO/structured_data/FAQ), AI-34 (grafo/autoridade), AI-35 (recomendacao)
--   e AI-20 (trust) em dois indices oficiais:
--     AIS = AI Visibility Score (0-100)
--     AQS = Answer Quality Score (0-100)
--
-- PRINCIPIO: nunca inventa fato; nunca altera conteudo; toda sugestao tem
--   justificativa + evidencia + impacto esperado.
--
-- LACUNA DECLARADA: nao e possivel observar um modelo de IA citando a plataforma
--   -> orion_ai_mentions e ALVO DE INSTRUMENTACAO FUTURA (fica VAZIA; nunca
--   fabricamos mencoes). "citation_score" mede PRONTIDAO para citacao, nao
--   citacoes reais.
--
-- Anti-colisao AI-32/33/34/35: tabelas/funcoes proprias (orion_ai_visibility/
--   orion_ai_mentions/orion_answer_quality, ai_visibility_*, chave ai_visibility).
--
-- Idempotente / auditavel / versionado. SECURITY DEFINER + guarda. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_ai_visibility (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id             text        NOT NULL,
  entity_type           text        NOT NULL,       -- anuncio|produto
  visibility_score      integer     NOT NULL DEFAULT 0,   -- AIS
  answer_score          integer     NOT NULL DEFAULT 0,   -- AQS
  citation_score        integer     NOT NULL DEFAULT 0,   -- PRONTIDAO p/ citacao (nao real)
  authority_score       integer     NOT NULL DEFAULT 0,
  freshness_score       integer     NOT NULL DEFAULT 0,
  structured_data_score integer     NOT NULL DEFAULT 0,
  semantic_score        integer     NOT NULL DEFAULT 0,
  trust_score           integer     NOT NULL DEFAULT 0,
  ai_readiness          integer     NOT NULL DEFAULT 0,
  fatores               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  prioridades           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  evidencia             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  trace_id              text,
  dia                   date        NOT NULL DEFAULT current_date,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aivis_uq UNIQUE (entity_id, entity_type, dia)
);
COMMENT ON TABLE public.orion_ai_visibility IS
  'ORION-AI-36: AI Visibility Score (AIS) + prontidao para IA por entidade. Read-only; consolida AI-32/33/34/35/20.';

CREATE INDEX IF NOT EXISTS ix_orion_aivis_dia ON public.orion_ai_visibility (dia DESC);
CREATE INDEX IF NOT EXISTS ix_orion_aivis_ais ON public.orion_ai_visibility (visibility_score);

CREATE TABLE IF NOT EXISTS public.orion_ai_mentions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mecanismo   text        NOT NULL,        -- chatgpt|gemini|claude|perplexity|copilot|search
  entidade    text        NOT NULL,
  tipo        text,
  contexto    text,
  data        timestamptz NOT NULL DEFAULT now(),
  evidencia   text        NOT NULL,        -- SEMPRE preenchida (nunca mencao sem evidencia)
  confidence  numeric     NOT NULL DEFAULT 0
);
COMMENT ON TABLE public.orion_ai_mentions IS
  'ORION-AI-36: mencoes reais por mecanismo de IA. VAZIA por design — alvo de instrumentacao futura; NUNCA fabricar mencoes (declarado).';

CREATE TABLE IF NOT EXISTS public.orion_answer_quality (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id           text        NOT NULL,
  entity_type         text        NOT NULL,
  completeness        integer     NOT NULL DEFAULT 0,
  factual_consistency integer     NOT NULL DEFAULT 0,
  semantic_clarity    integer     NOT NULL DEFAULT 0,
  geo_quality         integer     NOT NULL DEFAULT 0,
  citation_quality    integer     NOT NULL DEFAULT 0,
  readability         integer     NOT NULL DEFAULT 0,
  ai_readiness        integer     NOT NULL DEFAULT 0,
  aqs                 integer     NOT NULL DEFAULT 0,
  dia                 date        NOT NULL DEFAULT current_date,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aq_uq UNIQUE (entity_id, entity_type, dia)
);
COMMENT ON TABLE public.orion_answer_quality IS
  'ORION-AI-36: Answer Quality Score (AQS) por entidade. factual_consistency e PROXY (sem fact-checking externo — declarado).';

CREATE INDEX IF NOT EXISTS ix_orion_aq_dia ON public.orion_answer_quality (dia DESC);

CREATE TABLE IF NOT EXISTS public.visibility_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade      text,
  score_anterior integer,
  score_novo    integer,
  motivo        text,
  tempo_ms      integer,
  tokens        integer NOT NULL DEFAULT 0,
  latencia_ms   integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.visibility_logs IS 'ORION-AI-36: logs de recalculo (score anterior/novo/motivo/tempo/tokens/latencia).';

-- ----------------------------------------------------------------------------
-- 2) RLS — leitura admin
-- ----------------------------------------------------------------------------
ALTER TABLE public.orion_ai_visibility  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_ai_mentions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_answer_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visibility_logs      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_ai_visibility' AND policyname='orion_aivis_admin') THEN
    CREATE POLICY orion_aivis_admin ON public.orion_ai_visibility FOR SELECT USING (public.mp_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_ai_mentions' AND policyname='orion_aiment_admin') THEN
    CREATE POLICY orion_aiment_admin ON public.orion_ai_mentions FOR SELECT USING (public.mp_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_answer_quality' AND policyname='orion_aq_admin') THEN
    CREATE POLICY orion_aq_admin ON public.orion_answer_quality FOR SELECT USING (public.mp_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visibility_logs' AND policyname='orion_vislogs_admin') THEN
    CREATE POLICY orion_vislogs_admin ON public.visibility_logs FOR SELECT USING (public.mp_is_admin());
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_visibility_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados)
  VALUES (p_tipo, 'ai_visibility', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — ai_visibility_build: AIS + AQS consolidando AI-32/33/34/35/20
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_visibility_build(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'aivis_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_l int := 0; v_p int := 0; v_aq int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'ai_visibility_build: acesso negado (somente admin/service)';
  END IF;

  -- 4.1 ANUNCIOS (advertiser_listings) ------------------------------------
  WITH sc AS (
    SELECT entidade_id, discovery_score disc, semantic_score sem FROM public.orion_search_scores
    WHERE entidade_tipo='listing' AND dia=(SELECT max(dia) FROM public.orion_search_scores)
  ),
  geo AS (
    SELECT entidade_id, geo_score, content_quality_score cq, structured_data sd, jsonb_array_length(coalesce(faq,'[]'::jsonb)) faqn
    FROM public.orion_geo_scores WHERE entidade_tipo='listing' AND dia=(SELECT max(dia) FROM public.orion_geo_scores)
  ),
  kg AS (
    SELECT split_part(entity_key,':',2) eid, kg_score FROM public.orion_knowledge_entities
    WHERE entity_type='anuncio' AND dia=(SELECT max(dia) FROM public.orion_knowledge_entities)
  ),
  tr AS (
    SELECT DISTINCT ON (entidade_id) entidade_id, score FROM public.orion_trust_scores ORDER BY entidade_id, dia DESC
  ),
  rec AS (
    SELECT split_part(target_entity,':',2) eid, max(recommendation_score) recmax
    FROM public.orion_recommendations WHERE target_entity LIKE 'listing:%' GROUP BY 1
  ),
  base AS (
    SELECT l.id::text eid, l.title,
      coalesce(sc.disc,0) disc, coalesce(sc.sem,0) sem, coalesce(geo.geo_score,0) geo, coalesce(geo.cq,0) cq,
      geo.sd sd, coalesce(geo.faqn,0) faqn, coalesce(kg.kg_score,0) kg, tr.score trust, coalesce(rec.recmax,0) recmax,
      greatest(0, 100 - extract(day FROM (now()-coalesce(l.updated_at,l.created_at)))::int*3) freshness,
      (lower(coalesce(l.ai_status,'approved')) IN ('approved','aprovado','ok')
        AND lower(coalesce(l.moderation_status,'approved')) IN ('approved','active','aprovado')) aprovado,
      length(coalesce(l.description,'')) desclen
    FROM public.advertiser_listings l
    LEFT JOIN sc  ON sc.entidade_id = l.id::text
    LEFT JOIN geo ON geo.entidade_id = l.id::text
    LEFT JOIN kg  ON kg.eid = l.id::text
    LEFT JOIN tr  ON tr.entidade_id = l.id::text
    LEFT JOIN rec ON rec.eid = l.id::text
  ),
  comp AS (
    SELECT b.*,
      least((CASE WHEN b.sd ? 'json_ld' THEN 40 ELSE 0 END)+(CASE WHEN b.sd ? 'open_graph' THEN 20 ELSE 0 END)
          +(CASE WHEN b.sd ? 'twitter_card' THEN 15 ELSE 0 END)+(CASE WHEN b.faqn>=2 THEN 25 WHEN b.faqn>0 THEN 10 ELSE 0 END),100) sd_score,
      round(0.5*b.kg + 0.3*coalesce(b.trust,b.kg) + 0.2*coalesce(nullif(b.recmax,0),b.kg))::int authority,
      coalesce(b.trust, round(b.kg*0.8)::int) trust_eff,
      (CASE WHEN b.aprovado THEN 90 ELSE 40 END) factual,
      (CASE WHEN b.desclen>=120 THEN 100 WHEN b.desclen>=40 THEN 70 WHEN b.desclen>0 THEN 40 ELSE 0 END) readability
    FROM base b
  ),
  fin AS (
    SELECT c.*,
      least(round(c.sd_score*0.5 + (CASE WHEN c.faqn>0 THEN 30 ELSE 0 END) + c.sem*0.2)::int,100) citation,
      round((c.sd_score + c.sem + c.geo + c.cq)/4.0)::int ai_readiness
    FROM comp c
  )
  INSERT INTO public.orion_ai_visibility
    (entity_id, entity_type, visibility_score, answer_score, citation_score, authority_score, freshness_score,
     structured_data_score, semantic_score, trust_score, ai_readiness, fatores, prioridades, evidencia, trace_id, dia, updated_at)
  SELECT f.eid, 'anuncio',
     round(0.20*f.sem + 0.18*f.sd_score + 0.15*f.disc + 0.12*f.geo + 0.12*f.authority + 0.10*f.freshness + 0.08*f.citation + 0.05*f.trust_eff)::int,
     round((f.cq + f.factual + f.sem + f.geo + f.sd_score + f.readability + f.ai_readiness)/7.0)::int,
     f.citation, f.authority, f.freshness, f.sd_score, f.sem, f.trust_eff, f.ai_readiness,
     jsonb_build_object('discovery',f.disc,'semantic',f.sem,'geo',f.geo,'content_quality',f.cq,'structured_data',f.sd_score,
       'faq',f.faqn,'kg',f.kg,'trust',f.trust,'recomendacao',f.recmax,'freshness',f.freshness,
       'completeness',f.cq,'factual_consistency',f.factual,'semantic_clarity',f.sem,'geo_quality',f.geo,
       'citation_quality',f.sd_score,'readability',f.readability,'ai_readiness',f.ai_readiness,
       'pesos_ais','sem.20/sd.18/disc.15/geo.12/authority.12/fresh.10/citation.08/trust.05'),
     (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'impacto',imp,'evidencia',ev) ORDER BY imp DESC),'[]'::jsonb)
      FROM (VALUES
        ('Gerar/ampliar dados estruturados (JSON-LD/OG/Twitter) e FAQ', round((100-f.sd_score)*0.30)::int, 'structured_data_score='||f.sd_score),
        ('Enriquecer a descrição e clareza semântica',                  round((100-f.sem)*0.22)::int,      'semantic_score='||f.sem),
        ('Melhorar descobribilidade (Discovery/AI-32)',                round((100-f.disc)*0.18)::int,     'discovery_score='||f.disc),
        ('Fortalecer conexões no grafo (autoridade)',                  round((100-f.authority)*0.15)::int,'authority_score='||f.authority),
        ('Atualizar o anúncio (recência)',                             round((100-f.freshness)*0.10)::int,'freshness_score='||f.freshness)
      ) v(acao,imp,ev) WHERE imp >= 4),
     jsonb_build_object('modulos_fonte', jsonb_build_array('AI-32','AI-33','AI-34','AI-35','AI-20'),
       'mencoes_reais','DECLARADO: orion_ai_mentions vazia — nao ha observacao de citacao por IA externa'),
     v_trace, current_date, now()
  FROM fin f
  ON CONFLICT (entity_id, entity_type, dia) DO UPDATE SET
     visibility_score=excluded.visibility_score, answer_score=excluded.answer_score, citation_score=excluded.citation_score,
     authority_score=excluded.authority_score, freshness_score=excluded.freshness_score,
     structured_data_score=excluded.structured_data_score, semantic_score=excluded.semantic_score,
     trust_score=excluded.trust_score, ai_readiness=excluded.ai_readiness, fatores=excluded.fatores,
     prioridades=excluded.prioridades, evidencia=excluded.evidencia, trace_id=excluded.trace_id, updated_at=now();
  GET DIAGNOSTICS v_l = ROW_COUNT;

  -- 4.2 PRODUTOS (merchant_products) — fontes mais rasas (declarado)
  WITH sc AS (SELECT entidade_id, discovery_score disc, semantic_score sem FROM public.orion_search_scores WHERE entidade_tipo='produto' AND dia=(SELECT max(dia) FROM public.orion_search_scores)),
  geo AS (SELECT entidade_id, geo_score, content_quality_score cq, structured_data sd, jsonb_array_length(coalesce(faq,'[]'::jsonb)) faqn FROM public.orion_geo_scores WHERE entidade_tipo='produto' AND dia=(SELECT max(dia) FROM public.orion_geo_scores)),
  kg AS (SELECT split_part(entity_key,':',2) eid, kg_score FROM public.orion_knowledge_entities WHERE entity_type='produto' AND dia=(SELECT max(dia) FROM public.orion_knowledge_entities)),
  base AS (
    SELECT p.id::text eid, coalesce(sc.disc,0) disc, coalesce(sc.sem,0) sem, coalesce(geo.geo_score,0) geo, coalesce(geo.cq,0) cq,
      geo.sd sd, coalesce(geo.faqn,0) faqn, coalesce(kg.kg_score,0) kg, length(coalesce(p.descricao,'')) desclen,
      greatest(0, 100 - extract(day FROM (now()-coalesce(p.updated_at,p.created_at)))::int*3) freshness
    FROM public.merchant_products p
    LEFT JOIN sc ON sc.entidade_id=p.id::text LEFT JOIN geo ON geo.entidade_id=p.id::text LEFT JOIN kg ON kg.eid=p.id::text
  ),
  fin AS (
    SELECT b.*,
      least((CASE WHEN b.sd ? 'json_ld' THEN 40 ELSE 0 END)+(CASE WHEN b.sd ? 'open_graph' THEN 20 ELSE 0 END)+(CASE WHEN b.faqn>0 THEN 25 ELSE 0 END),100) sd_score,
      round(b.kg*0.8)::int authority,
      (CASE WHEN b.desclen>=120 THEN 100 WHEN b.desclen>=40 THEN 70 WHEN b.desclen>0 THEN 40 ELSE 0 END) readability
    FROM base b
  )
  INSERT INTO public.orion_ai_visibility
    (entity_id, entity_type, visibility_score, answer_score, citation_score, authority_score, freshness_score,
     structured_data_score, semantic_score, trust_score, ai_readiness, fatores, prioridades, evidencia, trace_id, dia, updated_at)
  SELECT f.eid, 'produto',
     round(0.20*f.sem + 0.18*f.sd_score + 0.15*f.disc + 0.12*f.geo + 0.12*f.authority + 0.10*f.freshness + 0.08*least(round(f.sd_score*0.5+f.sem*0.2)::int,100) + 0.05*round(f.kg*0.8))::int,
     round((f.cq + 70 + f.sem + f.geo + f.sd_score + f.readability + round((f.sd_score+f.sem+f.geo+f.cq)/4.0))/7.0)::int,
     least(round(f.sd_score*0.5+f.sem*0.2)::int,100), f.authority, f.freshness, f.sd_score, f.sem, round(f.kg*0.8)::int, round((f.sd_score+f.sem+f.geo+f.cq)/4.0)::int,
     jsonb_build_object('discovery',f.disc,'semantic',f.sem,'geo',f.geo,'content_quality',f.cq,'structured_data',f.sd_score,'faq',f.faqn,'kg',f.kg,'freshness',f.freshness,
       'completeness',f.cq,'factual_consistency',70,'semantic_clarity',f.sem,'geo_quality',f.geo,'citation_quality',f.sd_score,'readability',f.readability,'ai_readiness',round((f.sd_score+f.sem+f.geo+f.cq)/4.0),
       'lacuna','merchant_products sem categoria/cidade estruturada (declarado)'),
     (SELECT coalesce(jsonb_agg(jsonb_build_object('acao',acao,'impacto',imp,'evidencia',ev) ORDER BY imp DESC),'[]'::jsonb)
      FROM (VALUES
        ('Gerar dados estruturados (JSON-LD) e FAQ',      round((100-f.sd_score)*0.35)::int,'structured_data_score='||f.sd_score),
        ('Enriquecer descrição/clareza semântica',        round((100-f.sem)*0.25)::int,     'semantic_score='||f.sem),
        ('Melhorar descobribilidade',                     round((100-f.disc)*0.20)::int,    'discovery_score='||f.disc)
      ) v(acao,imp,ev) WHERE imp >= 4),
     jsonb_build_object('modulos_fonte', jsonb_build_array('AI-32','AI-33','AI-34'),'mencoes_reais','DECLARADO: sem observacao de citacao por IA'),
     v_trace, current_date, now()
  FROM fin f
  ON CONFLICT (entity_id, entity_type, dia) DO UPDATE SET
     visibility_score=excluded.visibility_score, answer_score=excluded.answer_score, citation_score=excluded.citation_score,
     authority_score=excluded.authority_score, freshness_score=excluded.freshness_score, structured_data_score=excluded.structured_data_score,
     semantic_score=excluded.semantic_score, trust_score=excluded.trust_score, ai_readiness=excluded.ai_readiness,
     fatores=excluded.fatores, prioridades=excluded.prioridades, evidencia=excluded.evidencia, trace_id=excluded.trace_id, updated_at=now();
  GET DIAGNOSTICS v_p = ROW_COUNT;

  -- 4.3 Answer Quality (AQS) — derivado dos fatores ja calculados
  INSERT INTO public.orion_answer_quality
    (entity_id, entity_type, completeness, factual_consistency, semantic_clarity, geo_quality, citation_quality, readability, ai_readiness, aqs, dia)
  SELECT v.entity_id, v.entity_type,
    (v.fatores->>'completeness')::int, (v.fatores->>'factual_consistency')::int, (v.fatores->>'semantic_clarity')::int,
    (v.fatores->>'geo_quality')::int, (v.fatores->>'citation_quality')::int, (v.fatores->>'readability')::int,
    (v.fatores->>'ai_readiness')::int, v.answer_score, current_date
  FROM public.orion_ai_visibility v WHERE v.dia=current_date
  ON CONFLICT (entity_id, entity_type, dia) DO UPDATE SET
    completeness=excluded.completeness, factual_consistency=excluded.factual_consistency, semantic_clarity=excluded.semantic_clarity,
    geo_quality=excluded.geo_quality, citation_quality=excluded.citation_quality, readability=excluded.readability,
    ai_readiness=excluded.ai_readiness, aqs=excluded.aqs;
  GET DIAGNOSTICS v_aq = ROW_COUNT;

  PERFORM public.ai_visibility_emit('visibility.updated', jsonb_build_object('anuncios',v_l,'produtos',v_p,'aqs',v_aq,'trace',v_trace));
  RETURN jsonb_build_object('ok',true,'anuncios',v_l,'produtos',v_p,'aqs',v_aq,'total',v_l+v_p,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 5) calculate_ai_visibility(entity, tipo) — AIS + readiness + prioridades + evidencias
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_ai_visibility(p_entity text, p_type text DEFAULT 'anuncio')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'entity_id',entity_id,'entity_type',entity_type,
    'visibility_score',visibility_score,'answer_score',answer_score,'ai_readiness',ai_readiness,
    'componentes',jsonb_build_object('semantic',semantic_score,'structured_data',structured_data_score,
      'authority',authority_score,'citation',citation_score,'freshness',freshness_score,'trust',trust_score),
    'prioridades',prioridades,'evidencia',evidencia,'atualizado',updated_at)
  FROM public.orion_ai_visibility
  WHERE entity_id=p_entity AND entity_type=p_type ORDER BY dia DESC LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- 6) SCORE / ANALYTICS / HEALTH / METRICS / SUMMARY / DASHBOARD
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_visibility_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (SELECT * FROM public.orion_ai_visibility WHERE dia=(SELECT max(dia) FROM public.orion_ai_visibility))
  SELECT jsonb_build_object(
    'ais_medio', (SELECT coalesce(round(avg(visibility_score))::int,0) FROM v),
    'aqs_medio', (SELECT coalesce(round(avg(answer_score))::int,0) FROM v),
    'ai_readiness_medio', (SELECT coalesce(round(avg(ai_readiness))::int,0) FROM v),
    'entidades', (SELECT count(*) FROM v),
    'distribuicao', jsonb_build_object(
      'excelente',(SELECT count(*) FROM v WHERE visibility_score>=80),
      'bom',(SELECT count(*) FROM v WHERE visibility_score BETWEEN 60 AND 79),
      'regular',(SELECT count(*) FROM v WHERE visibility_score BETWEEN 40 AND 59),
      'fraco',(SELECT count(*) FROM v WHERE visibility_score<40)),
    'structured_data_medio', (SELECT coalesce(round(avg(structured_data_score))::int,0) FROM v),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.ai_visibility_analytics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (SELECT * FROM public.orion_ai_visibility WHERE dia=(SELECT max(dia) FROM public.orion_ai_visibility))
  SELECT jsonb_build_object(
    'mais_fortes', (SELECT coalesce(jsonb_agg(jsonb_build_object('entity',entity_id,'tipo',entity_type,'ais',visibility_score,'aqs',answer_score) ORDER BY visibility_score DESC),'[]'::jsonb)
       FROM (SELECT * FROM v ORDER BY visibility_score DESC LIMIT 8) t),
    'mais_fracas', (SELECT coalesce(jsonb_agg(jsonb_build_object('entity',entity_id,'tipo',entity_type,'ais',visibility_score,'top_acao',(prioridades->0->>'acao')) ORDER BY visibility_score ASC),'[]'::jsonb)
       FROM (SELECT * FROM v ORDER BY visibility_score ASC LIMIT 8) t),
    'gargalos', (SELECT jsonb_build_object(
       'sem_structured_data',(SELECT count(*) FROM v WHERE structured_data_score<50),
       'baixa_semantica',(SELECT count(*) FROM v WHERE semantic_score<50),
       'baixa_autoridade',(SELECT count(*) FROM v WHERE authority_score<50))),
    'mencoes_reais', (SELECT count(*) FROM public.orion_ai_mentions),
    'nota_mencoes', 'orion_ai_mentions vazia por design (sem observacao de IA externa) — DECLARADO',
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.ai_visibility_health()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT public.ai_visibility_score() r)
  SELECT jsonb_build_object(
    'ais', (SELECT (r->>'ais_medio')::int FROM s),
    'aqs', (SELECT (r->>'aqs_medio')::int FROM s),
    'status', (SELECT CASE WHEN (r->>'ais_medio')::int>=70 THEN 'verde' WHEN (r->>'ais_medio')::int>=45 THEN 'amarelo' ELSE 'vermelho' END FROM s),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.ai_visibility_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'visibility_total', (SELECT count(*) FROM public.orion_ai_visibility),
    'answer_quality_total', (SELECT count(*) FROM public.orion_answer_quality),
    'mencoes', (SELECT count(*) FROM public.orion_ai_mentions),
    'logs', (SELECT count(*) FROM public.visibility_logs),
    'ultimo_dia', (SELECT max(dia) FROM public.orion_ai_visibility),
    'eventos', (SELECT count(*) FROM public.orion_eventos WHERE tipo LIKE 'visibility.%'));
$$;

CREATE OR REPLACE FUNCTION public.ai_visibility_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('score',public.ai_visibility_score(),'health',public.ai_visibility_health(),
    'analytics',public.ai_visibility_analytics(),'metrics',public.ai_visibility_metrics());
$$;

CREATE OR REPLACE FUNCTION public.ai_visibility_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.ai_visibility_summary();
  PERFORM public.ai_visibility_emit('visibility.score', jsonb_build_object('ais', v->'score'->'ais_medio'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 7) TICK incremental */21
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_ai_visibility_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t0 timestamptz := clock_timestamp(); r jsonb;
BEGIN
  r := public.ai_visibility_build('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  INSERT INTO public.visibility_logs (entidade, motivo, tempo_ms, latencia_ms)
  VALUES ('*', 'tick incremental', round(extract(milliseconds FROM (clock_timestamp()-v_t0)))::int, round(extract(milliseconds FROM (clock_timestamp()-v_t0)))::int);
  PERFORM public.ai_visibility_emit('visibility.recommendation', jsonb_build_object('total',(r->>'total')));
END$$;

-- ----------------------------------------------------------------------------
-- 8) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.ai_visibility_build(text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_ai_visibility(text,text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_visibility_score()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_visibility_analytics()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_visibility_health()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_visibility_metrics()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_visibility_summary()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_visibility_dashboard()                   TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9) PROMPT REGISTRY (5 prompts)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('aivis.low_visibility',
 'Voce e o ORION AI Visibility. Explique por que uma entidade tem baixa visibilidade para IAs (dados estruturados fracos, baixa descobribilidade/autoridade), usando os fatores fornecidos. Nunca invente; use so a evidencia.',
 'ORION-AI-36 seed');
SELECT public.orion_ai_prompt_set('aivis.low_comprehension',
 'Voce e o ORION AI Visibility. Explique por que um conteudo e pouco compreendido por IAs (baixa clareza semantica, descricao curta, sem FAQ/JSON-LD). Baseie-se apenas nos dados.',
 'ORION-AI-36 seed');
SELECT public.orion_ai_prompt_set('aivis.improve_semantic',
 'Voce e o ORION AI Visibility. Sugira melhorias semanticas COMPLEMENTARES (contexto, sinonimos, FAQ, atributos) para aumentar a prontidao para IA, sem alterar o conteudo original. Cada sugestao com justificativa e impacto.',
 'ORION-AI-36 seed');
SELECT public.orion_ai_prompt_set('aivis.detect_duplicate',
 'Voce e o auditor do ORION AI Visibility. Aponte possiveis conteudos duplicados/redundantes a partir de titulos e categorias fornecidos, explicando o criterio. Nunca afirme duplicidade sem evidencia.',
 'ORION-AI-36 seed');
SELECT public.orion_ai_prompt_set('aivis.prioritize',
 'Voce e o ORION AI Visibility. Priorize as otimizacoes de visibilidade por impacto esperado, considerando dados estruturados, semantica, autoridade e recencia. Cada prioridade com justificativa, evidencia e impacto.',
 'ORION-AI-36 seed');

-- ----------------------------------------------------------------------------
-- 10) MODEL PREF + CRON */21
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code)
VALUES ('ai_visibility','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_ai_visibility_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_ai_visibility_tick');
    PERFORM cron.schedule('orion_ai_visibility_tick','*/21 * * * *','SELECT public.orion_ai_visibility_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_ai_visibility_tick');
--   DROP FUNCTION IF EXISTS public.orion_ai_visibility_tick, public.ai_visibility_dashboard,
--     public.ai_visibility_summary, public.ai_visibility_metrics, public.ai_visibility_health,
--     public.ai_visibility_analytics, public.ai_visibility_score, public.calculate_ai_visibility(text,text),
--     public.ai_visibility_build(text), public.ai_visibility_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.visibility_logs, public.orion_answer_quality, public.orion_ai_mentions, public.orion_ai_visibility;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='ai_visibility';
-- ============================================================================
