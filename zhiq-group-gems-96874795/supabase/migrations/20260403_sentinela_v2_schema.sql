-- =========================================================
-- SENTINELA VISUAL V2 — SCHEMA DE MODERAÇÃO TOLERÂNCIA ZERO
-- =========================================================
-- Adiciona campos de auditoria detalhados à real_estate_media
-- e novos enum values para moderação extendida.
-- NUNCA usa ALTER VIEW DROP COLUMN — sempre DROP + CREATE.
-- =========================================================

-- 1. Novos enum values para status de moderação extendida
DO $$
BEGIN
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'pending_ai_analysis';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'ai_processing';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'approved_clean';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'approved_masked';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_contact_risk';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_low_quality';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_invalid_content';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_text_detected';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_watermark';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_suspicious_pattern';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'ai_error';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Campos de auditoria obrigatórios na tabela real_estate_media
ALTER TABLE public.real_estate_media
    ADD COLUMN IF NOT EXISTS moderation_reason        text,
    ADD COLUMN IF NOT EXISTS ocr_text_detected        text,
    ADD COLUMN IF NOT EXISTS ai_flagged_text          text,
    ADD COLUMN IF NOT EXISTS contains_number          boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS contains_at_symbol       boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS contains_contact_pattern boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_from_storage_at  timestamptz,
    -- Campos do Sentinela V1 (idempotente)
    ADD COLUMN IF NOT EXISTS ai_agent_name            text DEFAULT 'Sentinela Visual V2',
    ADD COLUMN IF NOT EXISTS ai_status                text DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS ai_detected_entities     jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_confidence            numeric(5,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS decision_reason          text,
    ADD COLUMN IF NOT EXISTS reviewed_at              timestamptz,
    ADD COLUMN IF NOT EXISTS review_source            text DEFAULT 'ai',
    ADD COLUMN IF NOT EXISTS mask_applied             boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS public_masked_storage_path text;

-- 3. Atualizar trigger: todo insert marca como pending_ai_analysis
CREATE OR REPLACE FUNCTION public.handle_sentinela_v2_auto_queue()
RETURNS trigger AS $$
BEGIN
    -- Força status de análise pendente
    NEW.moderation_status := 'pending_ai_analysis';
    NEW.ai_status := 'queued';

    -- Insere na fila de moderação para reprocessamento/fallback
    INSERT INTO public.real_estate_moderation_queue (media_id, listing_id, status)
    VALUES (NEW.id, NEW.listing_id, 'pending')
    ON CONFLICT (media_id) DO UPDATE SET status = 'pending', attempts = 0;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove triggers anteriores e recria
DROP TRIGGER IF EXISTS trg_real_estate_media_sentinela_visual ON public.real_estate_media;
DROP TRIGGER IF EXISTS trg_real_estate_media_moderation ON public.real_estate_media;
DROP TRIGGER IF EXISTS trg_sentinela_v2_auto_queue ON public.real_estate_media;

CREATE TRIGGER trg_sentinela_v2_auto_queue
BEFORE INSERT ON public.real_estate_media
FOR EACH ROW
EXECUTE FUNCTION public.handle_sentinela_v2_auto_queue();

-- 4. View de auditoria para admins (DROP + CREATE, nunca ALTER DROP COLUMN)
DROP VIEW IF EXISTS public.admin_real_estate_image_audit CASCADE;
CREATE VIEW public.admin_real_estate_image_audit AS
SELECT
    m.id                          AS media_id,
    m.listing_id,
    l.title                       AS listing_title,
    m.moderation_status,
    m.ai_status,
    m.ai_confidence,
    m.ai_detected_entities,
    m.decision_reason,
    m.moderation_reason,
    m.ocr_text_detected,
    m.ai_flagged_text,
    m.contains_number,
    m.contains_at_symbol,
    m.contains_contact_pattern,
    m.original_storage_path,
    m.public_masked_storage_path,
    m.deleted_from_storage_at,
    m.created_at                  AS uploaded_at,
    m.reviewed_at                 AS processed_at
FROM public.real_estate_media m
JOIN public.real_estate_listings l ON l.id = m.listing_id;

-- 5. View pública — garante que imagens rejeitadas NUNCA aparecem
-- (DROP + CREATE por segurança, sem ALTER DROP COLUMN)
DROP VIEW IF EXISTS public.public_real_estate_media CASCADE;
CREATE VIEW public.public_real_estate_media AS
SELECT
    m.id,
    m.listing_id,
    m.sort_order,
    m.media_type,
    m.public_masked_storage_path,
    m.thumb_masked_storage_path
FROM public.real_estate_media m
JOIN public.real_estate_listings l ON l.id = m.listing_id
WHERE l.visibility_status = 'published'
  AND m.moderation_status IN ('approved', 'masked', 'approved_clean', 'approved_masked')
  AND m.public_masked_storage_path IS NOT NULL
  AND m.deleted_from_storage_at IS NULL;  -- Garante exclusão fisica respeitada

GRANT SELECT ON public.public_real_estate_media TO anon, authenticated;

-- 6. Índices para queries de moderação eficientes
CREATE INDEX IF NOT EXISTS idx_real_estate_media_moderation_status
    ON public.real_estate_media(moderation_status);
CREATE INDEX IF NOT EXISTS idx_real_estate_media_deleted_at
    ON public.real_estate_media(deleted_from_storage_at)
    WHERE deleted_from_storage_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
