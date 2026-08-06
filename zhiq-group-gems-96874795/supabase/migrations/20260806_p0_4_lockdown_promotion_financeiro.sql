-- ============================================================================
-- P0-4 — promotion_packages / promotion_purchases / promotion_package_logs:
--        remover ESCRITA/leitura anônima irrestrita em superfície FINANCEIRA
-- ============================================================================
-- Causa raiz:
--   Três policies PERMISSIVE com ALL USING(true) WITH CHECK(true) para {public}
--   (all_access_packages / all_access_promo_purchases / all_access_logs) +
--   grant anon INSERT/UPDATE/DELETE. Não há por baixo nenhum conjunto de
--   escrita legítimo — a escrita real vem de:
--     - promotion_purchases : SOMENTE service_role (edge functions
--       promotion-checkout e promotion-payment-webhook; o cliente apenas LÊ
--       as próprias compras).
--     - promotion_packages / _logs : painel admin (authenticated + is_admin).
--
-- Impacto comprovado no banco vivo (transacional, revertido):
--   - anon INSERIU compra forjada com status='paid' (fraude: promoção ativa
--     sem pagamento);
--   - anon marcou 22 compras reais como 'paid';
--   - anon alterou o preço de 27 pacotes para R$ 0,01;
--   - anon apagou 218 registros da trilha de auditoria.
--
-- Correção (fail-closed, menor privilégio):
--   1) DROP das três policies all_access_*.
--   2) promotion_packages: SELECT público apenas de pacotes ativos +
--      ALL admin via is_admin(). REVOKE escrita do anon (authenticated
--      mantém tabela-grant, mas a policy só permite escrita a admin).
--   3) promotion_purchases: mantém SELECT do dono (policy existente) +
--      SELECT admin. REVOKE escrita de anon E authenticated (só service_role).
--   4) promotion_package_logs: ALL admin via is_admin() + SELECT admin.
--      REVOKE escrita do anon (authenticated grava log apenas via painel admin,
--      coberto pela policy is_admin()).
--
-- Idempotente: DROP/CREATE POLICY guardado + REVOKE no-op + guards fail-closed.
-- ============================================================================

BEGIN;

-- 1) Remover policies irrestritas --------------------------------------------
DROP POLICY IF EXISTS "all_access_packages"       ON public.promotion_packages;
DROP POLICY IF EXISTS "all_access_promo_purchases" ON public.promotion_purchases;
DROP POLICY IF EXISTS "all_access_logs"           ON public.promotion_package_logs;

-- 2) promotion_packages -------------------------------------------------------
DROP POLICY IF EXISTS "promotion_packages_public_read_active" ON public.promotion_packages;
CREATE POLICY "promotion_packages_public_read_active"
  ON public.promotion_packages
  AS PERMISSIVE FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "promotion_packages_admin_all" ON public.promotion_packages;
CREATE POLICY "promotion_packages_admin_all"
  ON public.promotion_packages
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.promotion_packages FROM anon;

-- 3) promotion_purchases ------------------------------------------------------
-- Mantém a policy existente "anunciante vê suas compras" (SELECT do dono).
-- Acrescenta leitura para admin no painel financeiro.
DROP POLICY IF EXISTS "promotion_purchases_admin_read" ON public.promotion_purchases;
CREATE POLICY "promotion_purchases_admin_read"
  ON public.promotion_purchases
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Escrita é exclusiva de service_role (edge functions). Sem policy de escrita
-- para anon/authenticated + REVOKE de grant garante fail-closed.
REVOKE INSERT, UPDATE, DELETE ON public.promotion_purchases FROM anon, authenticated;

-- 4) promotion_package_logs ---------------------------------------------------
DROP POLICY IF EXISTS "promotion_package_logs_admin_all" ON public.promotion_package_logs;
CREATE POLICY "promotion_package_logs_admin_all"
  ON public.promotion_package_logs
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.promotion_package_logs FROM anon;

-- ---------------------------------------------------------------------------
-- Guards fail-closed
-- ---------------------------------------------------------------------------
-- A) Nenhuma policy ALL USING(true) acessível a anon/public nas 3 tabelas.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT tablename || '.' || policyname INTO v_offender
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('promotion_packages','promotion_purchases','promotion_package_logs')
    AND cmd = 'ALL' AND qual = 'true'
    AND ('anon' = ANY (roles) OR 'public' = ANY (roles))
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-4: ainda existe policy ALL USING(true) acessível a anon: %', v_offender;
  END IF;
END $$;

-- B) anon não retém escrita em nenhuma das 3 tabelas.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT table_name || ':' || privilege_type INTO v_offender
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('promotion_packages','promotion_purchases','promotion_package_logs')
    AND grantee = 'anon'
    AND privilege_type IN ('INSERT','UPDATE','DELETE')
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-4: anon ainda retém escrita: %', v_offender;
  END IF;
END $$;

-- C) authenticated não retém escrita em promotion_purchases (só service_role).
DO $$
DECLARE v_offender text;
BEGIN
  SELECT privilege_type INTO v_offender
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'promotion_purchases'
    AND grantee = 'authenticated'
    AND privilege_type IN ('INSERT','UPDATE','DELETE')
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-4: authenticated ainda escreve promotion_purchases: %', v_offender;
  END IF;
END $$;

COMMIT;
