-- =========================================================
-- ORION-480 P0 — VEHICLE_LISTINGS: GRANT SELECT AUSENTE
-- =========================================================
-- Causa raiz (auditoria ORION-480, 2026-07-30):
-- public.vehicle_listings foi criada com RLS habilitado e com a
-- policy vehicle_listings_public_read_published corretamente
-- restringindo a leitura a visibility_status = 'published',
-- mas NUNCA recebeu o GRANT SELECT de nível de tabela para os
-- papéis anon/authenticated. Sem esse GRANT, o Postgres nega o
-- acesso (42501 permission denied) antes mesmo de avaliar a RLS.
--
-- Esta migration concede exclusivamente o privilégio de leitura
-- de tabela. Nenhuma policy, trigger, índice, constraint ou
-- coluna é alterada. A RLS existente continua sendo a única
-- responsável por filtrar QUAIS linhas cada papel enxerga.
-- =========================================================

grant select on public.vehicle_listings to anon;
grant select on public.vehicle_listings to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- ROLLBACK (executar manualmente se necessário reverter):
--
--   revoke select on public.vehicle_listings from anon;
--   revoke select on public.vehicle_listings from authenticated;
--   notify pgrst, 'reload schema';
--
-- Reverter restaura o erro 42501 original para leitura pública
-- de veículos — usar somente se esta migration causar regressão
-- inesperada em produção.
-- =========================================================
