-- ============================================================================
-- P0-5 — advertiser_accounts: remover exposição pública de PII
-- ============================================================================
-- Causa raiz:
--   Policy "Leitura publica de contas de anunciante" com SELECT USING(true)
--   para {anon,authenticated} expunha TODAS as colunas — incluindo PII
--   (full_name, email, whatsapp, settings_json) — a qualquer visitante.
--   Comprovado no banco vivo: anon leu 8 contas com email.
--
-- Restrição de negócio:
--   Fluxos PÚBLICOS (MercadoLocal join !inner, StorePublicPage, StoreLayout,
--   ProductLandingPage, AdvertiserSummaryCard) precisam apenas resolver o
--   vínculo conta→dono (id/user_id) — NENHUM lê PII. O join PostgREST
--   !inner(user_id) exige leitura por-linha na tabela base (não pode usar view),
--   portanto a solução é liberar as LINHAS ao público mas revogar as COLUNAS
--   sensíveis via column-level privileges, separando por papel:
--     - anon          : vê todas as linhas, SÓ colunas não-PII (join funciona).
--     - authenticated : vê SOMENTE a própria linha (ou admin), TODAS as colunas
--                       (o dono lê o próprio email/whatsapp no painel).
--
-- Correção (fail-closed, menor privilégio):
--   1) DROP da policy USING(true).
--   2) anon: policy SELECT pública (todas as linhas) — filtragem de PII é feita
--      por column privileges (REVOKE das colunas sensíveis do anon).
--   3) authenticated: policy SELECT restrita ao dono (auth.uid()=user_id) ou
--      admin (is_admin()); mantém acesso a todas as colunas.
--   4) Corrige policy de UPDATE do dono (usava auth.uid()=id, o PK da conta;
--      o correto é auth.uid()=user_id) + WITH CHECK; adiciona policy admin.
--   5) REVOKE INSERT/DELETE do anon; anon não escreve. REVOKE SELECT das
--      colunas PII (full_name,email,whatsapp,settings_json) do anon.
--   6) Guards fail-closed.
--
-- Idempotente: DROP/CREATE guardado + REVOKE/GRANT no-op + guards.
-- ============================================================================

BEGIN;

-- 1) Remover leitura pública irrestrita --------------------------------------
DROP POLICY IF EXISTS "Leitura publica de contas de anunciante" ON public.advertiser_accounts;

-- 2) anon: leitura pública por-linha (colunas restritas via grants abaixo) ----
DROP POLICY IF EXISTS "advertiser_accounts_anon_bridge_read" ON public.advertiser_accounts;
CREATE POLICY "advertiser_accounts_anon_bridge_read"
  ON public.advertiser_accounts
  AS PERMISSIVE FOR SELECT
  TO anon
  USING (true);

-- 3) authenticated: apenas a própria conta ou admin --------------------------
DROP POLICY IF EXISTS "Advertisers can read their own account" ON public.advertiser_accounts;
DROP POLICY IF EXISTS "advertiser_accounts_owner_or_admin_read" ON public.advertiser_accounts;
CREATE POLICY "advertiser_accounts_owner_or_admin_read"
  ON public.advertiser_accounts
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- 4) Corrigir UPDATE do dono (id -> user_id) + admin -------------------------
DROP POLICY IF EXISTS "Advertisers can update their own account" ON public.advertiser_accounts;
DROP POLICY IF EXISTS "advertiser_accounts_owner_update" ON public.advertiser_accounts;
CREATE POLICY "advertiser_accounts_owner_update"
  ON public.advertiser_accounts
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 5) Menor privilégio -------------------------------------------------------
--    anon não escreve.
REVOKE INSERT, UPDATE, DELETE ON public.advertiser_accounts FROM anon;

--    anon não lê colunas PII. Column privileges: revoga as sensíveis e
--    garante as não-sensíveis explicitamente (idempotente).
REVOKE SELECT ON public.advertiser_accounts FROM anon;
GRANT  SELECT (id, user_id, account_status, status, onboarding_completed,
               package_id, created_at, updated_at)
       ON public.advertiser_accounts TO anon;

-- ---------------------------------------------------------------------------
-- Guards fail-closed
-- ---------------------------------------------------------------------------
-- A) anon NÃO pode ter privilégio de SELECT em colunas PII.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT column_name INTO v_offender
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='advertiser_accounts'
    AND grantee='anon' AND privilege_type='SELECT'
    AND column_name IN ('email','whatsapp','full_name','settings_json')
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-5: anon ainda pode ler coluna PII: %', v_offender;
  END IF;
END $$;

-- B) anon NÃO pode escrever.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT privilege_type INTO v_offender
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='advertiser_accounts'
    AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-5: anon ainda escreve advertiser_accounts: %', v_offender;
  END IF;
END $$;

-- C) Não pode restar policy SELECT USING(true) para authenticated/public.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT policyname INTO v_offender
  FROM pg_policies
  WHERE schemaname='public' AND tablename='advertiser_accounts'
    AND cmd='SELECT' AND qual='true'
    AND ('authenticated' = ANY(roles) OR 'public' = ANY(roles))
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-5: leitura irrestrita para authenticated/public ainda existe: %', v_offender;
  END IF;
END $$;

COMMIT;
