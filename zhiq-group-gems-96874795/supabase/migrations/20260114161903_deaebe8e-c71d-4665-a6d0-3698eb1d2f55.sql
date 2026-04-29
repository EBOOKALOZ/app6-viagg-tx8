-- Add merchant_id column to delivery_orders
ALTER TABLE public.delivery_orders 
ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES auth.users(id);

-- Add product_id column for reference
ALTER TABLE public.delivery_orders 
ADD COLUMN IF NOT EXISTS product_id uuid;

-- Create index for merchant lookups
CREATE INDEX IF NOT EXISTS idx_delivery_orders_merchant_id ON public.delivery_orders(merchant_id);

-- Create index for status lookups
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON public.delivery_orders(status);

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own delivery orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "Users can update their own delivery orders" ON public.delivery_orders;

-- Merchants can create delivery orders
CREATE POLICY "Merchants can insert their own delivery orders"
ON public.delivery_orders
FOR INSERT
WITH CHECK (auth.uid() = merchant_id);

-- Merchants can view their own orders
CREATE POLICY "Merchants can view their own delivery orders"
ON public.delivery_orders
FOR SELECT
USING (auth.uid() = merchant_id);

-- Motoboys/Drivers can view pending orders matching their service type
CREATE POLICY "Delivery providers can view available orders"
ON public.delivery_orders
FOR SELECT
USING (
  status = 'aguardando_entregador'
  OR (user_id = auth.uid() AND status IN ('em_andamento', 'accepted', 'in_progress'))
);

-- Delivery providers can accept orders (update user_id and status)
CREATE POLICY "Delivery providers can accept orders"
ON public.delivery_orders
FOR UPDATE
USING (
  status = 'aguardando_entregador' 
  OR user_id = auth.uid()
);