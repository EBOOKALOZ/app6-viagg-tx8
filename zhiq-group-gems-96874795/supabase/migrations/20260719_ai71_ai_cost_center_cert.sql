-- AI-71 AI Cost Center (ai_center_*, AI-37 oficial): P-AICTR-SEC1 revogar anon (16 fns
-- expunham custo de IA por modelo/modulo/usuario/ranking - dado financeiro/operacional
-- sensivel - a anon; ai_center_by_user agrega custo de TODOS os usuarios via orion_ai_log
-- = visao de gestao). build/forecast gated. P-AICTR-H1 selftest.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^ai_center' or p.proname='orion_ai_center_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;
revoke execute on function public.orion_ai_center_tick() from authenticated, public;

create or replace function public.orion_ai_center_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_fonte int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^ai_center';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^ai_center' or p.proname='orion_ai_center_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^ai_center' or p.proname='orion_ai_center_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_ai_center_tick' and active;
  -- deriva do orion_ai_log (custo real do Gateway AI-00)
  select count(*) into v_fonte from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^ai_center' and lower(pg_get_functiondef(p.oid)) like '%orion_ai_log%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes ai_center_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_ai_center_tick ativo='||v_cron),
    jsonb_build_object('nome','deriva_do_gateway_log','resultado',case when v_fonte>=1 then 'PASS' else 'WARNING' end,'evidencia',v_fonte||' fns derivam de orion_ai_log (custo real do Gateway)')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','ai_cost_center','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_ai_center_selftest() from public, anon;
grant execute on function public.orion_ai_center_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^ai_center' or p.proname='orion_ai_center_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_ai_center_selftest())->>'status' selftest_status,
       (public.orion_ai_center_selftest())->'resumo' resumo;
