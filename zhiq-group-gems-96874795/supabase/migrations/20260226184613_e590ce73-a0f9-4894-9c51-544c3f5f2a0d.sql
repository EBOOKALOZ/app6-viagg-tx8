
ALTER TABLE public.delivery_orders
ADD COLUMN IF NOT EXISTS pickup_distance_km numeric,
ADD COLUMN IF NOT EXISTS pickup_estimated_minutes integer,
ADD COLUMN IF NOT EXISTS pickup_route_polyline jsonb,
ADD COLUMN IF NOT EXISTS pickup_calculated_at timestamptz;
