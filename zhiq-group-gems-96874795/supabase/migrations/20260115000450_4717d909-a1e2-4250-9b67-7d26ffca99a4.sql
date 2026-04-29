-- Add admin response column to support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS resposta_admin text;