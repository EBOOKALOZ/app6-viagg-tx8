-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260415_FIX_SERVICE_ORDERS_RLS.sql
-- FIX: RLS policies para service_orders
-- Garante que lojista, motoboy e admin vejam seus pedidos
-- ═══════════════════════════════════════════════════════════════

-- 1. Habilitar RLS (se não estiver habilitado)
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas antigas que podem estar conflitando
DROP POLICY IF EXISTS "Merchants can view their own service orders" ON public.service_orders;
DROP POLICY IF EXISTS "Merchants can view delivery history of their orders" ON public.service_orders;
DROP POLICY IF EXISTS "Motoboys can view assigned service orders" ON public.service_orders;
DROP POLICY IF EXISTS "Admins can view all service orders" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_merchant_select" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_motoboy_select" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_admin_select" ON public.service_orders;

-- 3. Lojista pode ver suas próprias ordens
CREATE POLICY "service_orders_merchant_select"
ON public.service_orders
FOR SELECT
USING (auth.uid() = merchant_id);

-- 4. Motoboy pode ver ordens atribuídas a ele
CREATE POLICY "service_orders_motoboy_select"
ON public.service_orders
FOR SELECT
USING (auth.uid() = motoboy_id);

-- 5. Admin pode ver tudo (via profiles role)
CREATE POLICY "service_orders_admin_select"
ON public.service_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 6. Confirmar
DO $$ BEGIN
  RAISE LOG '✅ RLS policies para service_orders criadas com sucesso.';
END $$;
