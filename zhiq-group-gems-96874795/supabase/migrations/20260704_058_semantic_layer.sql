-- ============================================================
-- M55.3 · Sprint 2 do Programa CIO — SEMANTIC LAYER Oficial
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_057 (fila de deploy)
-- ============================================================
-- Regras congeladas (CIO v1.0 §5-B):
--   • ÚNICA fonte oficial de métricas; painéis/IA/alertas jamais
--     calculam nada — consomem cio_metric()/cio_metric_bundle()
--   • Rollups com leitura REVOGADA de authenticated (o caminho
--     técnico obriga o institucional)
--   • Fórmulas DECLARATIVAS (JSONB) — nunca SQL livre; gauges são
--     funções internas em allowlist
--   • Versionamento: mudar fórmula = NOVA versão; a antiga continua
--     consultável; definição publicada é IMUTÁVEL (trigger)
--   • Métrica sem fonte de dados ainda = status 'draft' documentado,
--     retorna meta 'aguardando_fonte' — NUNCA número inventado
--   • Quality Validation Layer: valida, registra, NUNCA altera dados
--     e NUNCA bloqueia o ETL
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.cio_metrics') IS NULL THEN
    RAISE EXCEPTION 'M55.3 BLOQUEADA — aplicar 20260704_057 antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. Catálogo Oficial de Métricas (versionado, auditável)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cio_metric_definitions (
  metric_key   TEXT NOT NULL,
  version      INT  NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,            -- nenhuma métrica sem documentação
  category     TEXT NOT NULL,            -- operacao|financeiro|qualidade|ia|engajamento
  unit         TEXT NOT NULL,            -- count|ms|brl|ratio|pct
  audience     TEXT[] NOT NULL DEFAULT '{admin}',  -- ceo|admin|operador|anunciante|postador
  scope_dim    TEXT,                     -- p/ audiências self-scoped: 'advertiser_user_id'|'poster_user_id'
  formula_kind TEXT NOT NULL CHECK (formula_kind IN ('counter','avg','ratio','gauge')),
  formula      JSONB NOT NULL,           -- declarativa (ver kinds abaixo)
  dependencies TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated','draft')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  PRIMARY KEY (metric_key, version)
);
-- Exatamente UMA versão ativa por métrica
CREATE UNIQUE INDEX IF NOT EXISTS uq_ciodef_active
  ON public.cio_metric_definitions (metric_key) WHERE status = 'active';

-- Imutabilidade da definição publicada: fórmula/nome/kind não mudam;
-- apenas status (active→deprecated) e notes podem ser atualizados.
CREATE OR REPLACE FUNCTION public.cio_defs_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.formula IS DISTINCT FROM OLD.formula
     OR NEW.formula_kind IS DISTINCT FROM OLD.formula_kind
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.unit IS DISTINCT FROM OLD.unit
     OR NEW.scope_dim IS DISTINCT FROM OLD.scope_dim THEN
    RAISE EXCEPTION 'Definição de métrica é imutável — publique uma NOVA versão (CIO §5-B)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ciodef_immutable ON public.cio_metric_definitions;
CREATE TRIGGER trg_ciodef_immutable
  BEFORE UPDATE ON public.cio_metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.cio_defs_immutable();

ALTER TABLE public.cio_metric_definitions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='cio_metric_definitions' AND policyname='ciodef_sel_auth') THEN
    -- catálogo é público interno: qualquer autenticado pode LER definições
    CREATE POLICY "ciodef_sel_auth" ON public.cio_metric_definitions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Observabilidade de consumo (§9)
CREATE TABLE IF NOT EXISTS public.cio_metric_access_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_key TEXT NOT NULL, version INT, audience TEXT,
  caller UUID, grain TEXT, duration_ms INT,
  cached BOOLEAN NOT NULL DEFAULT false,
  error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cio_metric_access_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='cio_metric_access_log' AND policyname='cioacc_sel_admin') THEN
    CREATE POLICY "cioacc_sel_admin" ON public.cio_metric_access_log
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 2. ENFORCEMENT institucional: rollups deixam de ser legíveis
-- por authenticated — até admin consome via RPCs (CIO §5-B)
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cio_metrics_sel_admin"          ON public.cio_metrics;
DROP POLICY IF EXISTS "cio_city_daily_sel_admin"       ON public.cio_city_daily;
DROP POLICY IF EXISTS "cio_advertiser_daily_sel_admin" ON public.cio_advertiser_daily;
DROP POLICY IF EXISTS "cio_target_daily_sel_admin"     ON public.cio_target_daily;
DROP POLICY IF EXISTS "cio_poster_daily_sel_admin"     ON public.cio_poster_daily;
-- (cio_etl_runs / cio_watermarks / quality permanecem legíveis a admin p/ debug)


-- ──────────────────────────────────────────────────────────────
-- 3. Avaliador de fórmulas declarativas (interno)
-- kinds:
--  counter: {"source":?, "metric":"eventos", "dims":{"event_type":["A","B"], "origin":"x"}}
--  avg:     idem counter → value/count
--  ratio:   {"num":{<counter>}, "den":{<counter>}}
--  gauge:   {"fn":"nome_em_allowlist"}  — funções internas fixas
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_eval_counter(
  p_f JSONB, p_grain TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_extra_dims JSONB
) RETURNS TABLE (bucket_ts TIMESTAMPTZ, value NUMERIC, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.bucket_ts, SUM(m.value), SUM(m.count)
  FROM public.cio_metrics m
  WHERE m.grain = p_grain
    AND m.bucket_ts >= p_from AND m.bucket_ts < p_to
    AND m.metric = (p_f->>'metric')
    AND (p_f->>'source' IS NULL OR m.source = p_f->>'source')
    AND (NOT (p_f ? 'dims') OR (
      SELECT bool_and(
        CASE WHEN jsonb_typeof(d.value)='array'
             THEN m.dims->>d.key IN (SELECT jsonb_array_elements_text(d.value))
             ELSE m.dims->>d.key = d.value#>>'{}' END)
      FROM jsonb_each(p_f->'dims') d))
    AND (p_extra_dims = '{}'::jsonb OR m.dims @> p_extra_dims)
  GROUP BY m.bucket_ts
$$;
REVOKE EXECUTE ON FUNCTION public.cio_eval_counter(JSONB,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_eval_counter(JSONB,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB)
  TO service_role;

-- Gauges (allowlist fechada — CIO pode LER operacionais; consumidores não)
CREATE OR REPLACE FUNCTION public.cio_eval_gauge(
  p_fn TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_scope JSONB
) RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v NUMERIC;
BEGIN
  CASE p_fn
    WHEN 'backlog_agendado' THEN
      SELECT COUNT(*) INTO v FROM public.publication_requests WHERE status='AGENDADO';
    WHEN 'fila_lotes_available' THEN
      SELECT COUNT(*) INTO v FROM public.posting_lots WHERE status='available';
    WHEN 'disponibilidade_etl' THEN
      SELECT CASE WHEN COUNT(*)=0 THEN NULL
             ELSE ROUND(1.0 - COUNT(*) FILTER (WHERE error IS NOT NULL)::numeric/COUNT(*), 4) END
      INTO v FROM public.cio_etl_runs WHERE started_at >= p_from AND started_at < p_to;
    WHEN 'receita_promocoes' THEN
      SELECT COALESCE(SUM(amount_brl),0) INTO v FROM public.promotion_purchases
      WHERE status='paid' AND created_at >= p_from AND created_at < p_to;
    WHEN 'conversoes_outcomes' THEN
      SELECT COALESCE(SUM(sales_after),0) INTO v FROM public.m51_boost_outcomes
      WHERE boosted_at >= p_from AND boosted_at < p_to;
    WHEN 'execucoes_ia' THEN
      IF to_regclass('public.ai_execution_log') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.ai_execution_log WHERE created_at >= $1 AND created_at < $2'
        INTO v USING p_from, p_to;
      END IF;
    WHEN 'publicacoes_do_anunciante' THEN
      SELECT COALESCE(SUM(lots),0)+COALESCE(SUM(daily_used),0) INTO v
      FROM public.cio_advertiser_daily
      WHERE advertiser_user_id = (p_scope->>'advertiser_user_id')::uuid
        AND day >= (p_from AT TIME ZONE 'America/Sao_Paulo')::date
        AND day <= (p_to   AT TIME ZONE 'America/Sao_Paulo')::date;
    WHEN 'confirmacoes_do_postador' THEN
      SELECT COALESCE(SUM(confirmations),0) INTO v
      FROM public.cio_poster_daily
      WHERE poster_user_id = (p_scope->>'poster_user_id')::uuid
        AND day >= (p_from AT TIME ZONE 'America/Sao_Paulo')::date
        AND day <= (p_to   AT TIME ZONE 'America/Sao_Paulo')::date;
    ELSE
      RAISE EXCEPTION 'gauge_desconhecida: %', p_fn;
  END CASE;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_eval_gauge(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_eval_gauge(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB)
  TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 4. cio_metric() — a interface oficial
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_metric(
  p_key     TEXT,
  p_grain   TEXT        DEFAULT '1d',
  p_from    TIMESTAMPTZ DEFAULT now() - interval '7 days',
  p_to      TIMESTAMPTZ DEFAULT now(),
  p_dims    JSONB       DEFAULT '{}'::jsonb,
  p_version INT         DEFAULT NULL      -- NULL = versão ativa; nº = versão histórica
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
  -- Resolve definição: versão explícita > ativa > mais recente (permite
  -- que drafts documentados resolvam e retornem 'aguardando_fonte')
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

  -- Audiência: service/admin = total; usuário comum = só métricas da sua
  -- audiência, SEMPRE self-scoped pela scope_dim
  IF v_caller IS NULL OR public.is_admin() THEN
    v_aud := CASE WHEN v_caller IS NULL THEN 'service' ELSE 'admin' END;
  ELSE
    IF NOT (v_def.audience && ARRAY['anunciante','postador']) THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
    END IF;
    IF v_def.scope_dim IS NULL THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
    END IF;
    v_aud := CASE WHEN 'anunciante' = ANY(v_def.audience) THEN 'anunciante' ELSE 'postador' END;
    v_scope := jsonb_build_object(v_def.scope_dim, v_caller);
    p_dims := p_dims || v_scope;   -- escopo FORÇADO ao próprio usuário
  END IF;

  -- draft: catálogo documentado, fonte ainda inexistente — nunca inventa número
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

  -- Observabilidade (§9) — nunca falha a consulta por causa do log
  BEGIN
    INSERT INTO public.cio_metric_access_log
      (metric_key, version, audience, caller, grain, duration_ms, cached)
    VALUES (p_key, v_def.version, v_aud, v_caller, p_grain,
            (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int, false);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.cio_metric(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,INT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_metric(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,INT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cio_metric_bundle(
  p_keys  TEXT[],
  p_grain TEXT        DEFAULT '1d',
  p_from  TIMESTAMPTZ DEFAULT now() - interval '7 days',
  p_to    TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB := '{}'::jsonb; k TEXT;
BEGIN
  FOREACH k IN ARRAY p_keys LOOP
    v := v || jsonb_build_object(k, public.cio_metric(k, p_grain, p_from, p_to));
  END LOOP;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_metric_bundle(TEXT[],TEXT,TIMESTAMPTZ,TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cio_metric_bundle(TEXT[],TEXT,TIMESTAMPTZ,TIMESTAMPTZ)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- 5. Seed do Catálogo Oficial v1 (toda métrica DOCUMENTADA)
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.cio_metric_definitions
  (metric_key, version, name, description, category, unit, audience, scope_dim,
   formula_kind, formula, dependencies, status, notes) VALUES
  ('publicacoes',1,'Publicações Confirmadas','Publicações confirmadas na plataforma (evento PUBLICACAO_CONFIRMADA).','operacao','count','{ceo,admin,operador}',NULL,
   'counter','{"source":"pub_events","metric":"eventos","dims":{"event_type":"PUBLICACAO_CONFIRMADA"}}','{}','active',NULL),
  ('lotes',1,'Lotes Gerados','Lotes criados pela admissão do Motor + caminho legado observado.','operacao','count','{ceo,admin,operador}',NULL,
   'counter','{"source":"pub_events","metric":"eventos","dims":{"event_type":["LOTE_GERADO","LOTE_GERADO_LEGADO"]}}','{}','active',NULL),
  ('publication_requests',1,'Solicitações de Publicação','Intenções recebidas na porta única do Motor.','operacao','count','{ceo,admin,operador}',NULL,
   'counter','{"source":"pub_events","metric":"eventos","dims":{"event_type":"SOLICITACAO_RECEBIDA"}}','{}','active',NULL),
  ('throughput',1,'Throughput de Publicação','Publicações confirmadas por unidade de tempo (série pelo grão consultado).','operacao','count','{ceo,admin,operador}',NULL,
   'counter','{"source":"pub_events","metric":"eventos","dims":{"event_type":"PUBLICACAO_CONFIRMADA"}}','{}','active','Mesma base de publicacoes; leitura em série temporal.'),
  ('backlog',1,'Backlog da Fila','Requests AGENDADOS aguardando dispatch neste instante (gauge).','operacao','count','{admin,operador}',NULL,
   'gauge','{"fn":"backlog_agendado"}','{}','active',NULL),
  ('fila_lotes',1,'Lotes Disponíveis','Lotes available aguardando canal/postador (gauge).','operacao','count','{admin,operador}',NULL,
   'gauge','{"fn":"fila_lotes_available"}','{}','active',NULL),
  ('tempo_medio_request',1,'Tempo Médio de Request','Duração média (ms) do processamento de requests finalizados.','qualidade','ms','{admin,operador}',NULL,
   'avg','{"source":"requests_finished","metric":"request_duration_ms"}','{}','active',NULL),
  ('tempo_medio_tick',1,'Tempo Médio do Tick','Duração média (ms) dos ticks do dispatcher.','qualidade','ms','{admin,operador}',NULL,
   'avg','{"source":"dispatch_ticks","metric":"tick_duration_ms"}','{}','active',NULL),
  ('disponibilidade',1,'Disponibilidade do ETL','1 − taxa de runs com erro na janela consultada.','qualidade','ratio','{ceo,admin}',NULL,
   'gauge','{"fn":"disponibilidade_etl"}','{}','active',NULL),
  ('retries',1,'Falhas de Dispatch','Eventos DISPATCH_FAILED (inclui finais) na janela.','qualidade','count','{admin,operador}',NULL,
   'counter','{"source":"pub_events","metric":"eventos","dims":{"event_type":"DISPATCH_FAILED"}}','{}','active',NULL),
  ('receita',1,'Receita de Promoções','Somatório de promotion_purchases pagas na janela (BRL).','financeiro','brl','{ceo,admin}',NULL,
   'gauge','{"fn":"receita_promocoes"}','{}','active',NULL),
  ('conversao',1,'Conversões Atribuídas','Vendas atribuídas a impulsionamentos (m51_boost_outcomes).','engajamento','count','{ceo,admin}',NULL,
   'gauge','{"fn":"conversoes_outcomes"}','{}','active','Fica mais rico quando M57/tracking populam outcomes.'),
  ('custo_ia',1,'Execuções de IA','Execuções do Motor de IA na janela (custo monetário chega com M56-B).','ia','count','{admin}',NULL,
   'gauge','{"fn":"execucoes_ia"}','{"M56-B"}','active',NULL),
  ('eficiencia',1,'Eficiência de Confirmação','Confirmações ÷ atribuições de lote (razão de funil do canal humano).','operacao','ratio','{ceo,admin,operador}',NULL,
   'ratio','{"num":{"source":"pub_events","metric":"eventos","dims":{"event_type":"PUBLICACAO_CONFIRMADA"}},"den":{"source":"pub_events","metric":"eventos","dims":{"event_type":"LOTE_ATRIBUIDO"}}}','{}','active',NULL),
  ('minhas_publicacoes',1,'Minhas Publicações','Publicações/lotes do próprio anunciante (self-scoped).','engajamento','count','{anunciante}','advertiser_user_id',
   'gauge','{"fn":"publicacoes_do_anunciante"}','{}','active',NULL),
  ('minhas_confirmacoes',1,'Minhas Confirmações','Confirmações do próprio postador (self-scoped).','operacao','count','{postador}','poster_user_id',
   'gauge','{"fn":"confirmacoes_do_postador"}','{}','active',NULL),
  -- DRAFTS documentados: fonte ainda não existe — jamais inventar número
  ('ctr',1,'CTR','Cliques ÷ visualizações de publicações. AGUARDA tracking real de cliques/views.','engajamento','ratio','{ceo,admin,anunciante}','advertiser_user_id',
   'gauge','{"fn":"_draft"}','{"tracking_real_M60","M54.7_canal"}','draft','Sem fonte de cliques hoje; estimativas são proibidas pela doutrina.'),
  ('roi',1,'ROI','Retorno sobre investimento por campanha. AGUARDA atribuição receita×campanha.','financeiro','ratio','{ceo,admin,anunciante}','advertiser_user_id',
   'gauge','{"fn":"_draft"}','{"tracking_real_M60","M56-A"}','draft',NULL),
  ('health',1,'Health de Componentes','Saúde dos componentes de sistema. Implementada no Health Center.','qualidade','ratio','{ceo,admin,operador}',NULL,
   'gauge','{"fn":"_draft"}','{"M55.4"}','draft','Fórmula congelada no CIO §4; materializa no M55.4.')
ON CONFLICT (metric_key, version) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 6. QUALITY VALIDATION LAYER (valida · registra · nunca altera ·
-- nunca bloqueia)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cio_quality_issues (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_key   TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('P2','P3','P4')),
  entity_id   TEXT,
  details     JSONB,
  window_from TIMESTAMPTZ,
  window_to   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cio_quality_issues ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='cio_quality_issues' AND policyname='cioq_sel_admin') THEN
    CREATE POLICY "cioq_sel_admin" ON public.cio_quality_issues
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cio_quality_scan(
  p_from TIMESTAMPTZ, p_to TIMESTAMPTZ
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT := 0; v_c INT;
BEGIN
  -- Q1: request DESPACHADO sem lot_id (inconsistência de commit)
  INSERT INTO public.cio_quality_issues (check_key, severity, entity_id, details, window_from, window_to)
  SELECT 'request_despachado_sem_lote','P2', r.id::text,
         jsonb_build_object('status',r.status), p_from, p_to
  FROM public.publication_requests r
  WHERE r.status='DESPACHADO' AND r.lot_id IS NULL
    AND r.updated_at >= p_from AND r.updated_at <= p_to
    AND NOT EXISTS (SELECT 1 FROM public.cio_quality_issues q
      WHERE q.check_key='request_despachado_sem_lote' AND q.entity_id=r.id::text
        AND q.created_at > now() - interval '24 hours');
  GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;

  -- Q2: duração negativa/ausente em request finalizado
  INSERT INTO public.cio_quality_issues (check_key, severity, entity_id, details, window_from, window_to)
  SELECT 'duracao_invalida','P3', r.id::text,
         jsonb_build_object('duration_ms', r.duration_ms), p_from, p_to
  FROM public.publication_requests r
  WHERE r.finished_at IS NOT NULL AND (r.duration_ms IS NULL OR r.duration_ms < 0)
    AND r.finished_at >= p_from AND r.finished_at <= p_to
    AND NOT EXISTS (SELECT 1 FROM public.cio_quality_issues q
      WHERE q.check_key='duracao_invalida' AND q.entity_id=r.id::text
        AND q.created_at > now() - interval '24 hours');
  GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;

  -- Q3: delivery CONFIRMADA sem confirmed_at
  INSERT INTO public.cio_quality_issues (check_key, severity, entity_id, details, window_from, window_to)
  SELECT 'confirmada_sem_timestamp','P3', d.id::text, '{}'::jsonb, p_from, p_to
  FROM public.publication_deliveries d
  WHERE d.status='CONFIRMADA' AND d.confirmed_at IS NULL
    AND d.created_at >= p_from AND d.created_at <= p_to
    AND NOT EXISTS (SELECT 1 FROM public.cio_quality_issues q
      WHERE q.check_key='confirmada_sem_timestamp' AND q.entity_id=d.id::text
        AND q.created_at > now() - interval '24 hours');
  GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;

  -- Q4: divergência rollup×bruto (amostra: contagem de eventos da janela)
  IF (SELECT COUNT(*) FROM public.pub_events
      WHERE created_at >= p_from AND created_at < p_to)
     <> COALESCE((SELECT SUM(value)::bigint FROM public.cio_metrics
      WHERE source='pub_events' AND grain='5m' AND metric='eventos'
        AND bucket_ts >= to_timestamp(floor(EXTRACT(EPOCH FROM p_from)/300)*300)
        AND bucket_ts <  to_timestamp(ceil (EXTRACT(EPOCH FROM p_to)/300)*300)), 0)
  THEN
    INSERT INTO public.cio_quality_issues (check_key, severity, details, window_from, window_to)
    VALUES ('divergencia_rollup_bruto','P2',
      jsonb_build_object('acao','rodar cio_reprocess na janela'), p_from, p_to);
    v_n := v_n + 1;
  END IF;

  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_quality_scan(TIMESTAMPTZ,TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_quality_scan(TIMESTAMPTZ,TIMESTAMPTZ) TO service_role;

-- Acopla ao tick do ETL SEM poder bloqueá-lo (exceção engolida)
CREATE OR REPLACE FUNCTION public.cio_etl_tick()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t0        TIMESTAMPTZ := clock_timestamp();
  v_run       UUID := gen_random_uuid();
  v_mode      TEXT := public.motor_flag('cio.mode');
  v_batch     BIGINT := COALESCE(public.motor_flag('cio.batch_events')::bigint, 50000);
  v_lock      BOOLEAN;
  v_wm_ev     BIGINT;
  v_new_max   BIGINT;
  v_n_events  BIGINT := 0;
  v_skipped   BIGINT := 0;
  v_from      TIMESTAMPTZ;
  v_to        TIMESTAMPTZ := now();
  v_buckets   INT := 0;
  v_quality   INT := 0;
  v_wm_before JSONB;
  v_wm_after  JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;
  IF v_mode <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'mode', COALESCE(v_mode,'off'));
  END IF;
  v_lock := pg_try_advisory_xact_lock(hashtext('cio_etl_tick'));
  IF NOT v_lock THEN
    RETURN jsonb_build_object('ok', true, 'mode', v_mode, 'lock', false);
  END IF;

  SELECT jsonb_object_agg(source, jsonb_build_object('id', last_id, 'ts', last_ts))
  INTO v_wm_before FROM public.cio_watermarks;
  SELECT last_id INTO v_wm_ev FROM public.cio_watermarks WHERE source='pub_events';

  SELECT COUNT(*), MAX(id), MIN(created_at)
  INTO v_n_events, v_new_max, v_from
  FROM (SELECT id, created_at FROM public.pub_events
        WHERE id > COALESCE(v_wm_ev,0) ORDER BY id LIMIT v_batch) nw;
  SELECT GREATEST(v_n_events - v_batch, 0) INTO v_skipped;

  BEGIN
    IF v_n_events > 0 THEN
      v_buckets := public.cio_rebuild_window(v_from, v_to);
      UPDATE public.cio_watermarks SET last_id = v_new_max, updated_at = now()
      WHERE source='pub_events';
    ELSE
      v_from := v_to - interval '10 minutes';
      v_buckets := public.cio_rebuild_window(v_from, v_to);
    END IF;
    UPDATE public.cio_watermarks SET last_ts = v_to, updated_at = now()
    WHERE source IN ('dispatch_ticks','requests_finished');
  EXCEPTION WHEN OTHERS THEN
    SELECT jsonb_object_agg(source, jsonb_build_object('id', last_id, 'ts', last_ts))
    INTO v_wm_after FROM public.cio_watermarks;
    INSERT INTO public.cio_etl_runs
      (id, mode, started_at, finished_at, duration_ms, events_processed,
       events_skipped, wm_before, wm_after, error)
    VALUES (v_run, v_mode, v_t0, clock_timestamp(),
      (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int,
      0, v_skipped, v_wm_before, v_wm_after, SQLERRM);
    RETURN jsonb_build_object('ok', false, 'run_id', v_run, 'error', SQLERRM);
  END;

  -- QUALITY VALIDATION LAYER — registra ocorrências; JAMAIS bloqueia
  BEGIN
    v_quality := public.cio_quality_scan(v_from, v_to);
  EXCEPTION WHEN OTHERS THEN
    v_quality := -1;  -- falha do scan é registrada no retorno, nunca no fluxo
  END;

  SELECT jsonb_object_agg(source, jsonb_build_object('id', last_id, 'ts', last_ts))
  INTO v_wm_after FROM public.cio_watermarks;

  INSERT INTO public.cio_etl_runs
    (id, mode, started_at, finished_at, duration_ms, events_processed,
     events_skipped, buckets_rebuilt, wm_before, wm_after)
  VALUES (v_run, v_mode, v_t0, clock_timestamp(),
    (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int,
    v_n_events, v_skipped, v_buckets, v_wm_before, v_wm_after);

  RETURN jsonb_build_object('ok', true, 'run_id', v_run, 'mode', v_mode, 'lock', true,
    'events_processed', v_n_events, 'events_skipped', v_skipped,
    'buckets_rebuilt', v_buckets, 'quality_issues', v_quality,
    'duration_ms', (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int);
END $$;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.cio_metric_definitions WHERE status='active';
  IF v_n < 14 THEN
    RAISE EXCEPTION 'M55.3 ERRO: catálogo ativo incompleto (%)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.cio_metric_definitions
             WHERE description IS NULL OR description='') THEN
    RAISE EXCEPTION 'M55.3 ERRO: métrica sem documentação'; END IF;
  IF to_regprocedure('public.cio_metric(text,text,timestamptz,timestamptz,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'M55.3 ERRO: cio_metric ausente'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='cio_metrics' AND cmd='SELECT') THEN
    RAISE EXCEPTION 'M55.3 ERRO: rollups ainda legíveis por authenticated'; END IF;

  RAISE NOTICE 'M55.3 ✓ Semantic Layer: catálogo (% ativas + drafts documentados) + versionamento imutável — OK', v_n;
  RAISE NOTICE 'M55.3 ✓ cio_metric/cio_metric_bundle únicos pontos de consumo; rollups revogados de authenticated — OK';
  RAISE NOTICE 'M55.3 ✓ Quality Validation Layer acoplada ao ETL (registra, nunca bloqueia) — OK';
END $$;
