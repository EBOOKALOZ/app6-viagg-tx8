-- 1. Tabela de Inteligência Artificial para Leilões
CREATE TABLE IF NOT EXISTS public.auction_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_listing_id UUID NOT NULL UNIQUE REFERENCES public.auction_listings(id) ON DELETE CASCADE,
    attractiveness_score NUMERIC DEFAULT 0, -- de 0 a 100
    sale_probability NUMERIC DEFAULT 0, -- de 0 a 100
    best_start_time TEXT, -- ex: "Sexta-feira 19h"
    best_duration_hours NUMERIC, -- ex: 48, 72
    recommended_price_min NUMERIC,
    recommended_price_max NUMERIC,
    suggestions JSONB DEFAULT '[]'::jsonb, -- Dicas de descrição, imagem, etc
    alerts JSONB DEFAULT '[]'::jsonb, -- Avisos de baixo engajamento
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.auction_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendedores podem ler insights dos seus próprios leilões" 
    ON public.auction_ai_insights FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.auction_listings al 
            WHERE al.id = auction_ai_insights.auction_listing_id 
            AND al.seller_id = auth.uid()
        )
    );

CREATE POLICY "Admin pode ler tudo AI Insights" 
    ON public.auction_ai_insights FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.profile_type = 'admin'
        )
    );

-- 2. View de Performance Analítica Consolidada (auction_performance_analytics)
-- Adiciona a contagem de perguntas e visitantes 
CREATE OR REPLACE VIEW public.auction_performance_analytics AS
SELECT 
    al.id as listing_id,
    al.seller_id,
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
    -- Simulação de visitantes únicos e perguntas baseada na view count para preencher BI até tabelas existirem
    (COALESCE(acm.views_count, 0) * 0.7)::int as unique_visitors_count, 
    (COALESCE(acm.watchers_count, 0) * 0.2)::int as questions_count,
    CASE 
        WHEN COALESCE(acm.views_count, 0) > 0 THEN (COALESCE(acm.bids_count, 0)::numeric / acm.views_count) * 100
        ELSE 0
    END as conversion_rate,
    COALESCE(ai.attractiveness_score, 0) as attractiveness_score,
    COALESCE(ai.sale_probability, 0) as sale_probability,
    -- Comissão Simulada da plataforma (ex: 5%)
    (al.current_bid * 0.05) as platform_commission
FROM public.auction_listings al
LEFT JOIN public.auction_conversion_metrics acm ON acm.listing_id = al.id
LEFT JOIN public.auction_ai_insights ai ON ai.auction_listing_id = al.id;

-- 3. Função RPC para calcular Métricas de IA sob demanda
CREATE OR REPLACE FUNCTION public.calculate_auction_ai_metrics(p_listing_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    
    -- Heurística simples de atratividade
    v_attr_score := LEAST(100, (v_views * 0.1) + (v_watchers * 2) + (v_bids * 5));
    v_prob := LEAST(100, v_attr_score * 0.8);
    
    IF v_views < 10 AND v_bids = 0 THEN
        v_alerts := '[{"type": "LOW_TRAFFIC", "message": "O leilão está com baixo volume de visitas. Recomenda-se impulsionamento."}]'::jsonb;
    END IF;
    
    IF v_watchers > 5 AND v_bids = 0 THEN
        v_alerts := '[{"type": "HIGH_INTEREST_NO_BIDS", "message": "Muitos interessados, mas sem lances. Verifique se o lance inicial não está muito alto."}]'::jsonb;
    END IF;

    -- Inserir ou atualizar na tabela de insights
    INSERT INTO public.auction_ai_insights (
        auction_listing_id, attractiveness_score, sale_probability, 
        best_start_time, best_duration_hours, 
        recommended_price_min, recommended_price_max, 
        suggestions, alerts
    ) VALUES (
        p_listing_id, v_attr_score, v_prob,
        'Sexta-feira 19:00', 72,
        0, 0, -- Price seria calculado por IA externa, mock 0
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
