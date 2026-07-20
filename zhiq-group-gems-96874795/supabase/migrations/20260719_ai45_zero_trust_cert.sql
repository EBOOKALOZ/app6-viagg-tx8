-- AI-45 Zero Trust (zerotrust_*, AI-47 oficial): P-ZT-SEC1 anon + P-ZT-SEC2 internas
-- expostas a authenticated + P-ZT-H1 selftest (ja existe zerotrust_selftest)
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^zerotrust' or p.proname ~ 'zero_trust') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- P-ZT-SEC2: internas de avaliacao (so orion_zero_trust_tick chama, zero consumidor
-- externo) grant authenticated -> revoga (interna preservada via owner=postgres SECDEF)
revoke execute on function public.zerotrust_context_refresh() from authenticated, public;
revoke execute on function public.zerotrust_risk_refresh() from authenticated, public;
revoke execute on function public.zerotrust_devices_evaluate() from authenticated, public;
revoke execute on function public.zerotrust_sessions_evaluate() from authenticated, public;
revoke execute on function public.zerotrust_statistics_rollup() from authenticated, public;
revoke execute on function public.zerotrust_emit(text,jsonb) from authenticated, public;
revoke execute on function public.zerotrust_alert_emit(text,text,text,numeric) from authenticated, public;
revoke execute on function public.zerotrust_evidence(text,text,jsonb) from authenticated, public;

create or replace function public.orion_zerotrust_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^zerotrust' or p.proname ~ 'zero_trust');
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^zerotrust' or p.proname ~ 'zero_trust') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^zerotrust' or p.proname ~ 'zero_trust') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_zero_trust_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ 'zero_trust' and c.relrowsecurity;
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('zerotrust_context_refresh','zerotrust_risk_refresh','zerotrust_devices_evaluate','zerotrust_sessions_evaluate','zerotrust_statistics_rollup','zerotrust_emit','zerotrust_alert_emit','zerotrust_evidence')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=15 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes zerotrust'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_zero_trust_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','orquestracao_interna_fechada','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns internas expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','zero_trust','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_zerotrust_selftest() from public, anon;
grant execute on function public.orion_zerotrust_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^zerotrust' or p.proname ~ 'zero_trust') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('zerotrust_context_refresh','zerotrust_risk_refresh','zerotrust_devices_evaluate','zerotrust_sessions_evaluate','zerotrust_statistics_rollup','zerotrust_emit','zerotrust_alert_emit','zerotrust_evidence') and has_function_privilege('authenticated',p.oid,'execute')) interno_ainda_exposto,
       (public.orion_zerotrust_selftest())->>'status' selftest_status,
       (public.orion_zerotrust_selftest())->'resumo' resumo;
