-- ============================================================================
-- ORION-AI-65 — BACKGROUND INTELLIGENCE AI v1.0 (Fundos e Cenarios)
-- ============================================================================
-- Do ORION Design Ecosystem. Remove/substitui/gera/otimiza fundos e cenarios de
-- imagens (produtos/servicos/imoveis/veiculos/leiloes/campanhas), preservando a
-- fidelidade do objeto principal (nunca representacao enganosa).
--
-- HONESTIDADE (REAL em SQL x DECLARADO/Edge):
--   O processamento de PIXEL (remover fundo, gerar cenario, sombras, iluminacao,
--   perspectiva, export PNG/WEBP/PSD) NAO e feito no Postgres — e feito por EDGE
--   FUNCTIONS com bibliotecas de imagem / modelos de visao. DECLARADO.
--   REAL no banco (a espinha dorsal que a Edge pluga):
--     * CATALOGO DE CENARIOS seedado (scene library por categoria/segmento/estilo).
--     * FILA DE JOBS: create_* enfileira (pendente) -> `bg_next_job` (a Edge reivindica
--       com FOR UPDATE SKIP LOCKED) -> `bg_complete_job` (a Edge devolve url+metricas).
--     * VERSIONAMENTO: versao 0 = ORIGINAL preservado (imutavel); recuperacao de versao.
--     * BACKGROUND SCORE agregado das metricas reais que a Edge devolve.
--     * RECOMENDACAO de cenario por categoria/segmento **REUSANDO o AI-61**
--       (generate_palette da marca -> cores de fundo que harmonizam).
--
-- Fontes reais (07-18; pre-lancamento -> poucas imagens): merchant_credit_products,
--   auction_listings(product_image_url), profiles(logo/avatar). DECLARADO.
--
-- Anti-colisao: namespace orion_bg_*, funcoes bg_*, chave `background_intelligence`,
--   painel /admin/orion-background. Reusa AI-61 (`orion_brand_*`/generate_palette).
--
-- Idempotente. Original imutavel. RLS + REVOKE ALL/GRANT SELECT + REVOKE EXECUTE
-- FROM PUBLIC/anon nas funcoes de dados (licao AI-61). Tick */5. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_bg_scenes (
  scene_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave        text        NOT NULL UNIQUE,
  nome         text        NOT NULL,
  categoria    text        NOT NULL,   -- estudio|minimalista|luxo|madeira|marmore|industrial|natureza|praia|campo|cidade|neon|tecnologia|corporativo|gourmet|infantil|moda|fitness|pet|automotivo|imobiliario|delivery|turismo|marketplace|leiloes
  segmento     text,                   -- a qual segmento se aplica melhor
  estilo       text,                   -- premium|minimalista|moderno|popular
  ambiente     text,                   -- estudio_branco|estudio_preto|gradiente|mesa|cozinha|sala|escritorio|garagem|paisagem|loja...
  palette_hint jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- cores sugeridas do fundo
  thumb_url    text,
  premium      boolean     NOT NULL DEFAULT false,
  ativo        boolean     NOT NULL DEFAULT true,
  usos         integer     NOT NULL DEFAULT 0,
  score_medio  integer     NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_bg_scenes IS 'ORION-AI-65: biblioteca de cenarios (catalogo real por categoria/segmento/estilo).';
CREATE INDEX IF NOT EXISTS ix_bg_scenes_cat ON public.orion_bg_scenes (categoria);

CREATE TABLE IF NOT EXISTS public.orion_bg_projects (
  project_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_tipo      text        NOT NULL DEFAULT 'manual',  -- produto|leilao|imovel|veiculo|servico|logo|manual
  ref_id        text,
  imagem_original text      NOT NULL,
  categoria     text,
  objeto        text,                    -- diagnostico: objeto principal
  brand_id      bigint,                  -- AI-61 (harmonizacao)
  resultado_url text,                    -- ultima versao processada
  score         integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'novo',  -- novo|processando|concluido|falhou
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_bg_projects IS 'ORION-AI-65: projeto = uma imagem em trabalho. Original preservado em versao 0.';

CREATE TABLE IF NOT EXISTS public.orion_bg_jobs (
  job_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   bigint NOT NULL REFERENCES public.orion_bg_projects(project_id) ON DELETE CASCADE,
  tipo         text        NOT NULL,   -- remove_bg|replace_bg|generate_bg|shadows|reflections|perspective|export|scene_analysis
  params       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status       text        NOT NULL DEFAULT 'pendente',  -- pendente|processando|concluido|falhou
  prioridade   integer     NOT NULL DEFAULT 5,
  tentativas   integer     NOT NULL DEFAULT 0,
  claimed_by   text,
  resultado_url text,
  erro         text,
  enfileirado_em timestamptz NOT NULL DEFAULT now(),
  iniciado_em  timestamptz,
  concluido_em timestamptz
);
COMMENT ON TABLE public.orion_bg_jobs IS 'ORION-AI-65: FILA de processamento. A Edge reivindica (bg_next_job) e devolve (bg_complete_job).';
CREATE INDEX IF NOT EXISTS ix_bg_jobs_status ON public.orion_bg_jobs (status, prioridade, enfileirado_em);
CREATE INDEX IF NOT EXISTS ix_bg_jobs_proj ON public.orion_bg_jobs (project_id);

CREATE TABLE IF NOT EXISTS public.orion_bg_versions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   bigint NOT NULL REFERENCES public.orion_bg_projects(project_id) ON DELETE CASCADE,
  versao       integer     NOT NULL,     -- 0 = original imutavel
  tipo         text        NOT NULL,     -- original|remove_bg|replace_bg|generate_bg|...
  url          text        NOT NULL,
  scene_id     bigint,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bg_ver_uq UNIQUE (project_id, versao)
);
COMMENT ON TABLE public.orion_bg_versions IS 'ORION-AI-65: historico de versoes (v0=original preservado). Recuperacao de versao.';

CREATE TABLE IF NOT EXISTS public.orion_bg_metrics (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   bigint NOT NULL REFERENCES public.orion_bg_projects(project_id) ON DELETE CASCADE,
  versao       integer,
  naturalidade integer,   -- 0-100 (metricas devolvidas pela Edge/modelo)
  realismo     integer,
  qualidade    integer,
  iluminacao   integer,
  sombras      integer,
  integracao   integer,
  profundidade integer,
  consistencia integer,
  medido_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_bg_metrics IS 'ORION-AI-65: metricas de qualidade por resultado (origem: Edge/modelo). Base do Background Score.';

CREATE TABLE IF NOT EXISTS public.orion_bg_scores (
  project_id   bigint PRIMARY KEY REFERENCES public.orion_bg_projects(project_id) ON DELETE CASCADE,
  background_score integer NOT NULL DEFAULT 0,
  naturalidade integer, realismo integer, iluminacao integer, sombras integer, integracao integer, profundidade integer,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_bg_scores IS 'ORION-AI-65: Background Score consolidado por projeto.';

CREATE TABLE IF NOT EXISTS public.orion_bg_exports (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   bigint NOT NULL REFERENCES public.orion_bg_projects(project_id) ON DELETE CASCADE,
  formato      text        NOT NULL,   -- png|jpg|webp|avif|tiff|psd|transparente|impressao|social
  status       text        NOT NULL DEFAULT 'pendente',  -- pendente|gerado (Edge)
  url          text,
  solicitado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_bg_exports IS 'ORION-AI-65: exportacoes (geracao do arquivo = Edge DECLARADO).';

CREATE TABLE IF NOT EXISTS public.orion_bg_history (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   bigint REFERENCES public.orion_bg_projects(project_id) ON DELETE CASCADE,
  evento       text        NOT NULL,
  dados        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_bg_history IS 'ORION-AI-65: audit trail imutavel (append-only).';

CREATE TABLE IF NOT EXISTS public.orion_bg_models (
  chave        text        PRIMARY KEY,
  nome         text        NOT NULL,
  tipo         text        NOT NULL,   -- remocao|geracao|score|sombras
  provedor     text,
  status       text        NOT NULL DEFAULT 'declarado', -- declarado(Edge)|ativo
  descricao    text
);
COMMENT ON TABLE public.orion_bg_models IS 'ORION-AI-65: registro dos modelos de processamento (execucao na Edge — DECLARADO).';

CREATE TABLE IF NOT EXISTS public.orion_bg_statistics (
  dia               date        PRIMARY KEY,
  projetos          integer     NOT NULL DEFAULT 0,
  fundos_removidos  integer     NOT NULL DEFAULT 0,
  fundos_criados    integer     NOT NULL DEFAULT 0,
  jobs_concluidos   integer     NOT NULL DEFAULT 0,
  jobs_pendentes    integer     NOT NULL DEFAULT 0,
  jobs_falhos       integer     NOT NULL DEFAULT 0,
  tempo_medio_s     integer     NOT NULL DEFAULT 0,
  score_medio       integer     NOT NULL DEFAULT 0,
  cenarios          integer     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_bg_statistics IS 'ORION-AI-65: rollup diario (jobs/tempo/score/cenarios).';

-- ----------------------------------------------------------------------------
-- 2) RLS + hardening (tabelas + funcoes de dados)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_bg_scenes','orion_bg_projects','orion_bg_jobs','orion_bg_versions','orion_bg_metrics',
      'orion_bg_scores','orion_bg_exports','orion_bg_history','orion_bg_models','orion_bg_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bg_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'background_intelligence', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) PROJETO + FILA (enfileira job; Edge processa)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bg_create_project(p_imagem text, p_ref_tipo text DEFAULT 'manual', p_ref_id text DEFAULT NULL,
  p_categoria text DEFAULT NULL, p_brand_id bigint DEFAULT NULL, p_objeto text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'bg_create_project: acesso negado';
  END IF;
  INSERT INTO public.orion_bg_projects (imagem_original, ref_tipo, ref_id, categoria, brand_id, objeto)
  VALUES (p_imagem, p_ref_tipo, p_ref_id, p_categoria, p_brand_id, p_objeto) RETURNING project_id INTO v_id;
  -- v0 = ORIGINAL preservado (imutavel)
  INSERT INTO public.orion_bg_versions (project_id, versao, tipo, url) VALUES (v_id, 0, 'original', p_imagem);
  INSERT INTO public.orion_bg_history (project_id, evento, dados) VALUES (v_id, 'projeto_criado', jsonb_build_object('original',p_imagem));
  RETURN v_id;
END$$;

-- enfileira um job de processamento (a Edge executa o pixel)
CREATE OR REPLACE FUNCTION public.bg_enqueue(p_project bigint, p_tipo text, p_params jsonb DEFAULT '{}'::jsonb, p_prioridade int DEFAULT 5)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'bg_enqueue: acesso negado';
  END IF;
  INSERT INTO public.orion_bg_jobs (project_id, tipo, params, prioridade) VALUES (p_project, p_tipo, coalesce(p_params,'{}'::jsonb), p_prioridade) RETURNING job_id INTO v_job;
  UPDATE public.orion_bg_projects SET status='processando', atualizado_em=now() WHERE project_id=p_project;
  PERFORM public.bg_emit('bg.enqueued', jsonb_build_object('job',v_job,'tipo',p_tipo,'project',p_project));
  RETURN v_job;
END$$;

-- APIs de alto nivel (enfileiram)
CREATE OR REPLACE FUNCTION public.remove_background(p_project bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok',true,'job',public.bg_enqueue(p_project,'remove_bg','{}'::jsonb,3),'nota','processamento de pixel na Edge (DECLARADO)');
$$;
CREATE OR REPLACE FUNCTION public.replace_background(p_project bigint, p_scene bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok',true,'job',public.bg_enqueue(p_project,'replace_bg',jsonb_build_object('scene_id',p_scene),4),'nota','Edge substitui o fundo pelo cenario');
$$;
CREATE OR REPLACE FUNCTION public.apply_shadows(p_project bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok',true,'job',public.bg_enqueue(p_project,'shadows','{}'::jsonb,5));
$$;
CREATE OR REPLACE FUNCTION public.apply_reflections(p_project bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok',true,'job',public.bg_enqueue(p_project,'reflections','{}'::jsonb,5));
$$;
CREATE OR REPLACE FUNCTION public.correct_perspective(p_project bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok',true,'job',public.bg_enqueue(p_project,'perspective','{}'::jsonb,5));
$$;
CREATE OR REPLACE FUNCTION public.export_background(p_project bigint, p_formato text DEFAULT 'png')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'export_background: acesso negado'; END IF;
  INSERT INTO public.orion_bg_exports (project_id, formato) VALUES (p_project, p_formato) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'export_id',v_id,'formato',p_formato,'nota','geracao do arquivo = Edge (DECLARADO)');
END$$;

-- batch: enfileira o mesmo tipo para varios projetos
CREATE OR REPLACE FUNCTION public.batch_background(p_projects bigint[], p_tipo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p bigint; v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'batch_background: acesso negado'; END IF;
  FOREACH p IN ARRAY coalesce(p_projects,ARRAY[]::bigint[]) LOOP
    PERFORM public.bg_enqueue(p, p_tipo, '{}'::jsonb, 6); v_n := v_n+1;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'enfileirados',v_n,'tipo',p_tipo);
END$$;

-- ----------------------------------------------------------------------------
-- 5) INTEGRACAO EDGE — reivindicar e concluir job (a Edge chama estas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bg_next_job(p_worker text DEFAULT 'edge')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'bg_next_job: apenas service_role (Edge)';
  END IF;
  SELECT * INTO j FROM public.orion_bg_jobs WHERE status='pendente'
    ORDER BY prioridade, enfileirado_em FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'job',NULL); END IF;
  UPDATE public.orion_bg_jobs SET status='processando', claimed_by=p_worker, iniciado_em=now(), tentativas=tentativas+1 WHERE job_id=j.job_id;
  RETURN jsonb_build_object('ok',true,'job',jsonb_build_object('job_id',j.job_id,'project_id',j.project_id,'tipo',j.tipo,'params',j.params,
    'imagem_original',(SELECT imagem_original FROM public.orion_bg_projects WHERE project_id=j.project_id)));
END$$;

CREATE OR REPLACE FUNCTION public.bg_complete_job(p_job bigint, p_resultado_url text, p_metrics jsonb DEFAULT '{}'::jsonb, p_erro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record; v_ver int; v_score int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'bg_complete_job: apenas service_role (Edge)';
  END IF;
  SELECT * INTO j FROM public.orion_bg_jobs WHERE job_id=p_job;
  IF NOT FOUND THEN RAISE EXCEPTION 'job % inexistente', p_job; END IF;
  IF p_erro IS NOT NULL THEN
    UPDATE public.orion_bg_jobs SET status='falhou', erro=p_erro, concluido_em=now() WHERE job_id=p_job;
    UPDATE public.orion_bg_projects SET status='falhou', atualizado_em=now() WHERE project_id=j.project_id;
    RETURN jsonb_build_object('ok',false,'job',p_job,'status','falhou');
  END IF;
  -- nova versao
  SELECT coalesce(max(versao),0)+1 INTO v_ver FROM public.orion_bg_versions WHERE project_id=j.project_id;
  INSERT INTO public.orion_bg_versions (project_id, versao, tipo, url, scene_id)
  VALUES (j.project_id, v_ver, j.tipo, p_resultado_url, nullif(j.params->>'scene_id','')::bigint);
  -- metricas
  INSERT INTO public.orion_bg_metrics (project_id, versao, naturalidade, realismo, qualidade, iluminacao, sombras, integracao, profundidade, consistencia)
  VALUES (j.project_id, v_ver, (p_metrics->>'naturalidade')::int, (p_metrics->>'realismo')::int, (p_metrics->>'qualidade')::int,
    (p_metrics->>'iluminacao')::int, (p_metrics->>'sombras')::int, (p_metrics->>'integracao')::int,
    (p_metrics->>'profundidade')::int, (p_metrics->>'consistencia')::int);
  -- score consolidado (media das dimensoes presentes)
  SELECT round(avg(v))::int INTO v_score FROM (VALUES
    ((p_metrics->>'naturalidade')::numeric),((p_metrics->>'realismo')::numeric),((p_metrics->>'iluminacao')::numeric),
    ((p_metrics->>'sombras')::numeric),((p_metrics->>'integracao')::numeric),((p_metrics->>'profundidade')::numeric)) t(v) WHERE v IS NOT NULL;
  v_score := coalesce(v_score,0);
  INSERT INTO public.orion_bg_scores (project_id, background_score, naturalidade, realismo, iluminacao, sombras, integracao, profundidade, atualizado_em)
  VALUES (j.project_id, v_score, (p_metrics->>'naturalidade')::int, (p_metrics->>'realismo')::int, (p_metrics->>'iluminacao')::int,
    (p_metrics->>'sombras')::int, (p_metrics->>'integracao')::int, (p_metrics->>'profundidade')::int, now())
  ON CONFLICT (project_id) DO UPDATE SET background_score=excluded.background_score, naturalidade=excluded.naturalidade,
    realismo=excluded.realismo, iluminacao=excluded.iluminacao, sombras=excluded.sombras, integracao=excluded.integracao,
    profundidade=excluded.profundidade, atualizado_em=now();
  UPDATE public.orion_bg_jobs SET status='concluido', resultado_url=p_resultado_url, concluido_em=now() WHERE job_id=p_job;
  UPDATE public.orion_bg_projects SET status='concluido', resultado_url=p_resultado_url, score=v_score, atualizado_em=now() WHERE project_id=j.project_id;
  -- estatistica de uso do cenario
  IF (j.params->>'scene_id') IS NOT NULL THEN
    UPDATE public.orion_bg_scenes SET usos=usos+1, score_medio=round((score_medio*usos + v_score)/(usos+1.0))::int
     WHERE scene_id=(j.params->>'scene_id')::bigint;
  END IF;
  INSERT INTO public.orion_bg_history (project_id, evento, dados) VALUES (j.project_id, 'job_concluido', jsonb_build_object('job',p_job,'tipo',j.tipo,'versao',v_ver,'score',v_score));
  RETURN jsonb_build_object('ok',true,'job',p_job,'versao',v_ver,'score',v_score);
END$$;

-- recuperacao de versao (restaura uma versao anterior como resultado atual)
CREATE OR REPLACE FUNCTION public.bg_restore_version(p_project bigint, p_versao int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'bg_restore_version: acesso negado'; END IF;
  SELECT url INTO v_url FROM public.orion_bg_versions WHERE project_id=p_project AND versao=p_versao;
  IF NOT FOUND THEN RAISE EXCEPTION 'versao % nao existe', p_versao; END IF;
  UPDATE public.orion_bg_projects SET resultado_url=v_url, atualizado_em=now() WHERE project_id=p_project;
  INSERT INTO public.orion_bg_history (project_id, evento, dados) VALUES (p_project,'versao_restaurada',jsonb_build_object('versao',p_versao));
  RETURN jsonb_build_object('ok',true,'restaurada',p_versao,'url',v_url);
END$$;

-- ----------------------------------------------------------------------------
-- 6) RECOMENDACAO de cenario (REUSA AI-61 Brand Identity)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_background(p_categoria text, p_segmento text DEFAULT NULL, p_brand_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prim text; v_pal jsonb;
BEGIN
  -- harmonizacao com a marca (AI-61): cor primaria -> paleta de fundos
  IF p_brand_id IS NOT NULL THEN
    BEGIN
      SELECT hex INTO v_prim FROM public.orion_brand_colors WHERE brand_id=p_brand_id AND papel='primaria';
      IF v_prim IS NOT NULL THEN v_pal := public.generate_palette(v_prim); END IF;
    EXCEPTION WHEN OTHERS THEN v_pal := NULL; END;
  END IF;
  RETURN jsonb_build_object(
    'categoria', p_categoria,
    'cenarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('scene_id',scene_id,'chave',chave,'nome',nome,'estilo',estilo,'ambiente',ambiente,'premium',premium,'score_medio',score_medio) ORDER BY score_medio DESC, usos DESC),'[]'::jsonb)
                 FROM public.orion_bg_scenes WHERE ativo AND (categoria=p_categoria OR p_categoria IS NULL) AND (segmento=p_segmento OR p_segmento IS NULL OR segmento IS NULL) LIMIT 12),
    'paleta_fundo_marca', v_pal,   -- fundos que harmonizam com a marca (AI-61); null se sem marca
    'nota', 'recomendacao real (catalogo + harmonizacao AI-61); geracao do pixel = Edge');
END$$;

CREATE OR REPLACE FUNCTION public.background_score(p_project bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT jsonb_build_object('project_id',project_id,'background_score',background_score,'naturalidade',naturalidade,
    'realismo',realismo,'iluminacao',iluminacao,'sombras',sombras,'integracao',integracao,'profundidade',profundidade)
    FROM public.orion_bg_scores WHERE project_id=p_project),
    jsonb_build_object('project_id',p_project,'background_score',0,'nota','sem resultado ainda (aguardando Edge)'));
$$;

-- ----------------------------------------------------------------------------
-- 7) TICK (retry de jobs presos + rollup) + selftest
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bg_statistics_rollup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_bg_statistics (dia, projetos, fundos_removidos, fundos_criados, jobs_concluidos, jobs_pendentes, jobs_falhos, tempo_medio_s, score_medio, cenarios, updated_at)
  VALUES (current_date,
    (SELECT count(*) FROM public.orion_bg_projects),
    (SELECT count(*) FROM public.orion_bg_jobs WHERE tipo='remove_bg' AND status='concluido'),
    (SELECT count(*) FROM public.orion_bg_jobs WHERE tipo IN ('replace_bg','generate_bg') AND status='concluido'),
    (SELECT count(*) FROM public.orion_bg_jobs WHERE status='concluido'),
    (SELECT count(*) FROM public.orion_bg_jobs WHERE status IN ('pendente','processando')),
    (SELECT count(*) FROM public.orion_bg_jobs WHERE status='falhou'),
    (SELECT coalesce(round(avg(extract(epoch FROM (concluido_em-iniciado_em))))::int,0) FROM public.orion_bg_jobs WHERE concluido_em IS NOT NULL AND iniciado_em IS NOT NULL),
    (SELECT coalesce(round(avg(background_score))::int,0) FROM public.orion_bg_scores),
    (SELECT count(*) FROM public.orion_bg_scenes WHERE ativo), now())
  ON CONFLICT (dia) DO UPDATE SET projetos=excluded.projetos, fundos_removidos=excluded.fundos_removidos, fundos_criados=excluded.fundos_criados,
    jobs_concluidos=excluded.jobs_concluidos, jobs_pendentes=excluded.jobs_pendentes, jobs_falhos=excluded.jobs_falhos,
    tempo_medio_s=excluded.tempo_medio_s, score_medio=excluded.score_medio, cenarios=excluded.cenarios, updated_at=now();
$$;

CREATE OR REPLACE FUNCTION public.orion_bg_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- re-enfileira jobs presos em processando ha >15min (worker morreu), ate 3 tentativas
  UPDATE public.orion_bg_jobs SET status='pendente', claimed_by=NULL
   WHERE status='processando' AND iniciado_em < now()-interval '15 minutes' AND tentativas < 3;
  UPDATE public.orion_bg_jobs SET status='falhou', erro='timeout (3 tentativas)'
   WHERE status='processando' AND iniciado_em < now()-interval '15 minutes' AND tentativas >= 3;
  PERFORM public.bg_statistics_rollup();
END$$;

CREATE OR REPLACE FUNCTION public.bg_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE casos jsonb := '[]'::jsonb; v_pass int:=0; v_tot int:=0; v_proj bigint; v_job bigint; v_r jsonb;
BEGIN
  -- 1 biblioteca de cenarios seedada
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_bg_scenes)>=20 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','biblioteca_cenarios','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','biblioteca_cenarios','ok',false)); END IF;
  -- 2 recomendacao real por categoria
  v_tot:=v_tot+1; IF jsonb_array_length(public.generate_background('marketplace',NULL,NULL)->'cenarios')>0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','recomendacao','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','recomendacao','ok',false)); END IF;
  -- 3 ciclo de job: cria projeto -> enfileira -> Edge reivindica -> conclui -> score
  v_tot:=v_tot+1;
  v_proj := public.bg_create_project('https://exemplo/selftest.png','manual',NULL,'produto',NULL,'teste');
  PERFORM public.remove_background(v_proj);
  v_r := public.bg_next_job('selftest');
  v_job := (v_r->'job'->>'job_id')::bigint;
  PERFORM public.bg_complete_job(v_job,'https://exemplo/selftest_nobg.png', jsonb_build_object('naturalidade',90,'realismo',88,'iluminacao',85,'sombras',80,'integracao',86,'profundidade',82,'qualidade',88,'consistencia',87));
  IF (SELECT background_score FROM public.orion_bg_scores WHERE project_id=v_proj) BETWEEN 1 AND 100
     AND (SELECT count(*) FROM public.orion_bg_versions WHERE project_id=v_proj)=2  -- v0 original + v1 resultado
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','ciclo_job_edge','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','ciclo_job_edge','ok',false)); END IF;
  -- 4 original preservado (v0 imutavel presente)
  v_tot:=v_tot+1; IF EXISTS (SELECT 1 FROM public.orion_bg_versions WHERE project_id=v_proj AND versao=0 AND tipo='original')
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','original_preservado','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','original_preservado','ok',false)); END IF;
  -- 5 recuperacao de versao
  v_tot:=v_tot+1; IF (public.bg_restore_version(v_proj,0)->>'ok')::bool THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','recuperar_versao','ok',true)); END IF;
  -- 6 RLS ativo
  v_tot:=v_tot+1; IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'orion_bg%' AND NOT rowsecurity)=0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',false)); END IF;
  -- 7 fila: job concluido nao volta pra pendente
  v_tot:=v_tot+1; IF (SELECT status FROM public.orion_bg_jobs WHERE job_id=v_job)='concluido' THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','fila_consistente','ok',true)); END IF;
  -- 8 modelos declarados
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_bg_models)>0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','modelos_declarados','ok',true)); END IF;
  RETURN jsonb_build_object('suite','orion-ai-65-background','total',v_tot,'passou',v_pass,'aprovado',(v_pass=v_tot),'casos',casos);
END$$;

-- ----------------------------------------------------------------------------
-- 8) PAINEIS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bg_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'projetos', (SELECT count(*) FROM public.orion_bg_projects),
    'fundos_removidos', (SELECT count(*) FROM public.orion_bg_jobs WHERE tipo='remove_bg' AND status='concluido'),
    'fundos_criados', (SELECT count(*) FROM public.orion_bg_jobs WHERE tipo IN ('replace_bg','generate_bg') AND status='concluido'),
    'cenarios', (SELECT count(*) FROM public.orion_bg_scenes WHERE ativo),
    'jobs_pendentes', (SELECT count(*) FROM public.orion_bg_jobs WHERE status IN ('pendente','processando')),
    'jobs_concluidos', (SELECT count(*) FROM public.orion_bg_jobs WHERE status='concluido'),
    'jobs_falhos', (SELECT count(*) FROM public.orion_bg_jobs WHERE status='falhou'),
    'tempo_medio_s', (SELECT coalesce(round(avg(extract(epoch FROM (concluido_em-iniciado_em))))::int,0) FROM public.orion_bg_jobs WHERE concluido_em IS NOT NULL),
    'score_medio', (SELECT coalesce(round(avg(background_score))::int,0) FROM public.orion_bg_scores),
    'cenarios_por_categoria', (SELECT coalesce(jsonb_object_agg(categoria,n),'{}'::jsonb) FROM (SELECT categoria, count(*) n FROM public.orion_bg_scenes WHERE ativo GROUP BY 1) x),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.bg_scenes_view(p_categoria text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',scene_id,'chave',chave,'nome',nome,'categoria',categoria,'estilo',estilo,
    'ambiente',ambiente,'premium',premium,'usos',usos,'score_medio',score_medio,'palette',palette_hint) ORDER BY categoria, score_medio DESC),'[]'::jsonb)
  FROM public.orion_bg_scenes WHERE ativo AND (categoria=p_categoria OR p_categoria IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.bg_projects_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',project_id,'ref_tipo',ref_tipo,'categoria',categoria,'status',status,
    'score',score,'original',imagem_original,'resultado',resultado_url,'versoes',(SELECT count(*) FROM public.orion_bg_versions v WHERE v.project_id=p.project_id),'em',criado_em) ORDER BY criado_em DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_bg_projects ORDER BY criado_em DESC LIMIT 40) p;
$$;

CREATE OR REPLACE FUNCTION public.bg_jobs_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_status', (SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT status, count(*) n FROM public.orion_bg_jobs GROUP BY 1) x),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(tipo,n),'{}'::jsonb) FROM (SELECT tipo, count(*) n FROM public.orion_bg_jobs GROUP BY 1) y),
    'recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',job_id,'project',project_id,'tipo',tipo,'status',status,'tentativas',tentativas,'em',enfileirado_em) ORDER BY job_id DESC),'[]'::jsonb)
                 FROM (SELECT * FROM public.orion_bg_jobs ORDER BY job_id DESC LIMIT 20) z));
$$;

CREATE OR REPLACE FUNCTION public.background_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object(
    'overview', public.bg_overview(),
    'cenarios', public.bg_scenes_view(NULL),
    'projetos', public.bg_projects_view(),
    'jobs', public.bg_jobs_view(),
    'estatisticas_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'projetos',projetos,'concluidos',jobs_concluidos,'pendentes',jobs_pendentes,'score',score_medio,'tempo_s',tempo_medio_s) ORDER BY dia DESC),'[]'::jsonb)
                        FROM (SELECT * FROM public.orion_bg_statistics ORDER BY dia DESC LIMIT 7) x),
    'config', jsonb_build_object('cron','orion_bg_tick */5','modelo_ia',(SELECT model_code FROM public.orion_ai_module_prefs WHERE module='background_intelligence'),
      'motor','FILA + CATALOGO + SCORE reais em SQL; PIXEL na Edge',
      'declarado', jsonb_build_array(
        'remove_background/replace/generate/shadows/reflections/perspective = Edge (bibliotecas de imagem/modelos)',
        'export PNG/JPG/WEBP/AVIF/TIFF/PSD = Edge',
        'metricas de qualidade (naturalidade/realismo/...) vem da Edge/modelo',
        'plataforma pre-lancamento: poucas imagens (real)',
        'reusa AI-61 Brand Identity p/ harmonizar fundo com a marca')));
END$$;

-- ----------------------------------------------------------------------------
-- 9) SEED — biblioteca de cenarios + modelos
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_bg_scenes (chave, nome, categoria, estilo, ambiente, premium, palette_hint) VALUES
 ('estudio_branco','Estudio Branco','estudio','minimalista','estudio_branco',false,'{"fundo":"#FFFFFF","sombra":"#E5E7EB"}'),
 ('estudio_preto','Estudio Preto','estudio','premium','estudio_preto',true,'{"fundo":"#0A0A0A","sombra":"#1F1F1F"}'),
 ('gradiente_suave','Gradiente Suave','estudio','moderno','gradiente',false,'{"de":"#F8FAFC","para":"#E2E8F0"}'),
 ('madeira_clara','Mesa de Madeira Clara','madeira','popular','mesa',false,'{"fundo":"#D9B382"}'),
 ('madeira_escura','Madeira Escura','madeira','premium','mesa',true,'{"fundo":"#5B3A21"}'),
 ('marmore_branco','Marmore Branco','marmore','luxo','mesa',true,'{"fundo":"#F5F5F0"}'),
 ('concreto','Concreto','industrial','moderno','parede',false,'{"fundo":"#9CA3AF"}'),
 ('vidro','Vidro/Reflexo','industrial','premium','superficie',true,'{"fundo":"#DBEAFE"}'),
 ('natureza_folhas','Natureza / Folhas','natureza','popular','paisagem',false,'{"fundo":"#3F6212"}'),
 ('praia','Praia','natureza','moderno','paisagem',false,'{"fundo":"#38BDF8"}'),
 ('campo','Campo','natureza','popular','paisagem',false,'{"fundo":"#65A30D"}'),
 ('cidade','Cidade','cidade','moderno','cidade',false,'{"fundo":"#475569"}'),
 ('neon','Neon','neon','tecnologico','cidade',true,'{"fundo":"#0F172A","destaque":"#22D3EE"}'),
 ('tech_gradiente','Tech Gradiente','tecnologia','tecnologico','gradiente',true,'{"de":"#1E293B","para":"#0EA5E9"}'),
 ('corporativo','Escritorio Corporativo','corporativo','corporativo','escritorio',false,'{"fundo":"#E2E8F0"}'),
 ('cozinha_gourmet','Cozinha Gourmet','gourmet','premium','cozinha',true,'{"fundo":"#78350F"}'),
 ('mesa_posta','Mesa Posta','gourmet','moderno','mesa',false,'{"fundo":"#FEF3C7"}'),
 ('infantil','Infantil Colorido','infantil','popular','sala',false,'{"fundo":"#FDE68A"}'),
 ('moda_passarela','Moda / Passarela','moda','premium','estudio_branco',true,'{"fundo":"#FAFAFA"}'),
 ('fitness','Academia','fitness','moderno','loja',false,'{"fundo":"#111827"}'),
 ('pet','Pet','pet','popular','sala',false,'{"fundo":"#BBF7D0"}'),
 ('garagem_auto','Garagem Automotiva','automotivo','moderno','garagem',false,'{"fundo":"#374151"}'),
 ('showroom','Showroom','automotivo','premium','loja',true,'{"fundo":"#F1F5F9"}'),
 ('sala_imovel','Sala (Imovel)','imobiliario','moderno','sala',false,'{"fundo":"#F5F5F4"}'),
 ('fachada','Fachada','imobiliario','popular','paisagem',false,'{"fundo":"#93C5FD"}'),
 ('delivery_mesa','Delivery / Mesa','delivery','popular','mesa',false,'{"fundo":"#FEE2E2"}'),
 ('turismo_paisagem','Turismo / Paisagem','turismo','moderno','paisagem',false,'{"fundo":"#7DD3FC"}'),
 ('marketplace_clean','Marketplace Clean','marketplace','minimalista','estudio_branco',false,'{"fundo":"#FFFFFF"}'),
 ('leilao_destaque','Leilao Destaque','leiloes','premium','gradiente',true,'{"de":"#052E16","para":"#16A34A"}'),
 ('minimalista_neutro','Minimalista Neutro','minimalista','minimalista','estudio_branco',false,'{"fundo":"#F8FAFC"}')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.orion_bg_models (chave, nome, tipo, provedor, descricao) VALUES
 ('bg_removal','Segmentacao/Remocao de Fundo','remocao','edge','modelo de segmentacao (matting) na Edge — DECLARADO'),
 ('scene_gen','Geracao de Cenario','geracao','edge','geracao/compositing de cenario na Edge — DECLARADO'),
 ('quality_score','Avaliador de Qualidade','score','edge','metricas de naturalidade/realismo na Edge — DECLARADO')
ON CONFLICT (chave) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10) GRANTS + hardening (REVOKE EXECUTE FROM PUBLIC/anon nas funcoes de dados)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.bg_create_project(text,text,text,text,bigint,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_enqueue(bigint,text,jsonb,int)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_background(bigint)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_background(bigint,bigint)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_shadows(bigint)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_reflections(bigint)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_perspective(bigint)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_background(bigint,text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_background(bigint[],text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_next_job(text)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.bg_complete_job(bigint,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bg_restore_version(bigint,int)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_background(text,text,bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.background_score(bigint)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_statistics_rollup()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_selftest()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_overview()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_scenes_view(text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_projects_view()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bg_jobs_view()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.background_dashboard()           TO authenticated, service_role;

-- licao AI-61: SECURITY DEFINER de leitura/escrita fura RLS; Postgres concede EXECUTE a PUBLIC por default -> revogar
REVOKE EXECUTE ON FUNCTION
  public.bg_create_project(text,text,text,text,bigint,text), public.bg_enqueue(bigint,text,jsonb,int),
  public.remove_background(bigint), public.replace_background(bigint,bigint), public.apply_shadows(bigint),
  public.apply_reflections(bigint), public.correct_perspective(bigint), public.export_background(bigint,text),
  public.batch_background(bigint[],text), public.bg_next_job(text), public.bg_complete_job(bigint,text,jsonb,text),
  public.bg_restore_version(bigint,int), public.generate_background(text,text,bigint), public.background_score(bigint),
  public.bg_statistics_rollup(), public.bg_selftest(), public.bg_overview(), public.bg_scenes_view(text),
  public.bg_projects_view(), public.bg_jobs_view(), public.background_dashboard()
  FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 11) PROMPT REGISTRY (5 prompts GPT-5-mini)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('bg.scene_analysis',
 'Voce e o ORION Background Intelligence (AI-65). Descreva o diagnostico da imagem (objeto principal, categoria, complexidade do fundo) SO com os dados fornecidos. Nunca invente atributos do produto.',
 'ORION-AI-65 seed');
SELECT public.orion_ai_prompt_set('bg.recommend',
 'Voce e o ORION Background Intelligence (AI-65). Recomende cenarios do catalogo para a categoria/segmento, harmonizando com a marca (paleta AI-61). Explique por que cada cenario combina. So os cenarios reais retornados.',
 'ORION-AI-65 seed');
SELECT public.orion_ai_prompt_set('bg.quality',
 'Voce e o ORION Background Intelligence (AI-65). Explique o Background Score (naturalidade/realismo/iluminacao/sombras/integracao/profundidade) do resultado, citando os numeros reais devolvidos pela Edge.',
 'ORION-AI-65 seed');
SELECT public.orion_ai_prompt_set('bg.fidelity',
 'Voce e o ORION Background Intelligence (AI-65). Garanta que o objeto principal foi preservado e o resultado NAO cria representacao enganosa do produto. Aponte riscos de fidelidade.',
 'ORION-AI-65 seed');
SELECT public.orion_ai_prompt_set('bg.summary',
 'Voce e o ORION Background Intelligence (AI-65). Resuma a operacao: projetos, fundos removidos/criados, cenarios, jobs (pendentes/concluidos/falhos), tempo medio e score medio. Somente numeros fornecidos.',
 'ORION-AI-65 seed');

-- ----------------------------------------------------------------------------
-- 12) MODEL PREF + CRON */5
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('background_intelligence','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_bg_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_bg_tick');
    PERFORM cron.schedule('orion_bg_tick','*/5 * * * *','SELECT public.orion_bg_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_bg_tick');
--   DROP FUNCTION IF EXISTS public.orion_bg_tick, public.background_dashboard, public.bg_jobs_view, public.bg_projects_view,
--     public.bg_scenes_view(text), public.bg_overview, public.bg_selftest, public.bg_statistics_rollup, public.background_score(bigint),
--     public.generate_background(text,text,bigint), public.bg_restore_version(bigint,int), public.bg_complete_job(bigint,text,jsonb,text),
--     public.bg_next_job(text), public.batch_background(bigint[],text), public.export_background(bigint,text), public.correct_perspective(bigint),
--     public.apply_reflections(bigint), public.apply_shadows(bigint), public.replace_background(bigint,bigint), public.remove_background(bigint),
--     public.bg_enqueue(bigint,text,jsonb,int), public.bg_create_project(text,text,text,text,bigint,text), public.bg_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_bg_statistics, public.orion_bg_models, public.orion_bg_history, public.orion_bg_exports,
--     public.orion_bg_scores, public.orion_bg_metrics, public.orion_bg_versions, public.orion_bg_jobs, public.orion_bg_projects, public.orion_bg_scenes;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='background_intelligence';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'bg.%';
-- ============================================================================
