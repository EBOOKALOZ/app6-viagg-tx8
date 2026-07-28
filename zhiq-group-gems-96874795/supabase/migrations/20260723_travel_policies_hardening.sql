-- ============================================================
-- VIAGENS — HARDENING DE RLS/POLICIES · 2026-07-23
-- ------------------------------------------------------------
-- Corrige os achados da auditoria de 2026-07-23:
--  1) travel_listings_public_read era USING(true): anon lia
--     rascunhos/pausados/arquivados via REST. Agora: público só
--     enxerga 'published'; dono e admin enxergam tudo.
--  2) travel_media_public_read era USING(true): mídia de rascunho
--     vazava. Agora acompanha a visibilidade do anúncio-pai.
--  3) travel_credit_purchases tinha policy FOR ALL: o cliente
--     podia marcar a própria compra como 'paid' (fraude de recibo
--     — a UI de checkout confia nesse campo). Agora: SELECT do
--     dono + INSERT apenas 'awaiting_payment'; transições de
--     status são exclusivas do webhook (service_role, bypassa RLS).
--  4) travel_negotiation_messages: policies referenciavam a
--     coluna contact_user_id que NÃO existia (coluna fantasma) e
--     a migration original nem tinha GRANT. A coluna passou a
--     existir (schema_sync) e é preenchida pelo register oficial.
--  5) Policies de ADMIN (public.is_admin(), RBAC 20260703_027)
--     para o painel /admin/viagens: carteiras, ledger, compras e
--     contatos — nada de funcionalidade só no painel do usuário.
--
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. travel_listings: público vê só 'published' ────────────
DROP POLICY IF EXISTS travel_listings_public_read ON public.travel_listings;
CREATE POLICY travel_listings_public_read ON public.travel_listings
  FOR SELECT TO anon, authenticated
  USING (
    visibility_status = 'published'
    OR owner_user_id = auth.uid()
    OR public.is_admin()
  );

-- ── 2. travel_media: acompanha a visibilidade do anúncio ─────
-- A policy definitiva de travel_media (público vê só mídia APROVADA de
-- anúncio publicado; dono/admin veem tudo) está em
-- 20260723_travel_media_visibility_hardening.sql, que é a fonte única
-- desta policy. NÃO recriamos travel_media_public_read aqui para não
-- sobrescrever aquela versão (mais restritiva, com check de
-- moderation_status) — ela roda por ordem de nome e deve prevalecer.

-- ── 3. travel_credit_purchases: fim do FOR ALL ───────────────
DROP POLICY IF EXISTS travel_credit_purchases_owner_all ON public.travel_credit_purchases;

DROP POLICY IF EXISTS travel_credit_purchases_owner_read ON public.travel_credit_purchases;
CREATE POLICY travel_credit_purchases_owner_read ON public.travel_credit_purchases
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS travel_credit_purchases_owner_insert ON public.travel_credit_purchases;
CREATE POLICY travel_credit_purchases_owner_insert ON public.travel_credit_purchases
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND payment_status IN ('awaiting_payment', 'pending')
  );
-- (sem policy de UPDATE/DELETE para authenticated: transição de
--  status é exclusiva do webhook Mercado Pago via service_role.)

-- ── 4. travel_negotiation_messages: RLS real + GRANTs ────────
-- Participantes = anunciante do lead OU o próprio lead logado.
-- Guard de idempotência/ordem: as policies abaixo referenciam
-- advertiser_contact_intentions.contact_user_id (criada em
-- 20260723_travel_schema_sync_oficial.sql). Como o Supabase aplica
-- migrations em ordem lexicográfica de nome e "policies" < "schema",
-- garantimos a coluna aqui para esta migration ser auto-suficiente
-- independentemente da ordem de aplicação.
ALTER TABLE public.advertiser_contact_intentions
  ADD COLUMN IF NOT EXISTS contact_user_id uuid;

DROP POLICY IF EXISTS tnm_select ON public.travel_negotiation_messages;
CREATE POLICY tnm_select ON public.travel_negotiation_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.advertiser_contact_intentions aci
      WHERE aci.id = intention_id
        AND (aci.advertiser_user_id = auth.uid() OR aci.contact_user_id = auth.uid())
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS tnm_insert ON public.travel_negotiation_messages;
CREATE POLICY tnm_insert ON public.travel_negotiation_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.advertiser_contact_intentions aci
      WHERE aci.id = intention_id
        AND (aci.advertiser_user_id = auth.uid() OR aci.contact_user_id = auth.uid())
    )
  );

REVOKE ALL ON public.travel_negotiation_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.travel_negotiation_messages TO authenticated;
GRANT ALL ON public.travel_negotiation_messages TO service_role;

-- ── 5. Policies de ADMIN (painel /admin/viagens) ─────────────
DROP POLICY IF EXISTS tcb_admin_read ON public.travel_credit_balances;
CREATE POLICY tcb_admin_read ON public.travel_credit_balances
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS tcl_admin_read ON public.travel_credit_ledger;
CREATE POLICY tcl_admin_read ON public.travel_credit_ledger
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS travel_contacts_admin_read ON public.travel_listing_contacts;
CREATE POLICY travel_contacts_admin_read ON public.travel_listing_contacts
  FOR SELECT TO authenticated USING (public.is_admin());

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Esperado: public_read_using_true=0 · purchases_for_all=0 ·
--           tnm_policies=2 · admin_policies=3
SELECT
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename IN ('travel_listings','travel_media')
      AND policyname LIKE '%public_read'
      AND qual = 'true') AS public_read_using_true,
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='travel_credit_purchases' AND cmd='ALL') AS purchases_for_all,
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='travel_negotiation_messages'
      AND policyname IN ('tnm_select','tnm_insert')) AS tnm_policies,
  (SELECT count(*)::int FROM pg_policies
    WHERE policyname IN ('tcb_admin_read','tcl_admin_read','travel_contacts_admin_read')) AS admin_policies;
