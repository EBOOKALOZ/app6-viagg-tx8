-- Tabela de transações da carteira do motoboy
CREATE TABLE public.motoboy_wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrega', 'estorno', 'bonus', 'saque')),
  valor NUMERIC(10,2) NOT NULL,
  descricao TEXT,
  referencia_id UUID, -- ID da entrega ou ticket relacionado
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_wallet_transactions_user_id ON public.motoboy_wallet_transactions(user_id);
CREATE INDEX idx_wallet_transactions_tipo ON public.motoboy_wallet_transactions(tipo);

-- Enable RLS
ALTER TABLE public.motoboy_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Motoboy pode ver apenas suas próprias transações
CREATE POLICY "Motoboys can view own transactions"
ON public.motoboy_wallet_transactions
FOR SELECT
USING (auth.uid() = user_id);

-- Apenas sistema pode inserir (via admin ou triggers)
CREATE POLICY "System can insert transactions"
ON public.motoboy_wallet_transactions
FOR INSERT
WITH CHECK (true);

-- Função para calcular saldo do motoboy
CREATE OR REPLACE FUNCTION public.get_motoboy_wallet_balance(_user_id uuid)
RETURNS TABLE(saldo_entregas NUMERIC, creditos_bonus INTEGER, total_estornos NUMERIC)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN tipo = 'entrega' THEN valor ELSE 0 END), 0)::NUMERIC as saldo_entregas,
    COALESCE(SUM(CASE WHEN tipo = 'bonus' THEN 1 ELSE 0 END), 0)::INTEGER as creditos_bonus,
    COALESCE(SUM(CASE WHEN tipo = 'estorno' THEN valor ELSE 0 END), 0)::NUMERIC as total_estornos
  FROM public.motoboy_wallet_transactions
  WHERE user_id = _user_id;
END;
$$;

-- Trigger para criar transação quando entrega é concluída
CREATE OR REPLACE FUNCTION public.create_wallet_transaction_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só executa quando status muda para 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    -- Criar transação na carteira do motoboy
    INSERT INTO public.motoboy_wallet_transactions (user_id, tipo, valor, descricao, referencia_id)
    SELECT 
      NEW.current_motoboy_id,
      'entrega',
      dh.valor_liquido,
      'Entrega #' || NEW.delivery_code,
      NEW.id
    FROM public.delivery_history dh
    WHERE dh.delivery_order_id = NEW.id
    AND NEW.current_motoboy_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger na tabela delivery_orders
CREATE TRIGGER on_delivery_completed_wallet
AFTER UPDATE ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.create_wallet_transaction_on_delivery();

-- Enable realtime para transações
ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboy_wallet_transactions;