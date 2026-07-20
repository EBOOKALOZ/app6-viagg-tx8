-- AI-38 Cyber Defense (cyber_*): P-CYBER-SEC1 revogar anon (16 fns leitura vazavam
-- politicas/bloqueios/mapa de ataques SEM guard; 5 fns de acao tinham cyber_guard()
-- mas grant a anon violava defesa-em-profundidade) + P-CYBER-H1 selftest
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^cyber' or p.proname='orion_cyber_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_cyber_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_evt int; v_acao_sem_guard int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^cyber';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^cyber' or p.proname='orion_cyber_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^cyber' or p.proname='orion_cyber_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_cyber_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_cyber' and c.relrowsecurity;
  select count(*) into v_evt from orion_cyber_events;
  -- invariante: toda fn que ESCREVE (insert/update/delete) em tabelas cyber deve chamar cyber_guard()
  select count(*) into v_acao_sem_guard from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^cyber' and p.proname not in ('cyber_guard')
    and lower(pg_get_functiondef(p.oid)) ~ '(insert\s+into|update|delete\s+from)\s+public\.orion_cyber'
    and position('cyber_guard()' in pg_get_functiondef(p.oid)) = 0;
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=15 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes cyber_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_cyber_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','eventos_vivos','resultado',case when v_evt>=1 then 'PASS' else 'WARNING' end,'evidencia',v_evt||' eventos de ciber-seguranca'),
    jsonb_build_object('nome','toda_escrita_tem_guard','resultado',case when v_acao_sem_guard=0 then 'PASS' else 'FAIL' end,'evidencia',v_acao_sem_guard||' fns escrevem sem cyber_guard()')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','cyber_defense','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_cyber_selftest() from public, anon;
grant execute on function public.orion_cyber_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^cyber' or p.proname='orion_cyber_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_cyber_selftest())->>'status' selftest_status,
       (public.orion_cyber_selftest())->'resumo' resumo,
       (public.orion_cyber_selftest())->'checks'->6->>'evidencia' guard_invariante;
