-- Enable realtime for delivery_orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_orders;

-- Enable realtime for motoboy_passenger_rides table
ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboy_passenger_rides;