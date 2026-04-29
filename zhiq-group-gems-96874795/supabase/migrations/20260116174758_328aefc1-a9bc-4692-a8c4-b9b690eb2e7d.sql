-- Remover políticas antigas de SELECT na delivery_orders (se existirem)
DROP POLICY IF EXISTS "Motoboys can view pending deliveries" ON public.delivery_orders;
DROP POLICY IF EXISTS "Motoboys can view their assigned deliveries" ON public.delivery_orders;
DROP POLICY IF EXISTS "Users can view their own deliveries" ON public.delivery_orders;
DROP POLICY IF EXISTS "Anyone can view pending deliveries" ON public.delivery_orders;
DROP POLICY IF EXISTS "Select for motoboys" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_select_policy" ON public.delivery_orders;

-- Criar política de SELECT que permite:
-- 1. Usuários verem suas próprias entregas
-- 2. Motoboys verem entregas atribuídas a eles
-- 3. Entregas pendentes visíveis para todos autenticados (broadcast realtime)
CREATE POLICY "delivery_orders_select_policy"
ON public.delivery_orders
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR current_motoboy_id = auth.uid()
  OR status = 'pending'
);