-- Create table for motoboy bank data
CREATE TABLE public.motoboy_bank_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  
  -- Pix data
  pix_tipo_chave TEXT, -- CPF, CNPJ, Email, Telefone, Aleatoria
  pix_chave TEXT,
  
  -- Bank account data
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  tipo_conta TEXT, -- corrente, poupanca
  nome_titular TEXT,
  cpf_titular TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT motoboy_bank_data_user_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.motoboy_bank_data ENABLE ROW LEVEL SECURITY;

-- Motoboy can view their own data
CREATE POLICY "Users can view their own bank data"
ON public.motoboy_bank_data
FOR SELECT
USING (auth.uid() = user_id);

-- Motoboy can insert their own data
CREATE POLICY "Users can insert their own bank data"
ON public.motoboy_bank_data
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Motoboy can update their own data
CREATE POLICY "Users can update their own bank data"
ON public.motoboy_bank_data
FOR UPDATE
USING (auth.uid() = user_id);

-- Admin can view all bank data (for future payments)
CREATE POLICY "Admins can view all bank data"
ON public.motoboy_bank_data
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_motoboy_bank_data_updated_at
BEFORE UPDATE ON public.motoboy_bank_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();