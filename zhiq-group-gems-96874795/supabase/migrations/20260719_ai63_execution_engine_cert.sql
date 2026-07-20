-- AI-63 Execution AI (execution_*/execute_*, AI-08 motor): bem estruturado - quase
-- todas anon=0, executoras (run/gerar/schedule/aprovar/rollback) gated, selftest existe.
-- P-EXEC-SEC1: execute_workflow/execute_policy anon-exec (gate mp_is_admin+service_role
-- barra ao vivo - "somente admin/service" - mas defesa-em-profundidade exige revogar).
-- P-EXEC-SEC2: execute_local_actions (worker, escreve whatsapp_groups) sem search_path.
revoke execute on function public.execute_workflow(text) from anon, public;
grant execute on function public.execute_workflow(text) to authenticated;
revoke execute on function public.execute_policy(text) from anon, public;
grant execute on function public.execute_policy(text) to authenticated;
alter function public.execute_local_actions() set search_path = public;

create or replace function public.orion_execution_engine_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_exec_sem_gate int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^execution_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^execution_' or p.proname ~ '^execute_') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^execution_' or p.proname ~ '^execute_' or p.proname='orion_execution_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_execution_tick' and active;
  -- invariante: executoras (run/gerar/schedule/execute_workflow/execute_policy/aprovar/rollback) tem gate
  select count(*) into v_exec_sem_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('execution_run','execution_gerar','execution_schedule','execute_workflow','execute_policy','execution_aprovar','execution_rollback')
    and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=12 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes execution_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_execution_tick ativo='||v_cron),
    jsonb_build_object('nome','executoras_com_gate','resultado',case when v_exec_sem_gate=0 then 'PASS' else 'FAIL' end,'evidencia',v_exec_sem_gate||' executoras (run/gerar/schedule/workflow/policy/aprovar/rollback) sem gate')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','execution_engine','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_execution_engine_selftest() from public, anon;
grant execute on function public.orion_execution_engine_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^execution_' or p.proname ~ '^execute_' or p.proname='orion_execution_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_execution_engine_selftest())->>'status' selftest_status,
       (public.orion_execution_engine_selftest())->'resumo' resumo;
