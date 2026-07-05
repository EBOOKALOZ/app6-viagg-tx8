-- ============================================================
-- M55.3A · Auditoria e Fortalecimento da Semantic Layer
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_058 (fila de deploy)
-- ============================================================
-- 100% ADITIVA: nenhuma funcionalidade removida; chamadas existentes
-- a cio_metric/cio_metric_bundle permanecem válidas (assinaturas
-- ganham parâmetro opcional p_consumer com DEFAULT).
-- Entrega: Data Dictionary · Dependency Graph · Semantic Validator ·
-- Execution Profiler · Heat Map · Version Compare · Explain API ·
-- Quality Score · Tags · Business Glossary · IA-Ready · Security.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.cio_metric_definitions') IS NULL THEN
    RAISE EXCEPTION 'M55.3A BLOQUEADA — aplicar 20260704_058 antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. Metadados novos no catálogo (imutabilidade de fórmula intacta:
-- o trigger da 058 só bloqueia formula/name/unit/scope — owner,
-- tags e alias_of são METADADOS evolutivos)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.cio_metric_definitions
  ADD COLUMN IF NOT EXISTS owner    TEXT NOT NULL DEFAULT 'plataforma',
  ADD COLUMN IF NOT EXISTS tags     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alias_of TEXT;   -- alias declarado (mesma fórmula por design)

-- Vocabulário fechado de tags (Semantic Tags)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_ciodef_tags') THEN
    ALTER TABLE public.cio_metric_definitions ADD CONSTRAINT chk_ciodef_tags
      CHECK (tags <@ ARRAY['financeiro','marketing','ia','matching','corridas',
        'marketplace','fretes','entregas','usuarios','operacao','seguranca','growth']::text[]);
  END IF;
END $$;

-- Seed de tags/alias no catálogo v1 (achados da auditoria)
UPDATE public.cio_metric_definitions SET tags='{operacao}'
 WHERE metric_key IN ('publicacoes','lotes','publication_requests','backlog',
   'fila_lotes','eficiencia','minhas_confirmacoes') AND tags='{}';
UPDATE public.cio_metric_definitions SET tags='{operacao,growth}'
 WHERE metric_key='throughput' AND tags='{}';
UPDATE public.cio_metric_definitions SET alias_of='publicacoes'
 WHERE metric_key='throughput';   -- alias DECLARADO (auditoria: era duplicata implícita)
UPDATE public.cio_metric_definitions SET tags='{financeiro}'
 WHERE metric_key IN ('receita','roi') AND tags='{}';
UPDATE public.cio_metric_definitions SET tags='{marketing,growth}'
 WHERE metric_key IN ('ctr','conversao','minhas_publicacoes') AND tags='{}';
UPDATE public.cio_metric_definitions SET tags='{ia}'
 WHERE metric_key='custo_ia' AND tags='{}';
UPDATE public.cio_metric_definitions SET tags='{operacao,seguranca}'
 WHERE metric_key IN ('disponibilidade','retries','tempo_medio_request',
   'tempo_medio_tick','health') AND tags='{}';

-- Consumo identificado por consumidor (Dependency Graph + Profiler)
ALTER TABLE public.cio_metric_access_log
  ADD COLUMN IF NOT EXISTS consumer TEXT;

CREATE TABLE IF NOT EXISTS public.cio_metric_consumers (
  metric_key    TEXT NOT NULL,
  consumer_kind TEXT NOT NULL CHECK (consumer_kind IN
    ('dashboard','ia','report','api','widget','module')),
  consumer_id   TEXT NOT NULL,
  notes         TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_key, consumer_kind, consumer_id)
);
ALTER TABLE public.cio_metric_consumers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='cio_metric_consumers' AND policyname='ciocons_sel_auth') THEN
    CREATE POLICY "ciocons_sel_auth" ON public.cio_metric_consumers
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 2. cio_metric / cio_metric_bundle ganham p_consumer (compatível:
-- DEFAULT NULL; assinatura antiga substituída SEM overload ambígua)
-- ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.cio_metric(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,INT);
DROP FUNCTION IF EXISTS public.cio_metric_bundle(TEXT[],TEXT,TIMESTAMPTZ,TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.cio_metric(
  p_key      TEXT,
  p_grain    TEXT        DEFAULT '1d',
  p_from     TIMESTAMPTZ DEFAULT now() - interval '7 days',
  p_to       TIMESTAMPTZ DEFAULT now(),
  p_dims     JSONB       DEFAULT '{}'::jsonb,
  p_version  INT         DEFAULT NULL,
  p_consumer TEXT        DEFAULT NULL     -- identificação do consumidor (dashboard/ia/api)
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t0     TIMESTAMPTZ := clock_timestamp();
  v_def    RECORD;
  v_caller UUID := auth.uid();
  v_aud    TEXT;
  v_scope  JSONB := '{}'::jsonb;
  v_series JSONB;
  v_total  NUMERIC;
  v_num    NUMERIC; v_den NUMERIC;
  v_result JSONB;
BEGIN
  IF p_version IS NULL THEN
    SELECT * INTO v_def FROM public.cio_metric_definitions
    WHERE metric_key = p_key AND status = 'active';
    IF NOT FOUND THEN
      SELECT * INTO v_def FROM public.cio_metric_definitions
      WHERE metric_key = p_key ORDER BY version DESC LIMIT 1;
    END IF;
  ELSE
    SELECT * INTO v_def FROM public.cio_metric_definitions
    WHERE metric_key = p_key AND version = p_version;
  END IF;
  IF v_def IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'metrica_inexistente', 'key', p_key);
  END IF;

  IF v_caller IS NULL OR public.is_admin() THEN
    v_aud := CASE WHEN v_caller IS NULL THEN 'service' ELSE 'admin' END;
  ELSE
    IF NOT (v_def.audience && ARRAY['anunciante','postador']) OR v_def.scope_dim IS NULL THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
    END IF;
    v_aud := CASE WHEN 'anunciante' = ANY(v_def.audience) THEN 'anunciante' ELSE 'postador' END;
    v_scope := jsonb_build_object(v_def.scope_dim, v_caller);
    p_dims := p_dims || v_scope;
  END IF;

  IF v_def.status = 'draft' THEN
    v_result := jsonb_build_object('ok', true, 'key', p_key, 'version', v_def.version,
      'name', v_def.name, 'unit', v_def.unit, 'status', 'draft',
      'value', NULL, 'series', '[]'::jsonb,
      'meta', jsonb_build_object('aguardando_fonte', v_def.dependencies, 'notes', v_def.notes));
  ELSE
    CASE v_def.formula_kind
      WHEN 'counter' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket_ts, 'value', value)
                 ORDER BY bucket_ts), '[]'::jsonb), COALESCE(SUM(value),0)
        INTO v_series, v_total
        FROM public.cio_eval_counter(v_def.formula, p_grain, p_from, p_to, p_dims);
      WHEN 'avg' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket_ts,
                 'value', ROUND(value/NULLIF(cnt,0),2)) ORDER BY bucket_ts), '[]'::jsonb),
               ROUND(SUM(value)/NULLIF(SUM(cnt),0),2)
        INTO v_series, v_total
        FROM public.cio_eval_counter(v_def.formula, p_grain, p_from, p_to, p_dims);
      WHEN 'ratio' THEN
        SELECT COALESCE(SUM(value),0) INTO v_num
        FROM public.cio_eval_counter(v_def.formula->'num', p_grain, p_from, p_to, p_dims);
        SELECT COALESCE(SUM(value),0) INTO v_den
        FROM public.cio_eval_counter(v_def.formula->'den', p_grain, p_from, p_to, p_dims);
        v_total := ROUND(v_num/NULLIF(v_den,0), 4);
        v_series := '[]'::jsonb;
      WHEN 'gauge' THEN
        v_total := public.cio_eval_gauge(v_def.formula->>'fn', p_from, p_to,
                     COALESCE(v_scope, '{}'::jsonb));
        v_series := '[]'::jsonb;
    END CASE;

    v_result := jsonb_build_object('ok', true, 'key', p_key, 'version', v_def.version,
      'name', v_def.name, 'unit', v_def.unit, 'status', v_def.status,
      'value', v_total, 'series', v_series,
      'meta', jsonb_build_object('grain', p_grain, 'from', p_from, 'to', p_to,
                                 'audience', v_aud));
  END IF;

  BEGIN
    INSERT INTO public.cio_metric_access_log
      (metric_key, version, audience, caller, grain, duration_ms, cached, consumer)
    VALUES (p_key, v_def.version, v_aud, v_caller, p_grain,
            (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int, false, p_consumer);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_result;
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_metric(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,INT,TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_metric(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,INT,TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cio_metric_bundle(
  p_keys     TEXT[],
  p_grain    TEXT        DEFAULT '1d',
  p_from     TIMESTAMPTZ DEFAULT now() - interval '7 days',
  p_to       TIMESTAMPTZ DEFAULT now(),
  p_consumer TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB := '{}'::jsonb; k TEXT;
BEGIN
  FOREACH k IN ARRAY p_keys LOOP
    v := v || jsonb_build_object(k,
      public.cio_metric(k, p_grain, p_from, p_to, '{}'::jsonb, NULL, p_consumer));
  END LOOP;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_metric_bundle(TEXT[],TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_metric_bundle(TEXT[],TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- 3. DATA DICTIONARY + EXPLAIN + VERSION COMPARE + AI CONTEXT
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_data_dictionary(p_tag TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nome_tecnico', d.metric_key,
    'nome_amigavel', d.name,
    'categoria', d.category,
    'tags', d.tags,
    'unidade', d.unit,
    'formula', d.formula,
    'formula_kind', d.formula_kind,
    'dependencias', d.dependencies,
    'responsavel', d.owner,
    'alias_de', d.alias_of,
    'audiencia', d.audience,
    'versao', d.version,
    'status', d.status,
    'ultima_atualizacao', d.created_at,
    'observacoes', d.notes
  ) ORDER BY d.metric_key), '[]'::jsonb)
  FROM public.cio_metric_definitions d
  WHERE (d.status = 'active' OR d.status = 'draft')
    AND (p_tag IS NULL OR p_tag = ANY(d.tags));
$$;
REVOKE EXECUTE ON FUNCTION public.cio_data_dictionary(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_data_dictionary(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cio_metric_explain(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d RECORD; v_calc TEXT; v_filtros TEXT;
BEGIN
  SELECT * INTO d FROM public.cio_metric_definitions
  WHERE metric_key=p_key AND status IN ('active','draft')
  ORDER BY (status='active') DESC, version DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'metrica_inexistente');
  END IF;

  v_calc := CASE d.formula_kind
    WHEN 'counter' THEN format('Soma das ocorrências da métrica-base "%s" nos rollups agregados (fonte: %s).',
                        d.formula->>'metric', COALESCE(d.formula->>'source','todas as fontes'))
    WHEN 'avg'     THEN format('Média = soma(valores) ÷ soma(contagens) da métrica-base "%s" nos rollups.',
                        d.formula->>'metric')
    WHEN 'ratio'   THEN 'Razão entre dois contadores oficiais (numerador ÷ denominador), com proteção contra divisão por zero (retorna nulo).'
    WHEN 'gauge'   THEN format('Medição pontual calculada pela função interna "%s" da allowlist do CIO.',
                        d.formula->>'fn') END;
  v_filtros := CASE WHEN d.formula ? 'dims'
    THEN 'Filtros fixos da fórmula: ' || (d.formula->'dims')::text
    ELSE 'Sem filtros fixos; dimensões adicionais podem ser passadas na consulta.' END;

  RETURN jsonb_build_object('ok', true,
    'metrica', d.metric_key, 'nome', d.name, 'versao', d.version, 'status', d.status,
    'origem', CASE d.formula_kind WHEN 'gauge'
       THEN 'Estado atual/OPERACIONAL lido pela camada (consumidores nunca acessam direto).'
       ELSE 'Rollups do CIO (cio_metrics), alimentados pelo ETL incremental a cada 5 minutos.' END,
    'calculo', v_calc,
    'filtros', v_filtros,
    'escopo', CASE WHEN d.scope_dim IS NOT NULL
       THEN format('Self-scoped: usuários comuns só veem o próprio recorte (%s).', d.scope_dim)
       ELSE 'Escopo global; acesso restrito às audiências: '||array_to_string(d.audience, ', ')||'.' END,
    'limitacoes', CASE WHEN d.status='draft'
       THEN 'DRAFT: fonte de dados ainda não existe ('||array_to_string(d.dependencies,', ')||'). Retorna nulo até lá — números estimados são proibidos.'
       ELSE COALESCE(d.notes,'Nenhuma limitação registrada.') END,
    'dependencias', d.dependencies,
    'alias_de', d.alias_of,
    'observacoes', COALESCE(d.notes,''),
    'frescor', 'Dados históricos com atraso máximo de 1 ciclo de ETL (5 min); gauges são instantâneos.');
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_metric_explain(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_metric_explain(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cio_metric_diff(p_key TEXT, p_v1 INT, p_v2 INT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; b RECORD;
BEGIN
  SELECT * INTO a FROM public.cio_metric_definitions WHERE metric_key=p_key AND version=p_v1;
  SELECT * INTO b FROM public.cio_metric_definitions WHERE metric_key=p_key AND version=p_v2;
  IF a IS NULL OR b IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'versao_inexistente');
  END IF;
  RETURN jsonb_build_object('ok', true, 'metrica', p_key,
    'v1', jsonb_build_object('versao', a.version, 'formula', a.formula,
          'kind', a.formula_kind, 'unit', a.unit, 'status', a.status, 'publicada_em', a.created_at),
    'v2', jsonb_build_object('versao', b.version, 'formula', b.formula,
          'kind', b.formula_kind, 'unit', b.unit, 'status', b.status, 'publicada_em', b.created_at),
    'diferencas', jsonb_build_object(
      'formula_mudou', a.formula IS DISTINCT FROM b.formula,
      'kind_mudou',    a.formula_kind IS DISTINCT FROM b.formula_kind,
      'unidade_mudou', a.unit IS DISTINCT FROM b.unit),
    'compatibilidade', CASE
      WHEN a.formula_kind = b.formula_kind AND a.unit = b.unit THEN 'compativel'
      WHEN a.unit <> b.unit THEN 'INCOMPATIVEL: unidade mudou'
      ELSE 'atencao: tipo de formula mudou' END,
    'impacto', jsonb_build_object(
      'consumidores_registrados', COALESCE((SELECT jsonb_agg(consumer_kind||':'||consumer_id)
        FROM public.cio_metric_consumers WHERE metric_key=p_key), '[]'::jsonb),
      'consultas_30d', (SELECT COUNT(*) FROM public.cio_metric_access_log
        WHERE metric_key=p_key AND created_at > now()-interval '30 days')));
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_metric_diff(TEXT,INT,INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_metric_diff(TEXT,INT,INT) TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- 4. SEMANTIC VALIDATOR
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_semantic_validate()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_issues JSONB := '[]'::jsonb;
  v_allow  TEXT[] := ARRAY['backlog_agendado','fila_lotes_available','disponibilidade_etl',
    'receita_promocoes','conversoes_outcomes','execucoes_ia',
    'publicacoes_do_anunciante','confirmacoes_do_postador','_draft'];
  r RECORD;
BEGIN
  -- JSONB inválido por kind
  FOR r IN SELECT * FROM public.cio_metric_definitions WHERE status IN ('active','draft') LOOP
    IF r.formula_kind IN ('counter','avg') AND NOT (r.formula ? 'metric') THEN
      v_issues := v_issues || jsonb_build_object('check','formula_invalida','metric',r.metric_key,
        'detalhe','counter/avg sem campo metric');
    ELSIF r.formula_kind='ratio' AND NOT (r.formula ? 'num' AND r.formula ? 'den') THEN
      v_issues := v_issues || jsonb_build_object('check','formula_invalida','metric',r.metric_key,
        'detalhe','ratio sem num/den');
    ELSIF r.formula_kind='gauge' AND NOT ((r.formula->>'fn') = ANY(v_allow)) THEN
      v_issues := v_issues || jsonb_build_object('check','gauge_fora_da_allowlist',
        'metric',r.metric_key,'fn',r.formula->>'fn');
    END IF;
  END LOOP;

  -- Fórmulas duplicadas entre ativas SEM alias declarado
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','formula_duplicada_sem_alias',
      'metrics', ARRAY[a.metric_key, b.metric_key]))
    FROM public.cio_metric_definitions a
    JOIN public.cio_metric_definitions b
      ON a.formula = b.formula AND a.formula_kind = b.formula_kind
     AND a.metric_key < b.metric_key
     AND a.status='active' AND b.status='active'
     AND a.alias_of IS DISTINCT FROM b.metric_key
     AND b.alias_of IS DISTINCT FROM a.metric_key), '[]'::jsonb);

  -- Alias conflitante (aponta p/ métrica inexistente ou draft)
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','alias_conflitante',
      'metric', d.metric_key, 'alias_of', d.alias_of))
    FROM public.cio_metric_definitions d
    WHERE d.alias_of IS NOT NULL AND d.status='active'
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_definitions t
        WHERE t.metric_key = d.alias_of AND t.status='active')), '[]'::jsonb);

  -- Dependências que PARECEM métricas (snake_case) mas não existem
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','dependencia_inexistente',
      'metric', d.metric_key, 'dep', dep))
    FROM public.cio_metric_definitions d, unnest(d.dependencies) dep
    WHERE d.status IN ('active','draft')
      AND dep ~ '^[a-z][a-z0-9_]*$'          -- convenção: chave de métrica
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_definitions t
        WHERE t.metric_key = dep)), '[]'::jsonb);

  -- Ciclos de dependência (métrica→métrica via dependencies)
  v_issues := v_issues || COALESCE((
    WITH RECURSIVE g AS (
      SELECT d.metric_key AS origem, dep AS alvo, ARRAY[d.metric_key] AS caminho
      FROM public.cio_metric_definitions d, unnest(d.dependencies) dep
      WHERE EXISTS (SELECT 1 FROM public.cio_metric_definitions t WHERE t.metric_key=dep)
      UNION ALL
      SELECT g.origem, dep, g.caminho || d.metric_key
      FROM g
      JOIN public.cio_metric_definitions d ON d.metric_key = g.alvo
      CROSS JOIN unnest(d.dependencies) dep
      WHERE NOT d.metric_key = ANY(g.caminho)
        AND array_length(g.caminho,1) < 10
    )
    SELECT jsonb_agg(DISTINCT jsonb_build_object('check','ciclo_dependencia','metric',origem))
    FROM g WHERE alvo = origem), '[]'::jsonb);

  -- Métricas órfãs: sem consumidor registrado E sem consulta em 30d
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','metrica_orfa','severidade','info',
      'metric', d.metric_key))
    FROM public.cio_metric_definitions d
    WHERE d.status='active'
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_consumers c WHERE c.metric_key=d.metric_key)
      AND NOT EXISTS (SELECT 1 FROM public.cio_metric_access_log l
        WHERE l.metric_key=d.metric_key AND l.created_at > now()-interval '30 days')), '[]'::jsonb);

  -- Versões inconsistentes (>1 ativa — teoricamente impossível pelo índice)
  v_issues := v_issues || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('check','multiplas_ativas','metric',metric_key))
    FROM (SELECT metric_key FROM public.cio_metric_definitions WHERE status='active'
          GROUP BY metric_key HAVING COUNT(*)>1) x), '[]'::jsonb);

  RETURN jsonb_build_object('ok', true,
    'issues', v_issues,
    'total', jsonb_array_length(v_issues),
    'aprovado', NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) i
      WHERE i->>'check' NOT IN ('metrica_orfa')));   -- órfã é informativa
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_semantic_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_semantic_validate() TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 5. EXECUTION PROFILER + HEAT MAP + QUALITY SCORE
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_metric_profile(
  p_key TEXT DEFAULT NULL, p_hours INT DEFAULT 168
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', s.metric_key,
    'chamadas', s.calls,
    'tempo_medio_ms', s.avg_ms, 'tempo_max_ms', s.max_ms, 'tempo_min_ms', s.min_ms,
    'usuarios_distintos', s.users,
    'por_audiencia', s.auds,
    'por_consumidor', s.consumers
  ) ORDER BY s.calls DESC), '[]'::jsonb)
  FROM (
    SELECT l.metric_key, COUNT(*) calls,
      ROUND(AVG(l.duration_ms),2) avg_ms, MAX(l.duration_ms) max_ms, MIN(l.duration_ms) min_ms,
      COUNT(DISTINCT l.caller) users,
      (SELECT jsonb_object_agg(a, n) FROM (
        SELECT audience a, COUNT(*) n FROM public.cio_metric_access_log
        WHERE metric_key=l.metric_key AND created_at > now()-make_interval(hours=>p_hours)
        GROUP BY audience) t) auds,
      (SELECT COALESCE(jsonb_object_agg(c, n),'{}'::jsonb) FROM (
        SELECT COALESCE(consumer,'(nao identificado)') c, COUNT(*) n
        FROM public.cio_metric_access_log
        WHERE metric_key=l.metric_key AND created_at > now()-make_interval(hours=>p_hours)
        GROUP BY consumer) t) consumers
    FROM public.cio_metric_access_log l
    WHERE l.created_at > now()-make_interval(hours=>p_hours)
      AND (p_key IS NULL OR l.metric_key = p_key)
    GROUP BY l.metric_key
  ) s;
$$;
REVOKE EXECUTE ON FUNCTION public.cio_metric_profile(TEXT,INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_metric_profile(TEXT,INT) TO service_role;

CREATE OR REPLACE FUNCTION public.cio_metric_heatmap(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH uso AS (
    SELECT d.metric_key, d.status, d.alias_of,
      COALESCE(l.calls,0) AS calls, l.last_used, COALESCE(l.avg_ms,0) AS avg_ms
    FROM public.cio_metric_definitions d
    LEFT JOIN (
      SELECT metric_key, COUNT(*) calls, MAX(created_at) last_used, AVG(duration_ms) avg_ms
      FROM public.cio_metric_access_log
      WHERE created_at > now()-make_interval(days=>p_days)
      GROUP BY metric_key) l USING (metric_key)
    WHERE d.status IN ('active','deprecated','draft')
      AND d.version = (SELECT MAX(version) FROM public.cio_metric_definitions x
                       WHERE x.metric_key=d.metric_key)
  ),
  q AS (SELECT percentile_disc(0.75) WITHIN GROUP (ORDER BY calls) AS p75 FROM uso WHERE calls>0)
  SELECT jsonb_build_object(
    'janela_dias', p_days,
    'mais_utilizadas', COALESCE((SELECT jsonb_agg(jsonb_build_object('metric',metric_key,'calls',calls) ORDER BY calls DESC)
       FROM uso, q WHERE calls >= GREATEST(q.p75,1)), '[]'::jsonb),
    'nunca_utilizadas', COALESCE((SELECT jsonb_agg(metric_key ORDER BY metric_key)
       FROM uso WHERE calls = 0 AND status='active'), '[]'::jsonb),
    'obsoletas', COALESCE((SELECT jsonb_agg(metric_key)
       FROM uso WHERE status='deprecated'), '[]'::jsonb),
    'candidatas_remocao', COALESCE((SELECT jsonb_agg(metric_key)
       FROM uso WHERE status='deprecated' AND calls=0), '[]'::jsonb),
    'candidatas_cache', COALESCE((SELECT jsonb_agg(jsonb_build_object('metric',metric_key,
       'calls',calls,'avg_ms',ROUND(avg_ms::numeric,1)))
       FROM uso WHERE calls > 100 AND avg_ms > 50), '[]'::jsonb));
$$;
REVOKE EXECUTE ON FUNCTION public.cio_metric_heatmap(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_metric_heatmap(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.cio_metric_quality(p_key TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', s.metric_key,
    'confianca', s.confianca, 'completude', s.completude,
    'atualidade', s.atualidade, 'consistencia', s.consistencia,
    'score', ROUND((s.confianca+s.completude+s.atualidade+s.consistencia)/4.0, 2)
  ) ORDER BY s.metric_key), '[]'::jsonb)
  FROM (
    SELECT d.metric_key,
      CASE d.status WHEN 'active' THEN 1.0 WHEN 'deprecated' THEN 0.5 ELSE 0.3 END AS confianca,
      ROUND(((d.description<>'')::int + (d.notes IS NOT NULL)::int
        + (array_length(d.tags,1) IS NOT NULL)::int + (d.owner<>'')::int)/4.0, 2) AS completude,
      CASE
        WHEN d.status='draft' THEN 0.0        -- draft ANTES de gauge (ctr é gauge-draft)
        WHEN d.formula_kind='gauge' THEN 1.0
        WHEN EXISTS (SELECT 1 FROM public.cio_metrics m
          WHERE m.metric = d.formula->>'metric'
            AND m.bucket_ts > now()-interval '1 hour') THEN 1.0
        WHEN EXISTS (SELECT 1 FROM public.cio_metrics m
          WHERE m.metric = d.formula->>'metric'
            AND m.bucket_ts > now()-interval '24 hours') THEN 0.7
        ELSE 0.3 END AS atualidade,
      1.0 AS consistencia   -- penalizada quando o validator acusar (M55.4+ liga os dois)
    FROM public.cio_metric_definitions d
    WHERE d.status IN ('active','draft')
      AND (p_key IS NULL OR d.metric_key=p_key)
      AND d.version = (SELECT MAX(version) FROM public.cio_metric_definitions x
                       WHERE x.metric_key=d.metric_key AND x.status=d.status)
  ) s;
$$;
REVOKE EXECUTE ON FUNCTION public.cio_metric_quality(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_metric_quality(TEXT) TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- 6. BUSINESS GLOSSARY + AI CONTEXT (IA-Ready)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cio_glossary (
  term       TEXT PRIMARY KEY,
  definition TEXT NOT NULL,
  metric_ref TEXT,            -- métrica oficial correspondente (se houver)
  synonyms   TEXT[] NOT NULL DEFAULT '{}',
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cio_glossary ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='cio_glossary' AND policyname='ciogl_sel_auth') THEN
    CREATE POLICY "ciogl_sel_auth" ON public.cio_glossary
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.cio_glossary (term, definition, metric_ref, synonyms) VALUES
  ('CTR','Click-Through Rate: cliques ÷ impressões de uma publicação. Métrica oficial em draft até existir tracking real de cliques — estimativas são proibidas.','ctr','{taxa de cliques}'),
  ('ROI','Retorno sobre Investimento: retorno gerado ÷ valor investido na campanha. Draft até existir atribuição receita×campanha.','roi','{retorno}'),
  ('Conversão','Venda/ação atribuída a um impulsionamento, registrada em m51_boost_outcomes.','conversao','{venda atribuida}'),
  ('Impressão','Exibição de uma publicação a um usuário. Sem fonte de dados até tracking real (M60).',NULL,'{view,visualizacao}'),
  ('Clique','Interação de clique numa publicação. Sem fonte até tracking real (M60).',NULL,'{click}'),
  ('Alcance','Usuários únicos expostos a publicações num período. Sem fonte até tracking real.',NULL,'{reach}'),
  ('Receita','Somatório de vendas de promoções pagas (promotion_purchases status paid), em BRL.','receita','{faturamento,revenue}'),
  ('Ticket Médio','Receita ÷ número de pedidos pagos no período.',NULL,'{average ticket}'),
  ('CAC','Custo de Aquisição de Cliente: investimento em aquisição ÷ novos clientes. Sem fonte estruturada ainda.',NULL,'{custo de aquisicao}'),
  ('LTV','Lifetime Value: valor total gerado por um cliente ao longo do relacionamento. Sem fonte estruturada ainda.',NULL,'{lifetime value}'),
  ('Health','Saúde de um componente/alvo, entre 0 e 1. Componentes de sistema: fórmula do CIO §4 (M55.4). Grupos/postadores: fórmula do M54 §A5.','health','{saude}'),
  ('Score','Pontuação determinística usada em decisões (M51 para produtos; match_score para alvos). Nunca calculada por LLM no caminho quente.',NULL,'{pontuacao}'),
  ('Throughput','Publicações confirmadas por unidade de tempo. Alias oficial de "publicacoes" em série temporal.','throughput','{vazao}'),
  ('Backlog','Solicitações AGENDADAS aguardando despacho neste instante.','backlog','{fila}')
ON CONFLICT (term) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cio_glossary_lookup(p_term TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'term', g.term, 'definition', g.definition,
    'metric_ref', g.metric_ref, 'synonyms', g.synonyms, 'notes', g.notes)), '[]'::jsonb)
  FROM public.cio_glossary g
  WHERE lower(g.term) = lower(p_term)
     OR EXISTS (SELECT 1 FROM unnest(g.synonyms) s WHERE lower(s)=lower(p_term));
$$;
REVOKE EXECUTE ON FUNCTION public.cio_glossary_lookup(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_glossary_lookup(TEXT) TO authenticated, service_role;

-- Pacote completo para IAs (narrativa/analítica/executiva/alertas/
-- recomendações/diagnóstico): definição+explicação+qualidade+glossário.
-- VALORES continuam vindo exclusivamente de cio_metric().
CREATE OR REPLACE FUNCTION public.cio_ai_context(p_keys TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB := '[]'::jsonb; k TEXT; v_keys TEXT[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;
  v_keys := COALESCE(p_keys, ARRAY(
    SELECT DISTINCT metric_key FROM public.cio_metric_definitions
    WHERE status IN ('active','draft')));
  FOREACH k IN ARRAY v_keys LOOP
    v := v || jsonb_build_object(
      'metric', k,
      'explain', public.cio_metric_explain(k),
      'quality', public.cio_metric_quality(k));
  END LOOP;
  RETURN jsonb_build_object(
    'regras', jsonb_build_object(
      'fonte_unica', 'Valores de métricas SOMENTE via cio_metric()/cio_metric_bundle(). Recalcular fora da Semantic Layer é proibido e tecnicamente impossível (rollups invisíveis).',
      'drafts', 'Métricas draft retornam nulo — nunca estime valores.',
      'glossario', 'Termos de negócio devem usar as definições oficiais do glossário.'),
    'glossario', (SELECT jsonb_agg(jsonb_build_object('term',term,'definition',definition,
                    'metric_ref',metric_ref)) FROM public.cio_glossary),
    'metricas', v);
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_ai_context(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_ai_context(TEXT[]) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE v JSONB;
BEGIN
  IF to_regprocedure('public.cio_data_dictionary(text)') IS NULL
     OR to_regprocedure('public.cio_semantic_validate()') IS NULL
     OR to_regprocedure('public.cio_metric_heatmap(integer)') IS NULL
     OR to_regprocedure('public.cio_metric_explain(text)') IS NULL
     OR to_regprocedure('public.cio_ai_context(text[])') IS NULL THEN
    RAISE EXCEPTION 'M55.3A ERRO: RPCs de hardening ausentes'; END IF;
  IF (SELECT COUNT(*) FROM public.cio_glossary) < 14 THEN
    RAISE EXCEPTION 'M55.3A ERRO: glossário não seedado'; END IF;
  -- O próprio validator precisa aprovar o catálogo (auditoria contínua)
  v := public.cio_semantic_validate();
  IF NOT (v->>'aprovado')::boolean THEN
    RAISE EXCEPTION 'M55.3A ERRO: catálogo reprovado pelo validator: %', v->'issues'; END IF;

  RAISE NOTICE 'M55.3A ✓ Dictionary + Dependency Graph + Validator (catálogo APROVADO) + Profiler + Heatmap — OK';
  RAISE NOTICE 'M55.3A ✓ Version Compare + Explain + Quality Score + Tags + Glossário(14) + AI Context — OK';
  RAISE NOTICE 'M55.3A ✓ 100%% aditiva: assinaturas compatíveis (p_consumer DEFAULT NULL); alias throughput declarado — OK';
END $$;
