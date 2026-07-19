-- AI-20 Executive (executive_*): P-EXEC-SEC1 (revogar anon) + P-EXEC-H1 (selftest)
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^executive_' or p.proname='orion_executive_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_executive_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_snap int; v_exec int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^executive_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^executive_' or p.proname='orion_executive_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^executive_' or p.proname='orion_executive_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_executive_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_executive' and c.relrowsecurity;
  select count(*) into v_snap from orion_executive_snapshots;
  -- nao executa negocio: deteccao PRECISA (exclui substring 'dispatch' que e' so rotulo de navegacao)
  select count(*) into v_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^executive_'
    and (position('motor_publish_execute(' in lower(pg_get_functiondef(p.oid)))>0 or position('pay_post_transaction(' in lower(pg_get_functiondef(p.oid)))>0 or position('net.http_post' in lower(pg_get_functiondef(p.oid)))>0 or position('advertiser_credit' in lower(pg_get_functiondef(p.oid)))>0 or position('aoc_execute(' in lower(pg_get_functiondef(p.oid)))>0 or position('execution_run(' in lower(pg_get_functiondef(p.oid)))>0);
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes executive_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_executive_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=2 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','snapshots_vivos','resultado',case when v_snap>=1 then 'PASS' else 'WARNING' end,'evidencia',v_snap||' snapshots executivos'),
    jsonb_build_object('nome','nao_executa_negocio','resultado',case when v_exec=0 then 'PASS' else 'FAIL' end,'evidencia',v_exec||' fns que executam acao de negocio')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','executive','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_executive_selftest() from public, anon;
grant execute on function public.orion_executive_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^executive_' or p.proname='orion_executive_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_executive_selftest())->>'status' selftest_status,
       (public.orion_executive_selftest())->'resumo' resumo,
       (public.orion_executive_selftest())->'checks'->6->>'evidencia' nao_executa,
       (select max(criado_em)::text from orion_executive_snapshots) ultima_snap;
