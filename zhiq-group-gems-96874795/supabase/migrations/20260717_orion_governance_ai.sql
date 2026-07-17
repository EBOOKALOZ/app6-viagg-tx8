-- ============================================================================
-- ORION-AI-50 — GOVERNANCE AI v1.0  (o Governador do ecossistema ORION)
-- ============================================================================
-- Governa o CICLO DE VIDA de TODAS as IAs ORION (existentes e futuras, 100%
--   dinamico): registro global AUTO-DESCOBERTO da producao, versoes, deps,
--   certificacoes, lifecycle e saude operacional — com alertas e scores.
-- ANTI-COLISAO (critica): spec sugeria orion_ai_* — MINADO (Gateway AI-00:
--   orion_ai_models/config/prefs/log/cache/prompts; AI-37: orion_ai_usage/...;
--   AI-38: orion_ai_budgets/policies/audit). Funcoes governance_* SAO do AI-38.
--   AI-50 usa namespace proprio orion_gov_* + funcoes gov_* + chave
--   'governance' (AI-38 = governanca de CUSTO de IA; AI-50 = governanca de
--   CICLO DE VIDA de modulos; OCE = certificador de qualidade — AI-50 LE, nao
--   recalcula). Painel /admin/orion-governance (AI-38 usa /admin/orion-ai-
--   governance — rotas distintas). Mapa spec->real: 13 tabelas sugeridas
--   consolidadas em 8 (versions absorve deployments/change_history; registry
--   absorve modules/health/tests/documentation como campos+alertas).
-- FONTES REAIS: orion_ai_module_prefs (identidade tecnica = chave), cron.job +
--   job_run_details (tick/saude), orion_ai_prompts (cobertura de prompts),
--   orion_ai_log (uso/erros por modulo). Numeros/nomes/certificacoes seedados
--   da numeracao oficial (DOCS = dado documentado real). LACUNAS DECLARADAS:
--   build/branch/commit/deploy do front (git invisivel do banco), cobertura de
--   docs por arquivo (repo), testes por modulo (so os selftests conhecidos).
-- Suite: gov_selftest() = entrada do COMANDO TESTE. Idempotente. Historico
-- imutavel (lifecycle/changes sem UPD/DEL). SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orion_gov_registry (
  module      text PRIMARY KEY,            -- chave tecnica (identidade oficial)
  numero      text,                        -- rotulo humano (AI-NN) da numeracao
  nome        text,
  categoria   text NOT NULL DEFAULT 'operacional',
  status      text NOT NULL DEFAULT 'producao',  -- planejamento|desenvolvimento|testes|homologacao|certificacao|producao|atualizacao|descontinuada|arquivada
  versao      text NOT NULL DEFAULT 'v1',
  score       integer,
  certificado_em date,
  cron_job    text,
  cron_ativo  boolean,
  ultima_execucao timestamptz,
  prompts_ativos integer NOT NULL DEFAULT 0,
  uso_7d      integer NOT NULL DEFAULT 0,
  erros_7d    integer NOT NULL DEFAULT 0,
  painel      text,
  docs_status text NOT NULL DEFAULT 'declarado',
  health      text NOT NULL DEFAULT 'desconhecido', -- verde|amarelo|vermelho|desconhecido
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_gov_registry IS 'ORION-AI-50: registro global de IAs — AUTO-DESCOBERTO de orion_ai_module_prefs + cron + prompts + log; numero/nome/cert da numeracao oficial. Dinamico: modulo novo aparece sozinho.';

CREATE TABLE IF NOT EXISTS public.orion_gov_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module text NOT NULL, versao text NOT NULL, tipo text NOT NULL DEFAULT 'versao', -- versao|deploy|migration|rollback
  changelog text, commit_ref text, criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_gov_versions_uq UNIQUE (module, versao, tipo)
);
COMMENT ON TABLE public.orion_gov_versions IS 'ORION-AI-50: versoes/deploys/rollbacks por modulo (historico imutavel; absorve deployments+change_history).';

CREATE TABLE IF NOT EXISTS public.orion_gov_certifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module text NOT NULL, score integer NOT NULL, data date NOT NULL,
  auditor text NOT NULL DEFAULT 'sessao Claude + homologacao no banco vivo',
  aprovado boolean NOT NULL DEFAULT true, evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_gov_cert_uq UNIQUE (module, data)
);
COMMENT ON TABLE public.orion_gov_certifications IS 'ORION-AI-50: historico permanente de certificacoes (seed = numeracao oficial; futuras via OCE/homologacoes).';

CREATE TABLE IF NOT EXISTS public.orion_gov_dependencies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module text NOT NULL, depende_de text NOT NULL, tipo text NOT NULL DEFAULT 'ia', -- ia|banco|cron|painel|edge|rpc
  quebrada boolean NOT NULL DEFAULT false, verificado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_gov_dep_uq UNIQUE (module, depende_de, tipo)
);
COMMENT ON TABLE public.orion_gov_dependencies IS 'ORION-AI-50: grafo de dependencias; quebrada=true quando o alvo nao existe mais no registro.';

CREATE TABLE IF NOT EXISTS public.orion_gov_policies (
  politica text PRIMARY KEY, descricao text NOT NULL, ativa boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orion_gov_lifecycle (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module text NOT NULL, fase text NOT NULL, nota text, momento timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_gov_lifecycle IS 'ORION-AI-50: transicoes de ciclo de vida (imutavel; nunca remover historico).';
CREATE TABLE IF NOT EXISTS public.orion_gov_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alerta text NOT NULL, severidade text NOT NULL DEFAULT 'media', categoria text NOT NULL,
  chave text NOT NULL DEFAULT 'geral', evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolvido boolean NOT NULL DEFAULT false,
  dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_gov_alerts_uq UNIQUE (categoria, chave, dia)
);
CREATE TABLE IF NOT EXISTS public.orion_gov_statistics (
  data date PRIMARY KEY,
  total int NOT NULL DEFAULT 0, certificadas int NOT NULL DEFAULT 0, producao int NOT NULL DEFAULT 0,
  saudaveis int NOT NULL DEFAULT 0, crons_ativos int NOT NULL DEFAULT 0, deps_quebradas int NOT NULL DEFAULT 0,
  gs int NOT NULL DEFAULT 0, ls int NOT NULL DEFAULT 0, cs int NOT NULL DEFAULT 0,
  deps int NOT NULL DEFAULT 0, ohs int NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_gov_registry','orion_gov_versions','orion_gov_certifications',
    'orion_gov_dependencies','orion_gov_policies','orion_gov_lifecycle','orion_gov_alerts','orion_gov_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;
REVOKE UPDATE, DELETE ON public.orion_gov_lifecycle FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.orion_gov_versions  FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.gov_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'gov: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.gov_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'governance', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.gov_emit(text,jsonb) FROM public, anon, authenticated;

-- ===== MOTOR: sincroniza registro (auto-descoberta) + saude + alertas =======
CREATE OR REPLACE FUNCTION public.run_governance_check(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace,'gov_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_novos int := 0; r record;
BEGIN
  PERFORM public.gov_guard();

  -- 1) AUTO-DESCOBERTA: todo modulo do Gateway entra no registro (dinamico)
  INSERT INTO public.orion_gov_registry (module)
  SELECT p.module FROM public.orion_ai_module_prefs p
  ON CONFLICT (module) DO NOTHING;
  GET DIAGNOSTICS v_novos = ROW_COUNT;
  IF v_novos > 0 THEN
    INSERT INTO public.orion_gov_lifecycle (module, fase, nota)
    SELECT g.module, 'producao', 'auto-descoberto no Gateway (orion_ai_module_prefs)'
    FROM public.orion_gov_registry g WHERE g.criado_em > now()-interval '1 minute';
  END IF;

  -- 2) SAUDE REAL por modulo: cron + prompts + uso/erros do Gateway
  UPDATE public.orion_gov_registry g SET
    cron_ativo = c.active,
    ultima_execucao = c.ultima,
    prompts_ativos = coalesce(c.prompts_n,0),
    uso_7d = coalesce(c.tot,0), erros_7d = coalesce(c.err,0),
    health = CASE
      WHEN g.cron_job IS NULL THEN CASE WHEN coalesce(c.err,0) > 10 THEN 'amarelo' ELSE 'verde' END
      WHEN c.active IS NOT TRUE THEN 'vermelho'
      WHEN c.ultima < now()-interval '3 hours' THEN 'amarelo'
      WHEN coalesce(c.err,0) > 10 THEN 'amarelo'
      ELSE 'verde' END,
    atualizado_em = now()
  FROM (SELECT g2.module,
          (SELECT j.active FROM cron.job j WHERE j.jobname=g2.cron_job) active,
          (SELECT max(d.start_time) FROM cron.job_run_details d JOIN cron.job j2 ON j2.jobid=d.jobid WHERE j2.jobname=g2.cron_job) ultima,
          (SELECT count(*)::int FROM public.orion_ai_prompts pp WHERE pp.ativo AND pp.chave LIKE g2.module||'.%') prompts_n,
          (SELECT count(*)::int FROM public.orion_ai_log ll WHERE ll.module=g2.module AND ll.criado_em > now()-interval '7 days') tot,
          (SELECT count(*)::int FROM public.orion_ai_log ll WHERE ll.module=g2.module AND ll.status<>'ok' AND ll.criado_em > now()-interval '7 days') err
        FROM public.orion_gov_registry g2) c
  WHERE c.module = g.module;

  -- 3) DEPENDENCIAS quebradas (alvo sumiu do registro)
  UPDATE public.orion_gov_dependencies d SET quebrada = NOT EXISTS
    (SELECT 1 FROM public.orion_gov_registry g WHERE g.module=d.depende_de), verificado_em=now()
  WHERE d.tipo='ia';

  -- 4) ALERTAS (1/categoria/chave/dia)
  INSERT INTO public.orion_gov_alerts (alerta, severidade, categoria, chave, evidencias)
  SELECT 'Cron parado/ausente: '||module, 'alta', 'cron', module,
         jsonb_build_object('cron_job',cron_job,'ativo',cron_ativo,'ultima',ultima_execucao)
  FROM public.orion_gov_registry WHERE health='vermelho'
  ON CONFLICT (categoria, chave, dia) DO UPDATE SET evidencias=excluded.evidencias;

  INSERT INTO public.orion_gov_alerts (alerta, severidade, categoria, chave, evidencias)
  SELECT 'IA sem certificacao registrada: '||module, 'media', 'certificacao', module, '{}'::jsonb
  FROM public.orion_gov_registry g
  WHERE status='producao' AND NOT EXISTS (SELECT 1 FROM public.orion_gov_certifications ct WHERE ct.module=g.module)
  ON CONFLICT (categoria, chave, dia) DO NOTHING;

  INSERT INTO public.orion_gov_alerts (alerta, severidade, categoria, chave, evidencias)
  SELECT 'Dependencia quebrada: '||module||' -> '||depende_de, 'alta', 'dependencia', module||'>'||depende_de,
         jsonb_build_object('tipo',tipo)
  FROM public.orion_gov_dependencies WHERE quebrada
  ON CONFLICT (categoria, chave, dia) DO NOTHING;

  -- 5) ROLLUP + scores
  INSERT INTO public.orion_gov_statistics AS s (data, total, certificadas, producao, saudaveis, crons_ativos, deps_quebradas, gs, ls, cs, deps, ohs, atualizado_em)
  SELECT v_dia,
    (SELECT count(*) FROM public.orion_gov_registry),
    (SELECT count(DISTINCT module) FROM public.orion_gov_certifications WHERE aprovado),
    (SELECT count(*) FROM public.orion_gov_registry WHERE status='producao'),
    (SELECT count(*) FROM public.orion_gov_registry WHERE health='verde'),
    (SELECT count(*) FROM public.orion_gov_registry WHERE cron_ativo),
    (SELECT count(*) FROM public.orion_gov_dependencies WHERE quebrada),
    (public.gov_scores()->>'gs')::int, (public.gov_scores()->>'ls')::int,
    (public.gov_scores()->>'cs')::int, (public.gov_scores()->>'deps')::int, (public.gov_scores()->>'ohs')::int, now()
  ON CONFLICT (data) DO UPDATE SET total=excluded.total, certificadas=excluded.certificadas, producao=excluded.producao,
    saudaveis=excluded.saudaveis, crons_ativos=excluded.crons_ativos, deps_quebradas=excluded.deps_quebradas,
    gs=excluded.gs, ls=excluded.ls, cs=excluded.cs, deps=excluded.deps, ohs=excluded.ohs, atualizado_em=now();

  PERFORM public.gov_emit('gov.check', jsonb_build_object('trace',v_trace,'novos',v_novos));
  RETURN jsonb_build_object('ok',true,'trace',v_trace,'auto_descobertos',v_novos,
    'total',(SELECT count(*) FROM public.orion_gov_registry),
    'scores', public.gov_scores());
END$$;
REVOKE ALL ON FUNCTION public.run_governance_check(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_governance_check(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gov_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH g AS (SELECT count(*) tot, count(*) FILTER (WHERE health='verde') verde,
                    count(*) FILTER (WHERE status='producao') prod,
                    count(*) FILTER (WHERE cron_job IS NOT NULL AND cron_ativo) cron_ok,
                    count(*) FILTER (WHERE cron_job IS NOT NULL) cron_tot,
                    count(*) FILTER (WHERE prompts_ativos>0) c_prompts
             FROM public.orion_gov_registry),
       c AS (SELECT count(DISTINCT module) n FROM public.orion_gov_certifications WHERE aprovado),
       d AS (SELECT count(*) tot, count(*) FILTER (WHERE NOT quebrada) ok_ FROM public.orion_gov_dependencies)
  SELECT jsonb_build_object(
    'gs', (SELECT CASE WHEN tot>0 THEN round((verde*0.4 + prod*0.2 + c_prompts*0.2)*100.0/tot + 0.2*(SELECT CASE WHEN (SELECT tot FROM d)>0 THEN (SELECT ok_*100.0/tot FROM d) ELSE 100 END))::int ELSE 0 END FROM g),
    'ls', (SELECT CASE WHEN tot>0 THEN round(prod*100.0/tot)::int ELSE 0 END FROM g),
    'cs', (SELECT CASE WHEN (SELECT tot FROM g)>0 THEN round((SELECT n FROM c)*100.0/(SELECT tot FROM g))::int ELSE 0 END),
    'deps', (SELECT CASE WHEN tot>0 THEN round(ok_*100.0/tot)::int ELSE 100 END FROM d),
    'ohs', (SELECT CASE WHEN cron_tot>0 THEN round(cron_ok*100.0/cron_tot)::int ELSE 100 END FROM g),
    'docs', 50,
    'formula','GS=0.4*saude_verde+0.2*producao+0.2*cobertura_prompts+0.2*deps_ok · LS=%producao · CS=%certificadas · DEPS=%deps integras · OHS=%crons ativos · DOCS=50 fixo DECLARADO (arquivos do repo invisiveis do banco)',
    'base',(SELECT jsonb_build_object('modulos',tot,'verdes',verde,'certificadas',(SELECT n FROM c),'crons',cron_ok||'/'||cron_tot) FROM g));
$$;
GRANT EXECUTE ON FUNCTION public.gov_scores() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gov_set_lifecycle(p_module text, p_fase text, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.gov_guard();
  IF p_fase NOT IN ('planejamento','desenvolvimento','testes','homologacao','certificacao','producao','atualizacao','descontinuada','arquivada') THEN
    RAISE EXCEPTION 'fase invalida: %', p_fase; END IF;
  UPDATE public.orion_gov_registry SET status=p_fase, atualizado_em=now() WHERE module=p_module;
  IF NOT FOUND THEN RAISE EXCEPTION 'modulo inexistente: %', p_module; END IF;
  INSERT INTO public.orion_gov_lifecycle (module, fase, nota) VALUES (p_module, p_fase, coalesce(p_nota,'via gov_set_lifecycle'));
  PERFORM public.gov_emit('gov.lifecycle', jsonb_build_object('module',p_module,'fase',p_fase));
  RETURN jsonb_build_object('ok',true,'module',p_module,'fase',p_fase);
END$$;
REVOKE ALL ON FUNCTION public.gov_set_lifecycle(text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gov_set_lifecycle(text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gov_register_version(p_module text, p_versao text, p_tipo text DEFAULT 'versao', p_changelog text DEFAULT NULL, p_commit text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.gov_guard();
  INSERT INTO public.orion_gov_versions (module, versao, tipo, changelog, commit_ref)
  VALUES (p_module, p_versao, p_tipo, p_changelog, p_commit)
  ON CONFLICT (module, versao, tipo) DO UPDATE SET changelog=coalesce(excluded.changelog, orion_gov_versions.changelog);
  UPDATE public.orion_gov_registry SET versao=p_versao, atualizado_em=now() WHERE module=p_module AND p_tipo='versao';
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.gov_register_version(text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gov_register_version(text,text,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gov_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.gov_guard();
  v := jsonb_build_object(
    'scores', public.gov_scores(),
    'registry', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY coalesce(g.numero,'ZZ'), g.module),'[]'::jsonb) FROM public.orion_gov_registry g),
    'certifications', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_gov_certifications ORDER BY data DESC LIMIT 80) c),
    'dependencies', (SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.orion_gov_dependencies d),
    'lifecycle', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.momento DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_gov_lifecycle ORDER BY momento DESC LIMIT 40) l),
    'versions', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.criado_em DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_gov_versions ORDER BY criado_em DESC LIMIT 40) x),
    'policies', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.politica),'[]'::jsonb) FROM public.orion_gov_policies p),
    'alerts', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_gov_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7 ORDER BY criado_em DESC LIMIT 60) a),
    'statistics', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_gov_statistics ORDER BY data DESC LIMIT 30) s),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.gov_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gov_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gov_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('scores', public.gov_scores(),
    'vermelhos',(SELECT coalesce(jsonb_agg(module),'[]'::jsonb) FROM public.orion_gov_registry WHERE health='vermelho'),
    'sem_cert',(SELECT count(*) FROM public.orion_gov_registry g WHERE NOT EXISTS (SELECT 1 FROM public.orion_gov_certifications c WHERE c.module=g.module)));
$$;
GRANT EXECUTE ON FUNCTION public.gov_summary() TO authenticated, service_role;

-- ===== SELFTEST (COMANDO TESTE) =============================================
CREATE OR REPLACE FUNCTION public.gov_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checks jsonb := '[]'::jsonb; v_fail int; v_r jsonb;
BEGIN
  PERFORM public.gov_guard();
  v_r := public.run_governance_check('selftest');
  v_checks := v_checks || jsonb_build_object('check','motor_roda','ok', (v_r->>'ok')::boolean);
  v_checks := v_checks || jsonb_build_object('check','auto_descoberta_50mais','ok',
    (SELECT count(*) FROM public.orion_gov_registry) >= 50);
  v_checks := v_checks || jsonb_build_object('check','saude_medida','ok',
    (SELECT count(*) FROM public.orion_gov_registry WHERE health <> 'desconhecido') >= 40);
  v_checks := v_checks || jsonb_build_object('check','numeracao_seed','ok',
    (SELECT count(*) FROM public.orion_gov_registry WHERE numero IS NOT NULL) >= 40);
  v_checks := v_checks || jsonb_build_object('check','certificacoes_seed','ok',
    (SELECT count(DISTINCT module) FROM public.orion_gov_certifications) >= 40);
  v_checks := v_checks || jsonb_build_object('check','deps_seed','ok',
    (SELECT count(*) FROM public.orion_gov_dependencies) >= 10);
  PERFORM public.gov_set_lifecycle('governance','atualizacao','selftest');
  v_checks := v_checks || jsonb_build_object('check','lifecycle_muda','ok',
    (SELECT status FROM public.orion_gov_registry WHERE module='governance')='atualizacao');
  PERFORM public.gov_set_lifecycle('governance','producao','selftest volta');
  v_checks := v_checks || jsonb_build_object('check','lifecycle_historico','ok',
    (SELECT count(*) FROM public.orion_gov_lifecycle WHERE module='governance') >= 2);
  PERFORM public.gov_register_version('governance','v1','versao','selftest','head');
  v_checks := v_checks || jsonb_build_object('check','versao_registra','ok',
    EXISTS (SELECT 1 FROM public.orion_gov_versions WHERE module='governance'));
  v_checks := v_checks || jsonb_build_object('check','scores_0_100','ok',
    (public.gov_scores()->>'gs')::int BETWEEN 0 AND 100);
  v_checks := v_checks || jsonb_build_object('check','imutavel_lifecycle','ok',
    NOT has_table_privilege('authenticated','public.orion_gov_lifecycle','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok',
    NOT has_table_privilege('anon','public.orion_gov_registry','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_gov_tick'));
  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-50 — entrada do COMANDO TESTE');
END$$;
REVOKE ALL ON FUNCTION public.gov_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gov_selftest() TO authenticated, service_role;

-- ===== SEEDS: numeracao oficial (numero/nome/cron/cert) + deps + politicas ==
WITH mapa(module, numero, nome, cron_job, score, cert) AS (VALUES
  ('publisher','AI-01','Publisher AI',NULL,98,'2026-07-14'),('ridv','AI-02','RIDV AI','ridv_worker_tick',99,'2026-07-14'),
  ('package','AI-03','Package AI','orion_package_tick',100,'2026-07-14'),('finance','AI-04','Finance AI','orion_finance_tick',97,'2026-07-14'),
  ('campaign','AI-05','Campaign AI','orion_campaign_tick',99,'2026-07-14'),('dispatcher','AI-06','Dispatcher AI','orion_dispatcher_tick',100,'2026-07-14'),
  ('growth','AI-07','Growth AI','orion_growth_tick',100,'2026-07-14'),('execution','AI-08','Execution Orchestrator','orion_execution_tick',99,'2026-07-14'),
  ('conversion','AI-09','Conversion & Attribution','orion_conversion_tick',96,'2026-07-14'),('health','AI-10','Health Center','orion_health_tick',98,'2026-07-14'),
  ('performance','AI-11','Performance AI','orion_perf_tick',99,'2026-07-14'),('executive','AI-12','Command Center','orion_executive_tick',98,'2026-07-14'),
  ('operations','AI-13','Operations AI','orion_operations_tick',98,'2026-07-14'),('strategy','AI-14','Strategy Suite','orion_strategy_tick',95,'2026-07-14'),
  ('pricing','AI-15','Pricing AI',NULL,98,'2026-07-14'),('forecast','AI-16','Demand Forecast','orion_forecast_tick',90,'2026-07-14'),
  ('support','AI-17','Support AI','orion_support_tick',97,'2026-07-14'),('marketplace','AI-18','Marketplace Intelligence','orion_market_tick',97,'2026-07-15'),
  ('personalization','AI-19','Personalization AI','orion_perso_tick',97,'2026-07-15'),('trust','AI-20','Trust & Reputation','orion_trust_tick',97,'2026-07-15'),
  ('automation','AI-21','Automation AI','orion_automation_tick',97,'2026-07-15'),('business','AI-22','Business Intelligence','orion_bi_tick',98,'2026-07-15'),
  ('marketing','AI-23','Marketing AI','orion_marketing_tick',97,'2026-07-15'),('security','AI-24','Security AI','orion_security_tick',97,'2026-07-15'),
  ('sales','AI-25','Sales AI','orion_sales_tick',97,'2026-07-15'),('customer_success','AI-26','Customer Success','orion_customer_success_tick',97,'2026-07-15'),
  ('logistics','AI-27','Logistics AI','orion_logistics_tick',97,'2026-07-15'),('sustainability','AI-28','Sustainability AI','orion_sustainability_tick',97,'2026-07-15'),
  ('innovation','AI-29','Innovation AI','orion_innovation_tick',97,'2026-07-15'),('executive_copilot','AI-30','Executive/CEO Copilot','orion_executive_tick',98,'2026-07-15'),
  ('search_discovery','AI-32','Search & Discovery','orion_search_tick',97,'2026-07-16'),('geo_optimization','AI-33','GEO Optimization','orion_geo_tick',97,'2026-07-16'),
  ('knowledge_graph','AI-34','Knowledge Graph','orion_knowledge_tick',97,'2026-07-16'),('recommendation_ai','AI-35','Recommendation Intelligence','orion_recommendation_tick',97,'2026-07-16'),
  ('ai_visibility','AI-36','AI Visibility & Answer','orion_ai_visibility_tick',97,'2026-07-16'),('ai_center','AI-37','AI Cost & Intelligence Center','orion_ai_center_tick',97,'2026-07-16'),
  ('ai_governance','AI-38','AI Governance Center','orion_ai_governance_tick',98,'2026-07-16'),('visitor_intelligence','AI-39','Visitor Intelligence','orion_visitor_tick',97,'2026-07-16'),
  ('cyber_defense','AI-40','Cyber Defense','orion_cyber_tick',97,'2026-07-17'),('fraud_detection','AI-41','Fraud Detection','orion_fraud_tick',97,'2026-07-17'),
  ('identity_access','AI-42','Identity & Access',NULL,97,'2026-07-17'),('threat_intelligence','AI-43','Threat Intelligence',NULL,97,'2026-07-17'),
  ('security_audit','AI-44','Security Audit','orion_secaudit_tick',97,'2026-07-17'),('incident_response','AI-45','Incident Response','orion_incident_tick',97,'2026-07-17'),
  ('backup_recovery','AI-46','Backup & Disaster Recovery',NULL,97,'2026-07-17'),('zero_trust','AI-47','Zero Trust',NULL,97,'2026-07-17'),
  ('compliance_lgpd','AI-48','Compliance & LGPD','orion_compliance_tick',97,'2026-07-17'),('soc_commander','AI-49','SOC Commander',NULL,97,'2026-07-17'),
  ('certification','OCE','Certification Engine','orion_oce_tick',100,'2026-07-15'),('governance','AI-50','Governance AI','orion_gov_tick',NULL,NULL)
)
INSERT INTO public.orion_gov_registry (module, numero, nome, cron_job, score, certificado_em)
SELECT module, numero, nome, cron_job, score, cert::date FROM mapa
ON CONFLICT (module) DO UPDATE SET numero=excluded.numero, nome=excluded.nome,
  cron_job=coalesce(excluded.cron_job, orion_gov_registry.cron_job),
  score=coalesce(excluded.score, orion_gov_registry.score),
  certificado_em=coalesce(excluded.certificado_em, orion_gov_registry.certificado_em);

INSERT INTO public.orion_gov_certifications (module, score, data, evidencias)
SELECT module, score, certificado_em, jsonb_build_object('fonte','DOCS/orion-arquitetura-numeracao-oficial.md')
FROM public.orion_gov_registry WHERE score IS NOT NULL AND certificado_em IS NOT NULL
ON CONFLICT (module, data) DO NOTHING;

INSERT INTO public.orion_gov_dependencies (module, depende_de, tipo) VALUES
  ('fraud_detection','cyber_defense','ia'),('identity_access','cyber_defense','ia'),
  ('threat_intelligence','cyber_defense','ia'),('security_audit','cyber_defense','ia'),
  ('incident_response','cyber_defense','ia'),('incident_response','threat_intelligence','ia'),
  ('incident_response','identity_access','ia'),('compliance_lgpd','security_audit','ia'),
  ('compliance_lgpd','incident_response','ia'),('soc_commander','incident_response','ia'),
  ('ai_governance','ai_center','ia'),('geo_optimization','search_discovery','ia'),
  ('knowledge_graph','search_discovery','ia'),('recommendation_ai','knowledge_graph','ia'),
  ('ai_visibility','recommendation_ai','ia')
ON CONFLICT (module, depende_de, tipo) DO NOTHING;

INSERT INTO public.orion_gov_policies (politica, descricao) VALUES
  ('namespace_proprio','Todo modulo novo usa namespace proprio de tabelas/funcoes; chave tecnica unica no Gateway'),
  ('homologacao_banco_vivo','Certificacao exige homologacao no banco vivo com evidencias (idempotencia, read-only, imutabilidade)'),
  ('selftest_comando_teste','Modulos novos expoem selftest estavel integrado ao COMANDO TESTE'),
  ('rollback_documentado','Toda migration traz bloco ROLLBACK manual; rollback preserva historico'),
  ('docs_quadruplo','4 docs por modulo (principal/api/dashboard/certificacao) + numeracao + master + ecosystem'),
  ('sem_default_grants','REVOKE ALL + GRANT minimo em toda tabela nova (TRUNCATE ignora RLS)'),
  ('evidencia_obrigatoria','Nenhuma conclusao sem evidencia; lacunas declaradas, nunca inventadas'),
  ('deploy_manual_usuario','Deploy do front e SEMPRE manual pelo usuario (vercel --prod)')
ON CONFLICT (politica) DO NOTHING;

SELECT public.orion_ai_prompt_set('governance.audit','Voce e o ORION Governance. Explique o estado de governanca do ecossistema (registro, saude, certificacoes, dependencias) com base nas evidencias reais. Aponte os 3 riscos prioritarios.','ORION-AI-50 seed');
SELECT public.orion_ai_prompt_set('governance.lifecycle','Voce e o ORION Governance. Analise o ciclo de vida dos modulos (fases, transicoes, pendencias) e recomende proximos passos por modulo.','ORION-AI-50 seed');
SELECT public.orion_ai_prompt_set('governance.version','Voce e o ORION Governance. Compare versoes/mudancas registradas e explique impacto e compatibilidade. Base-se so no historico fornecido.','ORION-AI-50 seed');
SELECT public.orion_ai_prompt_set('governance.health','Voce e o ORION Governance. Explique a saude operacional (crons, execucoes, erros do Gateway) modulo a modulo; destaque vermelhos/amarelos com evidencia.','ORION-AI-50 seed');
SELECT public.orion_ai_prompt_set('governance.summary','Voce e o ORION Governance. Gere resumo executivo do ecossistema ORION (total, certificadas, saude, alertas) para lideranca nao-tecnica.','ORION-AI-50 seed');
SELECT public.orion_ai_prompt_set('governance.recommendation','Voce e o ORION Governance. Priorize melhorias de governanca (certificar, reativar cron, corrigir dependencia, documentar) por impacto x esforco.','ORION-AI-50 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('governance','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_gov_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_governance_check('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_gov_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_gov_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_gov_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_gov_tick');
    PERFORM cron.schedule('orion_gov_tick','*/10 * * * *','SELECT public.orion_gov_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_gov_%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'gov_%' OR p.proname IN ('run_governance_check','orion_gov_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_gov_registry) AS registry,
  (SELECT count(*) FROM public.orion_gov_policies) AS politicas,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_gov_tick') AS cron_job;

-- ROLLBACK (manual): cron.unschedule('orion_gov_tick'); DROP FUNCTION gov_*/run_governance_check/orion_gov_tick;
--   DROP TABLE orion_gov_* CASCADE; DELETE FROM orion_ai_module_prefs WHERE module='governance';
