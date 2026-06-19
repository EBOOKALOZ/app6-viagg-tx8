-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: checkout de pacote de veículos falhava com "Erro ao gerar cobrança".
--
-- Causa: vehicle_credit_purchases só tinha policy de SELECT (vcp_owner_read),
-- sem INSERT. O frontend (RealEstateCheckoutContent) precisa inserir a
-- ordem de compra como o próprio usuário autenticado antes de cobrar no
-- gateway — sem policy de INSERT, o RLS bloqueia e a compra falha.
--
-- Espelha real_estate_credit_purchases_owner_all (FOR ALL), que já funciona.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists vcp_owner_read on public.vehicle_credit_purchases;
drop policy if exists vehicle_credit_purchases_owner_all on public.vehicle_credit_purchases;
create policy vehicle_credit_purchases_owner_all
on public.vehicle_credit_purchases
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

select pg_notify('pgrst', 'reload schema');
