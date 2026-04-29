
-- Função para liberar entregas quando motoboy fica offline
CREATE OR REPLACE FUNCTION public.release_deliveries_on_offline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só executa se is_online mudou de true para false
  IF OLD.is_online = true AND NEW.is_online = false THEN
    -- Registrar rejeição automática para não retornar ao mesmo motoboy
    INSERT INTO public.delivery_rejections (delivery_id, motoboy_id, rejected_at)
    SELECT id, OLD.user_id, now()
    FROM public.delivery_orders
    WHERE current_motoboy_id = OLD.user_id
      AND status IN ('accepted', 'a_caminho')
    ON CONFLICT DO NOTHING;
    
    -- Liberar entregas ativas deste motoboy
    UPDATE public.delivery_orders
    SET 
      status = 'pending',
      current_motoboy_id = NULL,
      accepted_at = NULL,
      dispatch_sent_at = NULL
    WHERE current_motoboy_id = OLD.user_id
      AND status IN ('accepted', 'a_caminho');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger que dispara quando is_online muda em motoboy_profiles
DROP TRIGGER IF EXISTS trigger_release_deliveries_on_offline ON public.motoboy_profiles;

CREATE TRIGGER trigger_release_deliveries_on_offline
  AFTER UPDATE OF is_online ON public.motoboy_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.release_deliveries_on_offline();

-- Adicionar índice único para evitar duplicatas em delivery_rejections
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_rejections_unique 
ON public.delivery_rejections (delivery_id, motoboy_id);
