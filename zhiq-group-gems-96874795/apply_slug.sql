ALTER TABLE public.shc_modules ADD COLUMN IF NOT EXISTS slug TEXT;
UPDATE public.shc_modules SET slug = LOWER(name) WHERE slug IS NULL;
ALTER TABLE public.shc_modules ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shc_modules_slug ON public.shc_modules(slug);
NOTIFY pgrst, 'reload schema';
