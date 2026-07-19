-- AI-12 Analytics/BI: revogar anon de biz_* (info disclosure em scores/summary)
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^biz_' or p.proname='orion_biz_tick')
             and has_function_privilege('anon',p.oid,'execute')
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop; end $g$;
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^biz_' or p.proname='orion_biz_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.biz_selftest())->>'status' selftest_status,
       (public.biz_selftest())->'resumo' resumo;
