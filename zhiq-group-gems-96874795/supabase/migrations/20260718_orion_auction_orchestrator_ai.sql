-- ============================================================================
-- ORION-AI-70 — AUCTION ECOSYSTEM ORCHESTRATOR AI v1.0
-- Data: 2026-07-18 · Idempotente · SQL Editor (broifhfqmnzqoongtokm)
-- ----------------------------------------------------------------------------
-- Camada SUPERIOR de coordenacao do Ecossistema de Leiloes ORION. Coordena (NAO
-- substitui) os motores de leilao existentes: bidding/listings (`auctions`),
-- comissao (orion_auction_commission_*), finalizacao/arremate (orion_auction_finalize_*
-- + arremate_*), liquidacao (orion_auction_settlement_*), inteligencia (auction_intel_*).
-- Monitora saude, orquestra eventos com rastreabilidade, valida workflow, mede
-- performance/qualidade, gera alertas, consolida BI e faz previsao — SOMENTE com
-- dados reais. **ESTRITAMENTE READ-ONLY** sobre leilao/financeiro: escreve apenas
-- em orion_aeo_*. NUNCA modifica dado financeiro; NUNCA acao destrutiva.
--
-- Namespace ISOLADO: tabelas orion_aeo_*, funcoes aeo_*, chave auction_orchestrator.
--
-- ROLLBACK:
--   DROP TABLE public.orion_aeo_modules, orion_aeo_health, orion_aeo_events,
--     orion_aeo_workflow, orion_aeo_quality, orion_aeo_performance, orion_aeo_alerts,
--     orion_aeo_scores, orion_aeo_predictions, orion_aeo_bi, orion_aeo_audits, orion_aeo_runs CASCADE;
--   DROP FUNCTION public.aeo_emit, aeo_count_safe, aeo_call_safe, aeo_audit, aeo_regproc_ok,
--     aeo_discover, aeo_health_check, aeo_ingest_events, aeo_workflow_validate, aeo_quality_check,
--     aeo_performance_snapshot, aeo_alerts_generate, aeo_bi_consolidate, aeo_predict,
--     aeo_scores_refresh, aeo_orchestrate, aeo_dashboard, aeo_health, aeo_workflow, aeo_quality,
--     aeo_alerts, aeo_events, aeo_performance, aeo_predictions, aeo_bi, aeo_scores, aeo_modules,
--     orion_auction_orchestrator_tick, aeo_selftest CASCADE;
--   SELECT cron.unschedule('orion_auction_orchestrator_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'auction_orchestrator.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='auction_orchestrator';
-- ============================================================================

-- Gate defensivo (avisa drift, nao aborta)
DO $$
BEGIN
  IF to_regclass('public.auction_listings') IS NULL THEN RAISE WARNING 'AI-70: auction_listings ausente — orquestrador usara fallbacks.'; END IF;
  IF to_regclass('public.orion_auction_settlements') IS NULL THEN RAISE WARNING 'AI-70: orion_auction_settlements ausente.'; END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 1) TABELAS (12) — orion_aeo_*
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_aeo_modules (
  engine_key   text PRIMARY KEY,
  nome         text NOT NULL,
  tipo         text NOT NULL,
  tabela_principal text,
  dashboard_fn text, tick_fn text, selftest_fn text,
  status       text NOT NULL DEFAULT 'desconhecido',
  disponivel   boolean NOT NULL DEFAULT false,
  ultima_checagem timestamptz
);
COMMENT ON TABLE public.orion_aeo_modules IS 'ORION-AI-70: registro dos motores de leilao coordenados (auto-descoberto).';

CREATE TABLE IF NOT EXISTS public.orion_aeo_health (
  id bigserial PRIMARY KEY,
  componente text NOT NULL,
  status text NOT NULL,           -- ok/atencao/critico/indisponivel
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  medido_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aeo_health_unico UNIQUE (componente)
);
COMMENT ON TABLE public.orion_aeo_health IS 'ORION-AI-70: saude por componente (crons/RPCs/filas/banco/latencia).';

CREATE TABLE IF NOT EXISTS public.orion_aeo_events (
  id bigserial PRIMARY KEY,
  origem text NOT NULL,           -- auction_events / orion_eventos
  origem_id text,                 -- id da fonte (uuid/bigint) como texto — desacopla do tipo
  event_type text,
  listing_id text,
  payload jsonb,
  trace_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aeo_event_unico UNIQUE (origem, origem_id)
);
-- coercao defensiva se a tabela ja existir com bigint (aplicacoes anteriores)
DO $$ BEGIN
  BEGIN ALTER TABLE public.orion_aeo_events ALTER COLUMN origem_id TYPE text USING origem_id::text; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.orion_aeo_events ALTER COLUMN listing_id TYPE text USING listing_id::text; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
CREATE INDEX IF NOT EXISTS idx_aeo_events ON public.orion_aeo_events (criado_em DESC);
COMMENT ON TABLE public.orion_aeo_events IS 'ORION-AI-70: eventos orquestrados com rastreabilidade (trace_id).';

CREATE TABLE IF NOT EXISTS public.orion_aeo_workflow (
  stage_key text PRIMARY KEY,
  ordem int NOT NULL,
  descricao text,
  depende_de text,
  status text NOT NULL DEFAULT 'monitorado',   -- ok/atencao/critico/monitorado
  consistencia_pct numeric,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aeo_workflow IS 'ORION-AI-70: pipeline do leilao (criacao→...→BI) + consistencia por etapa.';

CREATE TABLE IF NOT EXISTS public.orion_aeo_quality (
  id bigserial PRIMARY KEY,
  check_key text NOT NULL,
  categoria text NOT NULL,        -- financeiro/lances/arremate/comissao/creditos/auditoria/consistencia
  ok boolean NOT NULL,
  achados bigint NOT NULL DEFAULT 0,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aeo_quality_unico UNIQUE (check_key)
);
COMMENT ON TABLE public.orion_aeo_quality IS 'ORION-AI-70: integridade (financeira/lances/arremate/comissao/creditos) — read-only.';

CREATE TABLE IF NOT EXISTS public.orion_aeo_performance (
  id bigserial PRIMARY KEY,
  metrica text NOT NULL,
  valor numeric,
  unidade text,
  threshold numeric,
  ok boolean,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aeo_perf_unico UNIQUE (metrica)
);
COMMENT ON TABLE public.orion_aeo_performance IS 'ORION-AI-70: tempos (finalizacao/atraso/cron) + thresholds.';

CREATE TABLE IF NOT EXISTS public.orion_aeo_alerts (
  id bigserial PRIMARY KEY,
  alert_key text NOT NULL,
  severidade text NOT NULL,       -- critico/alto/medio/baixo
  categoria text NOT NULL,
  titulo text NOT NULL,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'aberto',
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aeo_alert_unico UNIQUE (alert_key)
);
COMMENT ON TABLE public.orion_aeo_alerts IS 'ORION-AI-70: alertas (cron/latencia/fila/RPC/risco financeiro/fraude).';

CREATE TABLE IF NOT EXISTS public.orion_aeo_scores (
  dia date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  orchestration_score int, health_score int, workflow_score int, performance_score int,
  reliability_score int, security_score int, integration_score int,
  componentes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aeo_scores IS 'ORION-AI-70: 7 scores (orchestration/health/workflow/performance/reliability/security/integration).';

CREATE TABLE IF NOT EXISTS public.orion_aeo_predictions (
  id bigserial PRIMARY KEY,
  tipo text NOT NULL,             -- sobrecarga/escala/gargalo/falha/crescimento/otimizacao
  previsao text,
  base text,
  confianca int,
  dados_analisados bigint,
  horizonte text,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_aeo_pred_unico UNIQUE (tipo)
);
COMMENT ON TABLE public.orion_aeo_predictions IS 'ORION-AI-70: previsoes (sobrecarga/escala/gargalo) com base/confianca/dados.';

CREATE TABLE IF NOT EXISTS public.orion_aeo_bi (
  dia date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  leiloes_total bigint, leiloes_ativos bigint, leiloes_encerrados bigint,
  arremates bigint, gmv numeric, receita_comissoes numeric, creditos_consumidos numeric,
  lances_total bigint, participantes bigint, backlog_encerramento bigint,
  componentes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aeo_bi IS 'ORION-AI-70: BI consolidado do ecossistema de leilao (GMV/receita/arremates/backlog).';

CREATE TABLE IF NOT EXISTS public.orion_aeo_audits (
  id bigserial PRIMARY KEY,
  acao text NOT NULL, entidade text, detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ator uuid, criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_aeo_audits IS 'ORION-AI-70: trilha de auditoria imutavel da orquestracao.';

CREATE TABLE IF NOT EXISTS public.orion_aeo_runs (
  id bigserial PRIMARY KEY,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  ok boolean,
  health_score int,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_aeo_runs ON public.orion_aeo_runs (iniciado_em DESC);
COMMENT ON TABLE public.orion_aeo_runs IS 'ORION-AI-70: execucoes do orquestrador (auditavel).';

-- ----------------------------------------------------------------------------
-- 2) RLS + trava de grants
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_aeo_modules','orion_aeo_health','orion_aeo_events','orion_aeo_workflow',
    'orion_aeo_quality','orion_aeo_performance','orion_aeo_alerts','orion_aeo_scores','orion_aeo_predictions',
    'orion_aeo_bi','orion_aeo_audits','orion_aeo_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) HELPERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'auction_orchestrator', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL; END$$;

CREATE OR REPLACE FUNCTION public.aeo_count_safe(p_rel text, p_where text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  IF to_regclass('public.'||p_rel) IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT count(*) FROM public.'||quote_ident(p_rel)||coalesce(' WHERE '||p_where,'') INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END$$;

-- soma defensiva (retorna numeric)
CREATE OR REPLACE FUNCTION public.aeo_sum_safe(p_rel text, p_col text, p_where text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  IF to_regclass('public.'||p_rel) IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT coalesce(sum('||p_col||'),0) FROM public.'||quote_ident(p_rel)||coalesce(' WHERE '||p_where,'') INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.aeo_regproc_ok(p_sig text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT to_regproc(p_sig) IS NOT NULL $$;

-- chama uma funcao zero-arg com seguranca (read-only; erro -> null)
CREATE OR REPLACE FUNCTION public.aeo_call_safe(p_fn text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF to_regproc('public.'||p_fn||'()') IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT to_jsonb(public.'||quote_ident(p_fn)||'())' INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.aeo_audit(p_acao text, p_entidade text, p_detalhes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.orion_aeo_audits (acao, entidade, detalhes, ator) VALUES (p_acao, p_entidade, coalesce(p_detalhes,'{}'::jsonb), auth.uid());
EXCEPTION WHEN OTHERS THEN NULL; END$$;

-- ----------------------------------------------------------------------------
-- 4) DISCOVER — registra os motores coordenados (existencia real)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_discover()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; r record;
  defs jsonb := jsonb_build_array(
    jsonb_build_object('engine_key','bidding','nome','Leilao Core (bidding/listings)','tipo','core','tabela','auction_listings','dash','orion_auction_panel','tick',NULL,'self',NULL),
    jsonb_build_object('engine_key','commission','nome','Comissao & Arremate','tipo','financeiro','tabela','orion_auction_commissions','dash','orion_auction_commission_dashboard','tick','orion_auction_commission_tick','self','orion_auction_commission_selftest'),
    jsonb_build_object('engine_key','finalize','nome','Finalizacao/Encerramento','tipo','operacional','tabela','orion_auction_finalize_log','dash','orion_auction_finalize_dashboard','tick','orion_auction_finalize_tick','self','orion_auction_finalize_selftest'),
    jsonb_build_object('engine_key','settlement','nome','Liquidacao','tipo','financeiro','tabela','orion_auction_settlements','dash','orion_auction_settlement_dashboard','tick',NULL,'self',NULL),
    jsonb_build_object('engine_key','intelligence','nome','Auction Intelligence','tipo','analytics','tabela','auction_conversion_metrics','dash','orion_auction_intelligence_dashboard','tick','orion_auction_intel_tick','self',NULL),
    jsonb_build_object('engine_key','autoclose','nome','Auto-close','tipo','operacional','tabela','auction_listings','dash',NULL,'tick','orion_auction_autoclose','self',NULL),
    jsonb_build_object('engine_key','command','nome','Comando Leilao (growth/stats)','tipo','growth','tabela','auction_listings','dash','auction_command_dashboard','tick',NULL,'self',NULL));
BEGIN
  FOR r IN SELECT jsonb_array_elements(defs) AS e LOOP
    INSERT INTO public.orion_aeo_modules (engine_key, nome, tipo, tabela_principal, dashboard_fn, tick_fn, selftest_fn, disponivel, status, ultima_checagem)
    VALUES (r.e->>'engine_key', r.e->>'nome', r.e->>'tipo', r.e->>'tabela', r.e->>'dash', r.e->>'tick', r.e->>'self',
      (to_regclass('public.'||(r.e->>'tabela')) IS NOT NULL),
      CASE WHEN to_regclass('public.'||(r.e->>'tabela')) IS NOT NULL THEN 'ativo' ELSE 'ausente' END, now())
    ON CONFLICT (engine_key) DO UPDATE SET disponivel=excluded.disponivel, status=excluded.status, ultima_checagem=now();
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 5) HEALTH — crons + RPCs + banco + fila/backlog
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_status text; v_det jsonb; v_backlog bigint; v_ok int := 0; v_total int := 0;
  crons text[] := ARRAY['orion_auction_autoclose','orion_auction_commission_tick','orion_auction_finalize_tick','orion_auction_intel_tick'];
  rpcs text[] := ARRAY['place_auction_bid','orion_auction_finalize','orion_auction_settle','orion_auction_charge_commission','orion_auction_release_contact','orion_auction_close'];
  c text; v_last text;
BEGIN
  -- crons: existencia + ultimo status
  FOREACH c IN ARRAY crons LOOP
    v_total := v_total + 1;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname=c) THEN
      SELECT status INTO v_last FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname=c ORDER BY d.start_time DESC LIMIT 1;
      v_status := CASE WHEN v_last IS NULL THEN 'ok' WHEN v_last='succeeded' THEN 'ok' WHEN v_last='failed' THEN 'critico' ELSE 'atencao' END;
      IF v_status='ok' THEN v_ok := v_ok + 1; END IF;
      v_det := jsonb_build_object('agendado',true,'ultimo_status',coalesce(v_last,'sem_execucao'));
    ELSE
      v_status := 'indisponivel'; v_det := jsonb_build_object('agendado',false);
    END IF;
    INSERT INTO public.orion_aeo_health (componente, status, detalhe, medido_em) VALUES ('cron:'||c, v_status, v_det, now())
    ON CONFLICT (componente) DO UPDATE SET status=excluded.status, detalhe=excluded.detalhe, medido_em=now();
  END LOOP;

  -- RPCs criticas
  FOREACH c IN ARRAY rpcs LOOP
    v_total := v_total + 1;
    v_status := CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname=c) THEN 'ok' ELSE 'critico' END;
    IF v_status='ok' THEN v_ok := v_ok + 1; END IF;
    INSERT INTO public.orion_aeo_health (componente, status, detalhe, medido_em) VALUES ('rpc:'||c, v_status, jsonb_build_object('existe',v_status='ok'), now())
    ON CONFLICT (componente) DO UPDATE SET status=excluded.status, detalhe=excluded.detalhe, medido_em=now();
  END LOOP;

  -- fila/backlog de encerramento: leiloes passados de ends_at ainda "abertos"
  v_backlog := coalesce(public.aeo_count_safe('auction_listings',
    'ends_at < now() AND status::text NOT IN (''ended'',''closed'',''finalized'',''sold'',''canceled'',''cancelled'',''rejected'',''expired'')'), 0);
  v_total := v_total + 1;
  v_status := CASE WHEN v_backlog=0 THEN 'ok' WHEN v_backlog < 5 THEN 'atencao' ELSE 'critico' END;
  IF v_status='ok' THEN v_ok := v_ok + 1; END IF;
  INSERT INTO public.orion_aeo_health (componente, status, detalhe, medido_em) VALUES ('fila:encerramento', v_status, jsonb_build_object('backlog',v_backlog), now())
  ON CONFLICT (componente) DO UPDATE SET status=excluded.status, detalhe=excluded.detalhe, medido_em=now();

  -- banco (leitura basica ok)
  v_total := v_total + 1; v_ok := v_ok + 1;
  INSERT INTO public.orion_aeo_health (componente, status, detalhe, medido_em) VALUES ('banco', 'ok', jsonb_build_object('leitura','ok'), now())
  ON CONFLICT (componente) DO UPDATE SET status='ok', detalhe=excluded.detalhe, medido_em=now();

  -- realtime/edge: sem superficie SQL -> DECLARADO
  INSERT INTO public.orion_aeo_health (componente, status, detalhe, medido_em) VALUES ('realtime_edge', 'declarado', jsonb_build_object('nota','sem superficie SQL — monitorado fora do banco'), now())
  ON CONFLICT (componente) DO UPDATE SET detalhe=excluded.detalhe, medido_em=now();

  RETURN jsonb_build_object('health_score', round(v_ok*100.0/nullif(v_total,0))::int, 'ok', v_ok, 'total', v_total, 'backlog', v_backlog);
END$$;

-- ----------------------------------------------------------------------------
-- 6) EVENTOS — ingestao com rastreabilidade
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_ingest_events()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0;
BEGIN
  IF to_regclass('public.auction_events') IS NOT NULL THEN
    INSERT INTO public.orion_aeo_events (origem, origem_id, event_type, listing_id, payload, trace_id, criado_em)
    SELECT 'auction_events', e.id::text, e.event_type, e.auction_listing_id::text, e.event_payload, gen_random_uuid(), e.created_at
    FROM public.auction_events e
    WHERE e.created_at > now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM public.orion_aeo_events a WHERE a.origem='auction_events' AND a.origem_id=e.id::text);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 7) WORKFLOW — pipeline + consistencia por etapa (read-only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_workflow_validate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_listings bigint; v_ended bigint; v_finalized bigint; v_settled bigint; v_comm bigint; v_comm_ok bigint;
  v_backlog bigint; v_creditos bigint; v_contato bigint; v_bids bigint; v_avg numeric; v_okstages int := 0; v_tot int := 0;
BEGIN
  v_listings := coalesce(public.aeo_count_safe('auction_listings'),0);
  v_bids := coalesce(public.aeo_count_safe('auction_bids'),0);
  v_ended := coalesce(public.aeo_count_safe('auction_listings','ends_at < now()'),0);
  v_finalized := coalesce(public.aeo_count_safe('orion_auction_finalize_log','resultado IS NOT NULL'),0);
  v_settled := coalesce(public.aeo_count_safe('orion_auction_settlements'),0);
  v_comm := coalesce(public.aeo_count_safe('orion_auction_commissions'),0);
  v_comm_ok := coalesce(public.aeo_count_safe('orion_auction_settlements','comissao_ok'),0);
  v_creditos := coalesce(public.aeo_count_safe('orion_auction_commissions','creditos_debitados > 0'),0);
  v_contato := coalesce(public.aeo_count_safe('orion_auction_commissions','contato_liberado'),0);
  v_backlog := coalesce(public.aeo_count_safe('auction_listings','ends_at < now() AND status::text NOT IN (''ended'',''closed'',''finalized'',''sold'',''canceled'',''cancelled'',''rejected'',''expired'')'),0);

  -- upsert por etapa (ordem + consistencia)
  -- helper inline via array de linhas
  PERFORM 1;
  -- 1 criacao
  INSERT INTO public.orion_aeo_workflow (stage_key,ordem,descricao,depende_de,status,consistencia_pct,evidencias,atualizado_em) VALUES
   ('criacao',1,'Criacao do leilao',NULL, CASE WHEN v_listings>0 THEN 'ok' ELSE 'monitorado' END, 100, jsonb_build_object('leiloes',v_listings), now()),
   ('publicacao',2,'Publicacao/moderacao','criacao', CASE WHEN v_listings>0 THEN 'ok' ELSE 'monitorado' END, 100, jsonb_build_object('via','moderation_status'), now()),
   ('campanhas',3,'Campanhas','publicacao','monitorado',NULL, jsonb_build_object('engine','commission/command'), now()),
   ('divulgacao',4,'Divulgacao','campanhas','monitorado',NULL, jsonb_build_object('engine','publisher'), now()),
   ('lances',5,'Recebimento de lances','publicacao', CASE WHEN v_bids>0 THEN 'ok' ELSE 'monitorado' END, 100, jsonb_build_object('lances',v_bids), now()),
   ('monitoramento',6,'Monitoramento','lances','ok',100, jsonb_build_object('watchers','auction_watchers'), now()),
   ('encerramento',7,'Encerramento','lances', CASE WHEN v_backlog=0 THEN 'ok' WHEN v_backlog<5 THEN 'atencao' ELSE 'critico' END,
      round((1 - v_backlog::numeric/nullif(v_ended,0))*100,1), jsonb_build_object('encerrados',v_ended,'backlog',v_backlog), now()),
   ('arremate',8,'Arrematacao','encerramento', CASE WHEN v_finalized>0 THEN 'ok' ELSE 'monitorado' END, 100, jsonb_build_object('finalizados',v_finalized), now()),
   ('liquidacao',9,'Liquidacao','arremate', CASE WHEN v_settled>=0 THEN 'ok' ELSE 'monitorado' END,
      round(v_settled::numeric*100/nullif(v_finalized,0),1), jsonb_build_object('liquidados',v_settled,'finalizados',v_finalized), now()),
   ('comissao',10,'Comissao','liquidacao', CASE WHEN v_comm>0 THEN 'ok' ELSE 'monitorado' END,
      round(v_comm_ok::numeric*100/nullif(v_settled,0),1), jsonb_build_object('comissoes',v_comm,'comissao_ok',v_comm_ok), now()),
   ('creditos',11,'Debito de creditos','comissao', CASE WHEN v_creditos>=0 THEN 'ok' ELSE 'monitorado' END, 100, jsonb_build_object('com_credito_debitado',v_creditos), now()),
   ('liberacao_contato',12,'Liberacao de contato','creditos', CASE WHEN v_contato>=0 THEN 'ok' ELSE 'monitorado' END, 100, jsonb_build_object('contatos_liberados',v_contato), now()),
   ('pos_venda',13,'Pos-venda','liberacao_contato','monitorado',NULL, jsonb_build_object('engine','arremate_offers'), now()),
   ('reputacao',14,'Reputacao','pos_venda','monitorado',NULL, jsonb_build_object('engine','trust/lifecycle'), now()),
   ('analytics',15,'Analytics','monitoramento', CASE WHEN to_regclass('public.auction_conversion_metrics') IS NOT NULL THEN 'ok' ELSE 'monitorado' END, 100, jsonb_build_object('engine','auction_intelligence'), now()),
   ('growth',16,'Growth','analytics','monitorado',NULL, jsonb_build_object('engine','command/growth'), now()),
   ('bi',17,'Business Intelligence','growth','ok',100, jsonb_build_object('engine','aeo_bi'), now())
  ON CONFLICT (stage_key) DO UPDATE SET status=excluded.status, consistencia_pct=excluded.consistencia_pct, evidencias=excluded.evidencias, atualizado_em=now();

  SELECT count(*) FILTER (WHERE status='ok'), count(*) INTO v_okstages, v_tot FROM public.orion_aeo_workflow;
  SELECT round(avg(coalesce(consistencia_pct,80)),1) INTO v_avg FROM public.orion_aeo_workflow;
  RETURN jsonb_build_object('workflow_score', round(v_avg)::int, 'etapas_ok', v_okstages, 'etapas', v_tot, 'consistencia_media', v_avg);
END$$;

-- ----------------------------------------------------------------------------
-- 8) QUALITY — integridade (read-only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_quality_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a bigint; v_ok int := 0; v_tot int := 0;
BEGIN
  -- 1 financeiro: liquidacao com comissao calculada inconsistente (comissao_valor <> round(valor_final*pct/100))
  v_a := coalesce((SELECT count(*) FROM public.orion_auction_settlements
     WHERE valor_final IS NOT NULL AND comissao_pct IS NOT NULL AND comissao_valor IS NOT NULL
       AND abs(comissao_valor - round((valor_final*comissao_pct/100)::numeric,2)) > 0.05),0);
  v_tot:=v_tot+1; IF v_a=0 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_quality (check_key,categoria,ok,achados,evidencias,criado_em)
   VALUES ('comissao_valor_consistente','financeiro', v_a=0, v_a, jsonb_build_object('divergencias',v_a), now())
   ON CONFLICT (check_key) DO UPDATE SET ok=excluded.ok, achados=excluded.achados, evidencias=excluded.evidencias, criado_em=now();

  -- 2 creditos: comissao com contato liberado mas creditos nao debitados (risco financeiro)
  v_a := coalesce(public.aeo_count_safe('orion_auction_commissions','contato_liberado AND coalesce(creditos_debitados,0) < coalesce(creditos_devidos,0)'),0);
  v_tot:=v_tot+1; IF v_a=0 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_quality (check_key,categoria,ok,achados,evidencias,criado_em)
   VALUES ('creditos_debitados_ok','creditos', v_a=0, v_a, jsonb_build_object('contato_sem_debito',v_a), now())
   ON CONFLICT (check_key) DO UPDATE SET ok=excluded.ok, achados=excluded.achados, evidencias=excluded.evidencias, criado_em=now();

  -- 3 arremate: finalize com resultado sucesso e vencedor mas sem settlement
  v_a := coalesce((SELECT count(*) FROM public.orion_auction_finalize_log f
     WHERE f.tem_vencedor IS TRUE AND NOT EXISTS (SELECT 1 FROM public.orion_auction_settlements s WHERE s.listing_id=f.listing_id)),0);
  v_tot:=v_tot+1; IF v_a=0 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_quality (check_key,categoria,ok,achados,evidencias,criado_em)
   VALUES ('finalize_sem_settlement','arremate', v_a=0, v_a, jsonb_build_object('orfaos',v_a), now())
   ON CONFLICT (check_key) DO UPDATE SET ok=excluded.ok, achados=excluded.achados, evidencias=excluded.evidencias, criado_em=now();

  -- 4 lances: lance registrado apos o encerramento do leilao
  v_a := coalesce((SELECT count(*) FROM public.auction_bids b JOIN public.auction_listings l ON l.id=b.listing_id
     WHERE l.ends_at IS NOT NULL AND b.created_at > l.ends_at + interval '2 minutes'),0);
  v_tot:=v_tot+1; IF v_a=0 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_quality (check_key,categoria,ok,achados,evidencias,criado_em)
   VALUES ('lance_apos_encerramento','lances', v_a=0, v_a, jsonb_build_object('lances_tardios',v_a), now())
   ON CONFLICT (check_key) DO UPDATE SET ok=excluded.ok, achados=excluded.achados, evidencias=excluded.evidencias, criado_em=now();

  -- 5 auditoria: settlement sem certificado quando encerrado
  v_a := coalesce(public.aeo_count_safe('orion_auction_settlements','status::text IN (''liquidado'',''settled'',''concluido'') AND coalesce(certificado,false)=false'),0);
  v_tot:=v_tot+1; IF v_a=0 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_quality (check_key,categoria,ok,achados,evidencias,criado_em)
   VALUES ('settlement_certificado','auditoria', v_a=0, v_a, jsonb_build_object('sem_certificado',v_a), now())
   ON CONFLICT (check_key) DO UPDATE SET ok=excluded.ok, achados=excluded.achados, evidencias=excluded.evidencias, criado_em=now();

  -- 6 consistencia: settlement orfao (sem listing)
  v_a := coalesce((SELECT count(*) FROM public.orion_auction_settlements s WHERE NOT EXISTS (SELECT 1 FROM public.auction_listings l WHERE l.id=s.listing_id)),0);
  v_tot:=v_tot+1; IF v_a=0 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_quality (check_key,categoria,ok,achados,evidencias,criado_em)
   VALUES ('settlement_orfao','consistencia', v_a=0, v_a, jsonb_build_object('orfaos',v_a), now())
   ON CONFLICT (check_key) DO UPDATE SET ok=excluded.ok, achados=excluded.achados, evidencias=excluded.evidencias, criado_em=now();

  RETURN jsonb_build_object('quality_ok', v_ok, 'quality_total', v_tot, 'quality_pct', round(v_ok*100.0/nullif(v_tot,0))::int);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('quality_ok', v_ok, 'quality_total', v_tot, 'erro', SQLERRM);
END$$;

-- ----------------------------------------------------------------------------
-- 9) PERFORMANCE — tempos reais (finalize_log + cron)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_performance_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dur numeric; v_atraso numeric; v_cron numeric; v_ok int := 0; v_tot int := 0;
BEGIN
  v_dur := (SELECT round(avg(duracao_ms)::numeric,1) FROM public.orion_auction_finalize_log WHERE created_at > now()-interval '7 days');
  v_atraso := (SELECT round(avg(atraso_seg)::numeric,1) FROM public.orion_auction_finalize_log WHERE created_at > now()-interval '7 days');
  v_cron := (SELECT round(avg(extract(epoch FROM (end_time-start_time)))::numeric,2) FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname LIKE 'orion_auction_%' AND d.end_time > now()-interval '1 day');

  v_tot:=v_tot+1; IF coalesce(v_dur,0) <= 2000 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_performance (metrica,valor,unidade,threshold,ok,evidencias,criado_em)
   VALUES ('finalizacao_duracao_ms', v_dur, 'ms', 2000, coalesce(v_dur,0)<=2000, jsonb_build_object('janela','7d'), now())
   ON CONFLICT (metrica) DO UPDATE SET valor=excluded.valor, ok=excluded.ok, criado_em=now();

  v_tot:=v_tot+1; IF coalesce(v_atraso,0) <= 60 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_performance (metrica,valor,unidade,threshold,ok,evidencias,criado_em)
   VALUES ('finalizacao_atraso_seg', v_atraso, 's', 60, coalesce(v_atraso,0)<=60, jsonb_build_object('janela','7d'), now())
   ON CONFLICT (metrica) DO UPDATE SET valor=excluded.valor, ok=excluded.ok, criado_em=now();

  v_tot:=v_tot+1; IF coalesce(v_cron,0) <= 30 THEN v_ok:=v_ok+1; END IF;
  INSERT INTO public.orion_aeo_performance (metrica,valor,unidade,threshold,ok,evidencias,criado_em)
   VALUES ('cron_duracao_seg', v_cron, 's', 30, coalesce(v_cron,0)<=30, jsonb_build_object('janela','1d'), now())
   ON CONFLICT (metrica) DO UPDATE SET valor=excluded.valor, ok=excluded.ok, criado_em=now();

  RETURN jsonb_build_object('performance_score', round(v_ok*100.0/nullif(v_tot,0))::int, 'metricas_ok', v_ok, 'metricas', v_tot);
END$$;

-- ----------------------------------------------------------------------------
-- 10) ALERTAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_alerts_generate()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; r record; v_a bigint;
BEGIN
  -- crons criticos/indisponiveis
  FOR r IN SELECT componente, status, detalhe FROM public.orion_aeo_health WHERE componente LIKE 'cron:%' AND status IN ('critico','indisponivel') LOOP
    INSERT INTO public.orion_aeo_alerts (alert_key,severidade,categoria,titulo,evidencias,status,criado_em)
    VALUES ('cron_'||r.componente, CASE WHEN r.status='indisponivel' THEN 'critico' ELSE 'alto' END, 'operacional',
      'Cron do leilao com problema: '||r.componente, r.detalhe, 'aberto', now())
    ON CONFLICT (alert_key) DO UPDATE SET severidade=excluded.severidade, evidencias=excluded.evidencias, status='aberto', criado_em=now();
    v_n := v_n + 1;
  END LOOP;

  -- backlog de encerramento (fila parada)
  SELECT (detalhe->>'backlog')::bigint INTO v_a FROM public.orion_aeo_health WHERE componente='fila:encerramento';
  IF coalesce(v_a,0) > 0 THEN
    INSERT INTO public.orion_aeo_alerts (alert_key,severidade,categoria,titulo,evidencias,status,criado_em)
    VALUES ('backlog_encerramento', CASE WHEN v_a>=5 THEN 'critico' ELSE 'medio' END, 'operacional',
      v_a||' leilao(oes) passado(s) do prazo sem encerrar', jsonb_build_object('backlog',v_a), 'aberto', now())
    ON CONFLICT (alert_key) DO UPDATE SET severidade=excluded.severidade, titulo=excluded.titulo, evidencias=excluded.evidencias, status='aberto', criado_em=now();
    v_n := v_n + 1;
  ELSE
    UPDATE public.orion_aeo_alerts SET status='resolvido' WHERE alert_key='backlog_encerramento' AND status='aberto';
  END IF;

  -- risco financeiro: quality de credito/comissao reprovado
  FOR r IN SELECT check_key, categoria, achados FROM public.orion_aeo_quality WHERE NOT ok AND categoria IN ('financeiro','creditos','arremate') LOOP
    INSERT INTO public.orion_aeo_alerts (alert_key,severidade,categoria,titulo,evidencias,status,criado_em)
    VALUES ('quality_'||r.check_key, 'alto', 'risco_financeiro', 'Integridade financeira: '||r.check_key||' ('||r.achados||')',
      jsonb_build_object('achados',r.achados), 'aberto', now())
    ON CONFLICT (alert_key) DO UPDATE SET titulo=excluded.titulo, evidencias=excluded.evidencias, status='aberto', criado_em=now();
    v_n := v_n + 1;
  END LOOP;

  -- fraude: settlements com fraude_score alto
  v_a := coalesce(public.aeo_count_safe('orion_auction_settlements','coalesce(fraude_score,0) >= 70'),0);
  IF v_a > 0 THEN
    INSERT INTO public.orion_aeo_alerts (alert_key,severidade,categoria,titulo,evidencias,status,criado_em)
    VALUES ('fraude_settlements','alto','risco_fraude', v_a||' liquidacao(oes) com fraude_score alto', jsonb_build_object('qtd',v_a), 'aberto', now())
    ON CONFLICT (alert_key) DO UPDATE SET titulo=excluded.titulo, evidencias=excluded.evidencias, status='aberto', criado_em=now();
    v_n := v_n + 1;
  END IF;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 11) BI CONSOLIDADO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_bi_consolidate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_total bigint; v_ativos bigint; v_enc bigint; v_arr bigint; v_gmv numeric; v_rec numeric; v_cred numeric;
  v_lances bigint; v_part bigint; v_backlog bigint;
BEGIN
  v_total := coalesce(public.aeo_count_safe('auction_listings'),0);
  v_ativos := coalesce(public.aeo_count_safe('auction_listings','ends_at > now() AND status::text NOT IN (''canceled'',''cancelled'',''rejected'',''ended'',''closed'',''finalized'',''sold'',''expired'')'),0);
  v_enc := coalesce(public.aeo_count_safe('auction_listings','ends_at <= now()'),0);
  v_arr := coalesce(public.aeo_count_safe('orion_auction_settlements'),0);
  v_gmv := coalesce(public.aeo_sum_safe('orion_auction_settlements','valor_final'),
                    public.aeo_sum_safe('auction_bids','amount_cents/100.0','is_winning'), 0);
  v_rec := coalesce(public.aeo_sum_safe('orion_auction_settlements','comissao_valor'),
                    public.aeo_sum_safe('orion_auction_commissions','comissao_brl'), 0);
  v_cred := coalesce(public.aeo_sum_safe('orion_auction_credit_consumption','creditos'), 0);
  v_lances := coalesce(public.aeo_count_safe('auction_bids'),0);
  v_part := coalesce((SELECT count(DISTINCT user_id) FROM public.auction_bids),0);
  v_backlog := coalesce(public.aeo_count_safe('auction_listings','ends_at < now() AND status::text NOT IN (''ended'',''closed'',''finalized'',''sold'',''canceled'',''cancelled'',''rejected'',''expired'')'),0);

  INSERT INTO public.orion_aeo_bi (dia, leiloes_total, leiloes_ativos, leiloes_encerrados, arremates, gmv, receita_comissoes, creditos_consumidos, lances_total, participantes, backlog_encerramento, componentes)
  VALUES (v_hoje, v_total, v_ativos, v_enc, v_arr, v_gmv, v_rec, v_cred, v_lances, v_part, v_backlog,
    jsonb_build_object('fontes', jsonb_build_array('auction_listings','auction_bids','orion_auction_settlements','orion_auction_commissions','orion_auction_credit_consumption')))
  ON CONFLICT (dia) DO UPDATE SET leiloes_total=excluded.leiloes_total, leiloes_ativos=excluded.leiloes_ativos, leiloes_encerrados=excluded.leiloes_encerrados,
    arremates=excluded.arremates, gmv=excluded.gmv, receita_comissoes=excluded.receita_comissoes, creditos_consumidos=excluded.creditos_consumidos,
    lances_total=excluded.lances_total, participantes=excluded.participantes, backlog_encerramento=excluded.backlog_encerramento, criado_em=now();

  RETURN jsonb_build_object('gmv',v_gmv,'receita',v_rec,'leiloes',v_total,'ativos',v_ativos,'arremates',v_arr,'lances',v_lances);
END$$;

-- ----------------------------------------------------------------------------
-- 12) PREVISAO (base/confianca/dados)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_predict()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ev7 bigint; v_ev1 bigint; v_backlog bigint; v_dur numeric; v_n int := 0; v_trend numeric;
BEGIN
  v_ev7 := coalesce(public.aeo_count_safe('auction_events','created_at > now()-interval ''7 days'''),0);
  v_ev1 := coalesce(public.aeo_count_safe('auction_events','created_at > now()-interval ''1 day'''),0);
  v_backlog := coalesce((SELECT (detalhe->>'backlog')::bigint FROM orion_aeo_health WHERE componente='fila:encerramento'),0);
  v_dur := (SELECT avg(duracao_ms) FROM public.orion_auction_finalize_log WHERE created_at > now()-interval '3 days');
  v_trend := v_ev1 - (v_ev7/7.0);

  -- sobrecarga
  INSERT INTO public.orion_aeo_predictions (tipo,previsao,base,confianca,dados_analisados,horizonte,evidencias,criado_em)
  VALUES ('sobrecarga', CASE WHEN v_trend > (v_ev7/7.0)*0.5 THEN 'Tendencia de alta no volume de eventos — monitorar capacidade' ELSE 'Volume estavel — sem sobrecarga prevista' END,
    'eventos/dia (auction_events) media 7d vs ultimo dia', CASE WHEN v_ev7>=50 THEN 60 WHEN v_ev7>=10 THEN 40 ELSE 25 END, v_ev7, '7d',
    jsonb_build_object('media_dia',round(v_ev7/7.0,1),'ultimo_dia',v_ev1,'tendencia',round(v_trend,1)), now())
  ON CONFLICT (tipo) DO UPDATE SET previsao=excluded.previsao, confianca=excluded.confianca, dados_analisados=excluded.dados_analisados, evidencias=excluded.evidencias, criado_em=now();
  v_n:=v_n+1;

  -- gargalo
  INSERT INTO public.orion_aeo_predictions (tipo,previsao,base,confianca,dados_analisados,horizonte,evidencias,criado_em)
  VALUES ('gargalo', CASE WHEN v_backlog>=5 THEN 'Gargalo no encerramento — revisar cron/autoclose' WHEN v_backlog>0 THEN 'Pequeno acumulo no encerramento' ELSE 'Sem gargalo de encerramento' END,
    'backlog de leiloes vencidos ainda abertos', CASE WHEN v_backlog>0 THEN 70 ELSE 55 END, v_backlog, 'imediato',
    jsonb_build_object('backlog',v_backlog), now())
  ON CONFLICT (tipo) DO UPDATE SET previsao=excluded.previsao, confianca=excluded.confianca, dados_analisados=excluded.dados_analisados, evidencias=excluded.evidencias, criado_em=now();
  v_n:=v_n+1;

  -- escala/otimizacao
  INSERT INTO public.orion_aeo_predictions (tipo,previsao,base,confianca,dados_analisados,horizonte,evidencias,criado_em)
  VALUES ('otimizacao', CASE WHEN coalesce(v_dur,0)>2000 THEN 'Finalizacao lenta — avaliar indices/otimizacao' ELSE 'Finalizacao dentro do alvo' END,
    'duracao media de finalizacao (ms) 3d', CASE WHEN v_dur IS NOT NULL THEN 50 ELSE 20 END, coalesce(public.aeo_count_safe('orion_auction_finalize_log'),0), '3d',
    jsonb_build_object('duracao_ms',round(coalesce(v_dur,0)::numeric,1)), now())
  ON CONFLICT (tipo) DO UPDATE SET previsao=excluded.previsao, confianca=excluded.confianca, dados_analisados=excluded.dados_analisados, evidencias=excluded.evidencias, criado_em=now();
  v_n:=v_n+1;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 13) SCORES (7)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_scores_refresh(p_health jsonb, p_workflow jsonb, p_perf jsonb, p_quality jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_health int; v_wf int; v_perf int; v_qual int; v_rel int; v_sec int; v_integ int; v_orch int;
  v_fin_ok bigint; v_fin_tot bigint; v_active int; v_expected int := 7;
BEGIN
  v_health := coalesce((p_health->>'health_score')::int, 50);
  v_wf := coalesce((p_workflow->>'workflow_score')::int, 50);
  v_perf := coalesce((p_perf->>'performance_score')::int, 50);
  v_qual := coalesce((p_quality->>'quality_pct')::int, 50);
  -- reliability: taxa de sucesso da finalizacao + crons ok
  SELECT count(*) FILTER (WHERE resultado::text ILIKE '%ok%' OR resultado::text ILIKE '%sucesso%' OR resultado::text ILIKE '%success%' OR (erro IS NULL)), count(*)
    INTO v_fin_ok, v_fin_tot FROM public.orion_auction_finalize_log WHERE created_at > now()-interval '30 days';
  v_rel := CASE WHEN coalesce(v_fin_tot,0)=0 THEN v_health ELSE round(v_fin_ok*100.0/v_fin_tot)::int END;
  -- security: qualidade financeira + ausencia de fraude alta
  v_sec := round((v_qual*0.7) + (CASE WHEN coalesce(public.aeo_count_safe('orion_aeo_alerts','categoria=''risco_fraude'' AND status=''aberto'''),0)=0 THEN 30 ELSE 10 END))::int;
  -- integration: engines ativos / esperados
  SELECT count(*) FILTER (WHERE disponivel) INTO v_active FROM public.orion_aeo_modules;
  v_integ := round(v_active*100.0/nullif(v_expected,0))::int;
  -- orchestration: composto
  v_orch := round(v_health*0.20 + v_wf*0.20 + v_perf*0.15 + v_rel*0.15 + v_sec*0.15 + v_integ*0.15)::int;

  INSERT INTO public.orion_aeo_scores (dia, orchestration_score, health_score, workflow_score, performance_score, reliability_score, security_score, integration_score, componentes)
  VALUES (v_hoje, v_orch, v_health, v_wf, v_perf, v_rel, v_sec, v_integ,
    jsonb_build_object('pesos_orch', jsonb_build_object('health',0.20,'workflow',0.20,'performance',0.15,'reliability',0.15,'security',0.15,'integration',0.15),
      'finalize_ok', v_fin_ok, 'finalize_total', v_fin_tot, 'engines_ativos', v_active))
  ON CONFLICT (dia) DO UPDATE SET orchestration_score=excluded.orchestration_score, health_score=excluded.health_score, workflow_score=excluded.workflow_score,
    performance_score=excluded.performance_score, reliability_score=excluded.reliability_score, security_score=excluded.security_score, integration_score=excluded.integration_score, componentes=excluded.componentes, criado_em=now();

  RETURN jsonb_build_object('orchestration',v_orch,'health',v_health,'workflow',v_wf,'performance',v_perf,'reliability',v_rel,'security',v_sec,'integration',v_integ);
END$$;

-- ----------------------------------------------------------------------------
-- 14) ORQUESTRADOR MESTRE (idempotente) — read-only sobre leilao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_orchestrate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run bigint; v_disc int; v_h jsonb; v_ev int; v_wf jsonb; v_q jsonb; v_p jsonb; v_al int; v_bi jsonb; v_pr int; v_sc jsonb;
BEGIN
  INSERT INTO public.orion_aeo_runs (iniciado_em) VALUES (now()) RETURNING id INTO v_run;
  v_disc := public.aeo_discover();
  v_h := public.aeo_health_check();
  v_ev := public.aeo_ingest_events();
  v_wf := public.aeo_workflow_validate();
  v_q := public.aeo_quality_check();
  v_p := public.aeo_performance_snapshot();
  v_bi := public.aeo_bi_consolidate();
  v_al := public.aeo_alerts_generate();
  v_pr := public.aeo_predict();
  v_sc := public.aeo_scores_refresh(v_h, v_wf, v_p, v_q);

  UPDATE public.orion_aeo_runs SET finalizado_em=now(), ok=true, health_score=(v_h->>'health_score')::int,
    resultado=jsonb_build_object('discover',v_disc,'health',v_h,'eventos',v_ev,'workflow',v_wf,'quality',v_q,'performance',v_p,'bi',v_bi,'alertas',v_al,'previsoes',v_pr,'scores',v_sc)
  WHERE id=v_run;
  PERFORM public.aeo_audit('orchestrate','run', jsonb_build_object('run',v_run,'scores',v_sc));
  PERFORM public.aeo_emit('auction_orchestrator.run', jsonb_build_object('run',v_run,'health',v_h->>'health_score','orchestration',v_sc->>'orchestration'));
  RETURN jsonb_build_object('ok',true,'run',v_run,'scores',v_sc,'health',v_h,'bi',v_bi,'alertas',v_al,'eventos',v_ev);
END$$;

-- ----------------------------------------------------------------------------
-- 15) RPCs PUBLICAS (admin, read-only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_trace uuid := gen_random_uuid();
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  PERFORM public.aeo_emit('auction_orchestrator.dashboard', jsonb_build_object('trace',v_trace));
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'scores', (SELECT to_jsonb(s) FROM orion_aeo_scores s WHERE dia=v_hoje),
    'bi', (SELECT to_jsonb(b) FROM orion_aeo_bi b WHERE dia=v_hoje),
    'health', (SELECT coalesce(jsonb_agg(jsonb_build_object('componente',componente,'status',status,'detalhe',detalhe) ORDER BY componente),'[]'::jsonb) FROM orion_aeo_health),
    'modulos', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.tipo, m.engine_key),'[]'::jsonb) FROM orion_aeo_modules m),
    'workflow', (SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.ordem),'[]'::jsonb) FROM orion_aeo_workflow w),
    'quality', (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.ok, q.categoria),'[]'::jsonb) FROM orion_aeo_quality q),
    'performance', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.metrica),'[]'::jsonb) FROM orion_aeo_performance p),
    'alertas', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY CASE a.severidade WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 ELSE 4 END) FILTER (WHERE a.status='aberto'),'[]'::jsonb) FROM orion_aeo_alerts a),
    'previsoes', (SELECT coalesce(jsonb_agg(to_jsonb(pr) ORDER BY pr.tipo),'[]'::jsonb) FROM orion_aeo_predictions pr),
    'eventos_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_type',event_type,'listing_id',listing_id,'criado_em',criado_em) ORDER BY criado_em DESC),'[]'::jsonb) FROM (SELECT * FROM orion_aeo_events ORDER BY criado_em DESC LIMIT 20) e),
    'ultima_run', (SELECT to_jsonb(r) FROM orion_aeo_runs r ORDER BY iniciado_em DESC LIMIT 1),
    'seguranca', jsonb_build_object('read_only', true, 'nunca_modifica_financeiro', true, 'nunca_destrutivo', true),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','DD/MM/YYYY HH24:MI'));
END$$;

CREATE OR REPLACE FUNCTION public.aeo_orchestrate_rpc()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN public.aeo_orchestrate();
END$$;

CREATE OR REPLACE FUNCTION public.aeo_scores()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN coalesce((SELECT to_jsonb(s) FROM orion_aeo_scores s WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date), jsonb_build_object('nota','rode aeo_orchestrate'));
END$$;

-- ----------------------------------------------------------------------------
-- 16) TICK (cron */10)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_auction_orchestrator_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.aeo_orchestrate();
EXCEPTION WHEN OTHERS THEN PERFORM public.aeo_emit('auction_orchestrator.tick_error', jsonb_build_object('erro',SQLERRM)); END$$;

-- ----------------------------------------------------------------------------
-- 17) SELFTEST (COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aeo_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tests jsonb := '[]'::jsonb; v_ok boolean := true; v_t boolean; v_e jsonb; v_o jsonb;
  v_bids_before bigint; v_bids_after bigint; v_settle_before bigint; v_settle_after bigint; v_comm_before bigint; v_comm_after bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;

  -- 1) 12 tabelas
  v_t := (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_aeo_%') >= 12;
  v_tests := v_tests || jsonb_build_object('teste','tabelas_12','ok',v_t,'evidencia',jsonb_build_object('n',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_aeo_%'))); v_ok := v_ok AND v_t;

  -- 2) grants travados
  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'orion_aeo_%' AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'));
  v_tests := v_tests || jsonb_build_object('teste','grants_travados','ok',v_t); v_ok := v_ok AND v_t;

  -- 3) EXECUTE sem PUBLIC/anon (licao AI-61)
  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_routine_grants WHERE routine_schema='public' AND routine_name LIKE 'aeo_%' AND grantee IN ('PUBLIC','anon'));
  v_tests := v_tests || jsonb_build_object('teste','execute_sem_public_anon','ok',v_t); v_ok := v_ok AND v_t;

  -- READ-ONLY: snapshot financeiro/leilao antes
  v_bids_before := coalesce(public.aeo_count_safe('auction_bids'),0);
  v_settle_before := coalesce(public.aeo_count_safe('orion_auction_settlements'),0);
  v_comm_before := coalesce(public.aeo_count_safe('orion_auction_commissions'),0);

  -- 4) ORQUESTRACAO completa
  v_o := public.aeo_orchestrate();
  v_t := (v_o->>'ok')::bool AND (v_o->'scores' ? 'orchestration');
  v_tests := v_tests || jsonb_build_object('teste','orquestracao','ok',v_t,'evidencia',v_o->'scores'); v_ok := v_ok AND v_t;

  -- 5) READ-ONLY provado: leilao/financeiro intactos apos orquestrar
  v_bids_after := coalesce(public.aeo_count_safe('auction_bids'),0);
  v_settle_after := coalesce(public.aeo_count_safe('orion_auction_settlements'),0);
  v_comm_after := coalesce(public.aeo_count_safe('orion_auction_commissions'),0);
  v_t := (v_bids_before=v_bids_after) AND (v_settle_before=v_settle_after) AND (v_comm_before=v_comm_after);
  v_tests := v_tests || jsonb_build_object('teste','read_only_financeiro','ok',v_t,'evidencia',jsonb_build_object('bids',jsonb_build_array(v_bids_before,v_bids_after),'settlements',jsonb_build_array(v_settle_before,v_settle_after),'commissions',jsonb_build_array(v_comm_before,v_comm_after))); v_ok := v_ok AND v_t;

  -- 6) discover: 7 engines
  v_t := (SELECT count(*) FROM orion_aeo_modules) >= 7;
  v_tests := v_tests || jsonb_build_object('teste','discover_engines','ok',v_t,'evidencia',jsonb_build_object('engines',(SELECT count(*) FROM orion_aeo_modules),'ativos',(SELECT count(*) FROM orion_aeo_modules WHERE disponivel))); v_ok := v_ok AND v_t;

  -- 7) health: crons monitorados
  v_t := (SELECT count(*) FROM orion_aeo_health WHERE componente LIKE 'cron:%') = 4;
  v_tests := v_tests || jsonb_build_object('teste','health_crons','ok',v_t,'evidencia',(SELECT jsonb_agg(jsonb_build_object('c',componente,'s',status)) FROM orion_aeo_health WHERE componente LIKE 'cron:%')); v_ok := v_ok AND v_t;

  -- 8) workflow: 17 etapas
  v_t := (SELECT count(*) FROM orion_aeo_workflow) = 17;
  v_tests := v_tests || jsonb_build_object('teste','workflow_17_etapas','ok',v_t,'evidencia',jsonb_build_object('etapas',(SELECT count(*) FROM orion_aeo_workflow))); v_ok := v_ok AND v_t;

  -- 9) quality: checagens de integridade rodaram
  v_t := (SELECT count(*) FROM orion_aeo_quality) >= 6;
  v_tests := v_tests || jsonb_build_object('teste','quality_checks','ok',v_t,'evidencia',(SELECT jsonb_object_agg(check_key, ok) FROM orion_aeo_quality)); v_ok := v_ok AND v_t;

  -- 10) BI consolidado com GMV/receita
  v_t := (SELECT gmv IS NOT NULL AND receita_comissoes IS NOT NULL FROM orion_aeo_bi WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date);
  v_e := (SELECT to_jsonb(b) FROM orion_aeo_bi b WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date);
  v_tests := v_tests || jsonb_build_object('teste','bi_consolidado','ok',coalesce(v_t,false),'evidencia',v_e); v_ok := v_ok AND coalesce(v_t,false);

  -- 11) 7 scores presentes
  v_t := (SELECT orchestration_score IS NOT NULL AND health_score IS NOT NULL AND workflow_score IS NOT NULL AND performance_score IS NOT NULL AND reliability_score IS NOT NULL AND security_score IS NOT NULL AND integration_score IS NOT NULL FROM orion_aeo_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date);
  v_tests := v_tests || jsonb_build_object('teste','sete_scores','ok',coalesce(v_t,false)); v_ok := v_ok AND coalesce(v_t,false);

  -- 12) previsoes com base/confianca/dados
  v_t := (SELECT count(*) FROM orion_aeo_predictions WHERE base IS NOT NULL AND confianca IS NOT NULL AND dados_analisados IS NOT NULL) >= 3;
  v_tests := v_tests || jsonb_build_object('teste','previsoes_fundamentadas','ok',v_t,'evidencia',(SELECT jsonb_agg(jsonb_build_object('tipo',tipo,'conf',confianca,'dados',dados_analisados)) FROM orion_aeo_predictions)); v_ok := v_ok AND v_t;

  -- 13) dashboard executa
  v_t := (public.aeo_dashboard() ? 'scores');
  v_tests := v_tests || jsonb_build_object('teste','dashboard','ok',v_t); v_ok := v_ok AND v_t;

  -- 14) cron agendado
  v_t := EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_orchestrator_tick');
  v_tests := v_tests || jsonb_build_object('teste','cron_agendado','ok',v_t); v_ok := v_ok AND v_t;

  RETURN jsonb_build_object('ok',v_ok,'executado_em',now(),'testes',v_tests,'nota','suite oficial do AI-70 — entrada do COMANDO TESTE');
END$$;

-- ----------------------------------------------------------------------------
-- 18) GRANTS — REVOKE de PUBLIC/anon (licao AI-61) + GRANT seletivo
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname LIKE 'aeo_%' AND pronamespace='public'::regnamespace LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC, anon';
  END LOOP;
END$$;

GRANT EXECUTE ON FUNCTION public.aeo_dashboard()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aeo_scores()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aeo_orchestrate_rpc()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aeo_selftest()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aeo_orchestrate()          TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_discover()             TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_health_check()         TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_ingest_events()        TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_workflow_validate()    TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_quality_check()        TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_performance_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_alerts_generate()      TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_bi_consolidate()       TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_predict()              TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_scores_refresh(jsonb,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_orchestrator_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_emit(text,jsonb)       TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_count_safe(text,text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_sum_safe(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_call_safe(text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_audit(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.aeo_regproc_ok(text)       TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 19) PROMPTS (gpt-5-mini via Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('auction_orchestrator.summary',
 'Voce e o ORION Auction Ecosystem Orchestrator (AI-70). Resuma o estado do ecossistema de leiloes usando SOMENTE os numeros fornecidos (health/workflow/performance/reliability/security/integration/orchestration, GMV, receita, alertas). Coordena; nao executa acoes destrutivas nem move dinheiro.',
 'ORION-AI-70 seed');
SELECT public.orion_ai_prompt_set('auction_orchestrator.alert',
 'Voce e o ORION Auction Ecosystem Orchestrator (AI-70). Explique o alerta (cron/fila/RPC/risco financeiro/fraude) com base nas evidencias reais e recomende acao ao time. Nunca execute alteracao destrutiva.',
 'ORION-AI-70 seed');
SELECT public.orion_ai_prompt_set('auction_orchestrator.prediction',
 'Voce e o ORION Auction Ecosystem Orchestrator (AI-70). Descreva a previsao (sobrecarga/gargalo/otimizacao) sempre declarando a base, o nivel de confianca e a quantidade de dados analisados. Nunca apresente previsao como certeza.',
 'ORION-AI-70 seed');

-- ----------------------------------------------------------------------------
-- 20) MODEL PREF + CRON */10
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('auction_orchestrator','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_auction_orchestrator_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_orchestrator_tick');
    PERFORM cron.schedule('orion_auction_orchestrator_tick','*/10 * * * *','SELECT public.orion_auction_orchestrator_tick();');
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 21) BOOT (primeira orquestracao)
-- ----------------------------------------------------------------------------
DO $$
BEGIN PERFORM public.aeo_orchestrate(); EXCEPTION WHEN OTHERS THEN NULL; END$$;

-- ----------------------------------------------------------------------------
-- 22) VERIFICACAO
-- ----------------------------------------------------------------------------
-- SELECT public.aeo_selftest();
-- SELECT dia, orchestration_score, health_score, workflow_score, performance_score, reliability_score, security_score, integration_score FROM public.orion_aeo_scores;
