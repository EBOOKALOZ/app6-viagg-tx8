-- ═══════════════════════════════════════════════════════════════
-- RIDV — fix: overflow em ridv_decisions_log.confidence
-- A coluna nasceu numeric(5,4) (máx 9.9999), mas a confiança da IA
-- é 0–100 → "numeric field overflow" no primeiro veredito real
-- (descoberto na homologação do ORION AI Gateway com IA viva).
-- numeric(5,2) comporta 0.00–100.00.
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.ridv_decisions_log
  ALTER COLUMN confidence TYPE numeric(5,2);
