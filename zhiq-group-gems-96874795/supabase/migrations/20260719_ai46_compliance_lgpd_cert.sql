-- AI-46 Compliance LGPD (compliance_*/lgpd_*, AI-48 oficial): P-LGPD-SEC1 revogar anon.
-- lgpd_request_open/update sao ADMIN (compliance_guard) - ferramenta do DPO, p_user
-- arbitrario e' intencional (nao ha IDOR: so admin acessa). compliance_selftest NAO
-- apaga dados reais (0 DELETE). Ja tem compliance_guard + compliance_selftest.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^lgpd' or p.proname ~ '^compliance') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_lgpd_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_req_sem_gate int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^lgpd' or p.proname ~ '^compliance');
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^lgpd' or p.proname ~ '^compliance') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^lgpd' or p.proname ~ '^compliance') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_compliance_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (c.relname ~ '^orion_lgpd' or c.relname ~ '^orion_compliance') and c.relrowsecurity;
  -- invariante: requisicoes LGPD (abrir/atualizar) exigem compliance_guard (DPO/admin)
  select count(*) into v_req_sem_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('lgpd_request_open','lgpd_request_update')
    and position('compliance_guard()' in pg_get_functiondef(p.oid)) = 0;
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=6 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes lgpd/compliance'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_compliance_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=3 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','requisicao_lgpd_com_gate','resultado',case when v_req_sem_gate=0 then 'PASS' else 'FAIL' end,'evidencia',v_req_sem_gate||' fns lgpd_request sem compliance_guard')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','compliance_lgpd','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_lgpd_selftest() from public, anon;
grant execute on function public.orion_lgpd_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^lgpd' or p.proname ~ '^compliance') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_lgpd_selftest())->>'status' selftest_status,
       (public.orion_lgpd_selftest())->'resumo' resumo;
