-- Add map tracking coordinates for store and customer to delivery orders
ALTER TABLE delivery_orders
ADD COLUMN IF NOT EXISTS pickup_lat numeric,
ADD COLUMN IF NOT EXISTS pickup_lng numeric,
ADD COLUMN IF NOT EXISTS drop_lat numeric,
ADD COLUMN IF NOT EXISTS drop_lng numeric;
