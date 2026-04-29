-- =========================================================
-- VIAGG-TX8 SENTINELA VISUAL - SCHEMA EVOLUTION
-- =========================================================

-- 1. Expand the moderation status enum
-- Note: ALTER TYPE ADD VALUE cannot run inside a transaction block in some Postgres versions.
-- We'll handle this by assuming these values might already exist or adding them safely.
DO $$ 
BEGIN
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'pending_ai_analysis';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'ai_processing';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'approved_clean';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'approved_masked';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_contact_risk';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_low_quality';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'rejected_invalid_content';
    ALTER TYPE public.real_estate_media_status ADD VALUE IF NOT EXISTS 'ai_error';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add AI Metadata columns to real_estate_media
ALTER TABLE public.real_estate_media 
ADD COLUMN IF NOT EXISTS ai_agent_name text DEFAULT 'Viagg-TX8 Sentinela Visual',
ADD COLUMN IF NOT EXISTS ai_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ai_detected_entities jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_confidence numeric(5,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS decision_reason text,
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS review_source text DEFAULT 'ai',
ADD COLUMN IF NOT EXISTS mask_applied boolean DEFAULT false;

-- 3. Update moderation queue if exists
ALTER TABLE public.real_estate_moderation_queue
ADD COLUMN IF NOT EXISTS ai_decision text,
ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;

-- 4. Create the Trigger Function for Auto-Moderation
CREATE OR REPLACE FUNCTION public.handle_sentinela_visual_auto_queue()
RETURNS trigger AS $$
BEGIN
    -- Mark as pending AI analysis upon insertion
    NEW.moderation_status := 'pending_ai_analysis';
    NEW.ai_status := 'queued';
    
    -- Insert into the moderation queue for background processing
    INSERT INTO public.real_estate_moderation_queue (media_id, listing_id, status)
    VALUES (NEW.id, NEW.listing_id, 'pending')
    ON CONFLICT (media_id) DO UPDATE SET status = 'pending', attempts = 0;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach trigger to real_estate_media
DROP TRIGGER IF EXISTS trg_real_estate_media_sentinela_visual ON public.real_estate_media;
CREATE TRIGGER trg_real_estate_media_sentinela_visual
BEFORE INSERT ON public.real_estate_media
FOR EACH ROW
EXECUTE FUNCTION public.handle_sentinela_visual_auto_queue();

-- 6. View for Audit
DROP VIEW IF EXISTS public.admin_real_estate_image_audit;
CREATE OR REPLACE VIEW public.admin_real_estate_image_audit AS
SELECT 
  m.id as media_id,
  m.listing_id,
  l.title as listing_title,
  m.moderation_status,
  m.ai_status,
  m.ai_confidence,
  m.ai_detected_entities,
  m.decision_reason,
  m.original_storage_path,
  m.public_masked_storage_path,
  m.created_at as uploaded_at,
  m.reviewed_at as processed_at
FROM public.real_estate_media m
JOIN public.real_estate_listings l ON l.id = m.listing_id;

NOTIFY pgrst, 'reload schema';
