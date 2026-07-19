-- AI-31 Digital Twin (twin_*): P-TWIN-SEC1 revogar anon. Ja tem twin_selftest.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^twin_' or p.proname='orion_twin_tick' or p.proname='simulation_engine') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^twin_' or p.proname='orion_twin_tick' or p.proname='simulation_engine') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.twin_selftest()) selftest,
       (select count(*) from orion_twin_entities) entities,
       length((public.twin_summary())::text) summary_bytes;
