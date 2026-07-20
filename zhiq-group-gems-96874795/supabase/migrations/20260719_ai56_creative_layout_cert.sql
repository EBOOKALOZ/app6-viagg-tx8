-- AI-56 Creative Layout (clay_*, AI-63 oficial): modulo BOM (anon=0 nas fns; clay_selftest
-- ja valida grants_travados + execute_sem_public_anon). P-CLAY-SEC1: orion_creative_layout_tick
-- anon-exec -> revoga. P-CLAY-SEC2: writers internos (generate/learn/place/*_compute/
-- preview_build/metrics_rollup/emit; front so usa clay_dashboard/preview) expostos a
-- authenticated -> revoga (interna via owner=postgres SECDEF).
revoke execute on function public.orion_creative_layout_tick() from anon, public;
grant execute on function public.orion_creative_layout_tick() to authenticated;
revoke execute on function public.orion_creative_layout_tick() from authenticated;
revoke execute on function public.clay_generate(bigint) from authenticated, public;
revoke execute on function public.clay_learn() from authenticated, public;
revoke execute on function public.clay_place(bigint,text,jsonb,integer,integer,text,text,text,integer,text,text,integer,jsonb) from authenticated, public;
revoke execute on function public.clay_score_compute(bigint) from authenticated, public;
revoke execute on function public.clay_validate_compute(bigint) from authenticated, public;
revoke execute on function public.clay_preview_build(bigint) from authenticated, public;
revoke execute on function public.clay_metrics_rollup() from authenticated, public;
revoke execute on function public.clay_emit(text,jsonb) from authenticated, public;

create or replace function public.orion_clay_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_writer_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^clay_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^clay_' or p.proname='orion_creative_layout_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^clay_' or p.proname='orion_creative_layout_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_creative_layout_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_layout' and c.relrowsecurity;
  select count(*) into v_writer_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('clay_generate','clay_learn','clay_place','clay_score_compute','clay_validate_compute','clay_preview_build','clay_metrics_rollup','clay_emit')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=15 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes clay_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_creative_layout_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=8 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','writers_internos_fechados','resultado',case when v_writer_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_writer_exposto||' writers de layout expostos a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','creative_layout','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_clay_selftest() from public, anon;
grant execute on function public.orion_clay_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^clay_' or p.proname='orion_creative_layout_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('clay_generate','clay_learn','clay_place','clay_score_compute','clay_validate_compute','clay_preview_build','clay_metrics_rollup','clay_emit') and has_function_privilege('authenticated',p.oid,'execute')) writer_ainda_exposto,
       (public.orion_clay_selftest())->>'status' selftest_status,
       (public.orion_clay_selftest())->'resumo' resumo;
