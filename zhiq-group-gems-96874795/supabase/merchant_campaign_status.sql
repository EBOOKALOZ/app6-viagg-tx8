-- ═══════════════════════════════════════════════════════════════
-- MERCHANT CAMPAIGN STATUS VIEW
-- Agregação de dispatch status para visibilidade do lojista
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- View: merchant_campaign_status_view
-- Objetivo: permitir que o lojista veja o progresso dos dispatches
-- de cada campanha que ele criou.

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
    cq.created_by_user_id,
    cq.created_at,
    cq.updated_at,
    -- Dispatch counters
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
    cq.campaign_type, cq.target_city, cq.target_region,
    cq.created_by_user_id, cq.created_at, cq.updated_at;

-- RLS: lojista só vê suas próprias campanhas
ALTER VIEW public.merchant_campaign_status_view OWNER TO postgres;

COMMENT ON VIEW public.merchant_campaign_status_view IS
'View para visibilidade do lojista sobre o progresso dos dispatches de cada campanha criada.';
