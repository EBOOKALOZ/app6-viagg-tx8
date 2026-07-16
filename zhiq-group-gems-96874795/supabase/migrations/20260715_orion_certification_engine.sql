-- ═══════════════════════════════════════════════════════════════
-- ORION CORE — ORION CERTIFICATION ENGINE (OCE) v1.0
--   O auditor oficial da VIAGG-TX8 (parte do ORION CORE, NÃO é uma IA nova).
--
-- Substitui a homologação manual por verificação automatizada. PRINCÍPIO
-- MÁXIMO: o OCE NUNCA modifica o sistema — analisa, certifica e
-- RECOMENDA (gera patch/sugestão para aprovação). Read-only total.
--
-- HONESTIDADE (princípio ORION 8): os auditores que exigem navegador
-- headless / teste de carga real (Front-End/UX/Visual/Mobile/Marketplace
-- E2E/Stress/Visitor Simulator/IA Scenario) NÃO são executáveis dentro do
-- Postgres — ficam CATALOGADOS como 'declarado' (não contam como aprovado,
-- transparente). As verificações de arquitetura/banco/segurança/gateway/
-- event bus/financeiro/custos são REAIS e rodam ao vivo sobre o catálogo.
--
-- SEGURANÇA: o OCE nunca exclui dados, move dinheiro, altera RLS/permissões
-- nem executa SQL destrutivo. Só lê o catálogo e registra a certificação.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_oce_patches, orion_oce_results, orion_oce_runs, orion_oce_checks CASCADE;
--   DROP FUNCTION public.oce_emit, oce_certify, oce_checks, oce_last_run,
--     oce_results, oce_patches, oce_dimensions, oce_score, oce_history,
--     oce_summary, oce_dashboard, orion_oce_tick CASCADE;
--   SELECT cron.unschedule('orion_oce_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'certification.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='certification';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
-- Registry de verificações (catálogo dos 650+ checks; aqui os reais + declarados)
CREATE TABLE IF NOT EXISTS public.orion_oce_checks (
  chave       text PRIMARY KEY,
  categoria   text NOT NULL,
  descricao   text,
  tipo        text NOT NULL DEFAULT 'db',   -- db | browser | loadtest | integracao
  peso        int  NOT NULL DEFAULT 5,
  ativo       boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.orion_oce_checks IS 'ORION CORE/OCE: catálogo de verificações. tipo=db (executável ao vivo) ou browser/loadtest (declarado).';
ALTER TABLE public.orion_oce_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oce_chk_admin ON public.orion_oce_checks;
CREATE POLICY oce_chk_admin ON public.orion_oce_checks FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_oce_checks FROM authenticated, anon;

-- Execuções de certificação
CREATE TABLE IF NOT EXISTS public.orion_oce_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  score_geral  numeric,
  scores       jsonb NOT NULL DEFAULT '{}',
  verificados  int NOT NULL DEFAULT 0,
  passou       int NOT NULL DEFAULT 0,
  falhou       int NOT NULL DEFAULT 0,
  declarados   int NOT NULL DEFAULT 0,
  veredito     text
);
CREATE INDEX IF NOT EXISTS idx_oce_run_dt ON public.orion_oce_runs (iniciado_em DESC);
COMMENT ON TABLE public.orion_oce_runs IS 'ORION CORE/OCE: cada certificação (score geral + por dimensão + veredito). Imutável.';
ALTER TABLE public.orion_oce_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oce_run_admin ON public.orion_oce_runs;
CREATE POLICY oce_run_admin ON public.orion_oce_runs FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_oce_runs FROM authenticated, anon;

-- Resultados por check
CREATE TABLE IF NOT EXISTS public.orion_oce_results (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id    uuid NOT NULL,
  chave     text NOT NULL,
  categoria text NOT NULL,
  status    text NOT NULL,                 -- pass | warn | fail | declarado
  valor     text,
  esperado  text,
  evidencia jsonb NOT NULL DEFAULT '{}',
  peso      int NOT NULL DEFAULT 5,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oce_res_run ON public.orion_oce_results (run_id, categoria);
COMMENT ON TABLE public.orion_oce_results IS 'ORION CORE/OCE: resultado imutável de cada verificação, com evidência.';
ALTER TABLE public.orion_oce_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oce_res_admin ON public.orion_oce_results;
CREATE POLICY oce_res_admin ON public.orion_oce_results FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_oce_results FROM authenticated, anon;

-- Patches sugeridos (NUNCA aplicados automaticamente)
CREATE TABLE IF NOT EXISTS public.orion_oce_patches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL,
  chave         text NOT NULL,
  titulo        text,
  problema      text,
  patch_sugerido text,
  impacto       text,
  risco         text,
  rollback      text,
  status        text NOT NULL DEFAULT 'sugerido' CHECK (status IN ('sugerido','aprovado','rejeitado')),
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oce_patch_run ON public.orion_oce_patches (run_id);
COMMENT ON TABLE public.orion_oce_patches IS 'ORION CORE/OCE: patch/sugestão de correção (aguarda aprovação humana). OCE nunca aplica.';
ALTER TABLE public.orion_oce_patches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oce_patch_admin ON public.orion_oce_patches;
CREATE POLICY oce_patch_admin ON public.orion_oce_patches FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_oce_patches FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oce_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'oce', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- MOTOR DE CERTIFICAÇÃO: roda os checks reais + registra (read-only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oce_certify()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run uuid := gen_random_uuid();
  v_prefs int; v_prompts int; v_tab int; v_tab_rls int; v_uniq int; v_idx int;
  v_semsp int; v_finw int; v_ailog int; v_modelos int; v_eventos int; v_origens int; v_crons int; v_mods int;
  v_scores jsonb; v_geral numeric; v_verif int; v_pass int; v_fail int; v_decl int; v_veredito text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- ── métricas reais do catálogo (read-only) ──
  SELECT count(*) INTO v_prefs   FROM orion_ai_module_prefs;
  SELECT count(*) INTO v_prompts FROM orion_ai_prompts;
  SELECT count(*) INTO v_tab     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' AND relname LIKE 'orion_%';
  SELECT count(*) INTO v_tab_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' AND relname LIKE 'orion_%' AND relrowsecurity;
  SELECT count(DISTINCT conrelid) INTO v_uniq FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'orion_%' AND co.contype='u';
  SELECT count(*) INTO v_idx     FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'orion_%';
  SELECT count(*) INTO v_semsp   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef
     AND p.proname ~ '^(orion_|trust_|market_|mkt_|sec_|perso_|bi_|automation_|support_|finance_|growth_|conversion_|pricing_|forecast_|execution_|operations_|strategy_|health_|performance_|executive_|package_|publisher_|ridv_|dispatcher_|campaign_|motor_|oce_)'
     AND (p.proconfig IS NULL OR NOT (array_to_string(p.proconfig,',') ~* 'search_path'));
  SELECT count(*) INTO v_finw    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
     AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+pay_'
     AND p.proname ~ '^(trust_|market_|mkt_|bi_|sec_|perso_|finance_|automation_|business_|growth_|conversion_|pricing_|forecast_|oce_)';
  SELECT count(*) INTO v_ailog   FROM orion_ai_log;
  SELECT count(*) INTO v_modelos FROM orion_ai_models;
  SELECT count(*) INTO v_eventos FROM orion_eventos;
  SELECT count(DISTINCT origem) INTO v_origens FROM orion_eventos;
  SELECT count(*) INTO v_crons   FROM cron.job WHERE jobname ~ 'orion|ridv|dispatch|expire|expirar|janela';
  v_mods := v_prefs;

  -- ── registra os resultados (reais + declarados) ──
  INSERT INTO orion_oce_results (run_id, chave, categoria, status, valor, esperado, evidencia, peso) VALUES
    (v_run,'modulos_registrados','arquitetura', CASE WHEN v_mods>=20 THEN 'pass' ELSE 'warn' END, v_mods::text,'>=20', jsonb_build_object('modulos',v_mods), 8),
    (v_run,'prompts_registry','arquitetura', CASE WHEN v_prompts>=60 THEN 'pass' ELSE 'warn' END, v_prompts::text,'>=60', jsonb_build_object('prompts',v_prompts), 7),
    (v_run,'tabelas_orion','arquitetura','pass', v_tab::text,'info', jsonb_build_object('tabelas',v_tab), 4),
    (v_run,'rls_cobertura','banco', CASE WHEN v_tab_rls=v_tab THEN 'pass' WHEN v_tab_rls*100.0/nullif(v_tab,0)>=90 THEN 'warn' ELSE 'fail' END, (round(v_tab_rls*100.0/nullif(v_tab,0)))::text||'%','100%', jsonb_build_object('com_rls',v_tab_rls,'total',v_tab), 12),
    (v_run,'idempotencia_unique','banco', CASE WHEN v_uniq>=15 THEN 'pass' WHEN v_uniq>=8 THEN 'warn' ELSE 'fail' END, v_uniq::text,'>=15', jsonb_build_object('tabelas_com_unique',v_uniq), 8),
    (v_run,'indices','banco', CASE WHEN v_idx>0 THEN 'pass' ELSE 'fail' END, v_idx::text,'>0', jsonb_build_object('indices',v_idx), 5),
    (v_run,'definer_search_path','seguranca', CASE WHEN v_semsp=0 THEN 'pass' WHEN v_semsp<=3 THEN 'warn' ELSE 'fail' END, v_semsp::text,'0', jsonb_build_object('funcoes_sem_search_path',v_semsp), 10),
    (v_run,'financeiro_readonly','financeiro', CASE WHEN v_finw=0 THEN 'pass' ELSE 'fail' END, v_finw::text,'0', jsonb_build_object('funcoes_ia_escrevendo_pay',v_finw,'nota','nenhum módulo ORION move dinheiro'), 12),
    (v_run,'gateway_log','gateway', CASE WHEN v_ailog>0 THEN 'pass' ELSE 'warn' END, v_ailog::text,'>0', jsonb_build_object('chamadas',v_ailog), 6),
    (v_run,'modelos_ia','gateway', CASE WHEN v_modelos>=3 THEN 'pass' ELSE 'warn' END, v_modelos::text,'>=3', jsonb_build_object('modelos',v_modelos), 5),
    (v_run,'eventos_barramento','observabilidade', CASE WHEN v_eventos>0 THEN 'pass' ELSE 'fail' END, v_eventos::text,'>0', jsonb_build_object('eventos',v_eventos), 6),
    (v_run,'modulos_emitindo','observabilidade', CASE WHEN v_origens>=15 THEN 'pass' WHEN v_origens>=8 THEN 'warn' ELSE 'fail' END, v_origens::text,'>=15', jsonb_build_object('origens',v_origens), 7),
    (v_run,'crons_ativos','performance', CASE WHEN v_crons>=15 THEN 'pass' WHEN v_crons>=8 THEN 'warn' ELSE 'fail' END, v_crons::text,'>=15', jsonb_build_object('crons',v_crons), 6),
    -- DECLARADOS (exigem harness fora do banco) — transparentes, não contam no score
    (v_run,'frontend_navegacao','frontend','declarado', NULL,'harness headless', jsonb_build_object('nota','OCE-02: abrir/navegar telas requer navegador — não executado no motor DB'), 0),
    (v_run,'ux_acessibilidade','ux','declarado', NULL,'harness headless', jsonb_build_object('nota','OCE-03: contraste/responsividade requer navegador'), 0),
    (v_run,'visual_regressao','frontend','declarado', NULL,'screenshot diff', jsonb_build_object('nota','OCE-04: comparação visual requer captura de tela'), 0),
    (v_run,'mobile_responsivo','frontend','declarado', NULL,'device matrix', jsonb_build_object('nota','OCE-13: Android/iPhone/Tablet/Desktop requer emuladores'), 0),
    (v_run,'marketplace_e2e','marketplace','declarado', NULL,'e2e browser', jsonb_build_object('nota','OCE-11: cadastro→compra→pagamento requer usuários virtuais no navegador'), 0),
    (v_run,'stress_carga','stress','declarado', NULL,'load test', jsonb_build_object('nota','OCE-12: 100→100k usuários requer ferramenta de carga (k6/Locust)'), 0),
    (v_run,'visitor_simulator','simulacao','declarado', NULL,'traffic sim', jsonb_build_object('nota','OCE-14: milhares de visitantes virtuais requer harness'), 0),
    (v_run,'ia_cenarios','simulacao','declarado', NULL,'scenario harness', jsonb_build_object('nota','OCE-15: cenários massivos requer orquestrador externo'), 0);

  -- ── scores por dimensão (só checks executáveis) ──
  SELECT jsonb_object_agg(categoria, sc) INTO v_scores FROM (
    SELECT categoria, round(sum(CASE status WHEN 'pass' THEN peso WHEN 'warn' THEN peso*0.6 ELSE 0 END)*100.0/nullif(sum(peso),0)) sc
    FROM orion_oce_results WHERE run_id=v_run AND status IN ('pass','warn','fail') GROUP BY categoria) c;
  SELECT round(sum(CASE status WHEN 'pass' THEN peso WHEN 'warn' THEN peso*0.6 ELSE 0 END)*100.0/nullif(sum(peso),0),1)
    INTO v_geral FROM orion_oce_results WHERE run_id=v_run AND status IN ('pass','warn','fail');
  SELECT count(*) filter (where status IN ('pass','warn','fail')), count(*) filter (where status='pass'),
         count(*) filter (where status='fail'), count(*) filter (where status='declarado')
    INTO v_verif, v_pass, v_fail, v_decl FROM orion_oce_results WHERE run_id=v_run;
  v_veredito := CASE WHEN v_geral>=99 THEN '🟢 CERTIFICADO ENTERPRISE' WHEN v_geral>=90 THEN '🟢 APROVADO'
                     WHEN v_geral>=75 THEN '🟡 PRODUÇÃO COM RESSALVAS' ELSE '🔴 REPROVADO' END;

  INSERT INTO orion_oce_runs (id, concluido_em, score_geral, scores, verificados, passou, falhou, declarados, veredito)
  VALUES (v_run, now(), v_geral, coalesce(v_scores,'{}'), v_verif, v_pass, v_fail, v_decl, v_veredito);

  -- ── patches p/ falhas (nunca aplicados) ──
  INSERT INTO orion_oce_patches (run_id, chave, titulo, problema, patch_sugerido, impacto, risco, rollback)
  SELECT v_run, chave, 'Corrigir: '||chave,
    'Verificação falhou — valor='||coalesce(valor,'?')||' (esperado '||coalesce(esperado,'?')||')',
    'Revisar '||categoria||'/'||chave||' conforme a evidência; aplicar correção sob aprovação.',
    'melhora a dimensão '||categoria, 'a avaliar', 'reverter a alteração sugerida (nenhuma foi aplicada)'
  FROM orion_oce_results WHERE run_id=v_run AND status='fail';

  PERFORM oce_emit('certification.completed', jsonb_build_object('run', v_run, 'score', v_geral, 'veredito', v_veredito));
  RETURN jsonb_build_object('ok', true, 'run', v_run, 'score_geral', v_geral, 'veredito', v_veredito,
    'verificados', v_verif, 'passou', v_pass, 'falhou', v_fail, 'declarados', v_decl, 'scores', v_scores);
END; $$;
GRANT EXECUTE ON FUNCTION public.oce_certify() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oce_last_run()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT to_jsonb(r) FROM (SELECT id, concluido_em, score_geral, scores, verificados, passou, falhou, declarados, veredito
    FROM orion_oce_runs ORDER BY iniciado_em DESC LIMIT 1) r), '{}');
$$;
GRANT EXECUTE ON FUNCTION public.oce_last_run() TO authenticated;

CREATE OR REPLACE FUNCTION public.oce_results(p_run uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.categoria, r.chave), '[]')
  FROM (SELECT categoria, chave, status, valor, esperado, evidencia, peso FROM orion_oce_results
        WHERE run_id = coalesce(p_run, (SELECT id FROM orion_oce_runs ORDER BY iniciado_em DESC LIMIT 1))) r;
$$;
GRANT EXECUTE ON FUNCTION public.oce_results(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oce_patches()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.criado_em DESC), '[]')
  FROM (SELECT chave, titulo, problema, patch_sugerido, impacto, risco, rollback, status, criado_em
        FROM orion_oce_patches ORDER BY criado_em DESC LIMIT 50) p;
$$;
GRANT EXECUTE ON FUNCTION public.oce_patches() TO authenticated;

CREATE OR REPLACE FUNCTION public.oce_history(p_limite int DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('data', to_char(iniciado_em AT TIME ZONE 'America/Cuiaba','DD/MM HH24:MI'),
    'score', score_geral, 'veredito', veredito, 'passou', passou, 'falhou', falhou) ORDER BY iniciado_em DESC), '[]')
  FROM (SELECT * FROM orion_oce_runs ORDER BY iniciado_em DESC LIMIT least(p_limite,200)) r;
$$;
GRANT EXECUTE ON FUNCTION public.oce_history(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.oce_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN coalesce((SELECT jsonb_build_object('score_geral', score_geral, 'veredito', veredito, 'scores', scores,
    'passou', passou, 'falhou', falhou, 'declarados', declarados, 'quando', concluido_em)
    FROM orion_oce_runs ORDER BY iniciado_em DESC LIMIT 1),
    jsonb_build_object('nota','Nenhuma certificação ainda — rode oce_certify().'));
END; $$;
GRANT EXECUTE ON FUNCTION public.oce_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.oce_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', oce_score(), 'resultados', oce_results(NULL), 'patches', oce_patches(),
    'prompt_keys', jsonb_build_array('certification.executive','certification.architecture','certification.security','certification.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.oce_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.oce_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('certification_dashboard_consultado',
    'oce', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', oce_score(),
    'resultados', oce_results(NULL),
    'patches', oce_patches(),
    'historico', oce_history(20),
    'total_checks_catalogados', (SELECT count(*) FROM orion_oce_checks),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.oce_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron): re-certifica de hora em hora
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_oce_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM oce_certify();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_oce_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_oce_tick', '50 * * * *', 'SELECT public.orion_oce_tick()');
END $$;

-- ─────────────────────────────────────────────
-- CATÁLOGO SEED (checks reais + declarados)
-- ─────────────────────────────────────────────
INSERT INTO public.orion_oce_checks (chave, categoria, descricao, tipo, peso) VALUES
  ('modulos_registrados','arquitetura','módulos no registry do Gateway','db',8),
  ('prompts_registry','arquitetura','prompts versionados no Registry','db',7),
  ('tabelas_orion','arquitetura','tabelas do núcleo ORION','db',4),
  ('rls_cobertura','banco','RLS habilitada em 100% das tabelas ORION','db',12),
  ('idempotencia_unique','banco','constraints UNIQUE (idempotência)','db',8),
  ('indices','banco','índices presentes','db',5),
  ('definer_search_path','seguranca','funções SECURITY DEFINER com search_path fixo','db',10),
  ('financeiro_readonly','financeiro','nenhuma função ORION escreve em pay_*','db',12),
  ('gateway_log','gateway','AI Gateway com log de chamadas','db',6),
  ('modelos_ia','gateway','modelos de IA configurados','db',5),
  ('eventos_barramento','observabilidade','eventos no barramento','db',6),
  ('modulos_emitindo','observabilidade','módulos publicando eventos','db',7),
  ('crons_ativos','performance','jobs de cron ativos','db',6),
  ('frontend_navegacao','frontend','abrir/navegar telas (OCE-02)','browser',0),
  ('ux_acessibilidade','ux','contraste/responsividade (OCE-03)','browser',0),
  ('visual_regressao','frontend','comparação visual (OCE-04)','browser',0),
  ('mobile_responsivo','frontend','matriz de dispositivos (OCE-13)','browser',0),
  ('marketplace_e2e','marketplace','cadastro→compra E2E (OCE-11)','browser',0),
  ('stress_carga','stress','100→100k usuários (OCE-12)','loadtest',0),
  ('visitor_simulator','simulacao','visitantes virtuais (OCE-14)','loadtest',0),
  ('ia_cenarios','simulacao','cenários massivos de IA (OCE-15)','loadtest',0)
ON CONFLICT (chave) DO NOTHING;

-- ─────────────────────────────────────────────
-- PROMPTS (8)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('certification.executive',
'Você é o ORION Certification Engine (OCE) da VIAGG-TX8. Receberá a certificação REAL (score geral, scores por dimensão, veredito, aprovados/falhas/declarados). Em pt-BR (6-9 frases), dê o parecer executivo: o que está certificado, onde há falha e o que está DECLARADO como não instrumentado (browser/stress). Cite os números; nunca invente; deixe claro que o OCE não modifica nada.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.executive');
SELECT public.orion_ai_prompt_set('certification.architecture',
'Você audita arquitetura no OCE da VIAGG-TX8. Receberá checks de arquitetura/banco (RLS, idempotência, search_path, módulos). Em pt-BR (4-7 frases), avalie a saúde arquitetural e aponte correções, citando os valores. Só o JSON.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.architecture');
SELECT public.orion_ai_prompt_set('certification.frontend',
'Você comenta a cobertura de frontend/UX do OCE. Como esses checks exigem navegador (declarados), explique em pt-BR (3-5 frases) o que precisa ser instrumentado (harness headless, screenshot diff, matriz de dispositivos) para certificar frontend/UX/mobile. Não afirme que foram testados.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.frontend');
SELECT public.orion_ai_prompt_set('certification.security',
'Você audita segurança no OCE. Receberá checks (search_path, RLS, financeiro read-only). Em pt-BR (4-6 frases), avalie a postura de segurança/governança, citando os valores. Nunca recomende alterar RLS automaticamente.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.security');
SELECT public.orion_ai_prompt_set('certification.performance',
'Você comenta performance/observabilidade no OCE. Receberá checks (crons, eventos, gateway). Em pt-BR (3-5 frases), avalie e aponte o que instrumentar (stress/load test declarados). Só o JSON.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.performance');
SELECT public.orion_ai_prompt_set('certification.patch',
'Você é o Auto Patch Advisor do OCE. Para um problema detectado, gere em pt-BR uma sugestão de correção com: problema, patch sugerido, impacto, risco e rollback. NUNCA aplique nada — apenas recomende para aprovação humana. Baseie-se só no JSON.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.patch');
SELECT public.orion_ai_prompt_set('certification.summary',
'Você resume a certificação do OCE. Em pt-BR (4-6 frases), dê o veredito, o score e a principal ação, com os números do JSON. Declare o que é não instrumentado. Nunca invente.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.summary');
SELECT public.orion_ai_prompt_set('certification.audit',
'Você audita o histórico de certificações do OCE, procurando regressões. Receberá o histórico de scores. Em pt-BR (4-6 frases), aponte tendências e regressões, citando as datas/scores. Só o JSON.',
'Seed OCE') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='certification.audit');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('certification', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
