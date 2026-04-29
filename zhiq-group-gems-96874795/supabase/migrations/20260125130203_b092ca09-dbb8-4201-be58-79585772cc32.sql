-- 1. Popular merchant_wallets com saldos calculados das transações existentes
INSERT INTO public.merchant_wallets (merchant_id, saldo_atual, created_at, updated_at)
SELECT 
  user_id as merchant_id,
  COALESCE(SUM(CASE 
    WHEN tipo IN ('recarga', 'estorno', 'ajuste') THEN valor
    WHEN tipo = 'pagamento_entrega' THEN -ABS(valor)
    WHEN tipo = 'reserva' THEN -ABS(valor)
    ELSE 0
  END), 0) as saldo_atual,
  now() as created_at,
  now() as updated_at
FROM public.merchant_wallet_transactions
GROUP BY user_id
ON CONFLICT (merchant_id) DO UPDATE 
SET saldo_atual = EXCLUDED.saldo_atual,
    updated_at = now();

-- 2. Criar função para atualizar saldo automaticamente
CREATE OR REPLACE FUNCTION public.update_merchant_wallet_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta NUMERIC;
BEGIN
  -- Calcular delta baseado no tipo de transação
  CASE NEW.tipo
    WHEN 'recarga' THEN delta := NEW.valor;
    WHEN 'estorno' THEN delta := NEW.valor;
    WHEN 'ajuste' THEN delta := NEW.valor;
    WHEN 'pagamento_entrega' THEN delta := -ABS(NEW.valor);
    WHEN 'reserva' THEN delta := -ABS(NEW.valor);
    ELSE delta := NEW.valor;
  END CASE;

  -- Inserir ou atualizar merchant_wallets
  INSERT INTO public.merchant_wallets (merchant_id, saldo_atual, created_at, updated_at)
  VALUES (NEW.user_id, delta, now(), now())
  ON CONFLICT (merchant_id) DO UPDATE 
  SET saldo_atual = merchant_wallets.saldo_atual + delta,
      updated_at = now();

  RETURN NEW;
END;
$$;

-- 3. Criar trigger na tabela de transações
DROP TRIGGER IF EXISTS trigger_update_merchant_wallet ON public.merchant_wallet_transactions;

CREATE TRIGGER trigger_update_merchant_wallet
AFTER INSERT ON public.merchant_wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_merchant_wallet_balance();