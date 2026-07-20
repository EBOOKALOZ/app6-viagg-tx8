-- AI-40 Identity & Access (identity_*, AI-42 oficial): P-IDENT-SEC1 anon +
-- P-IDENT-SEC2 orquestracao interna exposta a authenticated + P-IDENT-H1 selftest
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^identity' or p.proname='orion_identity_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- P-IDENT-SEC2: fns de orquestracao INTERNA (chamadas so por orion_identity_tick,
-- nenhum front/edge externo) estavam grant authenticated sem gate -> qualquer
-- usuario logado podia chamar sync_profiles/sync_sessions/ingest_audit/detect/
-- respond/bridge_cyber/statistics_rollup direto, manipulando dados de identidade.
-- Revoga de authenticated; chamada interna preservada via owner=postgres (SECDEF).
revoke execute on function public.identity_detect() from authenticated, public;
revoke execute on function public.identity_ingest_audit() from authenticated, public;
revoke execute on function public.identity_sync_profiles() from authenticated, public;
revoke execute on function public.identity_sync_sessions() from authenticated, public;
revoke execute on function public.identity_statistics_rollup() from authenticated, public;
revoke execute on function public.identity_respond() from authenticated, public;
revoke execute on function public.identity_bridge_cyber() from authenticated, public;
revoke execute on function public.identity_event(text,text,bigint,jsonb,text,uuid,uuid,text,text,text,text,timestamptz) from authenticated, public;
revoke execute on function public.identity_emit(text,jsonb) from authenticated, public;

create or replace function public.orion_identity_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_prof int; v_acao_sem_gate int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^identity';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^identity' or p.proname='orion_identity_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^identity' or p.proname='orion_identity_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_identity_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_identity' and c.relrowsecurity;
  select count(*) into v_prof from orion_identity_profiles;
  select count(*) into v_acao_sem_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('identity_device_block','identity_device_unblock','identity_policy_set','identity_mark')
    and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%';
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('identity_detect','identity_ingest_audit','identity_sync_profiles','identity_sync_sessions','identity_statistics_rollup','identity_respond','identity_bridge_cyber','identity_event','identity_emit')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=15 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes identity_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_identity_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=2 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','perfis_vivos','resultado',case when v_prof>=1 then 'PASS' else 'WARNING' end,'evidencia',v_prof||' perfis de identidade'),
    jsonb_build_object('nome','acoes_userfacing_com_gate','resultado',case when v_acao_sem_gate=0 then 'PASS' else 'FAIL' end,'evidencia',v_acao_sem_gate||' fns block/unblock/policy sem checagem admin'),
    jsonb_build_object('nome','orquestracao_interna_fechada','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns internas expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','identity_access','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_identity_selftest() from public, anon;
grant execute on function public.orion_identity_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^identity' or p.proname='orion_identity_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('identity_detect','identity_ingest_audit','identity_sync_profiles','identity_sync_sessions','identity_statistics_rollup','identity_respond','identity_bridge_cyber','identity_event','identity_emit') and has_function_privilege('authenticated',p.oid,'execute')) interno_ainda_exposto,
       (public.orion_identity_selftest())->>'status' selftest_status,
       (public.orion_identity_selftest())->'resumo' resumo;
