-- AI-58 Auction Intelligence (auction_intel_*, AI-67 oficial): modulo BOM - anon=0 de
-- origem, nao toca leilao/pay real (toca_real=0 em todas; "nunca inventa"), refresh/
-- dashboard gated. P-AINT-SEC1: auction_intel_refresh (writer, ja gated) + tick internos
-- -> revoga authenticated. Fns de leitura/reco (score/summary/bids/market/predict/etc)
-- ficam authenticated (consumidas por admin/painel). P-AINT-H1 selftest.
revoke execute on function public.auction_intel_refresh() from authenticated, public;
revoke execute on function public.orion_auction_intel_tick() from authenticated, public;

create or replace function public.orion_auction_intel_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_toca_real int; v_writer_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^auction_intel';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^auction_intel' or p.proname='orion_auction_intel_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^auction_intel' or p.proname ~ '^orion_auction_intel') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_auction_intel_tick' and active;
  -- invariante "nunca inventa": nenhuma auction_intel_ toca leilao/pagamento real
  select count(*) into v_toca_real from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^auction_intel'
    and (lower(pg_get_functiondef(p.oid)) like '%place_auction_bid(%' or lower(pg_get_functiondef(p.oid)) like '%pay_post_transaction(%' or lower(pg_get_functiondef(p.oid)) like '%debitsellercredits(%' or lower(pg_get_functiondef(p.oid)) like '%create_auction_listing(%');
  -- writer (refresh) nao exposto a authenticated
  select count(*) into v_writer_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='auction_intel_refresh' and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes auction_intel_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_auction_intel_tick ativo='||v_cron),
    jsonb_build_object('nome','nunca_inventa','resultado',case when v_toca_real=0 then 'PASS' else 'FAIL' end,'evidencia',v_toca_real||' fns que tocam leilao/pagamento real (deve ser 0)'),
    jsonb_build_object('nome','writer_interno_fechado','resultado',case when v_writer_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_writer_exposto||' writer (refresh) exposto a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','auction_intelligence','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_auction_intel_selftest() from public, anon;
grant execute on function public.orion_auction_intel_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^auction_intel' or p.proname ~ '^orion_auction_intel') and has_function_privilege('anon',p.oid,'execute')) anon,
       has_function_privilege('authenticated','public.auction_intel_refresh()','execute') refresh_authd,
       (public.orion_auction_intel_selftest())->>'status' selftest_status,
       (public.orion_auction_intel_selftest())->'resumo' resumo;
