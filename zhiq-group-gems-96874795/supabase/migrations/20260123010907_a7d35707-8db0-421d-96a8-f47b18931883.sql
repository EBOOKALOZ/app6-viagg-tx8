-- Add passenger_count column to moto_taxi_corridas for car rides
ALTER TABLE public.moto_taxi_corridas
ADD COLUMN IF NOT EXISTS passenger_count integer DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN public.moto_taxi_corridas.passenger_count IS 'Number of passengers for car rides (1-4). Default is 1.';