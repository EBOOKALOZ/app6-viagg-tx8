-- Habilitar RLS na tabela motorista_corridas
ALTER TABLE public.motorista_corridas ENABLE ROW LEVEL SECURITY;

-- Política: Passageiro pode criar corrida
CREATE POLICY "Passageiro pode criar corrida motorista"
ON public.motorista_corridas
FOR INSERT
WITH CHECK (auth.uid() = passenger_id);

-- Política: Passageiro pode ver suas corridas
CREATE POLICY "Passageiro pode ver suas corridas motorista"
ON public.motorista_corridas
FOR SELECT
USING (auth.uid() = passenger_id);

-- Política: Motorista pode ver corridas pendentes (para aceitar)
CREATE POLICY "Motorista pode ver corridas pendentes"
ON public.motorista_corridas
FOR SELECT
USING (status = 'pendente' OR auth.uid() = motorista_id);

-- Política: Motorista pode atualizar corridas pendentes (para aceitar) ou suas próprias
CREATE POLICY "Motorista pode aceitar corrida"
ON public.motorista_corridas
FOR UPDATE
USING (status = 'pendente' OR auth.uid() = motorista_id OR auth.uid() = passenger_id)
WITH CHECK (auth.uid() = motorista_id OR auth.uid() = passenger_id);

-- Política: Admin pode gerenciar todas as corridas
CREATE POLICY "Admin gerencia corridas motorista"
ON public.motorista_corridas
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));