-- Adicionar campos de comissão e valor líquido na tabela de corridas
ALTER TABLE public.moto_taxi_corridas
ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS platform_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount numeric DEFAULT 0;

-- Comentários
COMMENT ON COLUMN public.moto_taxi_corridas.commission_rate IS 'Taxa de comissão percentual no momento da aceitação';
COMMENT ON COLUMN public.moto_taxi_corridas.platform_fee IS 'Valor da taxa da plataforma';
COMMENT ON COLUMN public.moto_taxi_corridas.net_amount IS 'Valor líquido recebido pelo moto-táxi';