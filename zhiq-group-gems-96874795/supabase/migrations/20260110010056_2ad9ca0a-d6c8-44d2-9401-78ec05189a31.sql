-- Create table for tracking free rides
CREATE TABLE public.driver_free_rides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NULL,
  ride_id UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_free_rides ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own free rides"
ON public.driver_free_rides
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own free rides"
ON public.driver_free_rides
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own free rides"
ON public.driver_free_rides
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all free rides"
ON public.driver_free_rides
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all free rides"
ON public.driver_free_rides
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function to calculate available free rides
CREATE OR REPLACE FUNCTION public.get_driver_incentives(_user_id uuid)
RETURNS TABLE (
  active_groups_count INTEGER,
  profile_level TEXT,
  total_free_rides INTEGER,
  used_free_rides INTEGER,
  available_free_rides INTEGER,
  groups_to_next_ride INTEGER
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_groups INTEGER;
  _level TEXT;
  _total_rides INTEGER;
  _used_rides INTEGER;
  _available_rides INTEGER;
  _to_next INTEGER;
BEGIN
  -- Count active groups
  SELECT COUNT(*)::INTEGER INTO _active_groups
  FROM public.driver_whatsapp_groups
  WHERE user_id = _user_id AND status = 'ativo';
  
  -- Determine profile level
  IF _active_groups >= 10 THEN
    _level := 'Ouro';
  ELSIF _active_groups >= 5 THEN
    _level := 'Prata';
  ELSE
    _level := 'Bronze';
  END IF;
  
  -- Calculate total free rides earned (1 per 5 active groups)
  _total_rides := FLOOR(_active_groups / 5.0)::INTEGER;
  
  -- Count used free rides
  SELECT COUNT(*)::INTEGER INTO _used_rides
  FROM public.driver_free_rides
  WHERE user_id = _user_id AND used_at IS NOT NULL;
  
  -- Calculate available
  _available_rides := GREATEST(0, _total_rides - _used_rides);
  
  -- Calculate groups needed for next ride
  _to_next := 5 - (_active_groups % 5);
  IF _to_next = 5 AND _active_groups > 0 THEN
    _to_next := 0;
  END IF;
  
  RETURN QUERY SELECT _active_groups, _level, _total_rides, _used_rides, _available_rides, _to_next;
END;
$$;

-- Create function to get regional ranking
CREATE OR REPLACE FUNCTION public.get_regional_ranking(_estado TEXT, _cidade TEXT DEFAULT NULL, _limit INTEGER DEFAULT 10)
RETURNS TABLE (
  rank_position INTEGER,
  user_id UUID,
  user_name TEXT,
  active_groups INTEGER,
  cidade TEXT,
  estado TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH driver_stats AS (
    SELECT 
      dwg.user_id,
      p.name as user_name,
      COUNT(*)::INTEGER as active_groups,
      MAX(dwg.cidade) as cidade,
      dwg.estado
    FROM public.driver_whatsapp_groups dwg
    JOIN public.profiles p ON p.id = dwg.user_id
    WHERE dwg.status = 'ativo'
      AND dwg.estado = _estado
      AND (_cidade IS NULL OR dwg.cidade = _cidade)
    GROUP BY dwg.user_id, p.name, dwg.estado
  )
  SELECT 
    ROW_NUMBER() OVER (ORDER BY ds.active_groups DESC)::INTEGER as rank_position,
    ds.user_id,
    ds.user_name,
    ds.active_groups,
    ds.cidade,
    ds.estado
  FROM driver_stats ds
  ORDER BY ds.active_groups DESC
  LIMIT _limit;
END;
$$;