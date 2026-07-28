-- ==========================================
-- BLOCO ENTERPRISE - LEILÕES E ARREMATES
-- CENTRO DE TRANSPARÊNCIA E IA ANTIFRAUDE
-- ==========================================

-- 1. TABELA DE SELOS DAS LOJAS (Seller Transparency)
CREATE TABLE IF NOT EXISTS public.store_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
    badge_name TEXT NOT NULL,
    badge_description TEXT,
    icon_name TEXT,
    granted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, badge_name)
);

ALTER TABLE public.store_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Selos são visíveis para todos"
    ON public.store_badges
    FOR SELECT
    USING (true);

-- 2. TABELA DE ALERTAS DE FRAUDE (Motor IA de Segurança)
CREATE TABLE IF NOT EXISTS public.auction_fraud_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_listing_id UUID REFERENCES public.auction_listings(id) ON DELETE CASCADE,
    suspect_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    alert_type TEXT NOT NULL, -- 'SELF_BID', 'COLLUSION', 'FLOOD', 'BOT', etc.
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'BLOCKED')),
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.auction_fraud_alerts ENABLE ROW LEVEL SECURITY;

-- Somente administradores (roles específicas) ou service_role podem gerenciar alertas
-- Assumindo que temos uma checagem de admin, mas para simplificar, usaremos true temporariamente
-- ou limitamos se o usuário tiver perfil de admin.
CREATE POLICY "Apenas admin visualiza alertas de fraude"
    ON public.auction_fraud_alerts
    FOR SELECT
    USING (true); -- MUDAR EM PRODUÇÃO

CREATE POLICY "Apenas service_role ou auth pode inserir alertas"
    ON public.auction_fraud_alerts
    FOR INSERT
    WITH CHECK (true); -- MUDAR EM PRODUÇÃO

-- 3. EXPANDINDO `auction_events` para Auditoria Completa
-- As colunas de auditoria adicionais podem ser inseridas se não existirem
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auction_events' AND column_name = 'user_id') THEN
        ALTER TABLE public.auction_events ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auction_events' AND column_name = 'ip_address') THEN
        ALTER TABLE public.auction_events ADD COLUMN ip_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auction_events' AND column_name = 'origin') THEN
        ALTER TABLE public.auction_events ADD COLUMN origin TEXT;
    END IF;
END $$;

-- 4. RPC PARA REGISTRO DE FRAUDE (Chamada pelo Client ou IA)
CREATE OR REPLACE FUNCTION public.log_auction_fraud(
    p_auction_listing_id UUID,
    p_suspect_user_id UUID,
    p_alert_type TEXT,
    p_severity TEXT,
    p_details JSONB,
    p_ip_address TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_alert_id UUID;
BEGIN
    INSERT INTO public.auction_fraud_alerts (
        auction_listing_id, suspect_user_id, alert_type, severity, details, ip_address
    ) VALUES (
        p_auction_listing_id, p_suspect_user_id, p_alert_type, p_severity, p_details, p_ip_address
    ) RETURNING id INTO v_alert_id;

    -- Registrar também no auction_events como auditoria
    INSERT INTO public.auction_events (
        auction_listing_id, event_type, event_payload, user_id, ip_address, origin
    ) VALUES (
        p_auction_listing_id,
        'FRAUD_ALERT_GENERATED',
        jsonb_build_object(
            'alert_id', v_alert_id,
            'alert_type', p_alert_type,
            'severity', p_severity
        ) || p_details,
        p_suspect_user_id,
        p_ip_address,
        'SYSTEM_IA'
    );

    RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
