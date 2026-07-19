-- AI-32 Pricing (pricing_*/orion_dprice_*): P-PRICE-SEC1 revogar anon + P-PRICE-H1 selftest
-- CRITICO: pricing_apply_package/rollback escrevem divulgacao_packages (preco real) -> NUNCA podem ser anon.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^pricing' or p.proname ~ '^orion_dprice') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

create or replace function public.orion_pricing_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_tbl int; v_pol int; v_cron int; v_write_ungated int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^pricing' or p.proname ~ '^orion_dprice');
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^pricing' or p.proname ~ '^orion_dprice') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^pricing' or p.proname ~ '^orion_dprice') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (c.relname ~ '^orion_pricing' or c.relname ~ '^orion_dprice') and c.relrowsecurity;
  select count(*) into v_pol from orion_pricing_policies;
  select count(*) into v_cron from cron.job where jobname ~ 'pricing|dprice' and active;
  -- INVARIANTE CRITICA: toda fn que escreve divulgacao_packages (preco real) DEVE exigir mp_is_admin
  select count(*) into v_write_ungated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^pricing' or p.proname ~ '^orion_dprice')
    and lower(pg_get_functiondef(p.oid)) ~ '(update|insert into)\s+divulgacao_packages'
    and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes pricing/dprice'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=3 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','aplicacao_preco_so_admin','resultado',case when v_write_ungated=0 then 'PASS' else 'FAIL' end,'evidencia',v_write_ungated||' fns escrevem divulgacao_packages SEM gate admin'),
    jsonb_build_object('nome','sem_execucao_autonoma','resultado',case when v_cron=0 then 'PASS' else 'WARNING' end,'evidencia',v_cron||' cron aplica preco (0=recomenda, humano aplica)'),
    jsonb_build_object('nome','politicas_vivas','resultado',case when v_pol>=1 then 'PASS' else 'WARNING' end,'evidencia',v_pol||' politicas de preco')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','pricing','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_pricing_selftest() from public, anon;
grant execute on function public.orion_pricing_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^pricing' or p.proname ~ '^orion_dprice') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_pricing_selftest())->>'status' selftest_status,
       (public.orion_pricing_selftest())->'resumo' resumo,
       (public.orion_pricing_selftest())->'checks'->4->>'evidencia' invariante_admin,
       length((public.pricing_recommendations())::text) recs_bytes,
       length((public.pricing_summary())::text) summary_bytes;
