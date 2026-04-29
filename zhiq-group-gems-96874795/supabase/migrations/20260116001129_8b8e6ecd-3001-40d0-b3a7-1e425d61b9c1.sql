-- Adicionar coluna de cor da moto no perfil do motoboy
ALTER TABLE public.motoboy_profiles 
ADD COLUMN IF NOT EXISTS veiculo_cor text;