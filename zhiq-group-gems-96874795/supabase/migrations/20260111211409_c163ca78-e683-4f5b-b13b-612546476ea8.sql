-- Add accepts_passengers field to motoboy_profiles
ALTER TABLE public.motoboy_profiles 
ADD COLUMN IF NOT EXISTS accepts_passengers boolean DEFAULT false;

-- Create passenger rides table for motoboy rides
CREATE TABLE public.motoboy_passenger_rides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    motoboy_id uuid NOT NULL,
    passenger_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    pickup_location text NOT NULL,
    destination text NOT NULL,
    estimated_value numeric DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    accepted_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancelled_by text,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.motoboy_passenger_rides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for motoboy_passenger_rides
CREATE POLICY "Users can view their own rides as motoboy"
ON public.motoboy_passenger_rides
FOR SELECT
USING (auth.uid() = motoboy_id);

CREATE POLICY "Users can view their own rides as passenger"
ON public.motoboy_passenger_rides
FOR SELECT
USING (auth.uid() = passenger_id);

CREATE POLICY "Motoboys can update their rides"
ON public.motoboy_passenger_rides
FOR UPDATE
USING (auth.uid() = motoboy_id);

CREATE POLICY "Passengers can insert ride requests"
ON public.motoboy_passenger_rides
FOR INSERT
WITH CHECK (auth.uid() = passenger_id);

CREATE POLICY "Passengers can update their pending rides"
ON public.motoboy_passenger_rides
FOR UPDATE
USING (auth.uid() = passenger_id AND status = 'pending');

CREATE POLICY "Admins can manage all rides"
ON public.motoboy_passenger_rides
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to check if motoboy has any active activity (ride OR delivery)
CREATE OR REPLACE FUNCTION public.motoboy_has_active_activity(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Check for active delivery
    SELECT 1 FROM public.delivery_orders
    WHERE user_id = _user_id 
    AND status IN ('pending', 'accepted', 'in_progress')
  ) OR EXISTS (
    -- Check for active passenger ride
    SELECT 1 FROM public.motoboy_passenger_rides
    WHERE motoboy_id = _user_id
    AND status IN ('accepted', 'in_progress')
  )
$$;

-- Function to get active passenger ride for motoboy
CREATE OR REPLACE FUNCTION public.get_active_motoboy_ride(_user_id uuid)
RETURNS TABLE (
    id uuid,
    passenger_id uuid,
    status text,
    pickup_location text,
    destination text,
    estimated_value numeric,
    created_at timestamp with time zone,
    accepted_at timestamp with time zone,
    started_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    r.id,
    r.passenger_id,
    r.status,
    r.pickup_location,
    r.destination,
    r.estimated_value,
    r.created_at,
    r.accepted_at,
    r.started_at
  FROM public.motoboy_passenger_rides r
  WHERE r.motoboy_id = _user_id
  AND r.status IN ('accepted', 'in_progress')
  LIMIT 1
$$;

-- Function to check if motoboy accepts passengers
CREATE OR REPLACE FUNCTION public.motoboy_accepts_passengers(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT accepts_passengers 
     FROM public.motoboy_profiles 
     WHERE user_id = _user_id),
    false
  )
$$;