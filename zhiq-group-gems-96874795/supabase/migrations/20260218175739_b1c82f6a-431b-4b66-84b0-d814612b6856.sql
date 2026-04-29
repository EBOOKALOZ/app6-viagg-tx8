
-- Add display_order column to footer_contents for controlling link order in the public footer
ALTER TABLE public.footer_contents 
ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 99;

-- Set sensible default order values based on content_type
UPDATE public.footer_contents SET display_order = CASE content_type
  WHEN 'about'        THEN 1
  WHEN 'privacy'      THEN 3
  WHEN 'terms'        THEN 4
  WHEN 'lgpd'         THEN 5
  WHEN 'cancellation' THEN 6
  WHEN 'cookies'      THEN 7
  WHEN 'complaints'   THEN 8
  ELSE 99
END;

-- Static "Suporte" link is handled in code with order=2, so legal content order stays around that.
