-- AI-61 Background Intelligence (bg_*, AI-65 design oficial): anon=0 de origem, 0
-- net.http_post (pixel/IA no Edge). create_project/enqueue/restore_version gated.
-- bg_selftest existe. P-BG-SEC1: protocolo worker (bg_next_job/bg_complete_job) +
-- statistics_rollup/emit + tick estao grant authenticated. O worker (pixel/IA) usa
-- service_role, nao JWT de usuario; deixar authenticated permitiria usuario comum
-- puxar/completar jobs de terceiros (bg_complete_job grava resultado_url arbitrario).
-- Revoga authenticated dessas (worker via service_role/owner=postgres preservado).
revoke execute on function public.bg_next_job(text) from authenticated, public;
revoke execute on function public.bg_complete_job(bigint,text,jsonb,text) from authenticated, public;
revoke execute on function public.bg_statistics_rollup() from authenticated, public;
revoke execute on function public.bg_emit(text,jsonb) from authenticated, public;
revoke execute on function public.orion_bg_tick() from authenticated, public;

create or replace function public.orion_bg_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_worker_exposto int; v_net int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^bg_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^bg_' or p.proname='orion_bg_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^bg_' or p.proname='orion_bg_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_bg_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_bg' and c.relrowsecurity;
  -- invariante: protocolo worker nao exposto a authenticated
  select count(*) into v_worker_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('bg_next_job','bg_complete_job','bg_statistics_rollup','bg_emit')
    and has_function_privilege('authenticated',p.oid,'execute');
  -- pixel/IA no Edge, nao no SQL (0 net.http_post)
  select count(*) into v_net from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^bg_' and lower(pg_get_functiondef(p.oid)) like '%net.http_post%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=8 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes bg_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_bg_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','protocolo_worker_fechado','resultado',case when v_worker_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_worker_exposto||' fns worker (next/complete/rollup/emit) expostas a authenticated'),
    jsonb_build_object('nome','pixel_no_edge','resultado',case when v_net=0 then 'PASS' else 'WARNING' end,'evidencia',v_net||' fns bg_ com net.http_post (pixel/IA deve ser no Edge)')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','background_intelligence','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_bg_selftest() from public, anon;
grant execute on function public.orion_bg_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^bg_' or p.proname='orion_bg_tick') and has_function_privilege('anon',p.oid,'execute')) anon,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('bg_next_job','bg_complete_job','bg_statistics_rollup','bg_emit') and has_function_privilege('authenticated',p.oid,'execute')) worker_exposto,
       (public.orion_bg_selftest())->>'status' selftest_status,
       (public.orion_bg_selftest())->'resumo' resumo;
