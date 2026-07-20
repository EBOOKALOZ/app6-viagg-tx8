-- AI-60 Auction Growth (agrowth_*, AI-69 oficial): modulo EXEMPLAR de leilao. anon=0,
-- TODAS as fns tem agrowth_assert_admin (guard) e NENHUMA escreve (read/analytics puro),
-- 0 toca leilao/pay real, agrowth_selftest existe. P-AGR-SEC1: orion_agrowth_tick interno
-- -> revoga authenticated. P-AGR-H1: selftest padronizado c/ invariante todas_gated.
revoke execute on function public.orion_agrowth_tick() from authenticated, public;

create or replace function public.orion_agrowth_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_sem_guard int; v_aciona int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^agrowth';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^agrowth' or p.proname='orion_agrowth_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^agrowth' or p.proname='orion_agrowth_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_agrowth_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_agrowth' and c.relrowsecurity;
  -- invariante: toda fn agrowth_ (exceto assert_admin/selftest/tick) chama agrowth_assert_admin
  select count(*) into v_sem_guard from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^agrowth' and p.proname not in ('agrowth_assert_admin','agrowth_selftest')
    and pg_get_functiondef(p.oid) not like '%agrowth_assert_admin%';
  select count(*) into v_aciona from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^agrowth'
    and (lower(pg_get_functiondef(p.oid)) like '%place_auction_bid(%' or lower(pg_get_functiondef(p.oid)) like '%pay_post_transaction(%' or lower(pg_get_functiondef(p.oid)) like '%debitsellercredits(%');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=8 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes agrowth_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_agrowth_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','todas_gated','resultado',case when v_sem_guard=0 then 'PASS' else 'FAIL' end,'evidencia',v_sem_guard||' fns sem agrowth_assert_admin'),
    jsonb_build_object('nome','nao_toca_leilao_real','resultado',case when v_aciona=0 then 'PASS' else 'FAIL' end,'evidencia',v_aciona||' fns que dao lance/pagam')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','auction_growth','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_agrowth_selftest() from public, anon;
grant execute on function public.orion_agrowth_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^agrowth' or p.proname='orion_agrowth_tick') and has_function_privilege('anon',p.oid,'execute')) anon,
       (public.orion_agrowth_selftest())->>'status' selftest_status,
       (public.orion_agrowth_selftest())->'resumo' resumo;
