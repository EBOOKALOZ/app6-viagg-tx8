-- Table for passenger referrals
CREATE TABLE public.passenger_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL,
  referred_id UUID NOT NULL,
  referred_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed (after first paid ride)
  confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

-- Table for passenger free rides (from referrals and usage)
CREATE TABLE public.passenger_free_rides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL, -- 'referral' or 'usage'
  referral_batch_id UUID, -- groups referrals that earned the same reward
  max_value NUMERIC NOT NULL DEFAULT 20.00,
  months_remaining INTEGER DEFAULT 1, -- for referral: starts at 6, decrements monthly
  ride_id UUID, -- linked when used
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '12 months'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.passenger_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passenger_free_rides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for passenger_referrals
CREATE POLICY "Users can view their own referrals" 
  ON public.passenger_referrals FOR SELECT 
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "Users can insert referrals" 
  ON public.passenger_referrals FOR INSERT 
  WITH CHECK (auth.uid() = referrer_id);

CREATE POLICY "Admins can manage all referrals" 
  ON public.passenger_referrals FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for passenger_free_rides
CREATE POLICY "Users can view their own free rides" 
  ON public.passenger_free_rides FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own free rides" 
  ON public.passenger_free_rides FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all passenger free rides" 
  ON public.passenger_free_rides FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to get passenger incentives data
CREATE OR REPLACE FUNCTION public.get_passenger_incentives(_user_id uuid)
RETURNS TABLE(
  confirmed_referrals integer,
  pending_referrals integer,
  referrals_to_next_reward integer,
  paid_rides_count integer,
  rides_to_next_free integer,
  available_free_rides integer,
  used_free_rides integer,
  total_free_rides integer,
  active_referral_rewards integer,
  referral_code text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _confirmed INTEGER;
  _pending INTEGER;
  _to_next_referral INTEGER;
  _paid_rides INTEGER;
  _to_next_usage INTEGER;
  _available INTEGER;
  _used INTEGER;
  _total INTEGER;
  _active_rewards INTEGER;
  _code TEXT;
BEGIN
  -- Count confirmed referrals
  SELECT COUNT(*)::INTEGER INTO _confirmed
  FROM public.passenger_referrals
  WHERE referrer_id = _user_id AND status = 'confirmed';
  
  -- Count pending referrals
  SELECT COUNT(*)::INTEGER INTO _pending
  FROM public.passenger_referrals
  WHERE referrer_id = _user_id AND status = 'pending';
  
  -- Calculate referrals needed for next reward (every 3)
  _to_next_referral := 3 - (_confirmed % 3);
  IF _to_next_referral = 3 AND _confirmed > 0 THEN
    _to_next_referral := 0;
  END IF;
  
  -- For MVP, simulate paid rides count (in production, query rides table)
  _paid_rides := 0;
  
  -- Calculate rides to next free ride (every 5)
  _to_next_usage := 5 - (_paid_rides % 5);
  IF _to_next_usage = 5 AND _paid_rides > 0 THEN
    _to_next_usage := 0;
  END IF;
  
  -- Count available free rides (not used, not expired)
  SELECT COUNT(*)::INTEGER INTO _available
  FROM public.passenger_free_rides
  WHERE user_id = _user_id 
    AND used_at IS NULL 
    AND expires_at > now();
  
  -- Count used free rides
  SELECT COUNT(*)::INTEGER INTO _used
  FROM public.passenger_free_rides
  WHERE user_id = _user_id AND used_at IS NOT NULL;
  
  -- Total free rides earned
  _total := _available + _used;
  
  -- Count active referral reward cycles (months remaining > 0)
  SELECT COALESCE(SUM(months_remaining), 0)::INTEGER INTO _active_rewards
  FROM public.passenger_free_rides
  WHERE user_id = _user_id 
    AND source = 'referral' 
    AND months_remaining > 0
    AND used_at IS NULL;
  
  -- Generate referral code from user_id (first 8 chars)
  _code := UPPER(SUBSTRING(_user_id::text, 1, 8));
  
  RETURN QUERY SELECT 
    _confirmed, 
    _pending, 
    _to_next_referral,
    _paid_rides,
    _to_next_usage,
    _available,
    _used,
    _total,
    _active_rewards,
    _code;
END;
$$;