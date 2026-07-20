-- AI-53 Autonomous Operations (aoc_*, AI-56 oficial): ACHADO CRITICO MAXIMO.
-- P-AOC-SEC1 (P0): aoc_execute_decision (executor autonomo) era anon+authenticated
-- SEM gate -> PROVADO ao vivo (HTTP 204): anon disparava execucao de qualquer decisao
-- pendente (abrir incidente/recuperar/alertar/despachar p/ modulos). Cadeia legitima:
-- orion_aoc_tick -> aoc_decide (motor, so acao SEGURA; rebaixa nao-segura p/ aprovacao)
-- e aoc_approve_decision (gated) -> aoc_execute_decision. Owner=postgres SECDEF.
-- Revoga anon+authenticated do executor + internas (chamada interna preservada).
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^aoc_' or p.proname ~ '^autonomous' or p.proname='orion_aoc_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- P0: executor + motor + primitivas internas NAO podem ser exec por authenticated
revoke execute on function public.aoc_execute_decision(bigint) from authenticated, public;
revoke execute on function public.aoc_decide(bigint) from authenticated, public;
revoke execute on function public.aoc_dispatch(bigint,text,text,jsonb) from authenticated, public;
revoke execute on function public.aoc_ingest_events() from authenticated, public;
revoke execute on function public.aoc_optimize() from authenticated, public;
revoke execute on function public.aoc_snapshot_resources() from authenticated, public;
revoke execute on function public.aoc_open_incident(text,text,text,bigint,jsonb) from authenticated, public;
revoke execute on function public.aoc_recover(bigint,text) from authenticated, public;
revoke execute on function public.aoc_count_safe(text,text) from authenticated, public;

create or replace function public.orion_aoc_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_exec_exposto int; v_rebaixa int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^aoc_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aoc_' or p.proname='orion_aoc_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aoc_' or p.proname='orion_aoc_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_aoc_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_aoc' and c.relrowsecurity;
  -- P0 invariante: executor/motor/dispatch NAO exec por authenticated
  select count(*) into v_exec_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('aoc_execute_decision','aoc_decide','aoc_dispatch','aoc_open_incident','aoc_recover')
    and has_function_privilege('authenticated',p.oid,'execute');
  -- invariante: aoc_decide rebaixa acao nao-segura p/ aprovacao humana
  select count(*) into v_rebaixa from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='aoc_execute_decision' and lower(pg_get_functiondef(p.oid)) like '%aguardando_aprovacao%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes aoc_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_aoc_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','executor_autonomo_fechado','resultado',case when v_exec_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_exec_exposto||' fns executoras (execute/decide/dispatch) expostas a authenticated'),
    jsonb_build_object('nome','acao_nao_segura_exige_aprovacao','resultado',case when v_rebaixa=1 then 'PASS' else 'FAIL' end,'evidencia','executor rebaixa acao nao-segura p/ aprovacao='||v_rebaixa)
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','autonomous_operations','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_aoc_selftest() from public, anon;
grant execute on function public.orion_aoc_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aoc_' or p.proname='orion_aoc_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       has_function_privilege('authenticated','public.aoc_execute_decision(bigint)','execute') executor_authd_depois,
       (public.orion_aoc_selftest())->>'status' selftest_status,
       (public.orion_aoc_selftest())->'resumo' resumo;
