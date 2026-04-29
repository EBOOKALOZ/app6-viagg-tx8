-- Create the group_posting_settings table
CREATE TABLE IF NOT EXISTS public.group_posting_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Target scoping (optional, currently we just use the first row as global if null)
  region_id UUID,
  city_id UUID,
  
  -- Intervals
  min_days_between_posts INTEGER DEFAULT 6,
  max_days_variation INTEGER DEFAULT 2,
  min_minutes_between_posts INTEGER DEFAULT 2,
  max_minutes_between_posts INTEGER DEFAULT 5,
  block_same_template_days INTEGER DEFAULT 30,
  
  -- Content Allowed
  allow_images BOOLEAN DEFAULT true,
  allow_videos BOOLEAN DEFAULT false,
  allow_links BOOLEAN DEFAULT true,
  
  -- Posting Window
  posting_start_hour INTEGER DEFAULT 8,
  posting_end_hour INTEGER DEFAULT 21,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.group_posting_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read group_posting_settings"
ON public.group_posting_settings FOR SELECT
TO authenticated, anon
USING (true);

-- Allow admins full access via the existing admin_role function, but to be safe and consistent with the app,
-- we check if the user has an 'admin' role in the frontend or if the app's standard check passes.
-- The standard app check is: (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'))
CREATE POLICY "Admins can manage group_posting_settings"
  ON public.group_posting_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Insert a default global configuration row if none exists
INSERT INTO public.group_posting_settings (
  id, 
  min_days_between_posts, 
  max_days_variation, 
  min_minutes_between_posts, 
  max_minutes_between_posts, 
  block_same_template_days, 
  allow_images, 
  allow_videos, 
  allow_links, 
  posting_start_hour, 
  posting_end_hour
)
SELECT 
  gen_random_uuid(), 6, 2, 2, 5, 30, true, false, true, 8, 21
WHERE NOT EXISTS (
  SELECT 1 FROM public.group_posting_settings
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION set_updated_at_group_posting_settings()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_group_posting_settings_updated_at
  BEFORE UPDATE ON public.group_posting_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_group_posting_settings();
