-- AI-54 Knowledge (knowledge_*, distinto de Learning AI-21): modulo EXEMPLAR - anon=0
-- de origem + orion_knowledge_selftest ja existente (PASS 6/6, 145 entidades).
-- Unico ajuste: orion_knowledge_tick e' interna (cron) e estava grant authenticated ->
-- revoga (owner=postgres SECDEF preserva execucao do cron). P-KNOW-H1: sem novos gaps.
revoke execute on function public.orion_knowledge_tick() from authenticated, public;
select has_function_privilege('authenticated','public.orion_knowledge_tick()','execute') tick_authd_depois,
       (public.orion_knowledge_selftest())->>'status' selftest_status,
       (public.orion_knowledge_selftest())->'resumo' resumo,
       (public.orion_knowledge_selftest())->'checks'->2->>'evidencia' anon_check;
