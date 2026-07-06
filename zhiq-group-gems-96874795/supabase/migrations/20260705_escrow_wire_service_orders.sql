-- ============================================================
-- LIGAÇÃO FINAL — service_orders → pay_escrow_holds
--
-- A liquidação REAL (tg_service_order_release_payment →
-- release_delivery_payment) paga o motoboy pelo net_value da
-- OFERTA ACEITA e credita a plataforma com gross−net (fallback
-- 80/20 quando a oferta não tem valores). Este arquivo grava,
-- na MESMA condição de disparo (status → delivered), uma linha
-- de auditoria em pay_escrow_holds com números IDÊNTICOS aos
-- da liquidação — alimentando o Resumo Financeiro do admin e o
-- extrato discriminado do motoboy. Não altera nenhuma função
-- existente e não move dinheiro (é espelho contábil).
--
-- PRÉ-REQUISITOS (rodar antes, nesta ordem):
--   1) 20260705_pay_escrow_minimo.sql       (tabela pay_escrow_holds)
--   2) 20260705_comissao_financeiro_admin.sql (RPC do painel)
--
-- Idempotente: idempotency_key = 'so-'||service_order_id
-- (re-execuções e re-disparos não duplicam nada).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Função: registra o escrow-espelho na conclusão
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_escrow_on_service_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professional uuid;
  v_gross numeric(12,2);
  v_net   numeric(12,2);
  v_fee   numeric(12,2);
  v_offer RECORD;
  v_type  text;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN

    v_professional := COALESCE(NEW.courier_id, NEW.motoboy_id, NEW.professional_uid);

    -- MESMA fonte da liquidação: oferta aceita com valores
    SELECT gross_value, net_value INTO v_offer
    FROM public.delivery_offers
    WHERE service_order_id = NEW.id
      AND (v_professional IS NULL OR professional_uid = v_professional)
      AND offer_status = 'accepted'
      AND gross_value IS NOT NULL AND net_value IS NOT NULL
    ORDER BY accepted_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_gross := v_offer.gross_value;
      v_net   := v_offer.net_value;
    ELSE
      -- MESMO fallback da release_delivery_payment (80/20)
      v_gross := COALESCE(NEW.total_price, 0);
      v_net   := round(v_gross * 0.80, 2);
    END IF;

    v_fee := v_gross - v_net;

    IF v_gross <= 0 THEN
      RETURN NEW; -- sem valor, sem registro (constraint exige amount > 0)
    END IF;

    -- Categoria dentro do domínio aceito pela tabela
    v_type := CASE
      WHEN NEW.service_type::text IN ('delivery','ride','mototaxi','freight','credit_purchase')
        THEN NEW.service_type::text
      ELSE 'delivery'
    END;

    INSERT INTO public.pay_escrow_holds (
      idempotency_key, service_type, service_id,
      payer_user_id, professional_user_id,
      amount_cents, platform_fee_cents, professional_amount_cents,
      status, held_at, released_at, metadata
    ) VALUES (
      'so-' || NEW.id::text,
      v_type,
      NEW.id,
      COALESCE(NEW.payer_uid, NEW.customer_uid, NEW.merchant_id),
      v_professional,
      round(v_gross * 100)::int,
      round(v_fee   * 100)::int,
      round(v_net   * 100)::int,
      'released',
      COALESCE(NEW.accepted_at, NEW.created_at, now()),
      now(),
      jsonb_build_object(
        'source', 'record_escrow_on_service_order_delivered',
        'commission_percent', CASE WHEN v_gross > 0 THEN round((v_fee / v_gross) * 100, 2) ELSE NULL END,
        'from_accepted_offer', FOUND
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_escrow_on_delivered ON public.service_orders;
CREATE TRIGGER trg_record_escrow_on_delivered
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_escrow_on_service_order_delivered();

-- ------------------------------------------------------------
-- 2. BACKFILL: as entregas já concluídas entram no histórico
--    (created_at = data da conclusão, p/ os gráficos por dia)
-- ------------------------------------------------------------
INSERT INTO public.pay_escrow_holds (
  idempotency_key, service_type, service_id,
  payer_user_id, professional_user_id,
  amount_cents, platform_fee_cents, professional_amount_cents,
  status, held_at, released_at, created_at, metadata
)
SELECT
  'so-' || so.id::text,
  CASE WHEN so.service_type::text IN ('delivery','ride','mototaxi','freight','credit_purchase')
       THEN so.service_type::text ELSE 'delivery' END,
  so.id,
  COALESCE(so.payer_uid, so.customer_uid, so.merchant_id),
  COALESCE(so.courier_id, so.motoboy_id, so.professional_uid),
  round(COALESCE(o.gross_value, so.total_price, 0) * 100)::int,
  round((COALESCE(o.gross_value, so.total_price, 0)
       - COALESCE(o.net_value, round(COALESCE(so.total_price, 0) * 0.80, 2))) * 100)::int,
  round(COALESCE(o.net_value, round(COALESCE(so.total_price, 0) * 0.80, 2)) * 100)::int,
  'released',
  COALESCE(so.accepted_at, so.created_at),
  COALESCE(so.completed_at, so.updated_at, now()),
  COALESCE(so.completed_at, so.updated_at, so.created_at),
  jsonb_build_object('source', 'backfill_20260705', 'from_accepted_offer', (o.gross_value IS NOT NULL))
FROM public.service_orders so
LEFT JOIN LATERAL (
  SELECT gross_value, net_value
  FROM public.delivery_offers d
  WHERE d.service_order_id = so.id
    AND d.offer_status = 'accepted'
    AND d.gross_value IS NOT NULL AND d.net_value IS NOT NULL
  ORDER BY d.accepted_at DESC NULLS LAST, d.created_at DESC
  LIMIT 1
) o ON true
WHERE so.status = 'delivered'
  AND COALESCE(o.gross_value, so.total_price, 0) > 0
ON CONFLICT (idempotency_key) DO NOTHING;
