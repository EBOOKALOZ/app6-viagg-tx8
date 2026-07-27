-- ============================================================================
-- FIX P0 — "permission denied for function is_admin" na inicialização do SHC
--
-- CAUSA-RAIZ (2 camadas, confirmadas no banco real em 2026-07-27):
--
--  1. PERMISSÃO — 20260718_fase1_revoke_anon_sensiveis.sql revogou EXECUTE de
--     public.is_admin() de PUBLIC, anon E authenticated (ACL ficou apenas
--     postgres + service_role). Policy RLS executa a função com o papel do
--     CHAMADOR — SECURITY DEFINER muda o contexto DENTRO da função, mas não
--     dispensa o chamador de ter EXECUTE. Quando o lockdown SHC
--     (20260727010000_shc_security_lockdown_oficial.sql) criou as policies
--     "TO authenticated USING (public.is_admin())" nas tabelas shc_*, toda
--     escrita autenticada passou a falhar com 42501. No banco, 391 tabelas
--     têm policies que dependem de is_admin().
--
--  2. DEFINIÇÃO — a versão viva de is_admin() era JWT-only
--     (app_metadata.role IN ('admin','ceo')), mas os admins reais têm
--     app_metadata.role = NULL. O admin da plataforma é definido por
--     user_roles.role='admin' e profiles.is_admin=true (mesma fonte de
--     is_platform_admin(), mp_is_admin() e do frontend). Sem esta camada,
--     o GRANT elimina o erro 42501 mas o admin continua bloqueado
--     silenciosamente pelas policies ("new row violates row-level security").
--
-- CONTRATO PÓS-MIGRATION:
--   • is_admin() = JWT app_metadata.role IN ('admin','ceo')
--                  OU user_roles.role IN ('admin','ceo')
--                  OU profiles.is_admin = true.
--   • SECURITY DEFINER com search_path fixo (a versão anterior não fixava).
--   • EXECUTE: authenticated + service_role. anon/PUBLIC continuam SEM
--     EXECUTE (mantém o contrato da fase 1 de menor privilégio).
-- Idempotente: pode ser reaplicada sem efeito colateral.
-- ============================================================================

-- 1) Definição canônica de admin --------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
           (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'ceo'),
           false
         )
      OR (
           auth.uid() IS NOT NULL
           AND (
             EXISTS (
               SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid()
                 AND ur.role::text IN ('admin', 'ceo')
             )
             OR EXISTS (
               SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid()
                 AND p.is_admin = true
             )
           )
         );
$$;

COMMENT ON FUNCTION public.is_admin() IS
'Gate canônico de admin (RLS + RPCs): JWT app_metadata.role admin/ceo OU user_roles admin/ceo OU profiles.is_admin. SECURITY DEFINER; EXECUTE apenas p/ authenticated e service_role (anon bloqueado).';

-- 2) Permissões — policy RLS roda a função como o papel do chamador ---------
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
