-- =====================================================
-- ORGANIZAÇÃO ESTRUTURAL: DOMÍNIO MOTO-TÁXI (CORRIDA)
-- Separado de Motoboy (Entrega)
-- =====================================================

-- 1️⃣ TABELA CENTRAL DE CORRIDAS MOTO-TÁXI
CREATE TABLE public.moto_taxi_corridas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Participantes
  passenger_id UUID NOT NULL REFERENCES auth.users(id),
  moto_taxi_id UUID REFERENCES auth.users(id),
  
  -- Status da corrida (fonte única de verdade)
  status TEXT NOT NULL DEFAULT 'searching' CHECK (
    status IN ('searching', 'accepted', 'on_the_way', 'in_progress', 'finished', 'canceled')
  ),
  
  -- Localização origem
  origin_address TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  
  -- Localização destino
  destination_address TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  
  -- Estimativas
  estimated_km NUMERIC,
  estimated_time_minutes INTEGER,
  estimated_price NUMERIC,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  canceled_by TEXT CHECK (canceled_by IN ('passenger', 'moto_taxi', 'system'))
);

-- 2️⃣ FLAG MOTO-TÁXI NO PERFIL (evita duplicação)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_moto_taxi BOOLEAN DEFAULT false;

-- 3️⃣ HISTÓRICO DE CORRIDAS FINALIZADAS
CREATE TABLE public.moto_taxi_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrida_id UUID NOT NULL REFERENCES public.moto_taxi_corridas(id),
  passenger_id UUID NOT NULL REFERENCES auth.users(id),
  moto_taxi_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Valores finais
  final_price NUMERIC NOT NULL,
  final_km NUMERIC,
  final_time_minutes INTEGER,
  
  -- Avaliações futuras
  passenger_rating INTEGER CHECK (passenger_rating BETWEEN 1 AND 5),
  moto_taxi_rating INTEGER CHECK (moto_taxi_rating BETWEEN 1 AND 5),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- RLS POLICIES - MOTO_TAXI_CORRIDAS
-- =====================================================
ALTER TABLE public.moto_taxi_corridas ENABLE ROW LEVEL SECURITY;

-- Passageiro pode criar corrida
CREATE POLICY "Passageiro pode criar corrida"
ON public.moto_taxi_corridas
FOR INSERT
WITH CHECK (auth.uid() = passenger_id);

-- Passageiro pode ver suas corridas
CREATE POLICY "Passageiro pode ver suas corridas"
ON public.moto_taxi_corridas
FOR SELECT
USING (auth.uid() = passenger_id);

-- Moto-táxi pode ver corridas searching (para aceitar)
CREATE POLICY "Moto-taxi pode ver corridas disponíveis"
ON public.moto_taxi_corridas
FOR SELECT
USING (status = 'searching' OR auth.uid() = moto_taxi_id);

-- Moto-táxi pode aceitar corrida (UPDATE searching -> accepted)
CREATE POLICY "Moto-taxi pode aceitar corrida"
ON public.moto_taxi_corridas
FOR UPDATE
USING (
  status = 'searching' OR 
  auth.uid() = moto_taxi_id OR 
  auth.uid() = passenger_id
)
WITH CHECK (
  auth.uid() = moto_taxi_id OR 
  auth.uid() = passenger_id
);

-- Admin pode gerenciar tudo
CREATE POLICY "Admin gerencia corridas"
ON public.moto_taxi_corridas
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- RLS POLICIES - MOTO_TAXI_HISTORICO
-- =====================================================
ALTER TABLE public.moto_taxi_historico ENABLE ROW LEVEL SECURITY;

-- Participantes podem ver histórico
CREATE POLICY "Participantes podem ver histórico"
ON public.moto_taxi_historico
FOR SELECT
USING (auth.uid() = passenger_id OR auth.uid() = moto_taxi_id);

-- Sistema pode inserir histórico
CREATE POLICY "Sistema pode inserir histórico"
ON public.moto_taxi_historico
FOR INSERT
WITH CHECK (auth.uid() = passenger_id OR auth.uid() = moto_taxi_id);

-- Admin pode gerenciar histórico
CREATE POLICY "Admin gerencia histórico"
ON public.moto_taxi_historico
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================
CREATE INDEX idx_moto_taxi_corridas_passenger ON public.moto_taxi_corridas(passenger_id);
CREATE INDEX idx_moto_taxi_corridas_moto_taxi ON public.moto_taxi_corridas(moto_taxi_id);
CREATE INDEX idx_moto_taxi_corridas_status ON public.moto_taxi_corridas(status);
CREATE INDEX idx_moto_taxi_corridas_searching ON public.moto_taxi_corridas(status) WHERE status = 'searching';
CREATE INDEX idx_moto_taxi_historico_passenger ON public.moto_taxi_historico(passenger_id);
CREATE INDEX idx_moto_taxi_historico_moto_taxi ON public.moto_taxi_historico(moto_taxi_id);

-- =====================================================
-- HABILITAR REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.moto_taxi_corridas;