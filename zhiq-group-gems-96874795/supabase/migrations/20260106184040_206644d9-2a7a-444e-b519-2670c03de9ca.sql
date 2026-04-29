-- Add telefone column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS telefone text;

-- Add a column to track if profile setup is complete
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS profile_complete boolean NOT NULL DEFAULT false;