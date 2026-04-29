-- ═══════════════════════════════════════════════════════════════
-- EVOLUÇÃO: DISTRIBUIÇÃO TERRITORIAL POR BAIRRO + MULTI-PERFIL
-- Viagg-TX8 — Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- 1. ADICIONAR COLUNA BAIRRO NAS TABELAS
-- ═══════════════════════════════════════

-- motoboy_profiles: bairro de atuação do motoboy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'motoboy_profiles' AND column_name = 'bairro'
  ) THEN
    ALTER TABLE public.motoboy_profiles ADD COLUMN bairro TEXT;
  END IF;
END $$;

-- campaign_queue: bairro alvo da campanha
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_queue' AND column_name = 'target_bairro'
  ) THEN
    ALTER TABLE public.campaign_queue ADD COLUMN target_bairro TEXT;
  END IF;
END $$;

-- campaign_dispatches: bairro do dispatch
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_dispatches' AND column_name = 'bairro'
  ) THEN
    ALTER TABLE public.campaign_dispatches ADD COLUMN bairro TEXT;
  END IF;
END $$;


-- ═══════════════════════════════════════
-- 2. FUNÇÃO DE NORMALIZAÇÃO DE BAIRRO
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.normalize_bairro_name(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
BEGIN
  IF p_raw IS NULL OR trim(p_raw) = '' THEN
    RETURN '';
  END IF;

  v_clean := trim(p_raw);
  v_clean := lower(v_clean);
  v_clean := translate(v_clean,
    'àáâãäåèéêëìíîïòóôõöùúûüýñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
    'aaaaaaeeeeiiiioooooouuuuynccaaaaaaeeeeiiiioooooouuuuyncc'
  );
  v_clean := regexp_replace(v_clean, '[^a-z0-9\s]', '', 'g');
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  v_clean := trim(v_clean);

  RETURN v_clean;
END;
$$;


-- ═══════════════════════════════════════
-- 3. RECRIAR auto_dispatch COM MATCH POR BAIRRO
-- ═══════════════════════════════════════
-- Regra:
--   Se target_bairro preenchido → match por bairro normalizado (dentro da mesma cidade)
--   Se só target_city → match por cidade (fallback atual)
--   Multi-perfil: NÃO exclui created_by_user_id → mesmo user pode receber

CREATE OR REPLACE FUNCTION public.auto_dispatch_campaign_by_service_area(
  p_campaign_queue_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign       record;
  v_target_city_n  text;
  v_target_bairro_n text;
  v_dispatched     int := 0;
  v_eligible       int := 0;
  v_motoboy        record;
  v_match_type     text := 'city';
BEGIN
  -- ── 1. Buscar campanha ──
  SELECT id, status, target_city, target_region, target_bairro, priority, created_by_user_id
  INTO v_campaign
  FROM public.campaign_queue
  WHERE id = p_campaign_queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Campanha não encontrada', 'campaign_id', p_campaign_queue_id);
  END IF;

  -- ── 2. Validar status elegível ──
  IF v_campaign.status NOT IN ('ready', 'approved', 'scheduled', 'queued', 'pending', 'processing') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Status "%s" não elegível para distribuição automática', v_campaign.status),
      'campaign_id', p_campaign_queue_id, 'status', v_campaign.status
    );
  END IF;

  -- ── 3. Validar target_city ──
  IF v_campaign.target_city IS NULL OR trim(v_campaign.target_city) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Campanha sem target_city definido', 'campaign_id', p_campaign_queue_id);
  END IF;

  -- ── 4. Normalizar cidade e bairro alvo ──
  v_target_city_n := public.normalize_city_name(v_campaign.target_city);
  v_target_bairro_n := public.normalize_bairro_name(v_campaign.target_bairro);

  IF v_target_city_n = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_city resultou em string vazia');
  END IF;

  -- Determinar tipo de match
  IF v_target_bairro_n != '' THEN
    v_match_type := 'bairro';
  END IF;

  -- ── 5. Buscar motoboys elegíveis e inserir dispatches ──
  -- Multi-perfil: NÃO filtra por created_by_user_id
  -- Mesmo user pode ser lojista (creator) e motoboy (assignee)
  FOR v_motoboy IN
    SELECT mp.user_id, mp.cidade, mp.bairro
    FROM public.motoboy_profiles mp
    INNER JOIN public.profiles p ON p.id = mp.user_id
    WHERE p.is_active = true
      AND public.normalize_city_name(mp.cidade) = v_target_city_n
      -- Match por bairro quando disponível
      AND (
        v_target_bairro_n = ''
        OR public.normalize_bairro_name(mp.bairro) = v_target_bairro_n
      )
      -- Excluir duplicados existentes
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_dispatches cd
        WHERE cd.campaign_queue_id = p_campaign_queue_id
          AND cd.assigned_to_user_id = mp.user_id
          AND cd.assigned_profile_type = 'motoboy'
      )
  LOOP
    v_eligible := v_eligible + 1;

    BEGIN
      INSERT INTO public.campaign_dispatches (
        campaign_queue_id,
        assigned_to_user_id,
        assigned_profile_type,
        city,
        region,
        bairro,
        dispatch_status,
        priority,
        notes,
        assigned_at
      ) VALUES (
        p_campaign_queue_id,
        v_motoboy.user_id,
        'motoboy',
        v_campaign.target_city,
        v_campaign.target_region,
        COALESCE(v_campaign.target_bairro, v_motoboy.bairro),
        'assigned',
        COALESCE(v_campaign.priority, 2),
        format('Auto-dispatch por %s [%s]',
          v_match_type,
          CASE WHEN v_match_type = 'bairro' THEN v_target_bairro_n ELSE v_target_city_n END
        ),
        now()
      );
      v_dispatched := v_dispatched + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  -- ── 6. Atualizar status da campanha ──
  IF v_dispatched > 0 THEN
    UPDATE public.campaign_queue
    SET status = 'processing', updated_at = now()
    WHERE id = p_campaign_queue_id
      AND status IN ('ready', 'approved', 'scheduled', 'queued', 'pending');
  END IF;

  -- ── 7. Retorno ──
  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', p_campaign_queue_id,
    'match_type', v_match_type,
    'target_city_normalized', v_target_city_n,
    'target_bairro_normalized', v_target_bairro_n,
    'eligible_motoboys', v_eligible,
    'dispatched', v_dispatched,
    'multi_profile_enabled', true,
    'timestamp', now()::text
  );
END;
$$;


-- ═══════════════════════════════════════
-- 4. ATUALIZAR RPC create_merchant_campaign_queue_item
-- ═══════════════════════════════════════
-- Agora aceita p_target_bairro e busca bairro da loja como fallback

CREATE OR REPLACE FUNCTION public.create_merchant_campaign_queue_item(
    p_merchant_store_id     uuid,
    p_created_by_user_id    uuid,
    p_title                 text,
    p_message_text          text        DEFAULT NULL,
    p_media_url             text        DEFAULT NULL,
    p_campaign_type         text        DEFAULT 'offer',
    p_target_city           text        DEFAULT NULL,
    p_target_region         text        DEFAULT NULL,
    p_target_bairro         text        DEFAULT NULL,
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
    IF p_title IS NULL OR trim(p_title) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Título é obrigatório');
    END IF;

    IF p_created_by_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Usuário não identificado');
    END IF;

    -- Validar ownership da loja (usa merchant_stores)
    IF p_merchant_store_id IS NOT NULL THEN
        SELECT id, store_name, city, bairro INTO v_store
        FROM public.merchant_stores
        WHERE id = p_merchant_store_id AND user_id = p_created_by_user_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Loja não encontrada ou não pertence ao usuário');
        END IF;

        -- Fallback: cidade da loja
        IF (p_target_city IS NULL OR trim(p_target_city) = '') AND v_store.city IS NOT NULL THEN
            p_target_city := v_store.city;
        END IF;

        -- Fallback: bairro da loja
        IF (p_target_bairro IS NULL OR trim(p_target_bairro) = '') AND v_store.bairro IS NOT NULL THEN
            p_target_bairro := v_store.bairro;
        END IF;
    END IF;

    -- Inserir na campaign_queue com status 'ready'
    INSERT INTO public.campaign_queue (
        title,
        message_text,
        media_url,
        campaign_type,
        target_city,
        target_region,
        target_bairro,
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
        NULLIF(trim(COALESCE(p_target_bairro, '')), ''),
        COALESCE(p_priority, 2),
        'ready',
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
        'target_bairro', p_target_bairro,
        'status', 'ready',
        'multi_profile', true,
        'message', 'Campanha criada e distribuição automática por bairro acionada'
    );
END;
$$;


-- ═══════════════════════════════════════
-- 5. ATUALIZAR merchant_campaign_status_view
-- ═══════════════════════════════════════

CREATE OR REPLACE VIEW public.merchant_campaign_status_view AS
SELECT
    cq.id                   AS campaign_id,
    cq.title,
    cq.status,
    cq.message_text,
    cq.media_url,
    cq.campaign_type,
    cq.target_city,
    cq.target_region,
    cq.target_bairro,
    cq.created_by_user_id,
    cq.created_at,
    cq.updated_at,
    COUNT(cd.id)                                                    AS total_dispatches,
    COUNT(cd.id) FILTER (WHERE cd.dispatch_status = 'assigned')     AS assigned_count,
    COUNT(cd.id) FILTER (WHERE cd.dispatch_status = 'in_progress')  AS in_progress_count,
    COUNT(cd.id) FILTER (WHERE cd.dispatch_status = 'posted')       AS posted_count,
    COUNT(cd.id) FILTER (WHERE cd.dispatch_status = 'failed')       AS failed_count,
    COUNT(cd.id) FILTER (WHERE cd.dispatch_status = 'cancelled')    AS cancelled_count
FROM public.campaign_queue cq
LEFT JOIN public.campaign_dispatches cd ON cd.campaign_queue_id = cq.id
GROUP BY
    cq.id, cq.title, cq.status, cq.message_text, cq.media_url,
    cq.campaign_type, cq.target_city, cq.target_region, cq.target_bairro,
    cq.created_by_user_id, cq.created_at, cq.updated_at;

ALTER VIEW public.merchant_campaign_status_view OWNER TO postgres;


-- ═══════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════

-- Verificar colunas adicionadas:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'motoboy_profiles' AND column_name = 'bairro';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'campaign_queue' AND column_name = 'target_bairro';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'campaign_dispatches' AND column_name = 'bairro';

-- Testar normalização:
-- SELECT normalize_bairro_name('Centro'), normalize_bairro_name('  São José  '), normalize_bairro_name('JARDIM PAULISTA');
