-- ═══════════════════════════════════════════════════════════════
-- Adiciona colunas de rota de pickup em service_orders
-- (já existiam em delivery_orders, mas o código usa service_orders)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.service_orders
    ADD COLUMN IF NOT EXISTS pickup_distance_km      numeric,
    ADD COLUMN IF NOT EXISTS pickup_estimated_minutes integer,
    ADD COLUMN IF NOT EXISTS pickup_route_polyline    jsonb,
    ADD COLUMN IF NOT EXISTS pickup_calculated_at     timestamptz;
