-- ============================================================
-- CANCELOU A ORDEM → OFERTAS PENDENTES CANCELAM JUNTO (2026-07-12)
--
-- Bug provado em experimento transacional: cancel_ride_search
-- cancelava a ordem mas deixava as ofertas 'pending' vivas — os
-- motoboys continuavam tocando para uma corrida que não existia mais.
-- (A RECUSA de um motoboy estava correta: só afeta a própria oferta.)
--
-- Conserto na raiz: trigger no service_orders — QUALQUER caminho que
-- cancele a ordem (botão do cliente, admin, futuro) libera as ofertas
-- pendentes na hora. O realtime + revalidação do app derrubam o toque.
-- Inclui limpeza do legado. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_release_offers_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.delivery_offers
       SET status = 'cancelled', offer_status = 'cancelled', updated_at = now()
     WHERE (service_order_id = NEW.id OR delivery_order_id = NEW.id)
       AND status IN ('pending', 'open');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_release_offers_on_cancel ON public.service_orders;
CREATE TRIGGER trg_release_offers_on_cancel
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_release_offers_on_cancel();

-- Limpeza: ofertas pendentes órfãs de ordens já canceladas/encerradas
UPDATE public.delivery_offers o
   SET status = 'cancelled', offer_status = 'cancelled', updated_at = now()
  FROM public.service_orders so
 WHERE so.id = COALESCE(o.service_order_id, o.delivery_order_id)
   AND o.status IN ('pending', 'open')
   AND so.status::text IN ('canceled', 'delivered');
