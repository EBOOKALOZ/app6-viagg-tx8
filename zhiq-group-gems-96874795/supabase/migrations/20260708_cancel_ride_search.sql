-- ============================================================
-- CANCELAR CHAMADA DURANTE A BUSCA — RPC atômica (3 perfis)
-- 2026-07-08
--
-- O cliente pode cancelar a solicitação ENQUANTO procura profissional
-- (motoboy / moto-táxi / motorista). Regras:
--
--   • ATÔMICO: um UPDATE condicional decide o vencedor da corrida
--     cancelar × aceitar — só cancela se NENHUM profissional foi
--     atribuído E o status ainda é "de busca". Se o aceite chegou
--     primeiro, retorna {cancelled:false, reason:'accepted'} e o
--     cliente segue para o card do profissional. Nunca os dois estados.
--   • SEM financeiro: nenhuma cobrança/comissão/débito/crédito — o
--     modelo é pós-pago e o escrow só entra no aceite (que aqui não
--     aconteceu). Nenhuma tabela pay_* é tocada.
--   • LIBERA profissionais: ofertas pendentes em delivery_offers viram
--     'expired' (motoboy). Moto-táxi/carro escutam por status → o
--     'cancelada' remove a chamada dos painéis.
--   • STATUS: usa o vocabulário canônico de CADA tabela (CHECKs/enum vivos):
--     service_orders → 'canceled' (enum service_order_status, um L)
--     · moto_taxi_corridas/motorista_corridas
--     → 'cancelada' (+ canceled_by='passenger' onde a coluna existe).
--     O fato "cancelado PELO USUÁRIO" fica no canceled_by e na auditoria
--     (system_events_log: 'ride_search_cancelled_by_user') — não criamos
--     valor novo de status para não quebrar os CHECKs/painéis.
--   • AUDITORIA: request_id, usuário, serviço, tempo de busca (s),
--     ofertas consultadas, motivo, status final, data/hora.
--
-- NÃO altera: despacho, motor de ofertas, IA, regras financeiras.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_ride_search(
  p_order_id  uuid,
  p_service   text DEFAULT 'delivery'   -- 'delivery' | 'mototaxi' | 'ride' | 'freight'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_n          integer := 0;
  v_offers     integer := 0;
  v_created    timestamptz;
  v_assigned   boolean := false;
  v_final      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;

  -- ── MOTO-TÁXI ────────────────────────────────────────────
  IF p_service = 'mototaxi' THEN
    UPDATE public.moto_taxi_corridas
       SET status = 'cancelada',
           canceled_at = now(),
           canceled_by = 'passenger'
     WHERE id = p_order_id
       AND passenger_id = v_uid          -- só o dono cancela
       AND moto_taxi_id IS NULL          -- ninguém aceitou (árbitro atômico)
       AND status = 'pesquisando'
     RETURNING created_at INTO v_created;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_final := 'cancelada';
    IF v_n = 0 THEN
      SELECT (moto_taxi_id IS NOT NULL) INTO v_assigned
        FROM public.moto_taxi_corridas WHERE id = p_order_id AND passenger_id = v_uid;
    END IF;

  -- ── CARRO / MOTORISTA ────────────────────────────────────
  ELSIF p_service = 'ride' THEN
    UPDATE public.motorista_corridas
       SET status = 'cancelada'
     WHERE id = p_order_id
       AND passenger_id = v_uid
       AND motorista_id IS NULL
       AND status IN ('pendente','reserva')
     RETURNING created_at INTO v_created;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_final := 'cancelada';
    IF v_n = 0 THEN
      SELECT (motorista_id IS NOT NULL) INTO v_assigned
        FROM public.motorista_corridas WHERE id = p_order_id AND passenger_id = v_uid;
    END IF;

  -- ── MOTOBOY / ENTREGA / FRETE (service_orders) ───────────
  -- status é ENUM service_order_status → comparar via ::text para não
  -- explodir com literais que não existam no enum (ex.: 'aguardando').
  ELSE
    UPDATE public.service_orders
       SET status = 'canceled',   -- valor REAL do enum (um L só — conferido no banco)
           updated_at = now()
     WHERE id = p_order_id
       AND (merchant_id = v_uid OR payer_uid = v_uid)
       AND motoboy_id IS NULL AND courier_id IS NULL AND professional_uid IS NULL
       AND status::text IN ('awaiting_professional','searching','aguardando','waiting_acceptance')
     RETURNING created_at INTO v_created;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_final := 'canceled';

    IF v_n = 1 THEN
      -- Libera os profissionais: ofertas pendentes deixam de valer.
      -- (colunas reais da delivery_offers: delivery_order_id / service_order_id)
      UPDATE public.delivery_offers
         SET status = 'expired'
       WHERE (delivery_order_id = p_order_id OR service_order_id = p_order_id)
         AND status = 'pending';
      GET DIAGNOSTICS v_offers = ROW_COUNT;
    ELSE
      SELECT (COALESCE(motoboy_id, courier_id, professional_uid) IS NOT NULL) INTO v_assigned
        FROM public.service_orders
       WHERE id = p_order_id AND (merchant_id = v_uid OR payer_uid = v_uid);
    END IF;
  END IF;

  -- ── Corrida perdida para o aceite (ou já finalizada/inexistente) ──
  IF v_n = 0 THEN
    RETURN jsonb_build_object(
      'cancelled', false,
      'reason', CASE WHEN COALESCE(v_assigned,false) THEN 'accepted' ELSE 'not_cancellable' END
    );
  END IF;

  -- ── Auditoria (best-effort, nunca derruba o cancelamento) ─
  BEGIN
    INSERT INTO public.system_events_log (event_type, event_data) VALUES (
      'ride_search_cancelled_by_user',
      jsonb_build_object(
        'request_id', p_order_id,
        'user_id', v_uid,
        'service_type', p_service,
        'search_seconds', GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(v_created, now())))::int),
        'offers_released', v_offers,
        'reason', 'cancelled_by_user',
        'final_status', v_final,
        'at', now()
      ));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'cancelled', true,
    'final_status', v_final,
    'offers_released', v_offers
  );
END $$;

REVOKE ALL ON FUNCTION public.cancel_ride_search(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_ride_search(uuid, text) TO authenticated, service_role;
