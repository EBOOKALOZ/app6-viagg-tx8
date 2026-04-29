-- Adicionar provider_role na tabela profiles (default 'motoboy')
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS provider_role TEXT DEFAULT 'motoboy';

-- Comentário para documentação
COMMENT ON COLUMN public.profiles.provider_role IS 'Tipo de prestador: motorista, motoboy, mototaxi';