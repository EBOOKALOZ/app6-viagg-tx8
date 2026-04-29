-- ================================================
-- Growth Engine: Tables, RPCs, and Admin View
-- Viagg-TX8 Local Marketplace Agentic Architecture
-- ================================================

-- 1. product_interest_events
-- Raw event log: every click, view, share, or purchase by neighborhood
CREATE TABLE IF NOT EXISTS public.product_interest_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL,
    neighborhood text NOT NULL,
    city text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('view', 'click', 'share', 'purchase', 'wishlist')),
    user_id uuid REFERENCES auth.users(id),
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pie_city_neighborhood ON public.product_interest_events(city, neighborhood);
CREATE INDEX IF NOT EXISTS idx_pie_product ON public.product_interest_events(product_id);
CREATE INDEX IF NOT EXISTS idx_pie_created ON public.product_interest_events(created_at DESC);

ALTER TABLE public.product_interest_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_interest_events_insert_all" ON public.product_interest_events FOR INSERT WITH CHECK (true);
CREATE POLICY "product_interest_events_select_admin" ON public.product_interest_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- 2. neighborhood_product_demand
-- Aggregated demand score per product x neighborhood
CREATE TABLE IF NOT EXISTS public.neighborhood_product_demand (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL,
    neighborhood text NOT NULL,
    city text NOT NULL,
    demand_score numeric DEFAULT 0,
    total_views integer DEFAULT 0,
    total_clicks integer DEFAULT 0,
    total_shares integer DEFAULT 0,
    total_purchases integer DEFAULT 0,
    velocity_24h numeric DEFAULT 0,
    is_viral boolean DEFAULT false,
    last_calculated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    UNIQUE(product_id, neighborhood, city)
);

CREATE INDEX IF NOT EXISTS idx_npd_city ON public.neighborhood_product_demand(city);
CREATE INDEX IF NOT EXISTS idx_npd_viral ON public.neighborhood_product_demand(is_viral) WHERE is_viral = true;
CREATE INDEX IF NOT EXISTS idx_npd_demand ON public.neighborhood_product_demand(demand_score DESC);

ALTER TABLE public.neighborhood_product_demand ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npd_select_authenticated" ON public.neighborhood_product_demand FOR SELECT USING (auth.role() = 'authenticated');

-- 3. city_growth_metrics
-- Per-city KPIs for growth tracking
CREATE TABLE IF NOT EXISTS public.city_growth_metrics (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    city text NOT NULL UNIQUE,
    state text,
    total_stores integer DEFAULT 0,
    total_groups integer DEFAULT 0,
    total_active_posters integer DEFAULT 0,
    total_products integer DEFAULT 0,
    total_demand_events integer DEFAULT 0,
    demand_score numeric DEFAULT 0,
    growth_stage text DEFAULT 'cold' CHECK (growth_stage IN ('cold', 'warming', 'growing', 'hot', 'dominant')),
    previous_stage text,
    stage_changed_at timestamptz,
    total_zones integer DEFAULT 0,
    dominant_zones integer DEFAULT 0,
    last_calculated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cgm_stage ON public.city_growth_metrics(growth_stage);
CREATE INDEX IF NOT EXISTS idx_cgm_demand ON public.city_growth_metrics(demand_score DESC);

ALTER TABLE public.city_growth_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cgm_select_authenticated" ON public.city_growth_metrics FOR SELECT USING (auth.role() = 'authenticated');

-- 4. city_zones
-- Operational zones within a city (clusters of neighborhoods)
CREATE TABLE IF NOT EXISTS public.city_zones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    city text NOT NULL,
    zone_name text NOT NULL,
    zone_code text,
    center_lat numeric,
    center_lng numeric,
    radius_km numeric DEFAULT 3.0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cz_city ON public.city_zones(city);
CREATE INDEX IF NOT EXISTS idx_cz_active ON public.city_zones(is_active) WHERE is_active = true;

ALTER TABLE public.city_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cz_select_authenticated" ON public.city_zones FOR SELECT USING (auth.role() = 'authenticated');

-- 5. zone_neighborhoods
-- Many-to-many linking neighborhoods to zones
CREATE TABLE IF NOT EXISTS public.zone_neighborhoods (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_id uuid NOT NULL REFERENCES public.city_zones(id) ON DELETE CASCADE,
    neighborhood text NOT NULL,
    city text NOT NULL,
    assigned_at timestamptz DEFAULT now(),
    UNIQUE(zone_id, neighborhood, city)
);

CREATE INDEX IF NOT EXISTS idx_zn_zone ON public.zone_neighborhoods(zone_id);
CREATE INDEX IF NOT EXISTS idx_zn_city ON public.zone_neighborhoods(city);

ALTER TABLE public.zone_neighborhoods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zn_select_authenticated" ON public.zone_neighborhoods FOR SELECT USING (auth.role() = 'authenticated');

-- 6. zone_dominance_metrics
-- Per-zone strength metrics
CREATE TABLE IF NOT EXISTS public.zone_dominance_metrics (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_id uuid NOT NULL REFERENCES public.city_zones(id) ON DELETE CASCADE UNIQUE,
    city text NOT NULL,
    group_count integer DEFAULT 0,
    poster_count integer DEFAULT 0,
    store_count integer DEFAULT 0,
    demand_score numeric DEFAULT 0,
    dominance_level text DEFAULT 'weak' CHECK (dominance_level IN ('weak', 'emerging', 'growing', 'strong', 'dominant')),
    previous_level text,
    level_changed_at timestamptz,
    neighbor_zone_ids uuid[] DEFAULT '{}',
    last_calculated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zdm_city ON public.zone_dominance_metrics(city);
CREATE INDEX IF NOT EXISTS idx_zdm_level ON public.zone_dominance_metrics(dominance_level);
CREATE INDEX IF NOT EXISTS idx_zdm_demand ON public.zone_dominance_metrics(demand_score DESC);

ALTER TABLE public.zone_dominance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zdm_select_authenticated" ON public.zone_dominance_metrics FOR SELECT USING (auth.role() = 'authenticated');


-- ================================================
-- RPCs
-- ================================================

-- RPC: Record a product interest event
CREATE OR REPLACE FUNCTION public.record_product_interest(
    p_product_id uuid,
    p_neighborhood text,
    p_city text,
    p_event_type text,
    p_user_id uuid DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'
) RETURNS void AS $$
BEGIN
    INSERT INTO public.product_interest_events (product_id, neighborhood, city, event_type, user_id, metadata)
    VALUES (p_product_id, p_neighborhood, p_city, p_event_type, p_user_id, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Refresh neighborhood demand aggregation
CREATE OR REPLACE FUNCTION public.refresh_neighborhood_demand(p_city text)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    INSERT INTO public.neighborhood_product_demand (product_id, neighborhood, city, demand_score, total_views, total_clicks, total_shares, total_purchases, velocity_24h, is_viral, last_calculated_at)
    SELECT
        e.product_id,
        e.neighborhood,
        e.city,
        -- Demand score formula: views*1 + clicks*3 + shares*5 + purchases*10
        COUNT(*) FILTER (WHERE e.event_type = 'view') * 1 +
        COUNT(*) FILTER (WHERE e.event_type = 'click') * 3 +
        COUNT(*) FILTER (WHERE e.event_type = 'share') * 5 +
        COUNT(*) FILTER (WHERE e.event_type = 'purchase') * 10 AS demand_score,
        COUNT(*) FILTER (WHERE e.event_type = 'view'),
        COUNT(*) FILTER (WHERE e.event_type = 'click'),
        COUNT(*) FILTER (WHERE e.event_type = 'share'),
        COUNT(*) FILTER (WHERE e.event_type = 'purchase'),
        -- Velocity: events in last 24h
        COUNT(*) FILTER (WHERE e.created_at > now() - interval '24 hours'),
        -- Viral: 24h velocity > 2x average
        COUNT(*) FILTER (WHERE e.created_at > now() - interval '24 hours') >
            GREATEST(COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (now() - MIN(e.created_at))) / 86400, 1) * 2, 5),
        now()
    FROM public.product_interest_events e
    WHERE e.city = p_city
    GROUP BY e.product_id, e.neighborhood, e.city
    ON CONFLICT (product_id, neighborhood, city) DO UPDATE SET
        demand_score = EXCLUDED.demand_score,
        total_views = EXCLUDED.total_views,
        total_clicks = EXCLUDED.total_clicks,
        total_shares = EXCLUDED.total_shares,
        total_purchases = EXCLUDED.total_purchases,
        velocity_24h = EXCLUDED.velocity_24h,
        is_viral = EXCLUDED.is_viral,
        last_calculated_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Refresh city growth metrics
CREATE OR REPLACE FUNCTION public.refresh_city_growth_metrics(p_city text)
RETURNS void AS $$
DECLARE
    v_old_stage text;
BEGIN
    SELECT growth_stage INTO v_old_stage FROM public.city_growth_metrics WHERE city = p_city;

    INSERT INTO public.city_growth_metrics (city, total_stores, total_groups, total_demand_events, demand_score, total_zones, dominant_zones, last_calculated_at)
    VALUES (
        p_city,
        (SELECT COUNT(*) FROM public.merchant_stores WHERE city = p_city),
        0, -- groups count placeholder
        (SELECT COUNT(*) FROM public.product_interest_events WHERE city = p_city),
        (SELECT COALESCE(SUM(demand_score), 0) FROM public.neighborhood_product_demand WHERE city = p_city),
        (SELECT COUNT(*) FROM public.city_zones WHERE city = p_city AND is_active = true),
        (SELECT COUNT(*) FROM public.zone_dominance_metrics WHERE city = p_city AND dominance_level = 'dominant'),
        now()
    )
    ON CONFLICT (city) DO UPDATE SET
        total_stores = EXCLUDED.total_stores,
        total_groups = EXCLUDED.total_groups,
        total_demand_events = EXCLUDED.total_demand_events,
        demand_score = EXCLUDED.demand_score,
        total_zones = EXCLUDED.total_zones,
        dominant_zones = EXCLUDED.dominant_zones,
        last_calculated_at = now(),
        updated_at = now();

    -- Auto-classify growth stage
    UPDATE public.city_growth_metrics SET
        previous_stage = growth_stage,
        growth_stage = CASE
            WHEN demand_score >= 10000 AND total_stores >= 50 THEN 'dominant'
            WHEN demand_score >= 5000 AND total_stores >= 25 THEN 'hot'
            WHEN demand_score >= 1000 AND total_stores >= 10 THEN 'growing'
            WHEN demand_score >= 100 AND total_stores >= 3 THEN 'warming'
            ELSE 'cold'
        END,
        stage_changed_at = CASE
            WHEN growth_stage != COALESCE(v_old_stage, 'cold') THEN now()
            ELSE stage_changed_at
        END
    WHERE city = p_city;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Refresh zone dominance
CREATE OR REPLACE FUNCTION public.refresh_zone_dominance(p_zone_id uuid)
RETURNS void AS $$
DECLARE
    v_city text;
    v_old_level text;
BEGIN
    SELECT city INTO v_city FROM public.city_zones WHERE id = p_zone_id;

    SELECT dominance_level INTO v_old_level FROM public.zone_dominance_metrics WHERE zone_id = p_zone_id;

    INSERT INTO public.zone_dominance_metrics (zone_id, city, demand_score, last_calculated_at)
    SELECT
        p_zone_id,
        v_city,
        COALESCE(SUM(npd.demand_score), 0),
        now()
    FROM public.zone_neighborhoods zn
    LEFT JOIN public.neighborhood_product_demand npd ON npd.neighborhood = zn.neighborhood AND npd.city = zn.city
    WHERE zn.zone_id = p_zone_id
    ON CONFLICT (zone_id) DO UPDATE SET
        demand_score = EXCLUDED.demand_score,
        last_calculated_at = now(),
        updated_at = now();

    -- Auto-classify dominance level
    UPDATE public.zone_dominance_metrics SET
        previous_level = dominance_level,
        dominance_level = CASE
            WHEN demand_score >= 5000 AND group_count >= 20 THEN 'dominant'
            WHEN demand_score >= 2000 AND group_count >= 10 THEN 'strong'
            WHEN demand_score >= 500 AND group_count >= 5 THEN 'growing'
            WHEN demand_score >= 100 THEN 'emerging'
            ELSE 'weak'
        END,
        level_changed_at = CASE
            WHEN dominance_level != COALESCE(v_old_level, 'weak') THEN now()
            ELSE level_changed_at
        END
    WHERE zone_id = p_zone_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ================================================
-- Admin Growth Overview View
-- ================================================
CREATE OR REPLACE VIEW public.admin_growth_overview AS
SELECT
    cgm.id,
    cgm.city,
    cgm.state,
    cgm.total_stores,
    cgm.total_groups,
    cgm.total_active_posters,
    cgm.total_products,
    cgm.total_demand_events,
    cgm.demand_score,
    cgm.growth_stage,
    cgm.previous_stage,
    cgm.stage_changed_at,
    cgm.total_zones,
    cgm.dominant_zones,
    cgm.last_calculated_at,
    -- Zone details as JSON array
    (
        SELECT COALESCE(json_agg(json_build_object(
            'zone_id', cz.id,
            'zone_name', cz.zone_name,
            'dominance_level', zdm.dominance_level,
            'demand_score', zdm.demand_score,
            'group_count', zdm.group_count,
            'poster_count', zdm.poster_count
        )), '[]'::json)
        FROM public.city_zones cz
        LEFT JOIN public.zone_dominance_metrics zdm ON zdm.zone_id = cz.id
        WHERE cz.city = cgm.city AND cz.is_active = true
    ) AS zones
FROM public.city_growth_metrics cgm
ORDER BY cgm.demand_score DESC;
