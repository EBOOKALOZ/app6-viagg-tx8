-- Create merchant_stores table for store settings
CREATE TABLE public.merchant_stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome_loja TEXT NOT NULL,
  logo_url TEXT,
  cpf_cnpj TEXT NOT NULL,
  categoria TEXT,
  cep TEXT,
  rua TEXT,
  numero TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT merchant_stores_user_id_unique UNIQUE (user_id)
);

-- Enable Row Level Security
ALTER TABLE public.merchant_stores ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own store" 
ON public.merchant_stores 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own store" 
ON public.merchant_stores 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own store" 
ON public.merchant_stores 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Admin policies
CREATE POLICY "Admins can view all stores" 
ON public.merchant_stores 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all stores" 
ON public.merchant_stores 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for merchant logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('merchant-logos', 'merchant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for merchant logos
CREATE POLICY "Anyone can view merchant logos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'merchant-logos');

CREATE POLICY "Users can upload their own merchant logo" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'merchant-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own merchant logo" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'merchant-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own merchant logo" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'merchant-logos' AND auth.uid()::text = (storage.foldername(name))[1]);