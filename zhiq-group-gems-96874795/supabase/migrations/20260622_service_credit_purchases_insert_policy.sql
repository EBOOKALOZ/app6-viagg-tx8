-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: checkout de pacote de serviços falha com "Erro ao gerar cobrança".
--
-- Mesma causa já corrigida pra veículos (20260618_vehicle_credit_purchases_insert_policy.sql):
-- service_credit_purchases só tinha policy de SELECT (scp_owner_read), sem
-- INSERT. O frontend (RealEstateCheckoutContent) precisa inserir a ordem de
-- compra como o próprio usuário autenticado antes de cobrar no gateway —
-- sem policy de INSERT, o RLS bloqueia e a compra falha.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists scp_owner_read on public.service_credit_purchases;
drop policy if exists service_credit_purchases_owner_all on public.service_credit_purchases;
create policy service_credit_purchases_owner_all
on public.service_credit_purchases
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

select pg_notify('pgrst', 'reload schema');
