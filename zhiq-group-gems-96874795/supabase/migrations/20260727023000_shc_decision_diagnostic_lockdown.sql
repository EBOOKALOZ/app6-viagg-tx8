-- ============================================================================
-- SHC v2.0 — Fecha o lockdown nas 2 tabelas SHC que escaparam da varredura
-- inicial (shc_decision_history, shc_diagnostic_history — criadas pelas
-- migrations 20260726190000/200000 com INSERT/SELECT abertos a "public",
-- mesma classe de falha do BUG-02 original). Escrita agora só via
-- shc_run_module_audit (SECURITY DEFINER, já com o INSERT dentro da função).
-- Idempotente.
-- ============================================================================

ALTER TABLE public.shc_decision_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shc_diagnostic_history ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.shc_decision_history, public.shc_diagnostic_history FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.shc_decision_history, public.shc_diagnostic_history FROM authenticated;
REVOKE SELECT ON public.shc_diagnostic_history FROM anon;

DROP POLICY IF EXISTS shc_decision_history_insert ON public.shc_decision_history;
DROP POLICY IF EXISTS shc_decision_history_select ON public.shc_decision_history;
CREATE POLICY shc_decision_history_read ON public.shc_decision_history
  FOR SELECT USING (true);
CREATE POLICY shc_decision_history_admin_write ON public.shc_decision_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_diagnostic_history_insert_policy ON public.shc_diagnostic_history;
DROP POLICY IF EXISTS shc_diagnostic_history_select_policy ON public.shc_diagnostic_history;
CREATE POLICY shc_diagnostic_history_read ON public.shc_diagnostic_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY shc_diagnostic_history_admin_write ON public.shc_diagnostic_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
