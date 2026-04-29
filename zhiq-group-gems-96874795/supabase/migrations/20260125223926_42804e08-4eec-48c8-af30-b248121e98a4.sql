-- Primeiro, remover o trigger incorreto (AFTER)
DROP TRIGGER IF EXISTS trigger_calculate_commission_on_acceptance ON public.delivery_orders;

-- Recriar como BEFORE UPDATE para que as modificações no NEW funcionem
CREATE TRIGGER trigger_calculate_commission_on_acceptance
  BEFORE UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_commission_on_acceptance();

-- Também garantir que o trigger de crédito use o valor_liquido_motoboy corretamente
-- Atualizar a função para usar COALESCE mais robusto
CREATE OR REPLACE FUNCTION public.credit_motoboy_on_delivery_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_already_credited BOOLEAN;
  v_valor_liquido NUMERIC;
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
    
    -- Use valor_liquido_motoboy from delivery_orders (calculated at acceptance time)
    -- This is the ONLY source of truth for audit purposes
    v_valor_liquido := NEW.valor_liquido_motoboy;
    
    -- If somehow valor_liquido_motoboy is NULL (legacy data), calculate fallback
    IF v_valor_liquido IS NULL OR v_valor_liquido <= 0 THEN
      v_valor_liquido := COALESCE(NEW.estimated_value, 0) * 0.65; -- 35% commission fallback
      RAISE WARNING '[credit_motoboy] Using fallback calculation for delivery % - valor_liquido was NULL', NEW.id;
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
      v_valor_liquido,
      'Crédito entrega #' || NEW.delivery_code,
      NEW.id
    );
    
    RAISE NOTICE '[credit_motoboy] Credited R$% to motoboy % for delivery %', 
      v_valor_liquido, 
      NEW.current_motoboy_id, 
      NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$function$;