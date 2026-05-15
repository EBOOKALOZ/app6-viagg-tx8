-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 02 / Enhancements em pay_* existentes
-- - pay_idempotency_registry: adiciona response_payload jsonb
-- - pay_ledger_entries: triggers APPEND-ONLY
-- - RLS nas tabelas pay_* core + políticas de SELECT pro próprio dono
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pay_idempotency_registry
  ADD COLUMN IF NOT EXISTS response_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.pay_idempotency_registry.response_payload IS
  'Resposta cacheada para retornar em replay (mesma key → mesma resposta, sem reprocessar).';

CREATE OR REPLACE FUNCTION public.fn_pay_ledger_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF current_user = 'service_role' OR v_role = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION
    'pay_ledger_entries é APPEND-ONLY. % bloqueado. Use uma entry compensatória (ADJUSTMENT) em vez de editar.',
    TG_OP
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_pay_ledger_no_update ON public.pay_ledger_entries;
CREATE TRIGGER trg_pay_ledger_no_update
  BEFORE UPDATE ON public.pay_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_pay_ledger_block_mutation();

DROP TRIGGER IF EXISTS trg_pay_ledger_no_delete ON public.pay_ledger_entries;
CREATE TRIGGER trg_pay_ledger_no_delete
  BEFORE DELETE ON public.pay_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_pay_ledger_block_mutation();

COMMENT ON FUNCTION public.fn_pay_ledger_block_mutation() IS
  'Garante append-only no ledger. UPDATE/DELETE só por service_role.';

ALTER TABLE public.pay_financial_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_ledger_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_idempotency_registry   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pay_financial_accounts_self_read ON public.pay_financial_accounts;
CREATE POLICY pay_financial_accounts_self_read
  ON public.pay_financial_accounts
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

DROP POLICY IF EXISTS pay_ledger_entries_self_read ON public.pay_ledger_entries;
CREATE POLICY pay_ledger_entries_self_read
  ON public.pay_ledger_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pay_financial_accounts a
      WHERE a.id = pay_ledger_entries.account_id
        AND (a.owner_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
    )
  );

DROP POLICY IF EXISTS pay_idempotency_admin_read ON public.pay_idempotency_registry;
CREATE POLICY pay_idempotency_admin_read
  ON public.pay_idempotency_registry
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );
