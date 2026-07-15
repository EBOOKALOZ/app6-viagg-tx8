-- ═══════════════════════════════════════════════════════════════
-- AUDITORIA GERAL ORION v2.0 — hardening (2026-07-14)
-- Achado da auditoria: ridv_decisions_log tinha GRANT UPDATE/DELETE
-- para authenticated (a RLS já bloqueava writes por não haver policy
-- de UPDATE/DELETE, mas por consistência com os demais logs imutáveis
-- do ecossistema aplicamos o REVOKE explícito).
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════
REVOKE UPDATE, DELETE ON public.ridv_decisions_log FROM authenticated, anon;
