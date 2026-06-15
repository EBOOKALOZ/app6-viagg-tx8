-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FIX de segurança: RLS faltando em pay_payment_orders
--
-- Contexto: a migration 20260514_pay_phase1_02_pay_enhancements habilitou RLS
-- em pay_financial_accounts, pay_ledger_entries e pay_idempotency_registry,
-- mas ESQUECEU pay_payment_orders. Resultado: qualquer pessoa com a chave
-- anon (pública, embarcada no frontend) conseguia ler TODAS as ordens de
-- pagamento de todos os clientes via PostgREST.
--
-- Correção: liga RLS e cria policy de SELECT apenas para o dono (created_by)
-- e para admins.
--
-- Escrita: continua exclusiva das RPCs SECURITY DEFINER
-- (pay_create_payment_order grava created_by = auth.uid(); o webhook/reconcile
-- usam service_role). Como NÃO criamos policy de INSERT/UPDATE/DELETE para
-- authenticated/anon, com RLS ligado essas operações ficam bloqueadas por
-- padrão — exatamente o desejado.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pay_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pay_payment_orders_self_read ON public.pay_payment_orders;
CREATE POLICY pay_payment_orders_self_read
  ON public.pay_payment_orders
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

COMMENT ON POLICY pay_payment_orders_self_read ON public.pay_payment_orders IS
  'Dono (created_by) lê as próprias ordens; admin lê todas. Escrita só via RPCs SECURITY DEFINER / service_role.';
