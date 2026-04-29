-- Remover política antiga que não permite motoboy aceitar
DROP POLICY IF EXISTS "Delivery providers can accept orders" ON public.delivery_orders;

-- Nova política que permite motoboy aceitar entregas pending
CREATE POLICY "Motoboy can accept pending deliveries"
ON public.delivery_orders
FOR UPDATE
USING (
  (status = 'pending')
  OR
  (user_id = auth.uid())
  OR
  (current_motoboy_id = auth.uid())
)
WITH CHECK (
  (auth.uid() = user_id)
  OR
  (auth.uid() = current_motoboy_id)
);