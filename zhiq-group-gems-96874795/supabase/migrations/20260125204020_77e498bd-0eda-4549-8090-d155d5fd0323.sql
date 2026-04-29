-- Criar trigger para estornar reserva automaticamente quando entrega for cancelada ou expirada
-- Este trigger cria uma transação de estorno para devolver o valor ao lojista

CREATE OR REPLACE FUNCTION public.refund_merchant_reservation_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reserved_amount NUMERIC;
  v_merchant_id UUID;
BEGIN
  -- Só executa quando status muda para 'cancelled', 'expired' ou 'reserva' (expiração de oferta)
  IF NEW.status IN ('cancelled', 'expired', 'reserva') 
     AND OLD.status NOT IN ('cancelled', 'expired', 'delivered') THEN
    
    -- Buscar transação de reserva existente
    SELECT user_id, ABS(valor) INTO v_merchant_id, v_reserved_amount
    FROM public.merchant_wallet_transactions
    WHERE referencia_id = NEW.id 
      AND tipo = 'reserva'
    LIMIT 1;
    
    -- Se existe reserva, criar estorno
    IF v_reserved_amount IS NOT NULL AND v_reserved_amount > 0 THEN
      -- Inserir transação de estorno (valor positivo para devolver ao saldo)
      INSERT INTO public.merchant_wallet_transactions (user_id, tipo, valor, descricao, referencia_id)
      VALUES (
        v_merchant_id,
        'estorno',
        v_reserved_amount,
        'Estorno por cancelamento/expiração - #' || COALESCE(NEW.delivery_code, NEW.id::text),
        NEW.id
      );
      
      -- Marcar reserva original como cancelada (manter histórico)
      UPDATE public.merchant_wallet_transactions
      SET descricao = 'Reserva cancelada - valor estornado'
      WHERE referencia_id = NEW.id 
        AND tipo = 'reserva';
      
      RAISE NOTICE '[refund_reservation] Estorno de R$% para merchant % (entrega %)', v_reserved_amount, v_merchant_id, NEW.id;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger na tabela delivery_orders
DROP TRIGGER IF EXISTS on_delivery_cancelled_refund ON public.delivery_orders;
CREATE TRIGGER on_delivery_cancelled_refund
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.refund_merchant_reservation_on_cancel();