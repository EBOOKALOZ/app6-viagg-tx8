-- ============================================================
-- CONTADOR/PAGAMENTO na moto_taxi_corridas (completa os 3 perfis)
-- 2026-07-08
--
-- O contador (20260706_ride_countdown_3_profiles) cobriu service_orders
-- (motoboy) e motorista_corridas (carro). Agora que a chamada de moto-táxi
-- do cliente é roteada para moto_taxi_corridas (20260708_dispatch_by_service_type),
-- replicamos aqui a MESMA dinâmica nessa tabela:
--
--   • campos driver_status / payment_status / payment_deadline / payment_confirmed_at
--   • trigger BEFORE UPDATE que, no ACEITE (moto_taxi_id atribuído), põe a
--     corrida em waiting_payment + prazo de 3 min
--   • expire_ride_payments passa a cobrir AS TRÊS tabelas
--
-- driver_status é coluna SEPARADA do status pt já existente
-- ('pesquisando'/'aceita'/...), então não conflita com o CHECK daquela coluna.
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Campos do contador em moto_taxi_corridas (espelha service_orders)
-- ------------------------------------------------------------
ALTER TABLE public.moto_taxi_corridas
  ADD COLUMN IF NOT EXISTS driver_status        text,
  ADD COLUMN IF NOT EXISTS payment_status       text,
  ADD COLUMN IF NOT EXISTS payment_deadline     timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'moto_taxi_corridas_driver_status_chk') THEN
    ALTER TABLE public.moto_taxi_corridas ADD CONSTRAINT moto_taxi_corridas_driver_status_chk
      CHECK (driver_status IS NULL OR driver_status IN (
        'waiting_accept','accepted','waiting_payment','driver_on_the_way',
        'arrived','in_progress','completed','cancelled','payment_timeout'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'moto_taxi_corridas_payment_status_chk') THEN
    ALTER TABLE public.moto_taxi_corridas ADD CONSTRAINT moto_taxi_corridas_payment_status_chk
      CHECK (payment_status IS NULL OR payment_status IN ('pending','paid','failed','expired'));
  END IF;
END $$;

ALTER TABLE public.moto_taxi_corridas REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'moto_taxi_corridas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.moto_taxi_corridas;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'realtime moto_taxi_corridas: %', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- 2. Trigger p/ moto_taxi_corridas — profissional = moto_taxi_id
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_waiting_payment_mototaxi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.moto_taxi_id IS NOT NULL
     AND OLD.moto_taxi_id IS NULL
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

DROP TRIGGER IF EXISTS trg_waiting_payment_mototaxi ON public.moto_taxi_corridas;
CREATE TRIGGER trg_waiting_payment_mototaxi
  BEFORE UPDATE ON public.moto_taxi_corridas
  FOR EACH ROW EXECUTE FUNCTION public.tg_waiting_payment_mototaxi();

-- ------------------------------------------------------------
-- 3. expire_ride_payments(): agora cobre AS TRÊS tabelas
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

  WITH upd3 AS (
    UPDATE public.moto_taxi_corridas
       SET driver_status = 'payment_timeout', payment_status = 'expired'
     WHERE driver_status = 'waiting_payment'
       AND COALESCE(payment_status,'') <> 'paid'
       AND payment_deadline IS NOT NULL AND payment_deadline < now()
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM upd3;
  v_count := v_count + COALESCE(v_n, 0);

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.expire_ride_payments() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ride_payments() TO service_role;
