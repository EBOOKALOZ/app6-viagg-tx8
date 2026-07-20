-- AI-41 Threat Intelligence (threat_*, AI-43 oficial): P-THREAT-SEC1 anon +
-- P-THREAT-SEC2 orquestracao interna/orfa exposta a authenticated + P-THREAT-H1 selftest
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^threat' or p.proname='orion_threat_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- P-THREAT-SEC2: scan_intelligence/scan_vulnerabilities/statistics_rollup sao
-- orquestracao interna (so orion_threat_tick chama); add_edge/add_node sao
-- primitivas de grafo sem NENHUM consumidor (front/edge/tick) -- todas
-- expostas a authenticated sem gate. Revoga (chamada interna do tick preservada
-- via owner=postgres SECURITY DEFINER).
revoke execute on function public.threat_scan_intelligence() from authenticated, public;
revoke execute on function public.threat_scan_vulnerabilities() from authenticated, public;
revoke execute on function public.threat_statistics_rollup() from authenticated, public;
revoke execute on function public.threat_add_edge(text,text,text,jsonb,bigint,bigint,text) from authenticated, public;
revoke execute on function public.threat_add_node(text,text,text,bigint,text,jsonb,bigint,timestamptz,timestamptz,timestamptz,text) from authenticated, public;
revoke execute on function public.threat_emit(text,jsonb) from authenticated, public;

create or replace function public.orion_threat_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_acao_sem_gate int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^threat';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^threat' or p.proname='orion_threat_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^threat' or p.proname='orion_threat_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_threat_tick' and active;
  select count(*) into v_acao_sem_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('threat_mark_campaign','threat_rollback')
    and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%';
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('threat_scan_intelligence','threat_scan_vulnerabilities','threat_statistics_rollup','threat_add_edge','threat_add_node','threat_emit')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=14 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes threat_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_threat_tick ativo='||v_cron),
    jsonb_build_object('nome','acoes_userfacing_com_gate','resultado',case when v_acao_sem_gate=0 then 'PASS' else 'FAIL' end,'evidencia',v_acao_sem_gate||' fns mark_campaign/rollback sem checagem admin'),
    jsonb_build_object('nome','orquestracao_interna_fechada','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns internas/orfas expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','threat_intelligence','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_threat_selftest() from public, anon;
grant execute on function public.orion_threat_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^threat' or p.proname='orion_threat_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('threat_scan_intelligence','threat_scan_vulnerabilities','threat_statistics_rollup','threat_add_edge','threat_add_node','threat_emit') and has_function_privilege('authenticated',p.oid,'execute')) interno_ainda_exposto,
       (public.orion_threat_selftest())->>'status' selftest_status,
       (public.orion_threat_selftest())->'resumo' resumo;
