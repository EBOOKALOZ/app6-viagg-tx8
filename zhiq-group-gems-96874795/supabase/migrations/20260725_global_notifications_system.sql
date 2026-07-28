-- ==========================================
-- BLOCO ENTERPRISE - CENTRAL INTELIGENTE DE NOTIFICAÇÕES
-- ==========================================

-- 1. PREFERÊNCIAS DE NOTIFICAÇÃO
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    whatsapp_enabled BOOLEAN DEFAULT false,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia suas próprias preferências"
    ON public.user_notification_preferences
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 2. FILA DE ENTREGAS EXTERNAS (Preparo para E-mail, Push e WhatsApp)
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID NOT NULL, -- references user_notifications but might be dropped if we purge notifications
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'PUSH', 'WHATSAPP')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'READ')),
    provider_response JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    sent_at TIMESTAMPTZ
);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Apenas admin ou service_role visualiza fila de entrega"
    ON public.notification_deliveries
    FOR SELECT
    USING (true); -- Ajustar RLS para admin em produção

-- 3. MOTOR INTELIGENTE DE NOTIFICAÇÃO (Deduplicação e IA Básica)
-- Esta RPC funciona como o orquestrador. Se houver uma notificação semelhante NÃO LIDA, ele agrupa.
CREATE OR REPLACE FUNCTION public.create_smart_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT,
    p_source_module TEXT,
    p_reference_type TEXT,
    p_reference_id TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_severity TEXT;
    v_existing_id UUID;
    v_new_id UUID;
    v_pref RECORD;
BEGIN
    -- 3.1 Priorização Baseada em IA (Lógica Heurística Simples)
    -- Exemplo: Notificações de pagamento e denúncia são CRÍTICAS.
    IF p_type IN ('PAYMENT_CONFIRMED', 'FRAUD_ALERT') THEN
        v_severity := 'CRITICAL';
    ELSIF p_type IN ('AUCTION_OUTBID', 'AUCTION_WON', 'ACCOUNT_ALERT') THEN
        v_severity := 'HIGH';
    ELSIF p_type IN ('NEW_BID', 'NEW_QUESTION', 'NEW_ANSWER') THEN
        v_severity := 'MEDIUM';
    ELSE
        v_severity := 'LOW';
    END IF;

    -- 3.2 Deduplicação (Anti-Flood)
    -- Verifica se já existe uma notificação não lida deste exato tipo e referência para o usuário.
    SELECT id INTO v_existing_id 
    FROM public.user_notifications
    WHERE user_id = p_user_id 
      AND type = p_type 
      AND reference_type = p_reference_type 
      AND reference_id = p_reference_id 
      AND is_read = false
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Agrupa os eventos incrementando o contador no metadata
        UPDATE public.user_notifications
        SET 
            message = p_message, -- Atualiza para a última mensagem
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('grouped_count', COALESCE((metadata->>'grouped_count')::int, 1) + 1) || p_metadata,
            updated_at = timezone('utc'::text, now()),
            severity = v_severity
        WHERE id = v_existing_id;
        
        v_new_id := v_existing_id;
    ELSE
        -- Cria nova notificação
        INSERT INTO public.user_notifications (
            user_id, title, message, type, severity, source_module, reference_type, reference_id, metadata, is_read
        ) VALUES (
            p_user_id, p_title, p_message, p_type, v_severity, p_source_module, p_reference_type, p_reference_id, p_metadata, false
        ) RETURNING id INTO v_new_id;
    END IF;

    -- 3.3 Integração de Entrega Externa (Assíncrona)
    -- Verifica preferências do usuário
    SELECT * INTO v_pref FROM public.user_notification_preferences WHERE user_id = p_user_id;
    
    IF FOUND THEN
        IF v_pref.email_enabled AND v_severity IN ('HIGH', 'CRITICAL') THEN
            INSERT INTO public.notification_deliveries (notification_id, user_id, channel) VALUES (v_new_id, p_user_id, 'EMAIL');
        END IF;
        IF v_pref.push_enabled THEN
            INSERT INTO public.notification_deliveries (notification_id, user_id, channel) VALUES (v_new_id, p_user_id, 'PUSH');
        END IF;
        IF v_pref.whatsapp_enabled AND v_severity = 'CRITICAL' THEN
            INSERT INTO public.notification_deliveries (notification_id, user_id, channel) VALUES (v_new_id, p_user_id, 'WHATSAPP');
        END IF;
    ELSE
        -- Default (se não tiver preference, manda PUSH)
        INSERT INTO public.notification_deliveries (notification_id, user_id, channel) VALUES (v_new_id, p_user_id, 'PUSH');
    END IF;

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. GATILHOS DE NOTIFICAÇÃO PARA LEILÕES

-- 4.1 Gatilho ao dar lance
CREATE OR REPLACE FUNCTION notify_auction_bid() RETURNS TRIGGER AS $$
DECLARE
    v_listing RECORD;
    v_previous_highest_bidder UUID;
BEGIN
    -- Pega dados do leilão
    SELECT * INTO v_listing FROM public.auction_listings WHERE id = NEW.auction_listing_id;
    
    -- Notifica o Dono do Anúncio
    IF v_listing.owner_user_id != NEW.bidder_id THEN
        PERFORM public.create_smart_notification(
            v_listing.owner_user_id,
            'Novo Lance!',
            'Seu leilão "' || v_listing.title || '" recebeu um lance.',
            'NEW_BID',
            'AUCTIONS',
            'AUCTION_LISTING',
            v_listing.id::text,
            jsonb_build_object('amount_cents', NEW.amount_cents)
        );
    END IF;

    -- Tentar encontrar o último lance mais alto para notificar que foi superado
    SELECT bidder_id INTO v_previous_highest_bidder 
    FROM public.auction_bids 
    WHERE auction_listing_id = NEW.auction_listing_id 
      AND id != NEW.id 
      AND amount_cents < NEW.amount_cents
    ORDER BY amount_cents DESC 
    LIMIT 1;

    IF v_previous_highest_bidder IS NOT NULL AND v_previous_highest_bidder != NEW.bidder_id THEN
        PERFORM public.create_smart_notification(
            v_previous_highest_bidder,
            'Você foi superado!',
            'Alguém deu um lance maior que o seu no leilão "' || v_listing.title || '".',
            'AUCTION_OUTBID',
            'AUCTIONS',
            'AUCTION_LISTING',
            v_listing.id::text,
            jsonb_build_object('new_amount_cents', NEW.amount_cents)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auction_bid_notify ON public.auction_bids;
CREATE TRIGGER trigger_auction_bid_notify
    AFTER INSERT ON public.auction_bids
    FOR EACH ROW
    EXECUTE FUNCTION notify_auction_bid();
