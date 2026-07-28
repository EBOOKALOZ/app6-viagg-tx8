-- ============================================================================
-- HOTFIX — restaura EXECUTE de anon em public.is_admin()
--
-- Achado na regressão pós-varredura global (2026-07-27): anon estava sem
-- EXECUTE em is_admin(), quebrando qualquer policy de leitura pública que
-- decide "é admin OU é publicado" (ex.: travel_listings vitrine pública) —
-- toda leitura anônima passava a estourar 42501 "permission denied for
-- function is_admin" em vez de aplicar a policy normalmente.
--
-- is_admin() é STABLE + SECURITY DEFINER, sem side-effects, e retorna FALSE
-- com segurança para auth.uid() NULL (visitante anônimo) — EXECUTE para
-- anon é seguro por desenho (é a MESMA função usada internamente pelas
-- policies; negar EXECUTE a anon não impede visitante de "virar admin",
-- só quebra a leitura pública que depende de chamá-la).
-- Idempotente.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
