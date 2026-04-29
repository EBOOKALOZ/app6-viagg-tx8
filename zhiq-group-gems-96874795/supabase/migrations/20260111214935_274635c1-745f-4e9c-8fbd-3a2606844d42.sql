-- Add terms acceptance fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS terms_accepted boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp with time zone;