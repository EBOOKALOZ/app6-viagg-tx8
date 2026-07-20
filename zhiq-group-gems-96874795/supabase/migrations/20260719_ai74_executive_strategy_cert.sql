-- AI-74 Executive Strategy (exstrat_*, AI-59 oficial; reusa AI-30). 28 fns, muitas
-- ja gated. P-EXSTRAT-SEC1: 12 fns anon-exec -> revoga anon. P-EXSTRAT-SEC2: internas
-- de orquestracao (generate/build_recommendations/scores_refresh/refresh_ai_summary/
-- learn/emit/count_safe; front so usa exstrat_dashboard/questions) -> revoga authenticated.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^exstrat' or p.proname='orion_exec_strategy_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

revoke execute on function public.exstrat_generate() from authenticated, public;
revoke execute on function public.exstrat_build_recommendations() from authenticated, public;
revoke execute on function public.exstrat_scores_refresh() from authenticated, public;
revoke execute on function public.exstrat_refresh_ai_summary() from authenticated, public;
revoke execute on function public.exstrat_learn() from authenticated, public;
revoke execute on function public.exstrat_emit(text,jsonb) from authenticated, public;
revoke execute on function public.exstrat_count_safe(text,text) from authenticated, public;

create or replace function public.orion_exstrat_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^exstrat';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^exstrat' or p.proname='orion_exec_strategy_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^exstrat' or p.proname='orion_exec_strategy_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_exec_strategy_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_exstrat' and c.relrowsecurity;
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('exstrat_generate','exstrat_build_recommendations','exstrat_scores_refresh','exstrat_refresh_ai_summary','exstrat_learn','exstrat_emit')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=15 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes exstrat_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_exec_strategy_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=8 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas orion_exstrat c/ RLS'),
    jsonb_build_object('nome','orquestracao_interna_fechada','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns internas expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','executive_strategy','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_exstrat_selftest() from public, anon;
grant execute on function public.orion_exstrat_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^exstrat' or p.proname='orion_exec_strategy_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('exstrat_generate','exstrat_build_recommendations','exstrat_scores_refresh','exstrat_refresh_ai_summary','exstrat_learn','exstrat_emit') and has_function_privilege('authenticated',p.oid,'execute')) interno_exposto,
       (public.orion_exstrat_selftest())->>'status' selftest_status,
       (public.orion_exstrat_selftest())->'resumo' resumo;
