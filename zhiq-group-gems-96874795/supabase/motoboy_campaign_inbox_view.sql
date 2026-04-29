-- ═══════════════════════════════════════════════════════════════
-- VIEW: motoboy_campaign_inbox_view
-- Consumida pelo painel Postador do Motoboy
-- Junta campaign_dispatches + campaign_queue para exibir
-- campanhas atribuídas ao motoboy logado
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.motoboy_campaign_inbox_view AS
SELECT
    cd.id,
    cd.campaign_queue_id,
    cq.title                   AS campaign_title,
    cq.message_text            AS campaign_message,
    cq.media_url               AS campaign_media_url,
    cq.source_type,
    cq.source_id,
    cd.assigned_to_user_id,
    cd.assigned_profile_type,
    cd.city,
    cd.region,
    cd.dispatch_status,
    cd.priority,
    cd.notes,
    cq.created_at,
    cd.assigned_at,
    cd.processed_at,
    cd.completed_at,
    -- Store name: try merchant_stores, fallback to stores
    COALESCE(ms.store_name, ms.nome_loja, s.name)  AS store_name,
    cq.target_city,
    cq.target_region,
    cq.scheduled_for,
    cq.available_from,
    cq.available_until,
    CASE WHEN cq.media_url IS NOT NULL AND cq.media_url != '' THEN true ELSE false END AS has_media,
    -- Product info: extrair do source quando product_auto
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.name
      ELSE REPLACE(REPLACE(cq.title, 'Oferta: ', ''), 'Oferta:', '')
    END AS product_name,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.price
      ELSE NULL
    END AS product_price,
    -- Territorial
    COALESCE(cd.bairro, cq.target_bairro)           AS bairro
FROM public.campaign_dispatches cd
JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
-- Join merchant_stores via created_by_user_id
LEFT JOIN public.merchant_stores ms ON ms.user_id = cq.created_by_user_id
-- Join stores via owner_id (for store name fallback)
LEFT JOIN public.stores s ON s.owner_id = cq.created_by_user_id
-- Join products when source_type = 'product_auto'
LEFT JOIN public.products p ON cq.source_type = 'product_auto'
  AND cq.source_id IS NOT NULL
  AND p.id::text = cq.source_id;

ALTER VIEW public.motoboy_campaign_inbox_view OWNER TO postgres;

-- Grant access for authenticated users (Supabase RLS)
GRANT SELECT ON public.motoboy_campaign_inbox_view TO authenticated;
GRANT SELECT ON public.motoboy_campaign_inbox_view TO anon;

-- ═══════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════
-- SELECT * FROM motoboy_campaign_inbox_view WHERE dispatch_status = 'assigned' ORDER BY created_at DESC;
