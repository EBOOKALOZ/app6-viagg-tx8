-- CORREÇÃO: Atualizar políticas RLS para usar status em PORTUGUÊS
-- O sistema usa status em português: 'pesquisando', 'aceita', 'a_caminho', etc.

-- Remover políticas antigas com status em inglês
DROP POLICY IF EXISTS "Moto-taxi pode ver corridas disponíveis" ON public.moto_taxi_corridas;
DROP POLICY IF EXISTS "Moto-taxi pode aceitar corrida" ON public.moto_taxi_corridas;

-- Criar política de SELECT para moto-táxi ver corridas disponíveis (status 'pesquisando')
CREATE POLICY "Moto-taxi pode ver corridas disponíveis"
ON public.moto_taxi_corridas
FOR SELECT
USING (
  status = 'pesquisando' 
  OR auth.uid() = moto_taxi_id
  OR auth.uid() = passenger_id
);

-- Criar política de UPDATE para moto-táxi aceitar corrida
CREATE POLICY "Moto-taxi pode aceitar corrida"
ON public.moto_taxi_corridas
FOR UPDATE
USING (
  status = 'pesquisando' 
  OR auth.uid() = moto_taxi_id 
  OR auth.uid() = passenger_id
)
WITH CHECK (
  auth.uid() = moto_taxi_id 
  OR auth.uid() = passenger_id
);