-- Remover constraint CHECK existente se houver
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name LIKE '%moto_taxi_corridas_status%'
  ) THEN
    EXECUTE 'ALTER TABLE public.moto_taxi_corridas DROP CONSTRAINT IF EXISTS moto_taxi_corridas_status_check';
  END IF;
END $$;

-- Atualizar todos os status existentes de inglês para português
UPDATE public.moto_taxi_corridas SET status = 'pesquisando' WHERE status = 'searching';
UPDATE public.moto_taxi_corridas SET status = 'aceita' WHERE status = 'accepted';
UPDATE public.moto_taxi_corridas SET status = 'a_caminho' WHERE status = 'on_the_way';
UPDATE public.moto_taxi_corridas SET status = 'em_andamento' WHERE status = 'in_progress';
UPDATE public.moto_taxi_corridas SET status = 'finalizada' WHERE status = 'finished';
UPDATE public.moto_taxi_corridas SET status = 'cancelada' WHERE status = 'canceled';

-- Alterar o valor padrão para português
ALTER TABLE public.moto_taxi_corridas ALTER COLUMN status SET DEFAULT 'pesquisando';

-- Adicionar nova constraint CHECK com valores em português
ALTER TABLE public.moto_taxi_corridas 
ADD CONSTRAINT moto_taxi_corridas_status_check 
CHECK (status IN ('pesquisando', 'aceita', 'a_caminho', 'em_andamento', 'finalizada', 'cancelada'));