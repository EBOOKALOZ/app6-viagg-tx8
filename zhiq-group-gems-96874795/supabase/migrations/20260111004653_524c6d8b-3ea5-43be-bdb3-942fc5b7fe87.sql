-- Create incentive settings table
CREATE TABLE public.incentive_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.incentive_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage all settings"
ON public.incentive_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can read settings (needed for incentive calculations)
CREATE POLICY "Anyone can read settings"
ON public.incentive_settings
FOR SELECT
USING (true);

-- Insert default settings
INSERT INTO public.incentive_settings (setting_key, setting_value) VALUES
('driver_incentives', '{
  "groups_per_free_ride": 5,
  "max_free_rides_per_month": 3,
  "enabled": true
}'::jsonb),
('passenger_incentives', '{
  "referrals_for_benefit": 3,
  "benefit_duration_months": 6,
  "max_free_rides_per_month": 3,
  "max_ride_value": 20,
  "enabled": true
}'::jsonb),
('campaigns', '{
  "enabled": false,
  "bonus_multiplier": 1,
  "start_date": null,
  "end_date": null
}'::jsonb);

-- Create trigger for updated_at
CREATE TRIGGER update_incentive_settings_updated_at
BEFORE UPDATE ON public.incentive_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();