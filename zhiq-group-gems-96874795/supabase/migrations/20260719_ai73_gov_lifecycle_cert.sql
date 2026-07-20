-- AI-73 Governance Ciclo-de-Vida (gov_*, distinto do AI-49 ai_governance): registry/
-- lifecycle/versions/dependencies/certifications de modulos. gov_set_lifecycle/
-- register_version/dashboard gated (gov_guard). gov_selftest existe. P-GOVLC-SEC1:
-- gov_guard/scores/summary anon-exec -> revoga anon. Tambem:
-- command_c_calculate_commission_credits (fn pura de calculo comissao->creditos,
-- INVOKER, nao move nada) anon -> revoga anon por higiene. P-GOVLC-H1 selftest.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^gov_' or p.proname='orion_gov_tick' or p.proname='command_c_calculate_commission_credits') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_gov_lifecycle_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_writer_sem_gate int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^gov_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^gov_' or p.proname='orion_gov_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^gov_' or p.proname='orion_gov_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_gov_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_gov' and c.relrowsecurity;
  -- writers de lifecycle/versao tem gate
  select count(*) into v_writer_sem_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('gov_set_lifecycle','gov_register_version')
    and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%' and pg_get_functiondef(p.oid) not like '%gov_guard%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=6 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes gov_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_gov_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas orion_gov c/ RLS'),
    jsonb_build_object('nome','writers_lifecycle_gated','resultado',case when v_writer_sem_gate=0 then 'PASS' else 'FAIL' end,'evidencia',v_writer_sem_gate||' writers set_lifecycle/register_version sem gate')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','gov_lifecycle','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_gov_lifecycle_selftest() from public, anon;
grant execute on function public.orion_gov_lifecycle_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^gov_' or p.proname='orion_gov_tick' or p.proname='command_c_calculate_commission_credits') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_gov_lifecycle_selftest())->>'status' selftest_status,
       (public.orion_gov_lifecycle_selftest())->'resumo' resumo;
