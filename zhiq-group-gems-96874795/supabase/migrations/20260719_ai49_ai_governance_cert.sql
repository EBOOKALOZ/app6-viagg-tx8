-- AI-49 AI Governance (governance_*, AI-50 oficial): P-GOV-SEC1 revogar anon (15 fns
-- expunham trilha de auditoria de IA + orcamentos/gastos por modulo a anon - PROVADO
-- ao vivo). governance_build/rollback/user_role tem gate. P-GOV-H1 selftest.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^governance' or p.proname='orion_ai_governance_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_governance_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_acao_sem_gate int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^governance';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^governance' or p.proname='orion_ai_governance_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^governance' or p.proname='orion_ai_governance_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_ai_governance_tick' and active;
  -- invariante: fns de escrita (build/rollback/user_role) tem checagem admin
  select count(*) into v_acao_sem_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('governance_build','governance_rollback','governance_user_role')
    and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes governance_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_ai_governance_tick ativo='||v_cron),
    jsonb_build_object('nome','escrita_com_gate','resultado',case when v_acao_sem_gate=0 then 'PASS' else 'FAIL' end,'evidencia',v_acao_sem_gate||' fns build/rollback/user_role sem checagem admin')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','ai_governance','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_governance_selftest() from public, anon;
grant execute on function public.orion_governance_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^governance' or p.proname='orion_ai_governance_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_governance_selftest())->>'status' selftest_status,
       (public.orion_governance_selftest())->'resumo' resumo;
