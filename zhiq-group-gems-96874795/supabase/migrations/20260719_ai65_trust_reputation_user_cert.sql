-- AI-65 Trust & Reputation POR USUARIO (rep_*, AI-74 oficial; orion_rep_*): arquitetura
-- anti-IDOR EXEMPLAR - anon=0, rep_guard(p_target) impoe "so proprio usuario ou admin",
-- e as 5 fns por-usuario (rep_get/badges_api/history_api/recommendations_api/
-- verifications_api) TODAS usam rep_guard. rep_selftest existe. P-REP-SEC1:
-- rep_compute_user (interno, so rep_run/rep_get chamam; rep_get ja passa por guard) +
-- rep_award_badges/scan_alerts/recommendations_engine/rep_run sao internos do motor,
-- grant authenticated -> usuario comum recalcularia/liberia reputacao de terceiro
-- fora do guard. Revoga authenticated (interno via owner=postgres).
revoke execute on function public.rep_compute_user(uuid) from authenticated, public;
revoke execute on function public.rep_award_badges() from authenticated, public;
revoke execute on function public.rep_scan_alerts() from authenticated, public;
revoke execute on function public.rep_recommendations_engine() from authenticated, public;
revoke execute on function public.rep_run(text) from authenticated, public;

create or replace function public.orion_rep_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_por_user_sem_guard int; v_interno_exposto int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^rep_';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^rep_' or p.proname='orion_rep_tick') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^rep_' or p.proname='orion_rep_tick') and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_rep_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_rep' and c.relrowsecurity;
  -- invariante anti-IDOR: fns publicas por-usuario (api, p_user_id) chamam rep_guard
  select count(*) into v_por_user_sem_guard from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('rep_get','rep_badges_api','rep_history_api','rep_recommendations_api','rep_verifications_api')
    and pg_get_functiondef(p.oid) not like '%rep_guard%';
  -- motor interno nao exposto a authenticated
  select count(*) into v_interno_exposto from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('rep_compute_user','rep_award_badges','rep_scan_alerts','rep_recommendations_engine','rep_run')
    and has_function_privilege('authenticated',p.oid,'execute');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=12 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes rep_'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_rep_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=6 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','anti_idor_por_usuario','resultado',case when v_por_user_sem_guard=0 then 'PASS' else 'FAIL' end,'evidencia',v_por_user_sem_guard||' fns por-usuario sem rep_guard (IDOR)'),
    jsonb_build_object('nome','motor_interno_fechado','resultado',case when v_interno_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_interno_exposto||' fns motor (compute/award/run) expostas a authenticated')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','trust_reputation_user','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_rep_selftest() from public, anon;
grant execute on function public.orion_rep_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rep_compute_user','rep_award_badges','rep_scan_alerts','rep_recommendations_engine','rep_run') and has_function_privilege('authenticated',p.oid,'execute')) motor_exposto,
       (public.orion_rep_selftest())->>'status' selftest_status,
       (public.orion_rep_selftest())->'resumo' resumo,
       (public.orion_rep_selftest())->'checks'->5->>'evidencia' idor_check;
