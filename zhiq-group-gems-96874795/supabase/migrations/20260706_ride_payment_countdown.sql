-- ============================================================
-- MÓDULO CHAMADA + ACEITE + CONTADOR DE PAGAMENTO (3 MIN) — parte DB
--
-- Pós-aceite, a corrida entra em waiting_payment e o profissional
-- AGUARDA o pagamento do cliente (contador de 3 min) antes de seguir.
-- Igual para motoboy / moto-táxi / carro (service_type).
--
-- Estados (driver_status):
--   waiting_accept → accepted → waiting_payment → driver_on_the_way
--   → arrived → in_progress → completed
--   (ramos: cancelled, payment_timeout)
-- payment_status: pending | paid | failed | expired
--
-- Realtime: service_orders entra na publicação supabase_realtime com
-- REPLICA IDENTITY FULL, para o app receber aceite/pagamento/timeout
-- sem refresh.
--
-- Aditivo e não-destrutivo: NÃO mexe em status legado nem no despacho.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Campos de estado (idempotente)
-- ------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS driver_status        text,
  ADD COLUMN IF NOT EXISTS payment_status       text,
  ADD COLUMN IF NOT EXISTS payment_deadline     timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at          timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_orders_driver_status_chk') THEN
    ALTER TABLE public.service_orders ADD CONSTRAINT service_orders_driver_status_chk
      CHECK (driver_status IS NULL OR driver_status IN (
        'waiting_accept','accepted','waiting_payment','driver_on_the_way',
        'arrived','in_progress','completed','cancelled','payment_timeout'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_orders_payment_status_chk') THEN
    ALTER TABLE public.service_orders ADD CONSTRAINT service_orders_payment_status_chk
      CHECK (payment_status IS NULL OR payment_status IN ('pending','paid','failed','expired'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Realtime: payload completo em UPDATE + tabela na publicação
-- ------------------------------------------------------------
ALTER TABLE public.service_orders REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Não foi possível adicionar service_orders à publicação supabase_realtime: %', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- 3. set_ride_waiting_payment(order, minutos): chamado logo após o
--    aceite. Entra em waiting_payment + define o prazo. NÃO move dinheiro.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ride_waiting_payment(
  p_order_id uuid,
  p_minutes  int DEFAULT 3
)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.service_orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — requer autenticação' USING ERRCODE = '42501';
  END IF;

  UPDATE public.service_orders
     SET driver_status    = 'waiting_payment',
         payment_status   = COALESCE(NULLIF(payment_status,'paid'), 'pending'),
         accepted_at      = COALESCE(accepted_at, now()),
         payment_deadline = now() + make_interval(mins => GREATEST(p_minutes, 1)),
         updated_at       = now()
   WHERE id = p_order_id
     -- não regride quem já pagou/cancelou/expirou
     AND COALESCE(driver_status,'') NOT IN ('driver_on_the_way','arrived','in_progress','completed','cancelled','payment_timeout')
     AND COALESCE(payment_status,'') <> 'paid'
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.service_orders WHERE id = p_order_id;
  END IF;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.set_ride_waiting_payment(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_ride_waiting_payment(uuid, int) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. confirm_ride_payment(order): SÓ o webhook (service_role) chama.
--    Marca pago e libera o profissional (driver_on_the_way). O crédito
--    do escrow é feito na etapa do webhook (parte financeira) — aqui é
--    só o estado, para o realtime disparar instantaneamente.
--    NÃO exposto a authenticated: o cliente não pode auto-confirmar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_ride_payment(p_order_id uuid)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.service_orders;
BEGIN
  UPDATE public.service_orders
     SET payment_status       = 'paid',
         driver_status        = 'driver_on_the_way',
         payment_confirmed_at = COALESCE(payment_confirmed_at, now()),
         updated_at           = now()
   WHERE id = p_order_id
     AND COALESCE(driver_status,'') NOT IN ('cancelled','completed')
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.service_orders WHERE id = p_order_id;
  END IF;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.confirm_ride_payment(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_ride_payment(uuid) TO service_role;

-- ------------------------------------------------------------
-- 5. expire_ride_payments(): pg_cron (a cada minuto). Marca timeout
--    quem passou do prazo sem pagar e libera o profissional.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_ride_payments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.service_orders
       SET driver_status = 'payment_timeout',
           payment_status = 'expired',
           updated_at = now()
     WHERE driver_status = 'waiting_payment'
       AND COALESCE(payment_status,'') <> 'paid'
       AND payment_deadline IS NOT NULL
       AND payment_deadline < now()
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.expire_ride_payments() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ride_payments() TO service_role;

-- Agenda o expirador (a cada minuto). Guardado: se pg_cron não existir
-- ou o job já existir, não quebra a migration.
DO $$ BEGIN
  PERFORM cron.schedule('expire-ride-payments', '* * * * *', 'SELECT public.expire_ride_payments();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível ou job já agendado (expire-ride-payments): %', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- 6. cancel_ride(order, motivo): cliente OU profissional cancela antes
--    do pagamento. Marca cancelled e encerra o contador (via realtime).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_ride(
  p_order_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ord public.service_orders%ROWTYPE;
  v_is_client boolean;
  v_is_prof   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — requer autenticação' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ord FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_order % não existe', p_order_id USING ERRCODE = '23503';
  END IF;

  v_is_client := v_uid IN (v_ord.merchant_id, v_ord.payer_uid);
  v_is_prof   := v_uid IN (v_ord.courier_id, v_ord.motoboy_id, v_ord.professional_uid);
  IF NOT (v_is_client OR v_is_prof) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar a corrida %', p_order_id USING ERRCODE = '42501';
  END IF;

  -- Já pago não cancela por aqui (vira fluxo de estorno, fora deste módulo).
  IF COALESCE(v_ord.payment_status,'') = 'paid' THEN
    RAISE EXCEPTION 'Corrida já paga — cancelamento exige estorno' USING ERRCODE = '23514';
  END IF;

  -- Só o driver_status (estado do novo módulo). NÃO tocamos no status
  -- legado para não violar constraint/enum antigo nem impactar o despacho.
  UPDATE public.service_orders
     SET driver_status = 'cancelled',
         updated_at    = now()
   WHERE id = p_order_id
   RETURNING * INTO v_ord;

  RETURN v_ord;
END $$;

REVOKE ALL ON FUNCTION public.cancel_ride(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_ride(uuid, text) TO authenticated, service_role;
