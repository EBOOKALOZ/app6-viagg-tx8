-- AI-43 Incident Response (incident_*, AI-45 oficial): P-INC-SEC1 anon +
-- P-INC-SEC2 incident_run_playbook (executa bloqueios reais AI-40/AI-38) exposto a
-- authenticated sem gate proprio -> bypass do gate de respond_to_incidents +
-- P-INC-SEC3 search_path em incident_classify + P-INC-H1 selftest (ja existe incident_selftest)
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^incident' or p.proname='orion_incident_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- P-INC-SEC2: incident_run_playbook executa identity_device_block + cyber_block_entity
-- (bloqueios reais). Chamada legitima = respond_to_incidents (gated, via tick). Estava
-- authenticated sem gate proprio -> qualquer usuario logado forcava bloqueios.
-- Revoga authenticated (chamada interna preservada via owner=postgres SECDEF).
revoke execute on function public.incident_run_playbook(bigint) from authenticated, public;

-- P-INC-SEC3: incident_classify e IMMUTABLE/INVOKER pura (so calculo, sem tabela),
-- mas o linter aponta search_path ausente. Fixar por higiene (sem risco real).
alter function public.incident_classify(text,integer,integer,integer) set search_path = public;

create or replace function public.orion_incident_selftest_v2()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_playbook_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^incident';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^incident' or p.proname='orion_incident_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^incident' or p.proname='orion_incident_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_incident_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_incident' and c.relrowsecurity;
  -- invariante: motor de execucao de playbook (aciona bloqueios) NAO exposto a authenticated
  select count(*) into v_playbook_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname='incident_run_playbook' and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=15 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes incident_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_incident_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','motor_playbook_fechado','resultado',case when v_playbook_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_playbook_exposto||' run_playbook exposto a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','incident_response','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_incident_selftest_v2() from public, anon;
grant execute on function public.orion_incident_selftest_v2() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^incident' or p.proname='orion_incident_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       has_function_privilege('authenticated','public.incident_run_playbook(bigint)','execute') playbook_authd_depois,
       (public.orion_incident_selftest_v2())->>'status' selftest_status,
       (public.orion_incident_selftest_v2())->'resumo' resumo;
