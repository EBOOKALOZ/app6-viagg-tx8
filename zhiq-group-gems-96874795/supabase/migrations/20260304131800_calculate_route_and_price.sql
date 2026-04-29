-- Migration: calculate_route_and_price_v2
-- Description: Creates a function to calculate straight-line distance, ETA, and price based on service level.

CREATE OR REPLACE FUNCTION public.calculate_route_and_price_v2(
    p_pickup_lat double precision,
    p_pickup_lng double precision,
    p_drop_lat double precision,
    p_drop_lng double precision,
    p_service_level text DEFAULT 'standard'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_distance_meters double precision;
    v_distance_km double precision;
    v_eta_minutes integer;
    v_base_fee numeric;
    v_km_fee numeric := 1.60;
    v_priority_fee numeric := 0.00;
    v_total_price numeric;
    v_route_polyline text := null;
BEGIN
    -- 1. Calculate realistic distance using PostGIS straight-line distance (multiplying by a factor of 1.3 for street routing approximation)
    -- ST_DistanceSphere returns distance in meters.
    -- We assume SRID 4326 for coordinates.
    v_distance_meters := ST_DistanceSphere(
        ST_MakePoint(p_pickup_lng, p_pickup_lat),
        ST_MakePoint(p_drop_lng, p_drop_lat)
    ) * 1.3;

    v_distance_km := v_distance_meters / 1000.0;

    -- 2. Calculate ETA (assuming average urban speed of 30 km/h -> 2 min per km)
    -- Minimum 5 minutes
    v_eta_minutes := GREATEST(5, ROUND((v_distance_km * 2))::integer);

    -- 3. Calculate Pricing based on Service Level
    IF p_service_level = 'express' THEN
        v_base_fee := 12.00;
        v_priority_fee := 3.00; -- Extra priority fee explicitly tracked if needed, but included in base_fee here as requested (9 -> 12)
    ELSE
        -- Default: standard
        v_base_fee := 9.00;
        v_priority_fee := 0.00;
    END IF;

    -- Formula: Base + (Km * KmFee)
    v_total_price := v_base_fee + (v_distance_km * v_km_fee);

    -- 4. Return the result as a JSON object
    RETURN json_build_object(
        'distance_km', ROUND(v_distance_km::numeric, 2),
        'eta_minutes', v_eta_minutes,
        'base_fee', v_base_fee,
        'km_fee', v_km_fee,
        'priority_fee', v_priority_fee,
        'total_price', ROUND(v_total_price, 2),
        'route_polyline', v_route_polyline,
        'service_level', p_service_level
    );
END;
$$;
