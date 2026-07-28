-- ============================================================================
-- SHC — Remove módulo sintético da homologação do motor (achado E2E-02)
--
-- A homologação do motor v2.1 (2026-07-27 20:10 UTC) criou o módulo
-- "ASHC Homolog v21" (slug ashc-homolog-v21) com 5 runs de teste e o deixou
-- no catálogo oficial com status 'failed'. Ele não é vertical oficial,
-- viola o catálogo congelado (10-12 verticais cadastradas via migration) e
-- bloqueia permanentemente o build gate (verify-shc.mjs lê a última decisão
-- de TODOS os módulos do catálogo).
--
-- Remove o módulo e todo o rastro sintético associado (runs, tests, logs,
-- certificates, decision_history). Idempotente: reexecutar sem o módulo é
-- um no-op. Nenhuma policy/função é alterada.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_mod uuid;
  n_runs int := 0; n_tests int := 0; n_logs int := 0;
  n_certs int := 0; n_hist int := 0;
BEGIN
  SELECT id INTO v_mod FROM public.shc_modules WHERE slug = 'ashc-homolog-v21';
  IF v_mod IS NULL THEN
    RAISE NOTICE 'ashc-homolog-v21 não existe no catálogo — nada a remover.';
    RETURN;
  END IF;

  DELETE FROM public.shc_decision_history d
   WHERE d.run_id IN (SELECT id FROM public.shc_runs WHERE module_id = v_mod);
  GET DIAGNOSTICS n_hist = ROW_COUNT;

  DELETE FROM public.shc_certificates c WHERE c.module_id = v_mod
     OR c.run_id IN (SELECT id FROM public.shc_runs WHERE module_id = v_mod);
  GET DIAGNOSTICS n_certs = ROW_COUNT;

  DELETE FROM public.shc_tests t
   WHERE t.run_id IN (SELECT id FROM public.shc_runs WHERE module_id = v_mod);
  GET DIAGNOSTICS n_tests = ROW_COUNT;

  DELETE FROM public.shc_logs l
   WHERE l.module_id = v_mod
      OR l.run_id IN (SELECT id FROM public.shc_runs WHERE module_id = v_mod);
  GET DIAGNOSTICS n_logs = ROW_COUNT;

  DELETE FROM public.shc_runs r WHERE r.module_id = v_mod;
  GET DIAGNOSTICS n_runs = ROW_COUNT;

  DELETE FROM public.shc_modules m WHERE m.id = v_mod;

  RAISE NOTICE 'ashc-homolog-v21 removido: % runs, % tests, % logs, % certs, % decisões.',
    n_runs, n_tests, n_logs, n_certs, n_hist;
END $$;

COMMIT;
