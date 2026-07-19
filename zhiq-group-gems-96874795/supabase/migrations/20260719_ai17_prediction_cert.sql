-- AI-17 Prediction: revogar anon (info disclosure em domain/summary/engine)
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^predict_' or p.proname ~ '^prediction_' or p.proname='orion_predict_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^predict_' or p.proname ~ '^prediction_' or p.proname='orion_predict_tick') and has_function_privilege('anon',p.oid,'execute')) anon_depois,
       (public.predict_selftest()) selftest,
       (select max(gerado_em)::text from orion_predict_forecasts) ultima_previsao;
