-- ============================================
-- TRIGGER 1: Calcular comissão dinâmica na ACEITAÇÃO
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_calculate_commission_on_accept()
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
  -- Só executa quando status muda para 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    
    -- Contar grupos ativos do motoboy
    SELECT COUNT(*) INTO v_grupos_ativos
    FROM public.motoboy_whatsapp_groups
    WHERE user_id = NEW.current_motoboy_id 
      AND status = 'ativo';
    
    -- Buscar percentual da tabela de regras
    -- Regras: 0→35%, 1→28%, 2→20%, 3→15%, 4→11%, 5→8%, 6+→6%
    SELECT percentual INTO v_percentual
    FROM public.regras_comissao_motoboy
    WHERE v_grupos_ativos >= grupos_min
      AND (v_grupos_ativos <= grupos_max OR grupos_max IS NULL)
    ORDER BY grupos_min DESC
    LIMIT 1;
    
    -- Fallback para 35% se não encontrar regra
    v_percentual := COALESCE(v_percentual, 35);
    
    -- Usar estimated_value como valor total
    v_valor_total := COALESCE(NEW.estimated_value, 0);
    
    -- Calcular comissão e valor líquido
    v_valor_comissao := ROUND(v_valor_total * (v_percentual / 100), 2);
    v_valor_liquido := ROUND(v_valor_total - v_valor_comissao, 2);
    
    -- Atualizar campos no registro (BEFORE trigger modifica NEW)
    NEW.grupos_no_momento := v_grupos_ativos;
    NEW.percentual_comissao := v_percentual;
    NEW.valor_comissao := v_valor_comissao;
    NEW.valor_liquido_motoboy := v_valor_liquido;
    NEW.valor_total := v_valor_total;
    
    RAISE NOTICE '[trigger_calculate_commission] Motoboy % - Grupos: %, Percentual: %%%, Valor: R$%, Comissao: R$%, Liquido: R$%',
      NEW.current_motoboy_id, v_grupos_ativos, v_percentual, v_valor_total, v_valor_comissao, v_valor_liquido;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Criar trigger BEFORE UPDATE para calcular comissão
DROP TRIGGER IF EXISTS trigger_calculate_commission_before_accept ON public.delivery_orders;
CREATE TRIGGER trigger_calculate_commission_before_accept
  BEFORE UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_calculate_commission_on_accept();

-- ============================================
-- TRIGGER 2: Creditar motoboy ao FINALIZAR (usar valor_liquido_motoboy salvo)
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_credit_motoboy_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_already_credited BOOLEAN;
  v_valor_liquido NUMERIC;
BEGIN
  -- Só executa quando status muda para 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    
    -- Verificar se motoboy existe
    IF NEW.current_motoboy_id IS NULL THEN
      RAISE NOTICE '[trigger_credit_motoboy] Nenhum motoboy atribuído à entrega %', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Verificar idempotência (evitar crédito duplicado)
    SELECT EXISTS (
      SELECT 1 FROM public.motoboy_wallet_transactions
      WHERE referencia_id = NEW.id 
        AND tipo = 'credito_entrega'
        AND user_id = NEW.current_motoboy_id
    ) INTO v_already_credited;
    
    IF v_already_credited THEN
      RAISE NOTICE '[trigger_credit_motoboy] Entrega % já creditada ao motoboy %', NEW.id, NEW.current_motoboy_id;
      RETURN NEW;
    END IF;
    
    -- CRÍTICO: Usar valor_liquido_motoboy SALVO na aceitação (auditoria)
    v_valor_liquido := NEW.valor_liquido_motoboy;
    
    -- Se valor_liquido_motoboy é NULL (dados legados), calcular fallback
    IF v_valor_liquido IS NULL OR v_valor_liquido <= 0 THEN
      v_valor_liquido := ROUND(COALESCE(NEW.estimated_value, 0) * 0.65, 2); -- 35% comissão fallback
      RAISE WARNING '[trigger_credit_motoboy] FALLBACK para entrega % - valor_liquido_motoboy era NULL, usando 65%% de R$%', 
        NEW.id, NEW.estimated_value;
    END IF;
    
    -- Inserir crédito na carteira do motoboy
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
    
    RAISE NOTICE '[trigger_credit_motoboy] Creditado R$% ao motoboy % pela entrega % (#%)', 
      v_valor_liquido, NEW.current_motoboy_id, NEW.id, NEW.delivery_code;
    
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Criar trigger AFTER UPDATE para creditar motoboy
DROP TRIGGER IF EXISTS trigger_credit_motoboy_after_delivery ON public.delivery_orders;
CREATE TRIGGER trigger_credit_motoboy_after_delivery
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_credit_motoboy_on_completion();

-- ============================================
-- TRIGGER 3: Liquidar reserva do lojista ao finalizar
-- ============================================
DROP TRIGGER IF EXISTS trigger_liquidate_merchant_reservation ON public.delivery_orders;
CREATE TRIGGER trigger_liquidate_merchant_reservation
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.liquidate_merchant_reservation_on_delivery();

-- ============================================
-- TRIGGER 4: Estornar reserva se cancelada
-- ============================================
DROP TRIGGER IF EXISTS trigger_refund_merchant_on_cancel ON public.delivery_orders;
CREATE TRIGGER trigger_refund_merchant_on_cancel
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.refund_merchant_reservation_on_cancel();

-- ============================================
-- TRIGGER 5: Liberar entregas quando motoboy fica offline
-- ============================================
DROP TRIGGER IF EXISTS trigger_release_deliveries_on_offline ON public.motoboy_profiles;
CREATE TRIGGER trigger_release_deliveries_on_offline
  AFTER UPDATE ON public.motoboy_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.release_deliveries_on_offline();