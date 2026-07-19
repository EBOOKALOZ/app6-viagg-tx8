-- AI-27 Sales (sales_*): P-SALES-SEC1 revogar anon + P-SALES-H1 selftest
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^sales' or p.proname='orion_sales_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_sales_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_opp int; v_exec int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^sales';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^sales' or p.proname='orion_sales_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^sales' or p.proname='orion_sales_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_sales_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_sales' and c.relrowsecurity;
  select count(*) into v_opp from orion_sales_opportunities;
  select count(*) into v_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^sales'
    and (position('motor_publish_execute(' in lower(pg_get_functiondef(p.oid)))>0 or position('pay_post_transaction(' in lower(pg_get_functiondef(p.oid)))>0 or position('net.http_post' in lower(pg_get_functiondef(p.oid)))>0 or position('advertiser_credit' in lower(pg_get_functiondef(p.oid)))>0 or position('debitsellercredits' in lower(pg_get_functiondef(p.oid)))>0 or position('aoc_execute(' in lower(pg_get_functiondef(p.oid)))>0);
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=6 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes sales'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_sales_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=1 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabela c/ RLS'),
    jsonb_build_object('nome','oportunidades_vivas','resultado',case when v_opp>=1 then 'PASS' else 'WARNING' end,'evidencia',v_opp||' oportunidades'),
    jsonb_build_object('nome','nao_move_dinheiro','resultado',case when v_exec=0 then 'PASS' else 'FAIL' end,'evidencia',v_exec||' fns que movem $/executam/enviam msg')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','sales','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_sales_selftest() from public, anon;
grant execute on function public.orion_sales_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^sales' or p.proname='orion_sales_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_sales_selftest())->>'status' selftest_status,
       (public.orion_sales_selftest())->'resumo' resumo,
       (public.orion_sales_selftest())->'checks'->6->>'evidencia' nao_move,
       length((public.sales_summary())::text) summary_bytes,
       length((public.sales_funnel())::text) funnel_bytes;
