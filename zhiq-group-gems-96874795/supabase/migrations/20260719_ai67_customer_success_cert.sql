-- AI-67 Customer Success (cs_*, AI-26 oficial): cs_health(p_user) ja impoe anti-IDOR
-- (v_u=auth.uid() OR admin). Front so usa cs_dashboard/cs_summary (gated). P-CS-SEC1:
-- 10 fns cs_*/tick anon-exec expunham inteligencia de churn/clientes-em-risco a anon ->
-- revoga anon. P-CS-H1 selftest.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^cs_' or p.proname='orion_customer_success_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_cs_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_health_sem_guard int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^cs_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^cs_' or p.proname='orion_customer_success_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^cs_' or p.proname='orion_customer_success_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_customer_success_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname='orion_customer_health' and c.relrowsecurity;
  -- invariante anti-IDOR: cs_health(p_user) impoe auth.uid()=p_user OR admin
  select count(*) into v_health_sem_guard from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cs_health' and lower(pg_get_functiondef(p.oid)) not like '%auth.uid()%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=8 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes cs_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_customer_success_tick ativo='||v_cron),
    jsonb_build_object('nome','tabela_health_rls','resultado',case when v_tbl>=1 then 'PASS' else 'WARNING' end,'evidencia',v_tbl||' orion_customer_health c/ RLS'),
    jsonb_build_object('nome','anti_idor_health','resultado',case when v_health_sem_guard=0 then 'PASS' else 'FAIL' end,'evidencia',v_health_sem_guard||' cs_health sem controle auth.uid (IDOR)')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','customer_success','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_cs_selftest() from public, anon;
grant execute on function public.orion_cs_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^cs_' or p.proname='orion_customer_success_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_cs_selftest())->>'status' selftest_status,
       (public.orion_cs_selftest())->'resumo' resumo,
       (public.orion_cs_selftest())->'checks'->5->>'evidencia' idor_check;
