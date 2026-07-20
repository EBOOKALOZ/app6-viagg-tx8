-- ORGANIZACAO FINAL: remove selftests legados quebrados (substituidos por
-- orion_tpl_selftest / orion_aeo_selftest, ambos PASS). Deps verificadas: 0 cron,
-- 0 trigger, 0 fn chamadora; unica ref era tooltip textual (atualizado no front).
drop function if exists public.tpl_selftest();
drop function if exists public.aeo_selftest();
-- ajuste do threshold de orion_tpl_selftest pos-remocao (funcoes_nucleo >=2)
-- (aplicado ao vivo; ver 20260719_ai62_smart_template_cert.sql atualizado)
