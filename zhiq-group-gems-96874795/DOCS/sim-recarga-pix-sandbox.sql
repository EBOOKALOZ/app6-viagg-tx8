-- ════════════════════════════════════════════════════════════════════════
-- SANDBOX — simular PAGAMENTO da recarga PIX (credita a customer_wallet)
--
-- O PIX de sandbox não pode ser pago de verdade → a ordem fica em
-- 'waiting_payment'. Este script aplica o evento 'charge.paid' pela MESMA RPC
-- que o webhook do Mercado Pago usa (pay_webhook_apply_event) → transiciona a
-- ordem p/ 'paid' e credita o saldo, exatamente como em produção.
--
-- SÓ PARA SANDBOX/TESTE. SQL Editor (broifhfqmnzqoongtokm).
-- Troque o UUID abaixo se o usuário do teste for outro.
-- ════════════════════════════════════════════════════════════════════════

-- ─── PASSO 1: ver as ordens de recarga recentes do usuário ───────────────
SELECT id, status, amount, provider_name, provider_payment_id, created_at
  FROM public.pay_payment_orders
 WHERE payer_owner_type = 'customer'
   AND payer_owner_id = 'a9bac866-82c1-459f-b066-25fd8032895b'
 ORDER BY created_at DESC
 LIMIT 5;


-- ─── PASSO 2: aplicar 'charge.paid' na última ordem waiting_payment ──────
DO $$
DECLARE
  v_order  public.pay_payment_orders;
  v_result jsonb;
BEGIN
  SELECT * INTO v_order
    FROM public.pay_payment_orders
   WHERE payer_owner_type = 'customer'
     AND payer_owner_id = 'a9bac866-82c1-459f-b066-25fd8032895b'
     AND provider_name = 'mercadopago'
     AND provider_payment_id IS NOT NULL
     AND status = 'waiting_payment'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_order.id IS NULL THEN
    RAISE NOTICE 'Nenhuma ordem waiting_payment (com provider_payment_id) para esse usuário. Gere um PIX novo e rode de novo.';
    RETURN;
  END IF;

  SELECT public.pay_webhook_apply_event(
    p_provider_name       => 'mercadopago',
    p_provider_payment_id => v_order.provider_payment_id,
    p_provider_event_id   => 'sandbox-sim:' || v_order.provider_payment_id,
    p_event_type          => 'charge.paid',
    p_raw_payload         => jsonb_build_object('id', v_order.provider_payment_id,
                                                'status', 'approved',
                                                'source', 'sandbox_manual_sim'),
    p_normalized_payload  => jsonb_build_object('status', 'approved',
                                                'event_type', 'charge.paid')
  ) INTO v_result;

  RAISE NOTICE 'Ordem %  →  apply_event = %', v_order.id, v_result;
END $$;


-- ─── PASSO 3: conferir o saldo creditado ─────────────────────────────────
SELECT owner_type, account_type, available_balance, current_balance, updated_at
  FROM public.pay_financial_accounts
 WHERE owner_id = 'a9bac866-82c1-459f-b066-25fd8032895b'
   AND account_type = 'customer_wallet';
