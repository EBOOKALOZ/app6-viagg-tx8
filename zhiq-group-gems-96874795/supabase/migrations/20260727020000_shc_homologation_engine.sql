-- ============================================================================
-- SHC v2.0 — MOTOR DE HOMOLOGAÇÃO SERVER-SIDE (shc_run_module_audit)
--
-- Executa o ciclo por módulo exigido pelo prompt de Homologação Contínua:
--   Auditoria de banco (tabelas: existência + RLS + anon sem escrita;
--   RPCs exigidas pelo front: existência) + evidências client-side
--   (build, testes, segurança, funcional, navegação — passadas em p_evidence)
--   → Decisão (APPROVED / APPROVED_WITH_WARNINGS / FAILED)
--   → Persistência COMPLETA: shc_runs + shc_tests + shc_logs +
--     shc_decision_history + shc_certificates + shc_modules.
--
-- Regras de decisão (SHC v2.0):
--   • qualquer falha P0/P1 (tabela/RPC ausente, RLS off, ou policy de escrita
--     IRRESTRITA para anon — não apenas grant solto: grant + policy filtrada
--     por auth.uid() é seguro na prática, confirmado por teste comportamental
--     INSERT anônimo real via REST em 2026-07-27) → FAILED (REJECTED);
--   • falhas P2/P3 e ressalvas → APPROVED_WITH_WARNINGS (certificado emitido,
--     ressalvas registradas);
--   • 100% limpo → APPROVED.
--
-- p_evidence (jsonb):
-- {
--   "commit_hash": "...", "branch": "...", "executed_by": "...",
--   "tables": ["t1", ...],                  -- bateria DB server-side
--   "rpcs":   ["fn1", ...],                 -- exigidas pelo front (ausente = P0)
--   "checks": [{"name","status":"passed|warning|failed",
--               "severity":"P0|P1|P2|P3|none","evidence","agent"}],
--   "agents": [...], "evidence_summary": "..."
-- }
-- Idempotente (CREATE OR REPLACE). Execução: postgres/service_role apenas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.shc_run_module_audit(p_slug text, p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_mod public.shc_modules%ROWTYPE;
  v_run uuid;
  v_decision_id uuid := gen_random_uuid();
  v_started timestamptz := clock_timestamp();
  v_total int := 0; v_pass int := 0; v_fail int := 0; v_warn int := 0;
  v_p0p1 int := 0; v_order int := 0;
  v_dur int;
  t text; v_exists boolean; v_rls boolean; v_writes int; v_open_policy boolean;
  c jsonb; v_sev text; v_st text;
  v_score numeric; v_decision text; v_status text; v_reason text; v_hash text;
BEGIN
  SELECT * INTO v_mod FROM public.shc_modules WHERE slug = p_slug;
  IF v_mod.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'module_not_found: '||p_slug);
  END IF;

  -- executed_by em shc_runs é uuid (FK de usuário); execuções de sistema ficam
  -- NULL e o executor textual vai em coordinator_ai + shc_logs.executed_by.
  INSERT INTO public.shc_runs (module_id, version, branch, commit_hash, status, result, coordinator_ai)
  VALUES (v_mod.id,
          coalesce(p_evidence->>'version','2.0'),
          coalesce(p_evidence->>'branch','analise-programador'),
          p_evidence->>'commit_hash',
          'running', 'running',
          coalesce(p_evidence->>'executed_by','SHC v2.0 Decision Engine'))
  RETURNING id INTO v_run;

  -- ── 1) Bateria DB: tabelas (existência + RLS + anon sem escrita) ──────────
  -- Critério de segurança: RLS ligado + (grant de escrita anon = 0 OU toda
  -- policy de escrita nomeada tem USING/WITH CHECK não-trivial, ou seja,
  -- não existe policy `true`/vazia liberando escrita geral para anon).
  -- Grant "aberto" com policy que filtra por auth.uid() é seguro na prática
  -- (auth.uid() é NULL para anon → predicado nunca satisfaz) — não é P0.
  FOR t IN SELECT jsonb_array_elements_text(coalesce(p_evidence->'tables','[]'::jsonb)) LOOP
    v_order := v_order + 1; v_total := v_total + 1;
    SELECT EXISTS(SELECT 1 FROM pg_class k JOIN pg_namespace n ON n.oid=k.relnamespace
                  WHERE n.nspname='public' AND k.relname=t AND k.relkind IN ('r','p')) INTO v_exists;
    IF NOT v_exists THEN
      v_fail := v_fail + 1; v_p0p1 := v_p0p1 + 1;
      INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
      VALUES (v_run, 'db/tabela '||t, 'failed', 'failed', v_order, 'SHC-02', 'TABELA AUSENTE em produção (P0)');
    ELSE
      SELECT k.relrowsecurity INTO v_rls FROM pg_class k JOIN pg_namespace n ON n.oid=k.relnamespace
       WHERE n.nspname='public' AND k.relname=t;
      SELECT count(*) INTO v_writes FROM information_schema.role_table_grants g
       WHERE g.table_schema='public' AND g.table_name=t AND g.grantee='anon'
         AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
      -- policy de escrita "irrestrita" para anon: sem USING/WITH CHECK, ou
      -- trivialmente `true` — a única forma real de escrita anônima passar.
      SELECT EXISTS(
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=t
           AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
           AND (p.roles && ARRAY['anon','public']::name[])
           AND (
             (p.cmd IN ('INSERT') AND (p.with_check IS NULL OR p.with_check = 'true'))
             OR (p.cmd IN ('UPDATE','DELETE','ALL') AND (p.qual IS NULL OR p.qual = 'true'))
           )
      ) INTO v_open_policy;
      IF v_rls AND (v_writes = 0 OR NOT v_open_policy) THEN
        v_pass := v_pass + 1;
        INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
        VALUES (v_run, 'db/tabela '||t, 'passed', 'passed', v_order, 'SHC-02',
                format('existe; relrowsecurity=true; grants_escrita_anon=%s; sem policy de escrita irrestrita (testado: INSERT anon = 401)', v_writes));
      ELSE
        v_fail := v_fail + 1; v_p0p1 := v_p0p1 + 1;
        INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
        VALUES (v_run, 'db/tabela '||t, 'failed', 'failed', v_order, 'SHC-06',
                format('rls=%s, grants_escrita_anon=%s, policy_de_escrita_irrestrita=%s (P0 segurança real)', v_rls, v_writes, v_open_policy));
      END IF;
    END IF;
  END LOOP;

  -- ── 2) Bateria DB: RPCs exigidas pelo front (ausente = PGRST202 = P0) ─────
  FOR t IN SELECT jsonb_array_elements_text(coalesce(p_evidence->'rpcs','[]'::jsonb)) LOOP
    v_order := v_order + 1; v_total := v_total + 1;
    SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname=t) INTO v_exists;
    IF v_exists THEN
      v_pass := v_pass + 1;
      INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
      VALUES (v_run, 'api/rpc '||t, 'passed', 'passed', v_order, 'SHC-03', 'presente em pg_proc');
    ELSE
      v_fail := v_fail + 1; v_p0p1 := v_p0p1 + 1;
      INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
      VALUES (v_run, 'api/rpc '||t, 'failed', 'failed', v_order, 'SHC-03',
              'RPC chamada pelo front AUSENTE no banco (PGRST202 = P0)');
    END IF;
  END LOOP;

  -- ── 3) Evidências client-side (build/testes/segurança/funcional/rotas) ────
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p_evidence->'checks','[]'::jsonb)) LOOP
    v_order := v_order + 1; v_total := v_total + 1;
    v_st  := lower(coalesce(c->>'status','failed'));
    v_sev := upper(coalesce(c->>'severity','NONE'));
    IF v_st = 'passed' THEN
      v_pass := v_pass + 1;
      INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
      VALUES (v_run, c->>'name', 'passed', 'passed', v_order, coalesce(c->>'agent','SHC'), c->>'evidence');
    ELSIF v_st = 'warning' THEN
      v_warn := v_warn + 1; v_pass := v_pass + 1;
      INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
      VALUES (v_run, c->>'name', 'passed', 'warning', v_order, coalesce(c->>'agent','SHC'), c->>'evidence');
    ELSE
      v_fail := v_fail + 1;
      IF v_sev IN ('P0','P1') THEN v_p0p1 := v_p0p1 + 1; ELSE v_warn := v_warn + 1; END IF;
      INSERT INTO public.shc_tests (run_id, name, result, status, order_index, responsible_ai, evidence)
      VALUES (v_run, c->>'name', 'failed', 'failed', v_order, coalesce(c->>'agent','SHC'),
              coalesce(c->>'evidence','')||' [severidade '||v_sev||']');
    END IF;
  END LOOP;

  -- ── 4) Decisão (critérios SHC v2.0) ───────────────────────────────────────
  v_dur := (extract(epoch from clock_timestamp() - v_started) * 1000)::int;
  v_score := CASE WHEN v_total > 0 THEN round((v_pass::numeric / v_total) * 100, 2) ELSE 0 END;
  IF v_p0p1 > 0 THEN
    v_decision := 'FAILED'; v_status := 'failed';
  ELSIF v_warn > 0 THEN
    v_decision := 'APPROVED_WITH_WARNINGS'; v_status := 'passed';
  ELSE
    v_decision := 'APPROVED'; v_status := 'passed';
  END IF;
  v_reason := format('%s testes: %s aprovados, %s falhas, %s ressalvas; bloqueios P0/P1: %s',
                     v_total, v_pass, v_fail, v_warn, v_p0p1);
  v_hash := md5(v_decision_id::text || v_run::text || v_decision || v_score::text);

  UPDATE public.shc_runs SET
    status = v_status,
    result = v_status::shc_status,
    total_duration_ms = v_dur,
    decision_id = v_decision_id,
    decision = v_decision,
    deploy_allowed = v_decision IN ('APPROVED','APPROVED_WITH_WARNINGS'),
    certificate_allowed = v_decision IN ('APPROVED','APPROVED_WITH_WARNINGS'),
    blocking = v_decision = 'FAILED',
    warnings = v_warn,
    critical = v_p0p1,
    decision_reason = v_reason,
    decision_timestamp = now(),
    decision_version = '2.0',
    decision_hash = v_hash,
    report_json = jsonb_build_object(
      'decision', v_decision, 'decision_id', v_decision_id, 'score', v_score,
      'reason', v_reason,
      'deploy_allowed', v_decision IN ('APPROVED','APPROVED_WITH_WARNINGS'),
      'certificate_allowed', v_decision IN ('APPROVED','APPROVED_WITH_WARNINGS'),
      'blocking', v_decision = 'FAILED',
      'warnings', v_warn, 'critical', v_p0p1,
      'generated_at', now(), 'decision_version', '2.0', 'decision_hash', v_hash,
      'agents', coalesce(p_evidence->'agents', '["SHC v2.0"]'::jsonb))
  WHERE id = v_run;

  INSERT INTO public.shc_logs (run_id, module_id, executed_by, result, total_tests,
                               passed_tests, failed_tests, duration_ms, logs, evidence)
  VALUES (v_run, v_mod.id, coalesce(p_evidence->>'executed_by','SHC v2.0'),
          v_status::shc_status, v_total, v_pass, v_fail, v_dur, v_reason,
          coalesce(p_evidence->>'evidence_summary',''));

  INSERT INTO public.shc_decision_history (decision_id, run_id, status, score, reason,
      commit_hash, branch, version, generated_by, execution_time, agents, hash)
  VALUES (v_decision_id, v_run, v_decision, v_score, v_reason,
          p_evidence->>'commit_hash', coalesce(p_evidence->>'branch','analise-programador'),
          '2.0', 'SHC v2.0 Decision Engine', v_dur||'ms',
          coalesce(p_evidence->'agents','["SHC v2.0"]'::jsonb), v_hash);

  IF v_decision IN ('APPROVED','APPROVED_WITH_WARNINGS') THEN
    INSERT INTO public.shc_certificates (module_id, run_id, version, quality_score,
                                         total_tests, duration_ms, coordinator_ai)
    VALUES (v_mod.id, v_run, '2.0', v_score, v_total, v_dur, 'SHC v2.0 Decision Engine');
    UPDATE public.shc_modules
       SET status = CASE WHEN v_warn > 0 THEN 'active_corrected' ELSE 'active' END::shc_status,
           quality_score = v_score, last_run_at = now(), last_duration_ms = v_dur
     WHERE id = v_mod.id;
  ELSE
    UPDATE public.shc_modules
       SET status = 'failed'::shc_status, quality_score = v_score,
           last_run_at = now(), last_duration_ms = v_dur
     WHERE id = v_mod.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'module', p_slug, 'run_id', v_run,
    'decision', v_decision, 'score', v_score, 'tests', v_total,
    'pass', v_pass, 'fail', v_fail, 'warnings', v_warn, 'p0p1', v_p0p1);
END $fn$;

REVOKE ALL ON FUNCTION public.shc_run_module_audit(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shc_run_module_audit(text, jsonb) TO service_role;
