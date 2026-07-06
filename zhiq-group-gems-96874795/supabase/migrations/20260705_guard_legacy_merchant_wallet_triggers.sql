-- ============================================================
-- FIX — triggers legadas de reserva do lojista (delivery_orders)
-- tolerantes à ausência de merchant_wallet_transactions.
--
-- Contexto (auditoria 07-05):
--   BLOCO C apontou 2 triggers referenciando merchant_wallet_transactions
--   (tabela que NÃO existe neste banco):
--     · liquidate_merchant_reservation_on_delivery
--     · refund_merchant_reservation_on_cancel
--   São triggers em delivery_orders — tabela VAZIA/dormente (o fluxo vivo
--   é service_orders + pay_*). Hoje não disparam; mas se delivery_orders
--   receber uma linha, quebrariam com 42P01.
--
--   Corpos idênticos ao repo (sem drift) — preservados 100%; apenas
--   adicionada UMA guarda no topo: se a tabela legada não existir,
--   a trigger vira no-op (RETURN NEW), sem erro. Quando/se a tabela
--   voltar, o comportamento original é integral.
--
-- Não altera contrato: mesmo nome, mesmo RETURNS TRIGGER, mesmos triggers.
-- Rodar no SQL Editor (broifhfqmnzqoongtokm). Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Liquidação da reserva na conclusão da entrega
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liquidate_merchant_reservation_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Guarda: tabela legada ausente → nada a liquidar (fluxo vivo usa pay_*)
  IF to_regclass('public.merchant_wallet_transactions') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só executa quando status muda para 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN

    -- Converter reserva existente em pagamento confirmado
    UPDATE public.merchant_wallet_transactions
    SET
      tipo = 'pagamento_entrega',
      descricao = 'Pagamento de entrega confirmado - #' || NEW.delivery_code
    WHERE referencia_id = NEW.id
      AND tipo = 'reserva';

    RAISE NOTICE '[liquidate_reservation] Reserva liquidada para entrega %', NEW.id;

  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Estorno da reserva no cancelamento/expiração
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_merchant_reservation_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reserved_amount NUMERIC;
  v_merchant_id UUID;
BEGIN
  -- Guarda: tabela legada ausente → nada a estornar (fluxo vivo usa pay_*)
  IF to_regclass('public.merchant_wallet_transactions') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só executa quando status muda para 'cancelled', 'expired' ou 'reserva'
  IF NEW.status IN ('cancelled', 'expired', 'reserva')
     AND OLD.status NOT IN ('cancelled', 'expired', 'delivered') THEN

    -- Buscar transação de reserva existente
    SELECT user_id, ABS(valor) INTO v_merchant_id, v_reserved_amount
    FROM public.merchant_wallet_transactions
    WHERE referencia_id = NEW.id
      AND tipo = 'reserva'
    LIMIT 1;

    -- Se existe reserva, criar estorno
    IF v_reserved_amount IS NOT NULL AND v_reserved_amount > 0 THEN
      INSERT INTO public.merchant_wallet_transactions (user_id, tipo, valor, descricao, referencia_id)
      VALUES (
        v_merchant_id,
        'estorno',
        v_reserved_amount,
        'Estorno por cancelamento/expiração - #' || COALESCE(NEW.delivery_code, NEW.id::text),
        NEW.id
      );

      UPDATE public.merchant_wallet_transactions
      SET descricao = 'Reserva cancelada - valor estornado'
      WHERE referencia_id = NEW.id
        AND tipo = 'reserva';

      RAISE NOTICE '[refund_reservation] Estorno de R$% para merchant % (entrega %)', v_reserved_amount, v_merchant_id, NEW.id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
