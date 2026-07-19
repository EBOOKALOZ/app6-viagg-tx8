-- AI-07 Operations: P-OPS-SEC1 (revogar anon de 11 fns + tick) + P-OPS-H1 (selftest)
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^operations_' or p.proname='orion_operations_tick')
             and has_function_privilege('anon',p.oid,'execute')
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop; end $g$;

create or replace function public.orion_operations_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_prompt int; v_evt int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^operations_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^operations_' and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^operations_' or p.proname='orion_operations_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_operations_tick' and active;
  select count(*) into v_prompt from orion_ai_prompts where chave='operations.executive' and ativo;
  select count(*) into v_evt from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='operations_emit';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=5 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes operations_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' funcoes anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_operations_tick ativo='||v_cron),
    jsonb_build_object('nome','prompt_registry','resultado',case when v_prompt>=1 then 'PASS' else 'FAIL' end,'evidencia','operations.executive ativo='||v_prompt),
    jsonb_build_object('nome','evento_emit','resultado',case when v_evt>=1 then 'PASS' else 'FAIL' end,'evidencia',v_evt||' operations_emit')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','operations','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_operations_selftest() from public, anon;
grant execute on function public.orion_operations_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^operations_' or p.proname='orion_operations_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_operations_selftest())->>'status' selftest_status,
       (public.orion_operations_selftest())->'resumo' resumo;
