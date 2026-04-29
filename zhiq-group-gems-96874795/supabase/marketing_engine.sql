-- ═══════════════════════════════════════════════════════════════
-- MOTOR DE DIVULGAÇÃO AUTOMÁTICA — PRODUTOS → CAMPANHAS → MOTOBOYS
-- Viagg-TX8 — Execute este script completo no Supabase SQL Editor
-- Pré-requisito: auto_dispatch_engine.sql já executado
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- LAYER A: VIEW DE PRODUTOS ELEGÍVEIS
-- ═══════════════════════════════════════
-- Consolida todos os produtos de marketing aptos para divulgação
-- com dados da loja, scoring e recência.

CREATE OR REPLACE VIEW public.marketing_eligible_products_view AS
SELECT
  mmp.id                                        AS product_id,
  mmp.merchant_store_id,
  ms.nome_loja                                  AS store_name,
  COALESCE(mmp.target_city, ms.cidade)          AS effective_city,
  COALESCE(mmp.target_region, ms.estado)        AS effective_region,
  mmp.title                                     AS product_title,
  mmp.short_description,
  mmp.marketing_text,
  mmp.image_url,
  mmp.video_url,
  mmp.external_link,
  mmp.price_label,
  mmp.cta_label,
  mmp.campaign_type,
  mmp.is_active,
  mmp.starts_at,
  mmp.ends_at,
  mmp.created_at,
  mmp.updated_at,
  mmp.created_by_user_id,
  -- Recência: última vez que este produto virou campanha
  (
    SELECT MAX(cq.created_at)
    FROM public.campaign_queue cq
    WHERE cq.source_type = 'merchant_marketing_product'
      AND cq.source_id::text = mmp.id::text
  )                                              AS last_enqueued_at,
  -- Dias desde última postagem
  COALESCE(
    EXTRACT(DAY FROM (now() - (
      SELECT MAX(cq.created_at)
      FROM public.campaign_queue cq
      WHERE cq.source_type = 'merchant_marketing_product'
        AND cq.source_id::text = mmp.id::text
    ))),
    999
  )::int                                         AS days_since_last_enqueue,
  -- Tem conteúdo postável?
  CASE
    WHEN mmp.image_url IS NOT NULL AND trim(mmp.image_url) != '' THEN true
    WHEN mmp.video_url IS NOT NULL AND trim(mmp.video_url) != '' THEN true
    WHEN mmp.marketing_text IS NOT NULL AND trim(mmp.marketing_text) != '' THEN true
    ELSE false
  END                                            AS has_postable_content,
  -- Score de prioridade (maior = mais apto)
  (
    -- Recência: nunca postado = +100, senão inversamente proporcional
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM public.campaign_queue cq
        WHERE cq.source_type = 'merchant_marketing_product'
          AND cq.source_id::text = mmp.id::text
      ) THEN 100
      ELSE LEAST(
        COALESCE(EXTRACT(DAY FROM (now() - (
          SELECT MAX(cq.created_at)
          FROM public.campaign_queue cq
          WHERE cq.source_type = 'merchant_marketing_product'
            AND cq.source_id::text = mmp.id::text
        ))), 0)::int,
        100
      )
    END
    -- Bônus por ter imagem
    + CASE WHEN mmp.image_url IS NOT NULL AND trim(mmp.image_url) != '' THEN 10 ELSE 0 END
    -- Bônus por ter link externo
    + CASE WHEN mmp.external_link IS NOT NULL AND trim(mmp.external_link) != '' THEN 5 ELSE 0 END
  )                                              AS priority_score
FROM public.merchant_marketing_products mmp
LEFT JOIN public.merchant_stores ms ON ms.id = mmp.merchant_store_id
WHERE mmp.is_active = true
  AND mmp.title IS NOT NULL
  AND trim(mmp.title) != ''
  -- Não expirado
  AND (mmp.ends_at IS NULL OR mmp.ends_at > now())
  -- Já começou (ou sem data de início)
  AND (mmp.starts_at IS NULL OR mmp.starts_at <= now())
  -- Tem cidade (do produto ou da loja)
  AND COALESCE(mmp.target_city, ms.cidade) IS NOT NULL
  AND trim(COALESCE(mmp.target_city, ms.cidade, '')) != '';


-- ═══════════════════════════════════════
-- LAYER B: FUNÇÃO DE ESCOLHA DE PRODUTOS
-- ═══════════════════════════════════════
-- Seleciona os melhores candidatos a se tornarem campanhas,
-- evitando duplicatas, recência e monopolização por loja.

CREATE OR REPLACE FUNCTION public.choose_products_for_posting(
  p_limit int DEFAULT 5,
  p_city text DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  merchant_store_id uuid,
  store_name text,
  effective_city text,
  effective_region text,
  product_title text,
  marketing_text text,
  image_url text,
  external_link text,
  campaign_type text,
  priority_score int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_city_norm text;
BEGIN
  -- Normalizar cidade filtro se fornecida
  IF p_city IS NOT NULL AND trim(p_city) != '' THEN
    v_city_norm := public.normalize_city_name(p_city);
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      e.product_id,
      e.merchant_store_id,
      e.store_name,
      e.effective_city,
      e.effective_region,
      e.product_title,
      e.marketing_text,
      e.image_url,
      e.external_link,
      e.campaign_type,
      e.priority_score,
      -- Anti-monopolização: rank dentro de cada loja
      ROW_NUMBER() OVER (
        PARTITION BY e.merchant_store_id
        ORDER BY e.priority_score DESC, e.created_at DESC
      ) AS store_rank
    FROM public.marketing_eligible_products_view e
    WHERE e.has_postable_content = true
      -- Filtrar por cidade se fornecida
      AND (
        v_city_norm IS NULL
        OR public.normalize_city_name(e.effective_city) = v_city_norm
      )
      -- Não tem campanha ativa (pending/ready/processing/approved/scheduled/queued)
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_queue cq
        WHERE cq.source_type = 'merchant_marketing_product'
          AND cq.source_id::text = e.product_id::text
          AND cq.status IN ('pending', 'ready', 'approved', 'scheduled', 'queued', 'processing')
      )
  )
  SELECT
    c.product_id,
    c.merchant_store_id,
    c.store_name,
    c.effective_city,
    c.effective_region,
    c.product_title,
    c.marketing_text,
    c.image_url,
    c.external_link,
    c.campaign_type,
    c.priority_score
  FROM candidates c
  WHERE c.store_rank = 1   -- Máximo 1 produto por loja por batch
  ORDER BY c.priority_score DESC, c.product_id   -- deterministic order
  LIMIT p_limit;
END;
$$;


-- ═══════════════════════════════════════
-- LAYER C: ENFILEIRAR PRODUTOS ESCOLHIDOS
-- ═══════════════════════════════════════
-- Converte os produtos selecionados em campanhas na campaign_queue.
-- O trigger existente (trg_auto_dispatch_campaign) dispara o auto-dispatch.

CREATE OR REPLACE FUNCTION public.enqueue_chosen_products(
  p_limit int DEFAULT 5,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product record;
  v_enqueued int := 0;
  v_campaign_id uuid;
  v_details jsonb[] := '{}';
BEGIN
  FOR v_product IN
    SELECT * FROM public.choose_products_for_posting(p_limit, p_city)
  LOOP
    BEGIN
      INSERT INTO public.campaign_queue (
        title,
        message_text,
        media_url,
        campaign_type,
        target_city,
        target_region,
        source_type,
        source_id,
        merchant_store_id,
        status,
        priority,
        created_at,
        updated_at
      ) VALUES (
        v_product.product_title,
        v_product.marketing_text,
        v_product.image_url,
        COALESCE(v_product.campaign_type, 'offer'),
        v_product.effective_city,
        v_product.effective_region,
        'merchant_marketing_product',
        v_product.product_id::text,
        v_product.merchant_store_id,
        'ready',  -- Triggers auto-dispatch via trg_auto_dispatch_campaign
        2,        -- Default priority
        now(),
        now()
      )
      RETURNING id INTO v_campaign_id;

      v_enqueued := v_enqueued + 1;
      v_details := array_append(v_details, jsonb_build_object(
        'campaign_id', v_campaign_id,
        'product_id', v_product.product_id,
        'store_name', v_product.store_name,
        'city', v_product.effective_city,
        'title', v_product.product_title
      ));

    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with next product
      RAISE NOTICE 'Error enqueuing product %: %', v_product.product_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'enqueued', v_enqueued,
    'timestamp', now()::text,
    'details', to_jsonb(v_details)
  );
END;
$$;


-- ═══════════════════════════════════════
-- LAYER D: ORQUESTRADORA — MOTOR COMPLETO
-- ═══════════════════════════════════════
-- Executa o pipeline completo:
-- 1. Identifica todas as cidades com produtos elegíveis
-- 2. Escolhe e enfileira produtos para cada cidade
-- 3. O auto-dispatch (trigger) cuida da distribuição para motoboys
-- Retorna resumo consolidado.

CREATE OR REPLACE FUNCTION public.run_marketing_engine(
  p_limit_per_city int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_city record;
  v_result jsonb;
  v_total_enqueued int := 0;
  v_total_cities int := 0;
  v_city_results jsonb[] := '{}';
BEGIN
  -- Processar cada cidade que tem produtos elegíveis
  FOR v_city IN
    SELECT DISTINCT
      public.normalize_city_name(e.effective_city) AS city_norm,
      e.effective_city AS city_raw
    FROM public.marketing_eligible_products_view e
    WHERE e.has_postable_content = true
      -- Garantir que a cidade normalizada não está vazia
      AND public.normalize_city_name(e.effective_city) != ''
    ORDER BY city_norm
  LOOP
    v_result := public.enqueue_chosen_products(p_limit_per_city, v_city.city_raw);
    v_total_cities := v_total_cities + 1;
    v_total_enqueued := v_total_enqueued + COALESCE((v_result->>'enqueued')::int, 0);

    v_city_results := array_append(v_city_results, jsonb_build_object(
      'city', v_city.city_raw,
      'enqueued', (v_result->>'enqueued')::int
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_enqueued', v_total_enqueued,
    'cities_processed', v_total_cities,
    'timestamp', now()::text,
    'per_city', to_jsonb(v_city_results)
  );
END;
$$;


-- ═══════════════════════════════════════
-- VERIFICAÇÃO (descomente para testar)
-- ═══════════════════════════════════════

-- Ver todos os produtos elegíveis:
-- SELECT * FROM marketing_eligible_products_view ORDER BY priority_score DESC;

-- Simular seleção (sem inserir):
-- SELECT * FROM choose_products_for_posting(5, NULL);

-- Simular seleção para uma cidade específica:
-- SELECT * FROM choose_products_for_posting(3, 'Blumenau');

-- Executar enfileiramento para uma cidade:
-- SELECT enqueue_chosen_products(3, 'Blumenau');

-- Executar motor completo (todas as cidades, máx 3 por cidade):
-- SELECT run_marketing_engine(3);

-- Verificar campanhas criadas pelo motor:
-- SELECT id, title, target_city, source_type, source_id, status, created_at
-- FROM campaign_queue
-- WHERE source_type = 'merchant_marketing_product'
-- ORDER BY created_at DESC LIMIT 20;

-- Verificar dispatches gerados:
-- SELECT * FROM campaign_dispatches ORDER BY created_at DESC LIMIT 20;
