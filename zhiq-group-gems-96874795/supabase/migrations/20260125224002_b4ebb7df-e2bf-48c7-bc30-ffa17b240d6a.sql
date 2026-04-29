-- Drop ALL existing commission triggers to start clean
DROP TRIGGER IF EXISTS trigger_calculate_commission_on_acceptance ON public.delivery_orders;
DROP TRIGGER IF EXISTS calculate_commission_on_acceptance ON public.delivery_orders;

-- Create BEFORE trigger (tgtype should be 23 for BEFORE ROW UPDATE)
CREATE TRIGGER trigger_calculate_commission_before_accept
  BEFORE UPDATE ON public.delivery_orders
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  EXECUTE FUNCTION public.calculate_commission_on_acceptance();