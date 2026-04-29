-- Add service_type column to motoboy_passenger_rides
ALTER TABLE public.motoboy_passenger_rides
ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'motoboy';

-- Add service_type column to delivery_orders
ALTER TABLE public.delivery_orders
ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'motoboy';

-- Add comment for documentation
COMMENT ON COLUMN public.motoboy_passenger_rides.service_type IS 'Type of service: motorista, motoboy, mototaxi';
COMMENT ON COLUMN public.delivery_orders.service_type IS 'Type of service: motorista, motoboy, mototaxi';