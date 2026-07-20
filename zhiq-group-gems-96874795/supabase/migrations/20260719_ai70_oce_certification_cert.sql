-- AI-70 OCE (oce_*, Orion Certification Authority - auditor READ-ONLY): read-only
-- comprovado (escreve_fora=0: so grava orion_oce_*, nunca negocio). P-OCE-SEC1: 9 fns
-- oce_*/tick anon-exec expunham relatorio de certificacao/patches/achados a anon ->
-- revoga anon. P-OCE-H1 selftest.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^oce_' or p.proname='orion_oce_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_oce_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_escreve_fora int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^oce_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^oce_' or p.proname='orion_oce_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^oce_' or p.proname='orion_oce_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_oce_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_oce' and c.relrowsecurity;
  -- INVARIANTE auditor: NENHUMA oce_ escreve fora de orion_oce_ (read-only sobre negocio)
  select count(*) into v_escreve_fora from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^oce_'
    and ((lower(pg_get_functiondef(p.oid)) ~ 'insert into public\.(?!orion_oce)') or (lower(pg_get_functiondef(p.oid)) ~ 'update public\.(?!orion_oce)') or (lower(pg_get_functiondef(p.oid)) ~ 'delete from public\.(?!orion_oce)'));
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=6 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes oce_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_oce_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=4 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas orion_oce c/ RLS'),
    jsonb_build_object('nome','auditor_read_only','resultado',case when v_escreve_fora=0 then 'PASS' else 'FAIL' end,'evidencia',v_escreve_fora||' fns que escrevem fora de orion_oce_ (auditor deve ser read-only)')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','oce_certification','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_oce_selftest() from public, anon;
grant execute on function public.orion_oce_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^oce_' or p.proname='orion_oce_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_oce_selftest())->>'status' selftest_status,
       (public.orion_oce_selftest())->'resumo' resumo,
       (public.orion_oce_selftest())->'checks'->5->>'evidencia' readonly_check;
