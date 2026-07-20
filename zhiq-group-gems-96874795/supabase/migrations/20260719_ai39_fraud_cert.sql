-- AI-39 Fraud (fraud_*, AI-41 oficial): P-FRAUD-SEC1 revogar anon (8 fns leitura
-- vazavam tipos/scores/heatmap de fraude PROVADO ao vivo) + P-FRAUD-H1 selftest
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^fraud' or p.proname='orion_fraud_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- P-FRAUD-SEC2: fraud_register/respond/patterns_rollup/statistics_rollup sao orquestracao
-- INTERNA (chamadas so por fraud_scan/orion_fraud_tick, que ja sao admin/service-gated).
-- Estavam grant a authenticated -> qualquer usuario logado pulava o gate de fraud_scan
-- e inseria fraude falsa direto via fraud_register. Revoga de authenticated tambem;
-- chamadas internas seguem funcionando via contexto SECURITY DEFINER do caller.
revoke execute on function public.fraud_register(text,text,text,text,bigint,bigint,bigint,bigint,numeric,jsonb,text,uuid,uuid,uuid,uuid) from authenticated, public;
revoke execute on function public.fraud_respond() from authenticated, public;
revoke execute on function public.fraud_patterns_rollup() from authenticated, public;
revoke execute on function public.fraud_statistics_rollup() from authenticated, public;

create or replace function public.orion_fraud_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_evt int; v_acao_sem_gate int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^fraud';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^fraud' or p.proname='orion_fraud_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^fraud' or p.proname='orion_fraud_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_fraud_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_fraud' and c.relrowsecurity;
  select count(*) into v_evt from orion_fraud_events;
  -- invariante 1: fns de acao user-facing (nome termina em mark/scan/rollback) tem checagem admin inline
  select count(*) into v_acao_sem_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('fraud_mark','fraud_scan','fraud_action_rollback')
    and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%';
  -- invariante 2: fns de orquestracao INTERNA (register/respond/rollups) nao podem ser exec por authenticated
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('fraud_register','fraud_respond','fraud_patterns_rollup','fraud_statistics_rollup')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes fraud_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_fraud_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=4 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','eventos_vivos','resultado',case when v_evt>=1 then 'PASS' else 'WARNING' end,'evidencia',v_evt||' eventos de fraude'),
    jsonb_build_object('nome','acoes_userfacing_com_gate','resultado',case when v_acao_sem_gate=0 then 'PASS' else 'FAIL' end,'evidencia',v_acao_sem_gate||' fns mark/scan/rollback sem checagem admin'),
    jsonb_build_object('nome','orquestracao_interna_fechada','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns internas (register/respond/rollup) expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','fraud','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_fraud_selftest() from public, anon;
grant execute on function public.orion_fraud_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^fraud' or p.proname='orion_fraud_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fraud_register','fraud_respond','fraud_patterns_rollup','fraud_statistics_rollup') and has_function_privilege('authenticated',p.oid,'execute')) interno_ainda_exposto,
       (public.orion_fraud_selftest())->>'status' selftest_status,
       (public.orion_fraud_selftest())->'resumo' resumo;
