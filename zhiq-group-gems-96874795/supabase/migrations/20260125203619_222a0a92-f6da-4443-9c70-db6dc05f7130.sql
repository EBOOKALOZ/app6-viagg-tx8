-- Criar trigger para liquidar reserva automaticamente quando entrega for finalizada
-- Este trigger converte a transação tipo 'reserva' em 'pagamento_entrega'

CREATE OR REPLACE FUNCTION public.liquidate_merchant_reservation_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só executa quando status muda para 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    
    -- Converter reserva existente em pagamento confirmado
    UPDATE public.merchant_wallet_transactions
    SET 
      tipo = 'pagamento_entrega',
      descricao = 'Pagamento de entrega confirmado - #' || NEW.delivery_code
    WHERE referencia_id = NEW.id 
      AND tipo = 'reserva';
    
    -- Log para debug
    RAISE NOTICE '[liquidate_reservation] Reserva liquidada para entrega %', NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger na tabela delivery_orders
DROP TRIGGER IF EXISTS on_delivery_completed_liquidate ON public.delivery_orders;
CREATE TRIGGER on_delivery_completed_liquidate
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.liquidate_merchant_reservation_on_delivery();