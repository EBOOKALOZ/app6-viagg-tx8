-- AI-64 Security Core (sec_*, AI-24 oficial): EXEMPLAR - anon=0 de origem em todas as
-- 15 fns, orion_security_selftest nativo PASS 6/6 (anon=0, search_path fixo, 3 tabelas
-- RLS, 5 prompts). Writers sensiveis (sec_generate/score/set_config/dashboard/summary/
-- auth_analysis/sessions) gated. Unico ajuste: orion_security_tick (interno) authenticated.
revoke execute on function public.orion_security_tick() from authenticated, public;
select has_function_privilege('authenticated','public.orion_security_tick()','execute') tick_authd_depois,
       (public.orion_security_selftest())->>'status' selftest_status,
       (public.orion_security_selftest())->'resumo' resumo,
       (public.orion_security_selftest())->'checks'->2->>'evidencia' anon_check;
