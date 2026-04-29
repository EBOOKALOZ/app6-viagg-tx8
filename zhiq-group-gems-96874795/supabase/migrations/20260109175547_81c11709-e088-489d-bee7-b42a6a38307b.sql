-- Create table for driver WhatsApp groups
CREATE TABLE public.driver_whatsapp_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  link TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Geral',
  status TEXT NOT NULL DEFAULT 'em_analise',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_status CHECK (status IN ('em_analise', 'ativo', 'inativo', 'rejeitado')),
  CONSTRAINT valid_tipo CHECK (tipo IN ('Mobilidade', 'Comunidade', 'Comércio', 'Serviços', 'Geral'))
);

-- Enable RLS
ALTER TABLE public.driver_whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- Users can view their own groups
CREATE POLICY "Users can view their own groups"
ON public.driver_whatsapp_groups
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own groups
CREATE POLICY "Users can insert their own groups"
ON public.driver_whatsapp_groups
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own groups (for soft delete via status change)
CREATE POLICY "Users can update their own groups"
ON public.driver_whatsapp_groups
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all groups
CREATE POLICY "Admins can view all groups"
ON public.driver_whatsapp_groups
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all groups (for approval/rejection)
CREATE POLICY "Admins can update all groups"
ON public.driver_whatsapp_groups
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_driver_whatsapp_groups_updated_at
BEFORE UPDATE ON public.driver_whatsapp_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for searching
CREATE INDEX idx_driver_whatsapp_groups_cidade ON public.driver_whatsapp_groups(cidade);
CREATE INDEX idx_driver_whatsapp_groups_estado ON public.driver_whatsapp_groups(estado);
CREATE INDEX idx_driver_whatsapp_groups_tipo ON public.driver_whatsapp_groups(tipo);
CREATE INDEX idx_driver_whatsapp_groups_status ON public.driver_whatsapp_groups(status);