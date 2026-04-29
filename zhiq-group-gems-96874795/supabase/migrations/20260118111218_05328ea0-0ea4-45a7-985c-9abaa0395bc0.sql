-- Criar tabela delivery_history para armazenar histórico de entregas
CREATE TABLE public.delivery_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id uuid NOT NULL,
  motoboy_id uuid NOT NULL,
  loja_nome text,
  cliente_nome text,
  cliente_telefone text,
  pickup_location text NOT NULL,
  destination text NOT NULL,
  order_description text,
  valor_bruto numeric(10,2) NOT NULL,
  taxa_plataforma numeric(10,2) NOT NULL,
  valor_liquido numeric(10,2) NOT NULL,
  status text CHECK (status IN ('finalizada', 'cancelada')) NOT NULL,
  finalizada_em timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Criar índices para melhor performance
CREATE INDEX idx_delivery_history_motoboy_id ON public.delivery_history(motoboy_id);
CREATE INDEX idx_delivery_history_delivery_order_id ON public.delivery_history(delivery_order_id);
CREATE INDEX idx_delivery_history_finalizada_em ON public.delivery_history(finalizada_em DESC);

-- Habilitar RLS
ALTER TABLE public.delivery_history ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Motoboys can view their own delivery history"
ON public.delivery_history
FOR SELECT
USING (auth.uid() = motoboy_id);

CREATE POLICY "Motoboys can insert their own delivery history"
ON public.delivery_history
FOR INSERT
WITH CHECK (auth.uid() = motoboy_id);

CREATE POLICY "Admins can manage all delivery history"
ON public.delivery_history
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));