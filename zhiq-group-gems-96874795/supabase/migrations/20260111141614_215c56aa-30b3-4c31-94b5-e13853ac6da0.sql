-- Create merchant_whatsapp_groups table (same structure as driver/motoboy)
CREATE TABLE public.merchant_whatsapp_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  link TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Geral'::text,
  status TEXT NOT NULL DEFAULT 'em_analise'::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.merchant_whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as driver/motoboy)
CREATE POLICY "Users can view their own merchant groups"
ON public.merchant_whatsapp_groups
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own merchant groups"
ON public.merchant_whatsapp_groups
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own merchant groups"
ON public.merchant_whatsapp_groups
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all merchant groups"
ON public.merchant_whatsapp_groups
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all merchant groups"
ON public.merchant_whatsapp_groups
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));