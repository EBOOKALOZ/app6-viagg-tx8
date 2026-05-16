-- Tabela de dados bancários/PIX (motoboy, imobiliária, anunciante).
-- Estava ausente no projeto live (broifhfqmnzqoongtokm): o upsert de chave PIX
-- na carteira do anunciante falhava porque a tabela não existia.
-- Adaptado ao schema do live: usa is_financial_admin() (não has_role).
CREATE TABLE IF NOT EXISTS public.motoboy_bank_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  pix_tipo_chave TEXT,
  pix_chave TEXT,

  banco TEXT,
  agencia TEXT,
  conta TEXT,
  tipo_conta TEXT,
  nome_titular TEXT,
  cpf_titular TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT motoboy_bank_data_user_unique UNIQUE (user_id)
);

ALTER TABLE public.motoboy_bank_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bank data" ON public.motoboy_bank_data;
CREATE POLICY "Users can view their own bank data"
  ON public.motoboy_bank_data FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own bank data" ON public.motoboy_bank_data;
CREATE POLICY "Users can insert their own bank data"
  ON public.motoboy_bank_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own bank data" ON public.motoboy_bank_data;
CREATE POLICY "Users can update their own bank data"
  ON public.motoboy_bank_data FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Financial admins can view all bank data" ON public.motoboy_bank_data;
CREATE POLICY "Financial admins can view all bank data"
  ON public.motoboy_bank_data FOR SELECT
  USING (is_financial_admin());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_motoboy_bank_data_updated_at ON public.motoboy_bank_data;
CREATE TRIGGER update_motoboy_bank_data_updated_at
  BEFORE UPDATE ON public.motoboy_bank_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
