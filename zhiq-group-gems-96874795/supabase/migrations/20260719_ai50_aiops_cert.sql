-- AI-50 AIOps (aiops_*, AI-53 oficial): P-AIOPS-SEC1 anon + P-AIOPS-SEC2 internas
-- (run_aiops/tick) expostas a authenticated + P-AIOPS-H1 selftest. AIOps NAO executa
-- remediacao real (aiops_automate grava recomendacoes/acoes p/ admin; 0 aoc/net/alter).
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^aiops' or p.proname='orion_aiops_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- internas do run_aiops (zero consumidor externo) -> revoga authenticated
revoke execute on function public.aiops_detect() from authenticated, public;
revoke execute on function public.aiops_predict() from authenticated, public;
revoke execute on function public.aiops_automate() from authenticated, public;
revoke execute on function public.aiops_refresh_health() from authenticated, public;
revoke execute on function public.aiops_statistics_rollup(jsonb,integer) from authenticated, public;

create or replace function public.orion_aiops_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_remedia int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^aiops';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aiops' or p.proname='orion_aiops_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aiops' or p.proname='orion_aiops_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_aiops_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_aiops' and c.relrowsecurity;
  -- invariante 1: nenhuma fn aiops executa remediacao real (aoc/net/pg_terminate/alter/motor)
  select count(*) into v_remedia from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^aiops'
    and (lower(pg_get_functiondef(p.oid)) like '%aoc_execute(%' or lower(pg_get_functiondef(p.oid)) like '%net.http_post%' or lower(pg_get_functiondef(p.oid)) like '%pg_terminate%');
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('aiops_detect','aiops_predict','aiops_automate','aiops_refresh_health','aiops_statistics_rollup')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=12 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes aiops_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_aiops_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','nao_executa_remediacao','resultado',case when v_remedia=0 then 'PASS' else 'FAIL' end,'evidencia',v_remedia||' fns que executam remediacao real'),
    jsonb_build_object('nome','orquestracao_interna_fechada','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns internas expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','aiops','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_aiops_selftest() from public, anon;
grant execute on function public.orion_aiops_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aiops' or p.proname='orion_aiops_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('aiops_detect','aiops_predict','aiops_automate','aiops_refresh_health','aiops_statistics_rollup') and has_function_privilege('authenticated',p.oid,'execute')) interno_ainda_exposto,
       (public.orion_aiops_selftest())->>'status' selftest_status,
       (public.orion_aiops_selftest())->'resumo' resumo;
