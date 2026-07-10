-- ============================================================
-- SANDBOX NO PAINEL FINANCEIRO ADMIN (2026-07-11)
--
-- Pagamentos sandbox já fluem 100% pelo motor real (ordem → webhook/
-- simulador → ledger → carteira). O que faltava: (1) ETIQUETA de
-- ambiente na ordem, (2) leitura ADMIN das ordens p/ o painel.
--
--  1. Backfill: TODAS as ordens até hoje são sandbox (o gateway nunca
--     operou em produção) → metadata.environment='sandbox'.
--  2. Daqui em diante a edge payments-charge carimba
--     metadata.environment = ambiente ativo do gateway a cada ordem.
--  3. RPC admin_list_payment_orders: SECURITY DEFINER gated por
--     mp_is_admin() — painel lê sem abrir RLS da tabela.
--
-- Produção NÃO é afetada: nenhum valor/status muda, só metadata e
-- uma função de leitura. Idempotente.
-- ============================================================

-- 1. Backfill do ambiente nas ordens existentes (histórico = sandbox)
UPDATE public.pay_payment_orders
   SET metadata = COALESCE(metadata, '{}'::jsonb)
                  || jsonb_build_object('environment', 'sandbox')
 WHERE metadata->>'environment' IS NULL;

-- 2. Leitura admin das ordens (o painel financeiro consome daqui)
CREATE OR REPLACE FUNCTION public.admin_list_payment_orders(p_limit int DEFAULT 500)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  paid_at timestamptz,
  status text,
  amount numeric,
  provider_name text,
  payer_owner_type text,
  payer_owner_id uuid,
  product_type text,
  environment text,
  kind text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.created_at, o.paid_at, o.status::text, o.amount,
         o.provider_name, o.payer_owner_type::text, o.payer_owner_id,
         o.product_type,
         COALESCE(o.metadata->>'environment', 'sandbox') AS environment,
         COALESCE(o.metadata->>'kind', o.product_type, '—') AS kind
    FROM public.pay_payment_orders o
   WHERE public.mp_is_admin()
   ORDER BY o.created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 500), 1000)
$$;

REVOKE ALL ON FUNCTION public.admin_list_payment_orders(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_orders(int) TO authenticated, service_role;
