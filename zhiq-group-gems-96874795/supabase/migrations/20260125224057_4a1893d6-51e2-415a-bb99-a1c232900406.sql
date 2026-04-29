-- Drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_calculate_commission_before_accept ON public.delivery_orders;

-- Create function that calculates and updates in same transaction
CREATE OR REPLACE FUNCTION public.calculate_and_set_commission_on_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grupos_ativos INTEGER;
  v_percentual NUMERIC;
  v_valor_total NUMERIC;
  v_valor_comissao NUMERIC;
  v_valor_liquido NUMERIC;
BEGIN
  -- Only execute when status changes to 'accepted' and values not yet set
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    
    -- Skip if already calculated (avoid infinite loop)
    IF NEW.percentual_comissao IS NOT NULL THEN
      RETURN NEW;
    END IF;
    
    -- Get motoboy's active groups count
    SELECT COUNT(*) INTO v_grupos_ativos
    FROM public.motoboy_whatsapp_groups
    WHERE user_id = NEW.current_motoboy_id 
      AND status = 'ativo';
    
    -- Get commission percentage from rules table
    SELECT percentual INTO v_percentual
    FROM public.regras_comissao_motoboy
    WHERE v_grupos_ativos >= grupos_min
      AND (v_grupos_ativos <= grupos_max OR grupos_max IS NULL)
    ORDER BY grupos_min DESC
    LIMIT 1;
    
    -- Fallback to 35% if no rule found
    v_percentual := COALESCE(v_percentual, 35);
    
    -- Use estimated_value as valor_total
    v_valor_total := COALESCE(NEW.estimated_value, 0);
    
    -- Calculate commission and net amount
    v_valor_comissao := ROUND(v_valor_total * (v_percentual / 100), 2);
    v_valor_liquido := v_valor_total - v_valor_comissao;
    
    -- Update the record with calculated values (separate UPDATE in AFTER trigger)
    UPDATE public.delivery_orders
    SET 
      grupos_no_momento = v_grupos_ativos,
      percentual_comissao = v_percentual,
      valor_comissao = v_valor_comissao,
      valor_liquido_motoboy = v_valor_liquido,
      valor_total = v_valor_total
    WHERE id = NEW.id;
    
    RAISE NOTICE '[calculate_commission] Motoboy % - Grupos: %, Percentual: %, Valor: %, Comissao: %, Liquido: %',
      NEW.current_motoboy_id, v_grupos_ativos, v_percentual, v_valor_total, v_valor_comissao, v_valor_liquido;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create AFTER UPDATE trigger
CREATE TRIGGER trigger_calculate_commission_after_accept
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  EXECUTE FUNCTION public.calculate_and_set_commission_on_acceptance();