-- AI-25 Personalization (perso_*): P-PERSO-SEC1 anon + P-PERSO-IDOR1 (perso_is_optout) + P-PERSO-H1 selftest
-- 1) Endurecer perso_is_optout: so o proprio usuario/admin/servico ve o optout (fecha IDOR)
create or replace function public.perso_is_optout(p_user uuid)
returns boolean language sql security definer set search_path to 'public' as $f$
  select case
    when p_user = auth.uid() or mp_is_admin() or session_user='postgres' or coalesce(auth.role(),'')='service_role'
      then exists (select 1 from orion_perso_optout where user_id = p_user)
    else null
  end;
$f$;

-- 2) Revogar anon de todas as perso_*
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^perso') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- 3) Selftest
create or replace function public.orion_perso_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_rec int; v_exec int; v_idor int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^perso';
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^perso' and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^perso' and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname='orion_perso_tick' and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_perso' and c.relrowsecurity;
  select count(*) into v_rec from orion_perso_recommendations;
  select count(*) into v_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^perso'
    and (position('motor_publish_execute(' in lower(pg_get_functiondef(p.oid)))>0 or position('pay_post_transaction(' in lower(pg_get_functiondef(p.oid)))>0 or position('net.http_post' in lower(pg_get_functiondef(p.oid)))>0 or position('advertiser_credit' in lower(pg_get_functiondef(p.oid)))>0 or position('aoc_execute(' in lower(pg_get_functiondef(p.oid)))>0);
  select count(*) into v_idor from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^perso'
    and pg_get_function_identity_arguments(p.oid) like '%p_user uuid%' and lower(pg_get_functiondef(p.oid)) not like '%auth.uid()%';
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=8 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes perso'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','cron_tick','resultado',case when v_cron>=1 then 'PASS' else 'FAIL' end,'evidencia','orion_perso_tick ativo='||v_cron),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=3 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','recomendacoes_vivas','resultado',case when v_rec>=1 then 'PASS' else 'WARNING' end,'evidencia',v_rec||' recomendacoes'),
    jsonb_build_object('nome','nao_executa_negocio','resultado',case when v_exec=0 then 'PASS' else 'FAIL' end,'evidencia',v_exec||' fns que executam acao de negocio'),
    jsonb_build_object('nome','controle_acesso_por_usuario','resultado',case when v_idor=0 then 'PASS' else 'FAIL' end,'evidencia',v_idor||' fns p_user sem auth.uid (IDOR)')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','personalization','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_perso_selftest() from public, anon;
grant execute on function public.orion_perso_selftest() to authenticated;

select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^perso' and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.orion_perso_selftest())->>'status' selftest_status,
       (public.orion_perso_selftest())->'resumo' resumo,
       (public.orion_perso_selftest())->'checks'->7->>'evidencia' idor_check,
       length((public.perso_metrics())::text) metrics_bytes;
