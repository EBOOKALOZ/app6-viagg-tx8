-- AI-66 Performance (performance_*, AI-11 oficial): BOM - 5 fns anon=0 de origem,
-- predictions/report/score gated, orion_perf_selftest existe, 3 tabelas RLS. Unico
-- ajuste: orion_perf_tick (interno) authenticated -> revoga. alerts/history sem gate
-- mas anon=0 (leitura admin). P-PERF-H1: reconfirma selftest nativo.
revoke execute on function public.orion_perf_tick() from authenticated, public;
select has_function_privilege('authenticated','public.orion_perf_tick()','execute') tick_authd,
       (public.orion_perf_selftest())->>'status' selftest_status,
       (public.orion_perf_selftest())->'resumo' resumo;
