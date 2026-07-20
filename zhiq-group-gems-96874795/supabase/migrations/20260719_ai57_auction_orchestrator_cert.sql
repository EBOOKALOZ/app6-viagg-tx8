-- AI-57 Auction Orchestrator (aeo_*, AI-70 oficial, READ-ONLY): modulo BOM - anon=0,
-- aeo_selftest existe, escreve so orion_aeo_* (nao toca leilao/pay real: bid=pay=cria=0;
-- 'settle' e' so referencia ao AI-65 que ele monitora). P-AEO-SEC1: 12 fns internas de
-- orquestracao (front so usa aeo_dashboard/aeo_orchestrate_rpc, ambos gated) expostas a
-- authenticated -> revoga (interna via owner=postgres SECDEF).
revoke execute on function public.aeo_orchestrate() from authenticated, public;
revoke execute on function public.aeo_discover() from authenticated, public;
revoke execute on function public.aeo_ingest_events() from authenticated, public;
revoke execute on function public.aeo_alerts_generate() from authenticated, public;
revoke execute on function public.aeo_bi_consolidate() from authenticated, public;
revoke execute on function public.aeo_health_check() from authenticated, public;
revoke execute on function public.aeo_quality_check() from authenticated, public;
revoke execute on function public.aeo_workflow_validate() from authenticated, public;
revoke execute on function public.aeo_predict() from authenticated, public;
revoke execute on function public.aeo_performance_snapshot() from authenticated, public;
revoke execute on function public.aeo_scores_refresh(jsonb,jsonb,jsonb,jsonb) from authenticated, public;
revoke execute on function public.aeo_emit(text,jsonb) from authenticated, public;

create or replace function public.orion_aeo_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_toca_real int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^aeo';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aeo' or p.proname='orion_auction_orchestrator_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aeo' or p.proname='orion_auction_orchestrator_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_auction_orchestrator_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_aeo' and c.relrowsecurity;
  -- invariante READ-ONLY: nenhuma aeo_ toca leilao/pagamento real
  select count(*) into v_toca_real from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^aeo'
    and (lower(pg_get_functiondef(p.oid)) like '%place_auction_bid(%' or lower(pg_get_functiondef(p.oid)) like '%pay_post_transaction(%' or lower(pg_get_functiondef(p.oid)) like '%create_auction_listing(%' or lower(pg_get_functiondef(p.oid)) like '%debitsellercredits(%');
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('aeo_orchestrate','aeo_discover','aeo_ingest_events','aeo_alerts_generate','aeo_bi_consolidate','aeo_health_check','aeo_quality_check','aeo_workflow_validate','aeo_predict','aeo_performance_snapshot','aeo_scores_refresh','aeo_emit')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=15 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes aeo_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_auction_orchestrator_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=8 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','read_only_leilao','resultado',case when v_toca_real=0 then 'PASS' else 'FAIL' end,'evidencia',v_toca_real||' fns que tocam leilao/pagamento real (deve ser 0)'),
    jsonb_build_object('nome','orquestracao_interna_fechada','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns internas expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','auction_orchestrator','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_aeo_selftest() from public, anon;
grant execute on function public.orion_aeo_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^aeo' or p.proname='orion_auction_orchestrator_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('aeo_orchestrate','aeo_discover','aeo_ingest_events','aeo_alerts_generate','aeo_bi_consolidate','aeo_health_check','aeo_quality_check','aeo_workflow_validate','aeo_predict','aeo_performance_snapshot','aeo_scores_refresh','aeo_emit') and has_function_privilege('authenticated',p.oid,'execute')) interno_ainda_exposto,
       (public.orion_aeo_selftest())->>'status' selftest_status,
       (public.orion_aeo_selftest())->'resumo' resumo;
