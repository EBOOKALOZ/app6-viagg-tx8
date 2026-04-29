-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_delivery_completed_credit_motoboy ON public.delivery_orders;
DROP FUNCTION IF EXISTS public.credit_motoboy_on_delivery_completion();

-- Create function to credit motoboy wallet on delivery completion
CREATE OR REPLACE FUNCTION public.credit_motoboy_on_delivery_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already_credited BOOLEAN;
BEGIN
  -- Only execute when status changes to 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    
    -- Check if motoboy exists
    IF NEW.current_motoboy_id IS NULL THEN
      RAISE NOTICE '[credit_motoboy] No motoboy assigned to delivery %', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Check if already credited (idempotency)
    SELECT EXISTS (
      SELECT 1 FROM public.motoboy_wallet_transactions
      WHERE referencia_id = NEW.id 
        AND tipo = 'credito_entrega'
        AND user_id = NEW.current_motoboy_id
    ) INTO v_already_credited;
    
    IF v_already_credited THEN
      RAISE NOTICE '[credit_motoboy] Delivery % already credited to motoboy %', NEW.id, NEW.current_motoboy_id;
      RETURN NEW;
    END IF;
    
    -- Insert credit transaction using valor_liquido_motoboy from delivery_orders
    INSERT INTO public.motoboy_wallet_transactions (
      user_id, 
      tipo, 
      valor, 
      descricao, 
      referencia_id
    )
    VALUES (
      NEW.current_motoboy_id,
      'credito_entrega',
      COALESCE(NEW.valor_liquido_motoboy, NEW.estimated_value * 0.85), -- Fallback to 85% if not calculated
      'Crédito entrega #' || NEW.delivery_code,
      NEW.id
    );
    
    RAISE NOTICE '[credit_motoboy] Credited R$% to motoboy % for delivery %', 
      COALESCE(NEW.valor_liquido_motoboy, NEW.estimated_value * 0.85), 
      NEW.current_motoboy_id, 
      NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_delivery_completed_credit_motoboy
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.credit_motoboy_on_delivery_completion();