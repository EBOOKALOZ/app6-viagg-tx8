-- ORGANIZACAO FINAL ETAPA 1: remover selftests legados quebrados, substituidos por
-- orion_tpl_selftest (PASS) e orion_aeo_selftest (PASS). Deps verificadas:
-- 0 cron, 0 trigger, 0 fn chamadora. Unica ref = tooltip textual em
-- AdminOrionSmartTemplate.tsx (atualizado p/ orion_tpl_selftest). Sem regra de negocio.
drop function if exists public.tpl_selftest();
drop function if exists public.aeo_selftest();
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('tpl_selftest','aeo_selftest')) legados_restantes,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('orion_tpl_selftest','orion_aeo_selftest')) substitutos_presentes;
