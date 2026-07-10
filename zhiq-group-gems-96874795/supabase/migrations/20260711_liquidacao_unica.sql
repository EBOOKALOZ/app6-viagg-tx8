-- ============================================================
-- LIQUIDAÇÃO ÚNICA DA CORRIDA — fim do pagamento em dobro (2026-07-11)
--
-- BUG (achado na auditoria do extrato): DOIS liquidadores rodavam em
-- paralelo a cada entrega:
--   • o front, na confirmação do código, chama pay_release_ride_payment
--     → lançamentos 'ride_release:*' (motor oficial, comissão fonte única);
--   • o trigger service_order_release_payment (status='delivered') chama
--     release_delivery_payment → lançamentos 'delivery_complete:*'.
-- Resultado: motoboy recebia 2× o líquido, plataforma 2× a comissão e o
-- platform_escrow ficava NEGATIVO 1× o valor da corrida por entrega.
-- Provas: ordens 237c0450 e 815c9c83 (6,82 + 6,82 cada; escrow −9,09).
--
-- CONSERTO (canônico):
--  1. release_delivery_payment vira um DELEGADOR do motor oficial —
--     pay_release_ride_payment é idempotente ('ride_release:'||order),
--     então tanto faz quem liquida primeiro (front ou trigger): o
--     segundo é no-op. UMA liquidação, garantida no servidor.
--  2. Estorno dos 2 duplicados: reverte APENAS os lançamentos
--     'delivery_complete' (o extra), devolvendo o valor ao escrow.
--     Idempotente por 'fix_double:'||order.
--
-- Fallback 80/20 do caminho antigo morre junto (o motor oficial usa o
-- líquido da OFERTA / official_motoboy_commission). Idempotente.
-- ============================================================

-- ── 1. Caminho antigo passa a delegar ao motor oficial ────────────
CREATE OR REPLACE FUNCTION public.release_delivery_payment(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- LIQUIDAÇÃO ÚNICA: delega ao motor oficial, idempotente por
  -- 'ride_release:'||order_id. O corpo antigo postava uma SEGUNDA
  -- transação ('delivery_complete') e pagava a corrida em dobro.
  PERFORM public.pay_release_ride_payment(p_delivery_id);
END $$;

-- ── 2. Estorno dos duplicados já ocorridos ─────────────────────────
DO $$
DECLARE
  v_order   uuid;
  v_escrow  uuid;
  v_main    uuid;
  v_wallet  uuid;
  v_net     numeric;
  v_fee     numeric;
BEGIN
  SELECT id INTO v_escrow FROM public.pay_financial_accounts
   WHERE owner_type='platform' AND account_type='platform_escrow' LIMIT 1;
  SELECT id INTO v_main FROM public.pay_financial_accounts
   WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1;

  FOR v_order IN
    SELECT DISTINCT split_part(e.idempotency_key, ':', 2)::uuid
      FROM public.pay_ledger_entries e
     WHERE e.idempotency_key LIKE 'delivery_complete:%'
       AND EXISTS (SELECT 1 FROM public.pay_ledger_entries r
                    WHERE r.idempotency_key =
                          'ride_release:' || split_part(e.idempotency_key, ':', 2) || ':2')
  LOOP
    -- Valores exatos do lançamento duplicado (não recalcula nada)
    SELECT e.amount, e.account_id INTO v_net, v_wallet
      FROM public.pay_ledger_entries e
      JOIN public.pay_financial_accounts a ON a.id = e.account_id
     WHERE e.idempotency_key = 'delivery_complete:' || v_order || ':2'
       AND a.account_type = 'motoboy_wallet';
    SELECT e.amount INTO v_fee
      FROM public.pay_ledger_entries e
     WHERE e.idempotency_key = 'delivery_complete:' || v_order || ':3';

    IF v_net IS NULL OR v_wallet IS NULL THEN
      RAISE NOTICE 'fix_double %: lançamento duplicado não encontrado, skip', v_order;
      CONTINUE;
    END IF;

    PERFORM public.pay_post_transaction(
      'fix_double_release',
      'fix_double:' || v_order::text,
      jsonb_build_array(
        jsonb_build_object(
          'account_id', v_wallet, 'direction', 'debit', 'entry_type', 'payment_out',
          'amount', v_net, 'reference_type', 'service_order', 'reference_id', v_order,
          'description', 'Estorno de liquidação duplicada (delivery_complete)'
        ),
        jsonb_build_object(
          'account_id', v_main, 'direction', 'debit', 'entry_type', 'payment_out',
          'amount', COALESCE(v_fee, 0), 'reference_type', 'service_order', 'reference_id', v_order,
          'description', 'Estorno de comissão duplicada (delivery_complete)'
        ),
        jsonb_build_object(
          'account_id', v_escrow, 'direction', 'credit', 'entry_type', 'payment_in',
          'amount', v_net + COALESCE(v_fee, 0), 'reference_type', 'service_order', 'reference_id', v_order,
          'description', 'Retorno ao escrow — liquidação duplicada estornada'
        )
      ),
      'service_order', v_order,
      jsonb_build_object('kind', 'fix_double_release')
    );
    RAISE NOTICE 'fix_double %: estornado % + % de volta ao escrow', v_order, v_net, v_fee;
  END LOOP;
END $$;
