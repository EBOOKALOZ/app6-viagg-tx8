-- ============================================================================
-- P0-3 — advertiser_listings / advertiser_listing_media:
--        remover ESCRITA anônima irrestrita (ALL USING(true) para {public})
-- ============================================================================
-- Causa raiz PRIMÁRIA:
--   Duas policies PERMISSIVE legadas com ALL USING (true) para {public}:
--     - advertiser_listings.......: "Anunciantes gerenciam seus produtos"
--     - advertiser_listing_media..: "Geral gerencia suas fotos"
--   Policies permissivas se combinam por OR, então essas duas anulam TODO o
--   conjunto correto por-dono/admin já existente. Somado ao grant de tabela
--   que dava a anon INSERT/UPDATE/DELETE, qualquer visitante anônimo podia
--   editar/apagar anúncios e mídias de qualquer anunciante (comprovado no
--   banco vivo: UPDATE como role anon afetou 1 linha real de cada tabela).
--
-- Causa raiz SECUNDÁRIA (revelada pelo replay):
--   As policies de admin usam EXISTS(SELECT 1 FROM public.profiles ...) direto,
--   sem SECURITY DEFINER. Enquanto a policy USING(true) existir, o planner faz
--   short-circuit e nunca avalia a de admin; ao remover a USING(true), o SELECT
--   público de anon passa a avaliar a policy admin e quebra com
--   "permission denied for table profiles" (anon não tem SELECT em profiles).
--   Correção: usar a função canônica public.is_admin() (SECURITY DEFINER,
--   search_path fixo), que retorna false para anon sem erro de permissão.
--
-- Correção (defesa em profundidade, fail-closed, menor privilégio):
--   1) DROP das duas policies USING(true).
--   2) Substituir as policies de admin baseadas em profiles direto por
--      is_admin(), preservando acesso total de admin sem quebrar leitura anon.
--   3) REVOKE de INSERT/UPDATE/DELETE do papel anon nas duas tabelas.
--   Policies preservadas intactas (owner e leitura pública condicional):
--      listings: _insert_own/_update_own/_delete_own/_select_own,
--                "Leitura publica de anuncios ativos" (SELECT status ativo).
--      media:    "Advertisers manage their own listing media",
--                "Leitura publica de midias de anuncios ativos",
--                "Public users can view approved media".
--
-- Idempotente: DROP/CREATE POLICY IF (NOT) EXISTS + REVOKE (no-op se já feito)
-- + guards fail-closed que abortam se restar superfície de escrita anônima.
-- ============================================================================

BEGIN;

-- 1) Remover policies USING(true) ---------------------------------------------
DROP POLICY IF EXISTS "Anunciantes gerenciam seus produtos" ON public.advertiser_listings;
DROP POLICY IF EXISTS "Geral gerencia suas fotos"           ON public.advertiser_listing_media;

-- 2) Recriar policies de admin usando is_admin() (SECURITY DEFINER) -----------
--    advertiser_listings: consolida numa única policy admin canônica.
--    DROP IF EXISTS da policy NOVA também, para garantir idempotência total
--    (PostgreSQL não tem CREATE POLICY IF NOT EXISTS).
DROP POLICY IF EXISTS "Permitir tudo para Admins"        ON public.advertiser_listings;
DROP POLICY IF EXISTS "advertiser_listings_admin_all"    ON public.advertiser_listings;
CREATE POLICY "advertiser_listings_admin_all"
  ON public.advertiser_listings
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

--    advertiser_listing_media: remove as duas policies admin duplicadas e
--    recria uma única canônica via is_admin().
DROP POLICY IF EXISTS "Admins gerenciam midia"                              ON public.advertiser_listing_media;
DROP POLICY IF EXISTS "Admins have full access to advertiser_listing_media" ON public.advertiser_listing_media;
DROP POLICY IF EXISTS "advertiser_listing_media_admin_all"                  ON public.advertiser_listing_media;
CREATE POLICY "advertiser_listing_media_admin_all"
  ON public.advertiser_listing_media
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) Menor privilégio: anon não escreve nestas tabelas ------------------------
REVOKE INSERT, UPDATE, DELETE ON public.advertiser_listings       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.advertiser_listing_media  FROM anon;

-- Guard fail-closed A: nenhuma policy de escrita irrestrita (ALL USING(true))
-- deve restar acessível a anon/public nestas tabelas.
DO $$
DECLARE
  v_offender text;
BEGIN
  SELECT tablename || '.' || policyname INTO v_offender
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('advertiser_listings', 'advertiser_listing_media')
    AND cmd = 'ALL'
    AND qual = 'true'
    AND ('anon' = ANY (roles) OR 'public' = ANY (roles))
  LIMIT 1;

  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-3: ainda existe policy de escrita irrestrita (ALL USING(true)) acessível a anon: %', v_offender;
  END IF;
END $$;

-- Guard fail-closed B: anon não pode reter privilégio de escrita nestas tabelas.
DO $$
DECLARE
  v_offender text;
BEGIN
  SELECT table_name || ':' || privilege_type INTO v_offender
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('advertiser_listings', 'advertiser_listing_media')
    AND grantee = 'anon'
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  LIMIT 1;

  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-3: anon ainda retém privilégio de escrita: %', v_offender;
  END IF;
END $$;

COMMIT;
