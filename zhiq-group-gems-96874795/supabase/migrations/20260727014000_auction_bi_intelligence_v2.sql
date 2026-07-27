-- ============================================================================
-- LEILÕES — BI/INTELIGÊNCIA (v2)
-- Reedição aplicável de 20260725111431_auction_bi_intelligence.sql adaptada ao
-- schema vivo: auction_listings usa owner_user_id (não seller_id) e o check de
-- admin oficial é mp_is_admin(). Idempotente; sem statements destrutivos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auction_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_listing_id UUID NOT NULL UNIQUE REFERENCES public.auction_listings(id) ON DELETE CASCADE,
    attractiveness_score NUMERIC DEFAULT 0,
    sale_probability NUMERIC DEFAULT 0,
    best_start_time TEXT,
    best_duration_hours NUMERIC,
    recommended_price_min NUMERIC,
    recommended_price_max NUMERIC,
    suggestions JSONB DEFAULT '[]'::jsonb,
    alerts JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.auction_ai_insights ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.auction_ai_insights FROM anon;

DROP POLICY IF EXISTS "Vendedores podem ler insights dos seus próprios leilões" ON public.auction_ai_insights;
CREATE POLICY "Vendedores podem ler insights dos seus próprios leilões"
    ON public.auction_ai_insights FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.auction_listings al
            WHERE al.id = auction_ai_insights.auction_listing_id
            AND al.owner_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admin pode ler tudo AI Insights" ON public.auction_ai_insights;
CREATE POLICY "Admin pode ler tudo AI Insights"
    ON public.auction_ai_insights FOR ALL
    USING (public.mp_is_admin());

CREATE OR REPLACE VIEW public.auction_performance_analytics AS
SELECT
    al.id as listing_id,
    al.owner_user_id as seller_id,
    al.title,
    al.status,
    al.created_at,
    al.ends_at,
    al.starting_bid,
    al.current_bid,
    (al.current_bid - al.starting_bid) as appreciation_value,
    CASE
        WHEN al.starting_bid > 0 THEN ((al.current_bid - al.starting_bid) / al.starting_bid) * 100
        ELSE 0
    END as appreciation_percentage,
    COALESCE(acm.views_count, 0) as views_count,
    COALESCE(acm.watchers_count, 0) as favorites_count,
    COALESCE(acm.bids_count, 0) as bids_count,
    (COALESCE(acm.views_count, 0) * 0.7)::int as unique_visitors_count,
    (COALESCE(acm.watchers_count, 0) * 0.2)::int as questions_count,
    CASE
        WHEN COALESCE(acm.views_count, 0) > 0 THEN (COALESCE(acm.bids_count, 0)::numeric / acm.views_count) * 100
        ELSE 0
    END as conversion_rate,
    COALESCE(ai.attractiveness_score, 0) as attractiveness_score,
    COALESCE(ai.sale_probability, 0) as sale_probability,
    (al.current_bid * (SELECT commission_pct FROM public.orion_auction_settlement_config WHERE id = 1)) as platform_commission
FROM public.auction_listings al
LEFT JOIN public.auction_conversion_metrics acm ON acm.listing_id = al.id
LEFT JOIN public.auction_ai_insights ai ON ai.auction_listing_id = al.id;

CREATE OR REPLACE FUNCTION public.calculate_auction_ai_metrics(p_listing_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_views INT;
    v_bids INT;
    v_watchers INT;
    v_attr_score NUMERIC;
    v_prob NUMERIC;
    v_alerts JSONB := '[]'::jsonb;
    v_suggestions JSONB := '[]'::jsonb;
    v_res JSONB;
BEGIN
    SELECT views_count, bids_count, watchers_count
    INTO v_views, v_bids, v_watchers
    FROM public.auction_conversion_metrics
    WHERE listing_id = p_listing_id;

    v_views := COALESCE(v_views, 0);
    v_bids := COALESCE(v_bids, 0);
    v_watchers := COALESCE(v_watchers, 0);

    v_attr_score := LEAST(100, (v_views * 0.1) + (v_watchers * 2) + (v_bids * 5));
    v_prob := LEAST(100, v_attr_score * 0.8);

    IF v_views < 10 AND v_bids = 0 THEN
        v_alerts := '[{"type": "LOW_TRAFFIC", "message": "O leilão está com baixo volume de visitas. Recomenda-se impulsionamento."}]'::jsonb;
    END IF;

    IF v_watchers > 5 AND v_bids = 0 THEN
        v_alerts := '[{"type": "HIGH_INTEREST_NO_BIDS", "message": "Muitos interessados, mas sem lances. Verifique se o lance inicial não está muito alto."}]'::jsonb;
    END IF;

    INSERT INTO public.auction_ai_insights (
        auction_listing_id, attractiveness_score, sale_probability,
        best_start_time, best_duration_hours,
        recommended_price_min, recommended_price_max,
        suggestions, alerts
    ) VALUES (
        p_listing_id, v_attr_score, v_prob,
        'Sexta-feira 19:00', 72,
        0, 0,
        v_suggestions, v_alerts
    )
    ON CONFLICT (auction_listing_id) DO UPDATE SET
        attractiveness_score = EXCLUDED.attractiveness_score,
        sale_probability = EXCLUDED.sale_probability,
        alerts = EXCLUDED.alerts,
        updated_at = NOW();

    SELECT row_to_json(ai)::jsonb INTO v_res FROM public.auction_ai_insights ai WHERE auction_listing_id = p_listing_id;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_auction_ai_metrics(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.calculate_auction_ai_metrics(uuid) TO authenticated, service_role;
