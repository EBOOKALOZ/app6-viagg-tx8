-- AI-19 Optimization (Cost Optimization): P-OPT-SEC1 revogar anon
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^cost_' or p.proname ~ '^orion_cost' or p.proname='optimization_engine') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^cost_' or p.proname ~ '^orion_cost' or p.proname='optimization_engine') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.cost_selftest()) selftest,
       (select count(*) from orion_cost_history) hist,
       (select max(ts)::text from (select xmax::text::bigint as ts from orion_cost_history limit 0) z) dummy;
