-- ============================================================================
-- VIAGENS — Defesa em profundidade (BUG-13 da auditoria 2026-07-26)
-- As 4 tabelas financeiras/PII de viagens estavam com grants COMPLETOS para
-- anon (INSERT/UPDATE/DELETE/...), tendo a RLS como única barreira. A suíte
-- comportamental (tests/security/rls-permissions.test.mjs) exige 401/403 no
-- SELECT anônimo. Revoga tudo de anon; authenticated permanece via policies.
-- Idempotente.
-- ============================================================================

REVOKE ALL ON public.travel_credit_balances   FROM anon;
REVOKE ALL ON public.travel_credit_ledger     FROM anon;
REVOKE ALL ON public.travel_credit_purchases  FROM anon;
REVOKE ALL ON public.travel_listing_contacts  FROM anon;

-- TRUNCATE/REFERENCES/TRIGGER também não são necessários a authenticated
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.travel_credit_balances,
  public.travel_credit_ledger, public.travel_credit_purchases,
  public.travel_listing_contacts FROM authenticated;
