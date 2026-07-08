-- ============================================================
-- CONTADOR/PAGAMENTO — MESMA DINÂMICA NOS 3 PERFIS
--
-- motoboy + moto-táxi vivem em service_orders (já têm os campos do
-- contador). carro/motorista vive em motorista_corridas (tabela
-- SEPARADA) → replicamos os campos e a dinâmica aqui.
--
-- Estratégia uniforme e não-invasiva: um TRIGGER BEFORE UPDATE em cada
-- tabela detecta o ACEITE (profissional atribuído) e põe a corrida em
-- waiting_payment + prazo de 3 min. Assim TODAS as telas/RPCs de aceite
-- (AvailableDeliveries, DeliveryCalls, MotoboyCorridas, useMotoTaxiRides,
-- useDriverCalls…) herdam a dinâmica sem alteração.
--
-- expire_ride_payments passa a cobrir AS DUAS tabelas.
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Campos do contador em motorista_corridas (espelha service_orders)
-- ------------------------------------------------------------
ALTER TABLE public.motorista_corridas
  ADD COLUMN IF NOT EXISTS driver_status        text,
  ADD COLUMN IF NOT EXISTS payment_status       text,
  ADD COLUMN IF NOT EXISTS payment_deadline     timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'motorista_corridas_driver_status_chk') THEN
    ALTER TABLE public.motorista_corridas ADD CONSTRAINT motorista_corridas_driver_status_chk
      CHECK (driver_status IS NULL OR driver_status IN (
        'waiting_accept','accepted','waiting_payment','driver_on_the_way',
        'arrived','in_progress','completed','cancelled','payment_timeout'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'motorista_corridas_payment_status_chk') THEN
    ALTER TABLE public.motorista_corridas ADD CONSTRAINT motorista_corridas_payment_status_chk
      CHECK (payment_status IS NULL OR payment_status IN ('pending','paid','failed','expired'));
  END IF;
END $$;

ALTER TABLE public.motorista_corridas REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'motorista_corridas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.motorista_corridas;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'realtime motorista_corridas: %', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- 2. Trigger p/ service_orders (motoboy + moto-táxi)
--    profissional = motoboy_id / courier_id / professional_uid
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_waiting_payment_service_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.courier_id, NEW.motoboy_id, NEW.professional_uid) IS NOT NULL
     AND COALESCE(OLD.courier_id, OLD.motoboy_id, OLD.professional_uid) IS NULL
     AND COALESCE(NEW.driver_status,'') NOT IN
         ('waiting_payment','driver_on_the_way','arrived','in_progress','completed','cancelled','payment_timeout')
     AND COALESCE(NEW.payment_status,'') <> 'paid'
  THEN
    NEW.driver_status    := 'waiting_payment';
    NEW.payment_status   := COALESCE(NEW.payment_status, 'pending');
    NEW.accepted_at      := COALESCE(NEW.accepted_at, now());
    NEW.payment_deadline := now() + interval '3 minutes';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_waiting_payment_service_orders ON public.service_orders;
CREATE TRIGGER trg_waiting_payment_service_orders
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_waiting_payment_service_orders();

-- ------------------------------------------------------------
-- 3. Trigger p/ motorista_corridas (carro) — profissional = motorista_id
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_waiting_payment_motorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.motorista_id IS NOT NULL
     AND OLD.motorista_id IS NULL
     AND COALESCE(NEW.driver_status,'') NOT IN
         ('waiting_payment','driver_on_the_way','arrived','in_progress','completed','cancelled','payment_timeout')
     AND COALESCE(NEW.payment_status,'') <> 'paid'
  THEN
    NEW.driver_status    := 'waiting_payment';
    NEW.payment_status   := COALESCE(NEW.payment_status, 'pending');
    NEW.accepted_at      := COALESCE(NEW.accepted_at, now());
    NEW.payment_deadline := now() + interval '3 minutes';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_waiting_payment_motorista ON public.motorista_corridas;
CREATE TRIGGER trg_waiting_payment_motorista
  BEFORE UPDATE ON public.motorista_corridas
  FOR EACH ROW EXECUTE FUNCTION public.tg_waiting_payment_motorista();

-- ------------------------------------------------------------
-- 4. expire_ride_payments(): agora cobre AS DUAS tabelas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_ride_payments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_n     integer;
BEGIN
  WITH upd AS (
    UPDATE public.service_orders
       SET driver_status = 'payment_timeout', payment_status = 'expired', updated_at = now()
     WHERE driver_status = 'waiting_payment'
       AND COALESCE(payment_status,'') <> 'paid'
       AND payment_deadline IS NOT NULL AND payment_deadline < now()
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM upd;
  v_count := v_count + COALESCE(v_n, 0);

  WITH upd2 AS (
    UPDATE public.motorista_corridas
       SET driver_status = 'payment_timeout', payment_status = 'expired'
     WHERE driver_status = 'waiting_payment'
       AND COALESCE(payment_status,'') <> 'paid'
       AND payment_deadline IS NOT NULL AND payment_deadline < now()
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM upd2;
  v_count := v_count + COALESCE(v_n, 0);

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.expire_ride_payments() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ride_payments() TO service_role;
