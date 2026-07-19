-- AI-13 Decision: revogar anon (menor privilegio) + criar selftest
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('decision_engine','orion_decidir') and has_function_privilege('anon',p.oid,'execute')
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop; end $g$;

create or replace function public.orion_decision_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_gate int; v_tbl int; v_perigo int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('decision_engine','orion_decidir');
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('decision_engine','orion_decidir') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('decision_engine','orion_decidir') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('decision_engine','orion_decidir') and (position('mp_is_admin' in lower(pg_get_functiondef(p.oid)))>0 or position('service_role' in lower(pg_get_functiondef(p.oid)))>0);
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='ai_decisions' and c.relrowsecurity;
  select count(*) into v_perigo from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('decision_engine','orion_decidir') and (position('motor_publish_execute(' in lower(pg_get_functiondef(p.oid)))>0 or position('pay_post_transaction(' in lower(pg_get_functiondef(p.oid)))>0 or position('aoc_execute' in lower(pg_get_functiondef(p.oid)))>0);
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=2 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' fns (decision_engine/orion_decidir)'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','gate_admin','resultado',case when v_gate>=2 then 'PASS' else 'FAIL' end,'evidencia',v_gate||' fns com gate'),
    jsonb_build_object('nome','tabela_rls','resultado',case when v_tbl>=1 then 'PASS' else 'FAIL' end,'evidencia','ai_decisions RLS='||v_tbl),
    jsonb_build_object('nome','recomenda_nunca_executa','resultado',case when v_perigo=0 then 'PASS' else 'FAIL' end,'evidencia',v_perigo||' fns com execucao proibida')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','decision','gerado_em',now(),'checks',v_checks,'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_decision_selftest() from public, anon;
grant execute on function public.orion_decision_selftest() to authenticated;
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('decision_engine','orion_decidir') and has_function_privilege('anon',p.oid,'execute')) anon_depois, (public.orion_decision_selftest())->>'status' selftest, (public.orion_decision_selftest())->'resumo' resumo;
