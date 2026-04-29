-- Remover política atual que tem problema no WITH CHECK
DROP POLICY IF EXISTS "Motoboy can accept pending deliveries" ON public.delivery_orders;

-- Nova política corrigida: permite motoboy aceitar entregas pending
-- e também permite motoboy/merchant atualizar suas próprias entregas
CREATE POLICY "Motoboy can accept pending deliveries"
ON public.delivery_orders
FOR UPDATE
USING (
  -- Motoboy pode atualizar se:
  -- 1. A entrega está pending (para aceitar)
  -- 2. Ele já é o motoboy atual (para atualizar progresso)
  -- 3. Ele é o dono original (merchant)
  (status = 'pending')
  OR (current_motoboy_id = auth.uid())
  OR (user_id = auth.uid())
)
WITH CHECK (
  -- Após o UPDATE, o motoboy deve ser o current_motoboy_id
  -- OU o user_id original permanece (para merchants)
  (current_motoboy_id = auth.uid())
  OR (user_id = auth.uid())
  OR (merchant_id = auth.uid())
);