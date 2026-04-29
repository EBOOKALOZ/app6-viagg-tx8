-- Create delivery_orders table for tracking deliveries with confirmation codes
CREATE TABLE public.delivery_orders (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    delivery_code varchar(6) NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    pickup_location text NOT NULL,
    destination text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text,
    estimated_value numeric(10,2) NOT NULL DEFAULT 0,
    order_description text,
    vehicle_type text NOT NULL CHECK (vehicle_type IN ('moto', 'carro')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    accepted_at timestamp with time zone,
    validated_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'in_progress', 'delivered', 'cancelled'))
);

-- Create index for faster lookups
CREATE INDEX idx_delivery_orders_user_id ON public.delivery_orders(user_id);
CREATE INDEX idx_delivery_orders_status ON public.delivery_orders(status);
CREATE INDEX idx_delivery_orders_code ON public.delivery_orders(delivery_code);

-- Enable RLS
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only manage their own delivery orders
CREATE POLICY "Users can view their own delivery orders"
ON public.delivery_orders
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own delivery orders"
ON public.delivery_orders
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can manage all delivery orders
CREATE POLICY "Admins can manage all delivery orders"
ON public.delivery_orders
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to generate a unique 6-digit delivery code
CREATE OR REPLACE FUNCTION public.generate_delivery_code()
RETURNS varchar(6)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_code varchar(6);
    code_exists boolean;
BEGIN
    LOOP
        -- Generate random 6-digit code
        new_code := LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
        
        -- Check if code already exists for active orders
        SELECT EXISTS (
            SELECT 1 FROM public.delivery_orders 
            WHERE delivery_code = new_code 
            AND status IN ('pending', 'accepted', 'in_progress')
        ) INTO code_exists;
        
        -- Exit loop if code is unique
        IF NOT code_exists THEN
            RETURN new_code;
        END IF;
    END LOOP;
END;
$$;

-- Function to check if user has an active delivery
CREATE OR REPLACE FUNCTION public.has_active_delivery(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.delivery_orders
        WHERE user_id = _user_id
        AND status IN ('accepted', 'in_progress')
    )
$$;

-- Function to get active delivery for user
CREATE OR REPLACE FUNCTION public.get_active_delivery(_user_id uuid)
RETURNS TABLE (
    id uuid,
    delivery_code varchar(6),
    status text,
    pickup_location text,
    destination text,
    customer_name text,
    customer_phone text,
    estimated_value numeric,
    order_description text,
    vehicle_type text,
    created_at timestamp with time zone,
    accepted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        id, delivery_code, status, pickup_location, destination,
        customer_name, customer_phone, estimated_value, order_description,
        vehicle_type, created_at, accepted_at
    FROM public.delivery_orders
    WHERE user_id = _user_id
    AND status IN ('accepted', 'in_progress')
    ORDER BY accepted_at DESC
    LIMIT 1
$$;

-- Function to validate delivery code
CREATE OR REPLACE FUNCTION public.validate_delivery_code(_order_id uuid, _code varchar(6))
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    order_record RECORD;
BEGIN
    -- Get the order
    SELECT * INTO order_record
    FROM public.delivery_orders
    WHERE id = _order_id
    AND user_id = auth.uid();
    
    -- Check if order exists and belongs to user
    IF order_record IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if code matches
    IF order_record.delivery_code != _code THEN
        RETURN false;
    END IF;
    
    -- Check if order is in valid state
    IF order_record.status NOT IN ('accepted', 'in_progress') THEN
        RETURN false;
    END IF;
    
    -- Update order status to delivered
    UPDATE public.delivery_orders
    SET status = 'delivered',
        validated_at = now(),
        completed_at = now()
    WHERE id = _order_id;
    
    RETURN true;
END;
$$;