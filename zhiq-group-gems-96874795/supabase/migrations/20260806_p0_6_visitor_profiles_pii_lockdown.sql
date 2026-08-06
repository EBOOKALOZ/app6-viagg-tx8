-- ============================================================================
-- P0-6 — visitor_profiles: remover leitura/escrita pública irrestrita de PII
-- ============================================================================
-- Causa raiz:
--   Policies vp_select_all (SELECT USING(true)), vp_update_all (UPDATE
--   USING(true)) e vp_insert_all (INSERT WITH CHECK(true)) para {public},
--   somadas ao grant anon INSERT/SELECT/UPDATE/DELETE. A tabela guarda PII
--   (full_name, whatsapp, email, bairro, city). Consequência: qualquer
--   visitante anônimo podia LER e ALTERAR o perfil de qualquer outro.
--   (Tabela atualmente com 0 linhas — vulnerabilidade latente: dispara no
--    momento em que qualquer visitante preenche o perfil.)
--
-- Fluxos legítimos (verificados no código):
--   - useVisitorProfile (visitante anon): INSERT do próprio perfil e UPDATE
--     pelo id guardado no localStorage. O hook trata falha de DB como
--     não-crítica (persiste em localStorage), então degradar UPDATE anon é
--     seguro para a UX.
--   - CreateDelivery / AdvertiserNewDelivery (lojista autenticado): leem
--     full_name/whatsapp de visitor_profiles como FALLBACK opcional a partir
--     de purchase_intentions.visitor_id — mas a PII do cliente já está na
--     própria purchase_intentions (customer_name/whatsapp/...). A leitura é
--     redundante e só deve ocorrer para o lojista dono do pedido.
--
-- Correção (fail-closed, menor privilégio):
--   1) DROP das três policies USING(true)/CHECK(true).
--   2) INSERT: anon+authenticated podem criar, mas WITH CHECK impede vincular
--      o perfil a user_id de terceiro (user_id IS NULL OR = auth.uid()).
--   3) UPDATE: apenas o dono autenticado (user_id = auth.uid()) ou admin.
--   4) SELECT: dono autenticado OU admin OU lojista dono de uma
--      purchase_intention que aponta para este visitor (fallback preservado,
--      sem expor a base inteira). anon NÃO lê.
--   5) REVOKE UPDATE/DELETE do anon (mantém INSERT/SELECT-grant; a policy de
--      SELECT nega toda linha para anon, pois auth.uid() é NULL).
--   6) Guards fail-closed.
--
-- Idempotente: DROP/CREATE guardado + REVOKE no-op + guards.
-- ============================================================================

BEGIN;

-- 1) Remover policies irrestritas --------------------------------------------
DROP POLICY IF EXISTS "vp_select_all" ON public.visitor_profiles;
DROP POLICY IF EXISTS "vp_update_all" ON public.visitor_profiles;
DROP POLICY IF EXISTS "vp_insert_all" ON public.visitor_profiles;

-- 2) INSERT: cria próprio perfil, sem forjar dono ----------------------------
DROP POLICY IF EXISTS "visitor_profiles_insert_self" ON public.visitor_profiles;
CREATE POLICY "visitor_profiles_insert_self"
  ON public.visitor_profiles
  AS PERMISSIVE FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 3) UPDATE: dono autenticado ou admin ---------------------------------------
DROP POLICY IF EXISTS "visitor_profiles_update_owner" ON public.visitor_profiles;
CREATE POLICY "visitor_profiles_update_owner"
  ON public.visitor_profiles
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- 4) SELECT: dono/admin/lojista-do-pedido ------------------------------------
DROP POLICY IF EXISTS "visitor_profiles_select_scoped" ON public.visitor_profiles;
CREATE POLICY "visitor_profiles_select_scoped"
  ON public.visitor_profiles
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.purchase_intentions pi
      JOIN public.merchant_stores ms ON ms.id = pi.store_id
      WHERE pi.visitor_id = visitor_profiles.id
        AND ms.user_id = auth.uid()
    )
  );

-- 5) Menor privilégio: anon não altera nem apaga -----------------------------
REVOKE UPDATE, DELETE ON public.visitor_profiles FROM anon;

-- ---------------------------------------------------------------------------
-- Guards fail-closed
-- ---------------------------------------------------------------------------
-- A) Nenhuma policy de SELECT/UPDATE com USING(true) acessível a anon/public.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT policyname INTO v_offender
  FROM pg_policies
  WHERE schemaname='public' AND tablename='visitor_profiles'
    AND cmd IN ('SELECT','UPDATE') AND qual='true'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-6: ainda existe policy USING(true) leitura/escrita para anon/public: %', v_offender;
  END IF;
END $$;

-- B) anon não retém UPDATE/DELETE.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT privilege_type INTO v_offender
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='visitor_profiles'
    AND grantee='anon' AND privilege_type IN ('UPDATE','DELETE')
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-6: anon ainda tem %', v_offender;
  END IF;
END $$;

COMMIT;
