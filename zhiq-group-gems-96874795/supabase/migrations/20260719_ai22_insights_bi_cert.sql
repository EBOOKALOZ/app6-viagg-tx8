-- AI-22 Insights (Business Intelligence): P-INS-SEC1 revogar anon de bi_* + orion_bi_tick
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^bi_' or p.proname ~ '^orion_bi_' or p.proname ~ '^orion_biz') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^bi_' or p.proname ~ '^orion_bi_' or p.proname ~ '^orion_biz') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.biz_selftest()) selftest;
