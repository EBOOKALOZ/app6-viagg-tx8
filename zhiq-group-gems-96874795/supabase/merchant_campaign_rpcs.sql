-- ═══════════════════════════════════════════════════════════════
-- RPCs para Integração Lojista → Postador
-- Viagg-TX8 — Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- 1. RPC: create_merchant_campaign_queue_item
-- Lojista cria item direto na fila de campanhas.
-- Status 'ready' dispara o trigger auto_dispatch automaticamente.
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_merchant_campaign_queue_item(
    p_merchant_store_id     uuid,
    p_created_by_user_id    uuid,
    p_title                 text,
    p_message_text          text        DEFAULT NULL,
    p_media_url             text        DEFAULT NULL,
    p_campaign_type         text        DEFAULT 'offer',
    p_target_city           text        DEFAULT NULL,
    p_target_region         text        DEFAULT NULL,
    p_priority              int         DEFAULT 2,
    p_product_id            uuid        DEFAULT NULL,
    p_source_type           text        DEFAULT 'merchant_direct',
    p_source_id             text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id uuid;
    v_store  record;
BEGIN
    -- Validações
    IF p_title IS NULL OR trim(p_title) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Título é obrigatório');
    END IF;

    IF p_created_by_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Usuário não identificado');
    END IF;

    -- Validar ownership da loja (usa merchant_stores, NÃO stores)
    IF p_merchant_store_id IS NOT NULL THEN
        SELECT id, store_name, city INTO v_store
        FROM public.merchant_stores
        WHERE id = p_merchant_store_id AND owner_id = p_created_by_user_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Loja não encontrada ou não pertence ao usuário');
        END IF;

        -- Se target_city não informado, usar cidade da loja
        IF (p_target_city IS NULL OR trim(p_target_city) = '') AND v_store.city IS NOT NULL THEN
            p_target_city := v_store.city;
        END IF;
    END IF;

    -- Inserir na campaign_queue com status 'ready'
    -- O trigger trg_auto_dispatch_campaign dispara automaticamente
    INSERT INTO public.campaign_queue (
        title,
        message_text,
        media_url,
        campaign_type,
        target_city,
        target_region,
        priority,
        status,
        source_type,
        source_id,
        created_by_user_id,
        created_at,
        updated_at
    ) VALUES (
        trim(p_title),
        NULLIF(trim(COALESCE(p_message_text, '')), ''),
        NULLIF(trim(COALESCE(p_media_url, '')), ''),
        COALESCE(p_campaign_type, 'offer'),
        NULLIF(trim(COALESCE(p_target_city, '')), ''),
        NULLIF(trim(COALESCE(p_target_region, '')), ''),
        COALESCE(p_priority, 2),
        'ready',  -- <-- Trigger auto-dispatch fires on this status
        COALESCE(p_source_type, 'merchant_direct'),
        p_source_id,
        p_created_by_user_id,
        now(),
        now()
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'campaign_queue_id', v_new_id,
        'title', trim(p_title),
        'target_city', p_target_city,
        'status', 'ready',
        'message', 'Campanha criada e distribuição automática acionada'
    );
END;
$$;


-- ═══════════════════════════════════════
-- 2. RPC: assign_campaign_to_motoboy
-- Atribuição explícita de campanha a um motoboy específico.
-- Respeita constraint de unicidade existente.
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_campaign_to_motoboy(
    p_campaign_queue_id     uuid,
    p_motoboy_user_id       uuid,
    p_city                  text    DEFAULT NULL,
    p_region                text    DEFAULT NULL,
    p_priority              int     DEFAULT 2,
    p_notes                 text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campaign record;
    v_new_id   uuid;
BEGIN
    -- Validar campanha existe
    SELECT id, title, status, target_city, target_region, priority
    INTO v_campaign
    FROM public.campaign_queue
    WHERE id = p_campaign_queue_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Campanha não encontrada');
    END IF;

    -- Validar motoboy existe e está ativo
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_motoboy_user_id AND is_active = true
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Motoboy não encontrado ou inativo');
    END IF;

    -- Verificar duplicidade antes de inserir
    IF EXISTS (
        SELECT 1 FROM public.campaign_dispatches
        WHERE campaign_queue_id = p_campaign_queue_id
          AND assigned_to_user_id = p_motoboy_user_id
          AND assigned_profile_type = 'motoboy'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Esta campanha já foi atribuída a este motoboy',
            'duplicate', true
        );
    END IF;

    -- Inserir dispatch
    INSERT INTO public.campaign_dispatches (
        campaign_queue_id,
        assigned_to_user_id,
        assigned_profile_type,
        city,
        region,
        dispatch_status,
        priority,
        notes,
        assigned_at
    ) VALUES (
        p_campaign_queue_id,
        p_motoboy_user_id,
        'motoboy',
        COALESCE(p_city, v_campaign.target_city),
        COALESCE(p_region, v_campaign.target_region),
        'assigned',
        COALESCE(p_priority, v_campaign.priority, 2),
        p_notes,
        now()
    )
    RETURNING id INTO v_new_id;

    -- Atualizar status da campanha se necessário
    UPDATE public.campaign_queue
    SET status = 'processing', updated_at = now()
    WHERE id = p_campaign_queue_id
      AND status IN ('ready', 'approved', 'scheduled', 'queued', 'pending');

    RETURN jsonb_build_object(
        'success', true,
        'dispatch_id', v_new_id,
        'campaign_queue_id', p_campaign_queue_id,
        'motoboy_user_id', p_motoboy_user_id,
        'message', 'Campanha atribuída ao motoboy com sucesso'
    );

EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Campanha já atribuída a este motoboy (constraint)',
        'duplicate', true
    );
END;
$$;


-- ═══════════════════════════════════════
-- COMENTÁRIOS
-- ═══════════════════════════════════════

COMMENT ON FUNCTION public.create_merchant_campaign_queue_item IS
'Lojista cria campanha diretamente na fila. Status ready dispara auto-dispatch via trigger.';

COMMENT ON FUNCTION public.assign_campaign_to_motoboy IS
'Atribuição explícita de campanha a um motoboy específico. Respeita unicidade campaign_queue_id + user + profile.';
