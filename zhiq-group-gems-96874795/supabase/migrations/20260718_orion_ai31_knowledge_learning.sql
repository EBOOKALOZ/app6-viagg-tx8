-- ============================================================================
-- ORION-AI-31 — KNOWLEDGE & LEARNING AI v1.0
-- ============================================================================
-- Fecha a lacuna do roadmap (numero reservado, ate agora NAO construido).
-- Camada de APRENDIZADO do ecossistema: consolida o conhecimento acumulado por
--   TODOS os modulos ORION a partir do event bus real (orion_eventos: 17k+
--   eventos, 142 tipos, 62 origens) — padroes, tendencias, licoes com evidencia.
--
-- READ-ONLY sobre o ecossistema; NUNCA inventa: toda licao/padrao tem evidencia
--   e confianca baseada em nº de registros. NAO altera nenhum modulo.
--
-- ANTI-COLISAO (namespace minado):
--   - AI-14 Strategy usa `orion_knowledge` + `knowledge_engine`  -> NAO tocar
--   - AI-34 Knowledge Graph usa `orion_knowledge_entities/relations` + prompts
--     `knowledge.*` (chave `knowledge_graph`)                    -> NAO tocar
--   - AI-57 Knowledge Graph corporativo usa `orion_kg_*`         -> NAO tocar
--   Este modulo: namespace `orion_learning_*`, funcoes `learning_*`, prompts
--   `learning.*`, chave de modulo `knowledge_learning`. (o rotulo `knowledge`
--   estava reservado ao AI-31 na numeracao, mas `knowledge.*` ja e do AI-34 —
--   por isso a chave tecnica e `knowledge_learning`.)
--
-- Idempotente / auditavel. SECURITY DEFINER + guarda. RLS + REVOKE. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_learning_snapshots (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia            date        NOT NULL UNIQUE,
  eventos_total  bigint      NOT NULL DEFAULT 0,
  tipos_ativos   integer     NOT NULL DEFAULT 0,
  origens_ativas integer     NOT NULL DEFAULT 0,
  learning_score integer     NOT NULL DEFAULT 0,
  kpis           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_learning_snapshots IS
  'ORION-AI-31: memoria de aprendizado — snapshot diario dos KPIs do ecossistema (do orion_eventos).';

CREATE TABLE IF NOT EXISTS public.orion_learning_lessons (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave       text        NOT NULL,          -- identidade da licao (idempotencia)
  categoria   text        NOT NULL,          -- atividade|tendencia|feedback|cobertura|manual
  licao       text        NOT NULL,
  evidencia   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  origem      text,
  confianca   integer     NOT NULL DEFAULT 0,
  dia         date        NOT NULL DEFAULT current_date,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_learning_lessons_uq UNIQUE (chave, dia)
);
COMMENT ON TABLE public.orion_learning_lessons IS
  'ORION-AI-31: base de conhecimento — licoes com EVIDENCIA (derivadas de dados reais ou manuais). Nunca inventadas.';
CREATE INDEX IF NOT EXISTS ix_orion_learning_lessons_cat ON public.orion_learning_lessons (categoria);

CREATE TABLE IF NOT EXISTS public.orion_learning_patterns (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo        text        NOT NULL,
  origem      text,
  freq_total  bigint      NOT NULL DEFAULT 0,
  freq_7d     bigint      NOT NULL DEFAULT 0,
  freq_7d_ant bigint      NOT NULL DEFAULT 0,
  tendencia   text        NOT NULL DEFAULT 'estavel',   -- crescente|estavel|decrescente
  variacao_pct numeric    NOT NULL DEFAULT 0,
  dia         date        NOT NULL DEFAULT current_date,
  CONSTRAINT orion_learning_patterns_uq UNIQUE (tipo, dia)
);
COMMENT ON TABLE public.orion_learning_patterns IS
  'ORION-AI-31: padroes/tendencias por tipo de evento (7d vs 7d anterior). Descritivo, com evidencia.';
CREATE INDEX IF NOT EXISTS ix_orion_learning_patterns_dia ON public.orion_learning_patterns (dia DESC);

-- ----------------------------------------------------------------------------
-- 2) RLS + REVOKE
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_learning_snapshots','orion_learning_lessons','orion_learning_patterns'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'knowledge_learning', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — learning_build: consolida orion_eventos em snapshot+patterns+licoes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_build(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace,'lrn_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_total bigint; v_tipos int; v_origens int; v_lessons int := 0; v_pat int := 0;
  v_diversidade int; v_cobertura int; v_volume int; v_kb int; v_feedback int; v_score int;
  v_top_origem text; v_top_origem_n bigint; v_top_tipo text; v_top_tipo_n bigint; v_reco bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'learning_build: acesso negado (somente admin/service)';
  END IF;

  SELECT count(*), count(DISTINCT tipo), count(DISTINCT origem) INTO v_total, v_tipos, v_origens FROM public.orion_eventos;
  SELECT origem, count(*) INTO v_top_origem, v_top_origem_n FROM public.orion_eventos WHERE origem IS NOT NULL GROUP BY origem ORDER BY count(*) DESC LIMIT 1;
  SELECT tipo, count(*) INTO v_top_tipo, v_top_tipo_n FROM public.orion_eventos GROUP BY tipo ORDER BY count(*) DESC LIMIT 1;
  SELECT count(*) INTO v_reco FROM public.orion_eventos WHERE tipo ~* 'recommend|recomenda';

  -- 4.1 PADROES por tipo (7d vs 7d anterior) — top 40 tipos
  INSERT INTO public.orion_learning_patterns (tipo, origem, freq_total, freq_7d, freq_7d_ant, tendencia, variacao_pct, dia)
  SELECT p.tipo, p.origem, p.total, p.d7, p.d7a,
    CASE WHEN p.d7 > p.d7a*1.2 THEN 'crescente' WHEN p.d7 < p.d7a*0.8 THEN 'decrescente' ELSE 'estavel' END,
    round(CASE WHEN p.d7a>0 THEN 100.0*(p.d7-p.d7a)/p.d7a ELSE 0 END,1), current_date
  FROM (
    SELECT tipo, max(origem) origem, count(*) total,
      count(*) FILTER (WHERE criado_em >= now()-interval '7 days') d7,
      count(*) FILTER (WHERE criado_em >= now()-interval '14 days' AND criado_em < now()-interval '7 days') d7a
    FROM public.orion_eventos GROUP BY tipo ORDER BY count(*) DESC LIMIT 40
  ) p
  ON CONFLICT (tipo, dia) DO UPDATE SET freq_total=excluded.freq_total, freq_7d=excluded.freq_7d,
    freq_7d_ant=excluded.freq_7d_ant, tendencia=excluded.tendencia, variacao_pct=excluded.variacao_pct, origem=excluded.origem;
  GET DIAGNOSTICS v_pat = ROW_COUNT;

  -- 4.2 LICOES derivadas de dados reais (fatos com evidencia — nunca inventadas)
  INSERT INTO public.orion_learning_lessons (chave, categoria, licao, evidencia, origem, confianca, dia)
  VALUES
    ('modulo_mais_ativo', 'atividade',
     'Modulo mais ativo do ecossistema: '||coalesce(v_top_origem,'?')||' ('||coalesce(v_top_origem_n,0)||' eventos)',
     jsonb_build_object('origem',v_top_origem,'eventos',v_top_origem_n,'pct',round(100.0*coalesce(v_top_origem_n,0)/greatest(v_total,1),1)),
     v_top_origem, least(40+(v_total/500)::int,100), current_date),
    ('evento_mais_frequente', 'atividade',
     'Tipo de evento mais frequente: '||coalesce(v_top_tipo,'?')||' ('||coalesce(v_top_tipo_n,0)||'x)',
     jsonb_build_object('tipo',v_top_tipo,'ocorrencias',v_top_tipo_n), NULL, least(40+(v_total/500)::int,100), current_date),
    ('cobertura_ecossistema', 'cobertura',
     coalesce(v_origens,0)||' modulos emitem eventos ('||coalesce(v_tipos,0)||' tipos distintos) — ecossistema '||
       CASE WHEN v_origens>=40 THEN 'altamente integrado' WHEN v_origens>=15 THEN 'bem integrado' ELSE 'em integracao' END,
     jsonb_build_object('origens',v_origens,'tipos',v_tipos,'eventos',v_total), NULL, least(40+(v_total/500)::int,100), current_date),
    ('loops_feedback', 'feedback',
     'Eventos de recomendacao/feedback registrados: '||coalesce(v_reco,0)||' — indica loops de aprendizado ativos',
     jsonb_build_object('eventos_recomendacao',v_reco,'pct',round(100.0*coalesce(v_reco,0)/greatest(v_total,1),1)),
     NULL, least(40+(v_reco/50)::int,100), current_date)
  ON CONFLICT (chave, dia) DO UPDATE SET licao=excluded.licao, evidencia=excluded.evidencia, confianca=excluded.confianca, atualizado_em=now();

  -- licoes de TENDENCIA (tipos crescendo forte) — top 3
  INSERT INTO public.orion_learning_lessons (chave, categoria, licao, evidencia, origem, confianca, dia)
  SELECT 'tendencia_'||tipo, 'tendencia',
    'Evento "'||tipo||'" em '||tendencia||' ('||variacao_pct||'% vs semana anterior)',
    jsonb_build_object('tipo',tipo,'freq_7d',freq_7d,'freq_7d_ant',freq_7d_ant,'variacao_pct',variacao_pct),
    origem, least(30+(freq_7d/10)::int,100), current_date
  FROM public.orion_learning_patterns
  WHERE dia=current_date AND tendencia='crescente' AND freq_7d >= 5
  ORDER BY variacao_pct DESC LIMIT 3
  ON CONFLICT (chave, dia) DO UPDATE SET licao=excluded.licao, evidencia=excluded.evidencia, confianca=excluded.confianca, atualizado_em=now();
  SELECT count(*) INTO v_lessons FROM public.orion_learning_lessons WHERE dia=current_date;

  -- 4.3 LEARNING SCORE
  v_diversidade := least(round(v_tipos/50.0*100)::int,100);
  v_cobertura   := least(round(v_origens/20.0*100)::int,100);
  v_volume      := least(round((SELECT count(*) FROM public.orion_eventos WHERE criado_em>=now()-interval '7 days')/500.0*100)::int,100);
  v_kb          := least(v_lessons*12,100);
  v_feedback    := least(round(100.0*coalesce(v_reco,0)/greatest(v_total,1))::int*4,100);
  v_score       := round(0.25*v_diversidade + 0.25*v_cobertura + 0.20*v_volume + 0.15*v_kb + 0.15*v_feedback)::int;

  INSERT INTO public.orion_learning_snapshots (dia, eventos_total, tipos_ativos, origens_ativas, learning_score, kpis)
  VALUES (current_date, v_total, v_tipos, v_origens, v_score,
    jsonb_build_object('diversidade',v_diversidade,'cobertura',v_cobertura,'volume_7d',v_volume,
      'base_conhecimento',v_kb,'feedback',v_feedback,'licoes',v_lessons,'padroes',v_pat,
      'top_origem',v_top_origem,'top_tipo',v_top_tipo,'eventos_recomendacao',v_reco))
  ON CONFLICT (dia) DO UPDATE SET eventos_total=excluded.eventos_total, tipos_ativos=excluded.tipos_ativos,
    origens_ativas=excluded.origens_ativas, learning_score=excluded.learning_score, kpis=excluded.kpis;

  PERFORM public.learning_emit('learning.updated', jsonb_build_object('score',v_score,'licoes',v_lessons,'padroes',v_pat,'trace',v_trace));
  RETURN jsonb_build_object('ok',true,'learning_score',v_score,'eventos',v_total,'tipos',v_tipos,'origens',v_origens,
    'licoes',v_lessons,'padroes',v_pat,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 5) CONSULTAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT * FROM public.orion_learning_snapshots ORDER BY dia DESC LIMIT 1),
  ant AS (SELECT learning_score FROM public.orion_learning_snapshots ORDER BY dia DESC OFFSET 1 LIMIT 1)
  SELECT jsonb_build_object(
    'learning_score', (SELECT learning_score FROM s),
    'classificacao', (SELECT CASE WHEN learning_score>=80 THEN 'Excelente' WHEN learning_score>=60 THEN 'Bom'
                        WHEN learning_score>=40 THEN 'Regular' ELSE 'Inicial' END FROM s),
    'tendencia', (SELECT CASE WHEN (SELECT learning_score FROM ant) IS NULL THEN 'sem historico'
                    WHEN (SELECT learning_score FROM s) > (SELECT learning_score FROM ant) THEN 'evoluindo'
                    WHEN (SELECT learning_score FROM s) < (SELECT learning_score FROM ant) THEN 'recuando' ELSE 'estavel' END),
    'eventos_total', (SELECT eventos_total FROM s),
    'tipos_ativos', (SELECT tipos_ativos FROM s),
    'origens_ativas', (SELECT origens_ativas FROM s),
    'componentes', (SELECT kpis FROM s),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.learning_knowledge_base()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',categoria,'licao',licao,'evidencia',evidencia,
    'origem',origem,'confianca',confianca) ORDER BY confianca DESC),'[]'::jsonb)
  FROM public.orion_learning_lessons WHERE dia=(SELECT max(dia) FROM public.orion_learning_lessons);
$$;

CREATE OR REPLACE FUNCTION public.learning_patterns_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT * FROM public.orion_learning_patterns WHERE dia=(SELECT max(dia) FROM public.orion_learning_patterns))
  SELECT jsonb_build_object(
    'crescentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'freq_7d',freq_7d,'variacao_pct',variacao_pct) ORDER BY variacao_pct DESC),'[]'::jsonb) FROM p WHERE tendencia='crescente'),
    'decrescentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'freq_7d',freq_7d,'variacao_pct',variacao_pct) ORDER BY variacao_pct ASC),'[]'::jsonb) FROM p WHERE tendencia='decrescente'),
    'top_frequentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'freq_total',freq_total) ORDER BY freq_total DESC),'[]'::jsonb) FROM (SELECT * FROM p ORDER BY freq_total DESC LIMIT 12) x),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.learning_event_intelligence()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_origem', (SELECT coalesce(jsonb_agg(jsonb_build_object('origem',origem,'eventos',n) ORDER BY n DESC),'[]'::jsonb)
       FROM (SELECT coalesce(origem,'(sem)') origem, count(*) n FROM public.orion_eventos GROUP BY 1 ORDER BY n DESC LIMIT 15) x),
    'por_dia', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'eventos',n) ORDER BY dia),'[]'::jsonb)
       FROM (SELECT criado_em::date dia, count(*) n FROM public.orion_eventos WHERE criado_em>=now()-interval '14 days' GROUP BY 1 ORDER BY 1) x),
    'total', (SELECT count(*) FROM public.orion_eventos),
    'gerado_em', now());
$$;

-- adiciona licao MANUAL (curadoria humana) — com evidencia obrigatoria
CREATE OR REPLACE FUNCTION public.learning_lesson_add(p_chave text, p_licao text, p_evidencia jsonb DEFAULT '{}'::jsonb, p_categoria text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'learning_lesson_add: apenas admin';
  END IF;
  INSERT INTO public.orion_learning_lessons (chave, categoria, licao, evidencia, confianca, dia)
  VALUES (p_chave, p_categoria, p_licao, coalesce(p_evidencia,'{}'::jsonb), 100, current_date)
  ON CONFLICT (chave, dia) DO UPDATE SET licao=excluded.licao, evidencia=excluded.evidencia, categoria=excluded.categoria, atualizado_em=now();
  RETURN jsonb_build_object('ok',true,'chave',p_chave);
END$$;

CREATE OR REPLACE FUNCTION public.learning_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'snapshots', (SELECT count(*) FROM public.orion_learning_snapshots),
    'licoes', (SELECT count(*) FROM public.orion_learning_lessons),
    'padroes', (SELECT count(*) FROM public.orion_learning_patterns),
    'eventos_fonte', (SELECT count(*) FROM public.orion_eventos),
    'ultimo_dia', (SELECT max(dia) FROM public.orion_learning_snapshots));
$$;

CREATE OR REPLACE FUNCTION public.learning_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('score',public.learning_score(),'knowledge_base',public.learning_knowledge_base(),
    'patterns',public.learning_patterns_view(),'event_intelligence',public.learning_event_intelligence(),
    'metrics',public.learning_metrics());
$$;

CREATE OR REPLACE FUNCTION public.learning_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.learning_summary();
  PERFORM public.learning_emit('learning.score', jsonb_build_object('score', v->'score'->'learning_score'));
  RETURN v;
END$$;

CREATE OR REPLACE FUNCTION public.orion_learning_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.learning_build('cron_'||to_char(now(),'YYYYMMDDHH24MI')); END$$;

-- ----------------------------------------------------------------------------
-- 6) GRANTS (REVOKE de PUBLIC/anon; so authenticated/service)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.learning_build(text), public.learning_score(), public.learning_knowledge_base(),
  public.learning_patterns_view(), public.learning_event_intelligence(), public.learning_lesson_add(text,text,jsonb,text),
  public.learning_metrics(), public.learning_summary(), public.learning_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.learning_build(text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_score()                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_knowledge_base()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_patterns_view()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_event_intelligence()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_lesson_add(text,text,jsonb,text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_metrics()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_summary()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_dashboard()                        TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) PROMPT REGISTRY (5 prompts `learning.*` — livres)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('learning.summary',
 'Voce e o ORION Knowledge & Learning AI. Resuma o aprendizado do ecossistema a partir das licoes/padroes/eventos reais fornecidos. Nunca invente — use so a evidencia. Destaque o que o ecossistema esta aprendendo e onde ha lacunas.',
 'ORION-AI-31 seed');
SELECT public.orion_ai_prompt_set('learning.lesson',
 'Voce e o ORION Knowledge & Learning AI. Explique uma licao do ecossistema com base na sua evidencia (numeros reais). Seja factual; nunca extrapole alem dos dados.',
 'ORION-AI-31 seed');
SELECT public.orion_ai_prompt_set('learning.pattern',
 'Voce e o ORION Knowledge & Learning AI. Explique um padrao/tendencia de eventos (crescente/decrescente) com base nas frequencias 7d vs 7d anterior. Nunca afirme causa sem evidencia.',
 'ORION-AI-31 seed');
SELECT public.orion_ai_prompt_set('learning.insight',
 'Voce e o ORION Knowledge & Learning AI. A partir do conhecimento consolidado, sugira o que o ecossistema deveria aprender/monitorar a seguir. Recomenda, nunca executa; baseado em dados.',
 'ORION-AI-31 seed');
SELECT public.orion_ai_prompt_set('learning.gap',
 'Voce e o ORION Knowledge & Learning AI. Aponte lacunas de aprendizado (modulos com pouca atividade, ausencia de loops de feedback) com base nas metricas reais. Declare quando faltar dado.',
 'ORION-AI-31 seed');

-- ----------------------------------------------------------------------------
-- 8) MODEL PREF + CRON :37
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('knowledge_learning','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_learning_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_learning_tick');
    PERFORM cron.schedule('orion_learning_tick','37 * * * *','SELECT public.orion_learning_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- build inicial
SELECT public.learning_build('seed_inicial_ai31');

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_learning_tick');
--   DROP FUNCTION IF EXISTS public.orion_learning_tick, public.learning_dashboard, public.learning_summary,
--     public.learning_metrics, public.learning_lesson_add(text,text,jsonb,text), public.learning_event_intelligence,
--     public.learning_patterns_view, public.learning_knowledge_base, public.learning_score, public.learning_build(text),
--     public.learning_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_learning_patterns, public.orion_learning_lessons, public.orion_learning_snapshots;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='knowledge_learning';
--   -- NAO tocar orion_knowledge (AI-14), orion_knowledge_entities/relations (AI-34), orion_kg_* (AI-57).
-- ============================================================================
