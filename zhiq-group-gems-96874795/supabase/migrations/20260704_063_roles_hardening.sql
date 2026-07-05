-- ============================================================
-- M58.0 · Enterprise Roles + Security Hardening
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_062 (fila de deploy)
-- ============================================================
-- Escopo: (1) estrutura oficial de papéis (9 papéis + "usuário
-- autenticado" = ausência de papel); (2) camada ÚNICA de
-- autorização reutilizável (cio_authorize); (3) endurecimento das
-- 10 RPCs de leitura apontadas na auditoria pré-M58 — corpos
-- re-emitidos com guarda, ASSINATURAS E RETORNOS INTACTOS
-- (funções sql viram plpgsql com o MESMO corpo: semântica igual);
-- (4) higiene: REVOKE de anon nas 3 trigger-functions.
-- NÃO altera: Semantic Layer, contratos, regras de negócio,
-- métricas, datasets. motor_get_flags/motor_flag NÃO são
-- endurecidas (o postadorBridge lê flags de qualquer usuário —
-- por desenho, M53.2).
-- Compatibilidade: service (auth.uid() NULL) e admin passam por
-- todas as guardas => crons, Edge Functions, datasets e painéis
-- admin atuais seguem idênticos.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.cio_alert_tick()') IS NULL THEN
    RAISE EXCEPTION 'M58.0 BLOQUEADA — aplicar 20260704_062 antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. Papéis oficiais + permissões granulares (estrutura)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cio_roles (
  role_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);
INSERT INTO public.cio_roles (role_key, name, description) VALUES
  ('ceo','CEO','Visão executiva completa (leitura)'),
  ('administrador','Administrador','Equivale a is_admin(); tudo'),
  ('operador','Operador','Operação diária: telemetria, saúde, alertas'),
  ('analista','Analista','Leitura de métricas, governança e telemetria'),
  ('auditor','Auditor','Leitura integral p/ auditoria; nunca escreve'),
  ('financeiro','Financeiro','Métricas e painéis financeiros'),
  ('comercial','Comercial','Métricas e painéis comerciais'),
  ('marketing','Marketing','Métricas de marketing/growth'),
  ('suporte','Suporte','Consulta operacional de atendimento')
ON CONFLICT (role_key) DO NOTHING;
-- "Usuário autenticado" = SEM papel: mantém exatamente o acesso
-- atual (flags + métricas self-scoped da própria audiência).

CREATE TABLE IF NOT EXISTS public.cio_user_roles (
  user_id UUID NOT NULL,
  role_key TEXT NOT NULL REFERENCES public.cio_roles(role_key),
  active BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.cio_role_permissions (
  role_key TEXT NOT NULL REFERENCES public.cio_roles(role_key),
  resource TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  PRIMARY KEY (role_key, resource)
);
-- Recursos EM USO hoje + preparados p/ granularização futura
INSERT INTO public.cio_role_permissions (role_key, resource, notes) VALUES
  ('ceo','governanca.leitura',NULL), ('operador','governanca.leitura',NULL),
  ('analista','governanca.leitura',NULL), ('auditor','governanca.leitura',NULL),
  ('ceo','telemetria.leitura',NULL), ('operador','telemetria.leitura',NULL),
  ('analista','telemetria.leitura',NULL), ('auditor','telemetria.leitura',NULL),
  ('ceo','financeiro.leitura','preparado p/ M58.x'), ('financeiro','financeiro.leitura','preparado p/ M58.x'),
  ('auditor','financeiro.leitura','preparado p/ M58.x'),
  ('ceo','comercial.leitura','preparado p/ M58.x'), ('comercial','comercial.leitura','preparado p/ M58.x'),
  ('marketing','comercial.leitura','preparado p/ M58.x'),
  ('ceo','dashboards.acesso','preparado p/ M58.1+'), ('operador','dashboards.acesso','preparado p/ M58.1+'),
  ('analista','dashboards.acesso','preparado p/ M58.1+'), ('auditor','dashboards.acesso','preparado p/ M58.1+'),
  ('financeiro','dashboards.acesso','preparado p/ M58.1+'), ('comercial','dashboards.acesso','preparado p/ M58.1+'),
  ('marketing','dashboards.acesso','preparado p/ M58.1+'), ('suporte','dashboards.acesso','preparado p/ M58.1+')
ON CONFLICT DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cio_roles','cio_user_roles','cio_role_permissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename=t AND policyname=t||'_sel_admin') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
        t||'_sel_admin', t);
    END IF;
  END LOOP;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 2. Camada ÚNICA de autorização (reutilizável em qualquer RPC)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cio_user_roles
    WHERE user_id = auth.uid() AND role_key = p_role AND active);
$$;

CREATE OR REPLACE FUNCTION public.cio_authorize(p_resource TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NULL            -- service/cron/Edge
      OR public.is_admin()             -- admin = tudo (compat integral)
      OR EXISTS (
        SELECT 1 FROM public.cio_user_roles ur
        JOIN public.cio_role_permissions rp
          ON rp.role_key = ur.role_key AND rp.allowed
        WHERE ur.user_id = auth.uid() AND ur.active
          AND rp.resource = p_resource);
$$;

-- Frontend: descobre os próprios papéis/recursos (self-scoped por construção)
CREATE OR REPLACE FUNCTION public.cio_my_roles()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'is_admin', public.is_admin(),
    'roles', COALESCE((SELECT jsonb_agg(role_key ORDER BY role_key)
      FROM public.cio_user_roles WHERE user_id=auth.uid() AND active), '[]'::jsonb),
    'resources', COALESCE((SELECT jsonb_agg(DISTINCT rp.resource ORDER BY rp.resource)
      FROM public.cio_user_roles ur
      JOIN public.cio_role_permissions rp ON rp.role_key=ur.role_key AND rp.allowed
      WHERE ur.user_id=auth.uid() AND ur.active), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.cio_role_grant(p_user UUID, p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  INSERT INTO public.cio_user_roles (user_id, role_key, granted_by)
  VALUES (p_user, p_role, auth.uid())
  ON CONFLICT (user_id, role_key) DO UPDATE SET active=true, granted_by=auth.uid(), granted_at=now();
  RETURN jsonb_build_object('ok', true, 'user', p_user, 'role', p_role);
END $$;

CREATE OR REPLACE FUNCTION public.cio_role_revoke(p_user UUID, p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  UPDATE public.cio_user_roles SET active=false WHERE user_id=p_user AND role_key=p_role;
  RETURN jsonb_build_object('ok', true, 'user', p_user, 'role', p_role, 'revogado', FOUND);
END $$;

REVOKE EXECUTE ON FUNCTION public.cio_has_role(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_has_role(TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cio_authorize(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_authorize(TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cio_my_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_my_roles() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cio_role_grant(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_role_grant(UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cio_role_revoke(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_role_revoke(UUID, TEXT) TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- 3. HARDENING — re-emissão das 10 RPCs de leitura da auditoria.
-- Mesmas assinaturas, mesmos retornos; guarda cio_authorize no topo.
-- ──────────────────────────────────────────────────────────────

-- 3.1 motor_metrics (telemetria.leitura) — sql→plpgsql, corpo idêntico
CREATE OR REPLACE FUNCTION public.motor_metrics(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.cio_authorize('telemetria.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN (
  WITH req AS (
    SELECT * FROM public.publication_requests
    WHERE created_at > now() - make_interval(hours => p_hours)
  )
  SELECT jsonb_build_object(
    'janela_horas',    p_hours,
    'throughput_total',(SELECT COUNT(*) FROM req),
    'por_modo',        (SELECT COALESCE(jsonb_object_agg(mode, n), '{}'::jsonb)
                        FROM (SELECT mode, COUNT(*) n FROM req GROUP BY mode) t),
    'por_status',      (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
                        FROM (SELECT status, COUNT(*) n FROM req GROUP BY status) t),
    'latencia_ms',     jsonb_build_object(
                         'media', (SELECT ROUND(AVG(duration_ms)) FROM req WHERE duration_ms IS NOT NULL),
                         'p95',   (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)
                                   FROM req WHERE duration_ms IS NOT NULL),
                         'max',   (SELECT MAX(duration_ms) FROM req)),
    'sucesso',         (SELECT COUNT(*) FROM req WHERE status IN ('LOTE_GERADO','SHADOW','OBSERVADO')),
    'erros',           (SELECT COUNT(*) FROM req WHERE status = 'ERRO'),
    'rejeicoes_limite',(SELECT COUNT(*) FROM req WHERE status = 'REJEITADO_LIMITE'),
    'fallbacks',       (SELECT COUNT(*) FROM req WHERE status = 'ROTEADO_LEGADO'),
    'lotes_via_motor', (SELECT COUNT(*) FROM req WHERE lot_id IS NOT NULL),
    'fila_lotes_available', (SELECT COUNT(*) FROM public.posting_lots WHERE status='available'),
    'eventos_janela',  (SELECT COUNT(*) FROM public.pub_events
                        WHERE created_at > now() - make_interval(hours => p_hours)),
    'legado_observado',(SELECT COUNT(*) FROM public.pub_events
                        WHERE event_type='LOTE_GERADO_LEGADO'
                          AND created_at > now() - make_interval(hours => p_hours))
  ));
END $function$;

-- 3.2 motor_weights_active (telemetria.leitura)
CREATE OR REPLACE FUNCTION public.motor_weights_active()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.cio_authorize('telemetria.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN (
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.dispatch_weights WHERE active)
    THEN (SELECT jsonb_object_agg(signal_key, weight)
          FROM public.dispatch_weights
          WHERE active
            AND version = (SELECT MAX(version) FROM public.dispatch_weights WHERE active))
    ELSE NULL END);
END $function$;

-- 3.3 cio_data_dictionary (governanca.leitura)
CREATE OR REPLACE FUNCTION public.cio_data_dictionary(p_tag text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN (
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
    AND (p_tag IS NULL OR p_tag = ANY(d.tags)));
END $function$;

-- 3.4 cio_metric_explain (governanca.leitura) — plpgsql, guarda no topo
CREATE OR REPLACE FUNCTION public.cio_metric_explain(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d RECORD; v_calc TEXT; v_filtros TEXT;
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
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
END $function$;

-- 3.5 cio_metric_diff (governanca.leitura)
CREATE OR REPLACE FUNCTION public.cio_metric_diff(p_key text, p_v1 integer, p_v2 integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a RECORD; b RECORD;
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
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
END $function$;

-- 3.6 cio_metric_quality (governanca.leitura)
CREATE OR REPLACE FUNCTION public.cio_metric_quality(p_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN (
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
        WHEN d.status='draft' THEN 0.0
        WHEN d.formula_kind='gauge' THEN 1.0
        WHEN EXISTS (SELECT 1 FROM public.cio_metrics m
          WHERE m.metric = d.formula->>'metric'
            AND m.bucket_ts > now()-interval '1 hour') THEN 1.0
        WHEN EXISTS (SELECT 1 FROM public.cio_metrics m
          WHERE m.metric = d.formula->>'metric'
            AND m.bucket_ts > now()-interval '24 hours') THEN 0.7
        ELSE 0.3 END AS atualidade,
      1.0 AS consistencia
    FROM public.cio_metric_definitions d
    WHERE d.status IN ('active','draft')
      AND (p_key IS NULL OR d.metric_key=p_key)
      AND d.version = (SELECT MAX(version) FROM public.cio_metric_definitions x
                       WHERE x.metric_key=d.metric_key AND x.status=d.status)
  ) s);
END $function$;

-- 3.7 cio_glossary_lookup (governanca.leitura)
CREATE OR REPLACE FUNCTION public.cio_glossary_lookup(p_term text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'term', g.term, 'definition', g.definition,
    'metric_ref', g.metric_ref, 'synonyms', g.synonyms, 'notes', g.notes)), '[]'::jsonb)
  FROM public.cio_glossary g
  WHERE lower(g.term) = lower(p_term)
     OR EXISTS (SELECT 1 FROM unnest(g.synonyms) s WHERE lower(s)=lower(p_term)));
END $function$;

-- 3.8 cio_metric_lineage (governanca.leitura)
CREATE OR REPLACE FUNCTION public.cio_metric_lineage(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d RECORD; v_phys TEXT[]; v_src TEXT;
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  SELECT * INTO d FROM public.cio_metric_definitions
  WHERE metric_key=p_key ORDER BY (status='active') DESC, version DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'metrica_inexistente');
  END IF;

  IF d.formula_kind IN ('counter','avg') THEN
    v_src := COALESCE(d.formula->>'source','(todas)');
    v_phys := CASE v_src
      WHEN 'pub_events' THEN ARRAY['pub_events']
      WHEN 'dispatch_ticks' THEN ARRAY['dispatch_ticks']
      WHEN 'requests_finished' THEN ARRAY['publication_requests']
      ELSE ARRAY['pub_events','dispatch_ticks','publication_requests'] END;
  ELSIF d.formula_kind='ratio' THEN
    v_src := 'multiplas'; v_phys := ARRAY['pub_events'];
  ELSE
    v_src := 'gauge:'||(d.formula->>'fn');
    v_phys := CASE d.formula->>'fn'
      WHEN 'backlog_agendado' THEN ARRAY['publication_requests']
      WHEN 'fila_lotes_available' THEN ARRAY['posting_lots']
      WHEN 'disponibilidade_etl' THEN ARRAY['cio_etl_runs']
      WHEN 'receita_promocoes' THEN ARRAY['promotion_purchases']
      WHEN 'conversoes_outcomes' THEN ARRAY['m51_boost_outcomes']
      WHEN 'execucoes_ia' THEN ARRAY['ai_execution_log']
      WHEN 'publicacoes_do_anunciante' THEN ARRAY['cio_advertiser_daily']
      WHEN 'confirmacoes_do_postador' THEN ARRAY['cio_poster_daily']
      WHEN 'health_geral' THEN ARRAY['cio_health_history']
      ELSE ARRAY['(aguardando_fonte)'] END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'metric', p_key, 'versao', d.version,
    'cadeia', jsonb_build_array(
      jsonb_build_object('nivel',1,'camada','origem_fisica','tabelas', v_phys),
      jsonb_build_object('nivel',2,'camada','etl',
        'responsavel', CASE WHEN d.formula_kind='gauge'
          THEN 'leitura direta pela allowlist (sem ETL)'
          ELSE 'cio_etl_tick → cio_rebuild_window (watermark 5min)' END),
      jsonb_build_object('nivel',3,'camada','rollup',
        'origem_logica', CASE WHEN d.formula_kind='gauge' THEN NULL
          ELSE format('cio_metrics[source=%s, metric=%s]', v_src, d.formula->>'metric') END),
      jsonb_build_object('nivel',4,'camada','semantic',
        'metric', p_key, 'versao', d.version, 'kind', d.formula_kind,
        'versao_origem', (SELECT jsonb_build_object('watermark', w.last_id, 'ts', w.last_ts)
          FROM public.cio_watermarks w WHERE w.source =
            CASE v_src WHEN '(todas)' THEN 'pub_events' ELSE split_part(v_src,':',1) END)),
      jsonb_build_object('nivel',5,'camada','rpc','interface','cio_metric()/cio_metric_bundle()')),
    'dependencias_declaradas', d.dependencies,
    'alias_de', d.alias_of);
END $function$;

-- 3.9 cio_metric_explain_graph (governanca.leitura)
CREATE OR REPLACE FUNCTION public.cio_metric_explain_graph(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN (
  SELECT jsonb_build_object('ok', true, 'metric', p_key,
    'grafo', (public.cio_metric_lineage(p_key))->'cadeia'
      || jsonb_build_array(
        jsonb_build_object('nivel',6,'camada','consumidores',
          'registrados', COALESCE((SELECT jsonb_agg(consumer_kind||':'||consumer_id)
            FROM public.cio_metric_consumers WHERE metric_key=p_key), '[]'::jsonb),
          'observados_30d', COALESCE((SELECT jsonb_agg(DISTINCT consumer)
            FROM public.cio_metric_access_log
            WHERE metric_key=p_key AND consumer IS NOT NULL
              AND created_at > now()-interval '30 days'), '[]'::jsonb)),
        jsonb_build_object('nivel',7,'camada','usuarios',
          'distintos_30d', (SELECT COUNT(DISTINCT caller)
            FROM public.cio_metric_access_log
            WHERE metric_key=p_key AND created_at > now()-interval '30 days')))));
END $function$;

-- 3.10 cio_metric_sla_status (governanca.leitura)
CREATE OR REPLACE FUNCTION public.cio_metric_sla_status(p_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', s.metric_key,
    'sla_max_ms', s.max_ms_expected,
    'freq_esperada_min', s.freq_expected_min,
    'tempo_medio_ms', a.avg_ms,
    'disponibilidade', a.disp,
    'ultima_atualizacao_fonte', f.last_bucket,
    'atraso_atual_min', CASE WHEN f.last_bucket IS NULL THEN NULL
      ELSE ROUND(EXTRACT(EPOCH FROM now()-f.last_bucket)/60.0,1) END,
    'status_operacional', CASE
      WHEN d.formula_kind='gauge' THEN 'ok'
      WHEN d.status='draft' THEN 'draft'
      WHEN f.last_bucket IS NULL THEN 'sem_dados'
      WHEN now()-f.last_bucket > make_interval(mins => s.freq_expected_min*3) THEN 'atrasado'
      WHEN COALESCE(a.avg_ms,0) > s.max_ms_expected THEN 'degradado'
      ELSE 'ok' END
  ) ORDER BY s.metric_key), '[]'::jsonb)
  FROM public.cio_metric_sla s
  JOIN public.cio_metric_definitions d
    ON d.metric_key=s.metric_key
   AND d.version=(SELECT MAX(version) FROM public.cio_metric_definitions x
                  WHERE x.metric_key=s.metric_key)
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(duration_ms),1) avg_ms,
      ROUND(1.0 - COUNT(*) FILTER (WHERE error IS NOT NULL)::numeric/NULLIF(COUNT(*),0), 4) disp
    FROM public.cio_metric_access_log
    WHERE metric_key=s.metric_key AND created_at > now()-interval '24 hours') a ON true
  LEFT JOIN LATERAL (
    SELECT MAX(bucket_ts) last_bucket FROM public.cio_metrics m
    WHERE m.metric = d.formula->>'metric' AND m.grain='5m') f ON true
  WHERE p_key IS NULL OR s.metric_key=p_key);
END $function$;


-- ──────────────────────────────────────────────────────────────
-- 4. Higiene: trigger-functions sem EXECUTE herdado (cosmético)
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.cio_defs_immutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.motor_observe_lot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cio_timeline_track() FROM PUBLIC, anon, authenticated;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE v JSONB; f TEXT; v_sig TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM public.cio_roles) < 9 THEN
    RAISE EXCEPTION 'M58.0 ERRO: 9 papéis esperados'; END IF;
  IF (SELECT COUNT(*) FROM public.cio_role_permissions) < 22 THEN
    RAISE EXCEPTION 'M58.0 ERRO: permissões-semente ausentes'; END IF;
  IF NOT public.cio_authorize('governanca.leitura') THEN
    RAISE EXCEPTION 'M58.0 ERRO: contexto service deveria autorizar'; END IF;
  -- assinaturas intactas (contratos públicos)
  FOR f, v_sig IN SELECT * FROM (VALUES
    ('motor_metrics', 'p_hours integer DEFAULT 24'),
    ('cio_data_dictionary', 'p_tag text DEFAULT NULL::text'),
    ('cio_metric_sla_status', 'p_key text DEFAULT NULL::text'),
    ('cio_metric_diff', 'p_key text, p_v1 integer, p_v2 integer')) t LOOP
    IF (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=f) IS DISTINCT FROM
       regexp_replace(v_sig, ' DEFAULT [^,]+', '', 'g') THEN
      RAISE EXCEPTION 'M58.0 ERRO: assinatura de % mudou', f; END IF;
  END LOOP;
  v := public.cio_semantic_validate();
  IF NOT (v->>'aprovado')::boolean THEN
    RAISE EXCEPTION 'M58.0 ERRO: catálogo reprovado: %', v->'issues'; END IF;
  -- caminho interno intacto: health usa quality internamente (contexto service)
  IF (public.cio_health_compute('banco')->0->>'score')::numeric IS NULL THEN
    RAISE EXCEPTION 'M58.0 ERRO: caminho interno health quebrou'; END IF;

  RAISE NOTICE 'M58.0 ✓ 9 papéis + permissões granulares (estrutura) + cio_authorize (camada única) — OK';
  RAISE NOTICE 'M58.0 ✓ 10 RPCs endurecidas (assinaturas INTACTAS; service/admin passam; menor privilégio p/ demais) — OK';
  RAISE NOTICE 'M58.0 ✓ cio_my_roles/role_grant/role_revoke p/ frontend e administração — OK';
  RAISE NOTICE 'M58.0 ✓ higiene: trigger-functions sem EXECUTE herdado — OK';
END $$;
