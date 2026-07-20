-- AI-47 SOC Commander (soc_*, AI-49 oficial): P-SOC-SEC1 revogar anon (16 fns leitura
-- expunham visao consolidada do SOC - alertas/incidentes/healthmap/decisoes). READ-ONLY:
-- 0 fns acionam bloqueio/playbook (consolida os modulos 40-48, nao executa). Ja tem
-- soc_selftest; soc_register_decision tem gate.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^soc_' or p.proname='orion_soc_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;
-- soc_statistics_rollup e' interna (so tick) -> tira de authenticated tambem
revoke execute on function public.soc_statistics_rollup(jsonb,jsonb) from authenticated, public;

create or replace function public.orion_soc_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_aciona int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^soc_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^soc_' or p.proname='orion_soc_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^soc_' or p.proname='orion_soc_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_soc_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_soc' and c.relrowsecurity;
  -- invariante: SOC consolida, NAO executa bloqueio/playbook (recomenda-nunca-executa)
  select count(*) into v_aciona from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^soc_'
    and (lower(pg_get_functiondef(p.oid)) like '%cyber_block_entity(%' or lower(pg_get_functiondef(p.oid)) like '%identity_device_block(%' or lower(pg_get_functiondef(p.oid)) like '%incident_run_playbook(%');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes soc_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_soc_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','consolida_nao_executa','resultado',case when v_aciona=0 then 'PASS' else 'FAIL' end,'evidencia',v_aciona||' fns que executam bloqueio/playbook (deve ser 0)')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','soc_commander','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_soc_selftest() from public, anon;
grant execute on function public.orion_soc_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^soc_' or p.proname='orion_soc_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_soc_selftest())->>'status' selftest_status,
       (public.orion_soc_selftest())->'resumo' resumo;
