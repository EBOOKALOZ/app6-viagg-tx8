-- ============================================================================
-- HOTFIX — restaura EXECUTE de anon nas demais funções-guarda de admin
-- (mesma classe do achado em is_admin(), migration 20260727024000)
--
-- Varredura: toda função SECURITY DEFINER referenciada dentro de USING/WITH
-- CHECK de alguma policy pública, sem EXECUTE para anon. Sem esse EXECUTE, a
-- policy inteira falha com 42501 ("permission denied for function X") em vez
-- de simplesmente negar a linha — quebra leitura legítima para QUALQUER role
-- que dependa da mesma policy composta (não só anon; authenticated também é
-- afetado quando a policy usa OR com uma condição pública).
--
-- Todas as 6 abaixo seguem o mesmo contrato seguro de is_admin(): STABLE/
-- IMMUTABLE-like, sem escrita, retornam FALSE com segurança para auth.uid()
-- NULL. EXECUTE não permite "virar admin" — só permite a policy AVALIAR a
-- condição e negar corretamente.
-- Idempotente.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.governance_user_role(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin()   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_admin()          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_financial_admin(uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin()       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mp_is_admin()              TO anon, authenticated;
-- dependência transitiva de is_financial_admin()
GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid)        TO anon, authenticated;
