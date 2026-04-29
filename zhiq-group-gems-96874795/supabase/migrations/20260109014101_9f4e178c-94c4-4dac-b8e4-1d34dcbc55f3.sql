
-- Create driver_profiles table for operational driver data
CREATE TABLE public.driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Location
  cidade TEXT,
  estado TEXT,
  
  -- Personal operational data
  cpf_cnpj TEXT,
  whatsapp TEXT,
  
  -- Identity
  selfie_url TEXT,
  selfie_status TEXT DEFAULT 'pending' CHECK (selfie_status IN ('pending', 'submitted', 'approved', 'rejected')),
  
  -- CNH
  cnh_numero TEXT,
  cnh_categoria TEXT DEFAULT 'B',
  cnh_validade DATE,
  cnh_url TEXT,
  
  -- Vehicle data
  veiculo_marca TEXT,
  veiculo_modelo TEXT,
  veiculo_ano INTEGER,
  veiculo_cor TEXT,
  veiculo_placa TEXT,
  
  -- Status
  is_online BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own driver profile"
ON public.driver_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own driver profile"
ON public.driver_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own driver profile"
ON public.driver_profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all driver profiles"
ON public.driver_profiles FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all driver profiles"
ON public.driver_profiles FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_driver_profiles_updated_at
BEFORE UPDATE ON public.driver_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for driver documents
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-documents', 'driver-documents', false);

-- Storage policies for driver documents
CREATE POLICY "Users can view their own driver documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own driver documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own driver documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own driver documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
