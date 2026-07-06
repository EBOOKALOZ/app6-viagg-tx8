-- ============================================================
-- LOTE C (Fase 3.3-fix) — idempotência + trava nas RPCs de consumo
--
-- V3: consume_purchase_intention_credit NÃO tinha idempotência —
--     a mesma intenção cobrada 2x debitava 2x. Fix: se já existe
--     lançamento no ledger para (store, intention, reason), retorna
--     idempotente sem cobrar de novo. (grant anon MANTIDO: a intenção
--     pode vir de comprador deslogado; a idempotência é a defesa.)
-- V4: accept_offer_with_credits lia o saldo SEM FOR UPDATE → corrida
--     de duplo-gasto. Fix: adiciona FOR UPDATE na leitura do saldo.
--
-- Corpos idênticos aos de produção, com as 2 mudanças mínimas marcadas.
-- ⚠️ NÃO APLICAR AUTOMATICAMENTE. Idempotente.
-- ============================================================

-- ── V3: consume_purchase_intention_credit (+ idempotência) ──
create or replace function public.consume_purchase_intention_credit(
  p_store_id uuid,
  p_intention_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost     integer;
  v_active   boolean;
  v_avail    integer;
  v_consumed integer;
  v_before   integer;
  v_after    integer;
begin
  -- ★ IDEMPOTÊNCIA (novo): esta intenção já foi cobrada? → não cobra de novo
  if p_intention_id is not null and exists (
    select 1 from public.merchant_credit_ledger
    where store_id = p_store_id
      and purchase_intention_id = p_intention_id
      and reason_code = 'purchase_intention_received'
  ) then
    return jsonb_build_object('charged', false, 'reason', 'already_charged');
  end if;

  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'purchase_intention_received'
  limit 1;

  if v_cost is null then v_cost := 5; end if;
  if v_active is false then
    return jsonb_build_object('charged', false, 'reason', 'charge_disabled');
  end if;

  select available_credits, consumed_credits into v_avail, v_consumed
  from public.merchant_credit_balances
  where store_id = p_store_id
  for update;

  if v_avail is null then
    return jsonb_build_object('charged', false, 'reason', 'balance_not_found');
  end if;

  v_before := v_avail;
  v_after  := greatest(0, v_before - v_cost);

  update public.merchant_credit_balances
     set available_credits = v_after,
         consumed_credits  = coalesce(v_consumed, 0) + (v_before - v_after),
         updated_at = now()
   where store_id = p_store_id;

  insert into public.merchant_credit_ledger
    (store_id, purchase_intention_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata)
  values
    (p_store_id, p_intention_id, 'debit', v_before - v_after, v_before, v_after,
     'purchase_intention_received', 'Intenção de compra recebida — ' || (v_before - v_after) || ' créditos',
     jsonb_build_object('intention_id', p_intention_id));

  return jsonb_build_object('charged', true, 'credits_charged', v_before - v_after, 'balance_after', v_after);
exception
  when others then
    return jsonb_build_object('charged', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.consume_purchase_intention_credit(uuid, uuid) to anon, authenticated;

-- ── V4: accept_offer_with_credits (+ FOR UPDATE) ──
-- Apenas a leitura do saldo (linhas 78-81 do original) ganha FOR UPDATE.
CREATE OR REPLACE FUNCTION public.accept_offer_with_credits(
  p_offer_id uuid,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_offer record;
  v_balance integer;
  v_consumed integer;
  v_new_balance integer;
  v_cost_communication integer;
  v_cost_intention integer;
  v_total_cost integer;
BEGIN
  SELECT COALESCE(credits_cost, 2)::integer INTO v_cost_communication
  FROM public.merchant_credit_usage_rules
  WHERE feature_code = 'offer_accept_contact_unlock' AND is_active = true
  LIMIT 1;
  v_cost_communication := COALESCE(v_cost_communication, 2);

  SELECT COALESCE(credits_cost, 5)::integer INTO v_cost_intention
  FROM public.merchant_credit_usage_rules
  WHERE feature_code = 'purchase_intention_received' AND is_active = true
  LIMIT 1;
  v_cost_intention := COALESCE(v_cost_intention, 5);

  v_total_cost := v_cost_communication + v_cost_intention;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_stores WHERE id = p_store_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_not_owned');
  END IF;

  SELECT ao.id, ao.offer_amount, ao.status, ao.customer_whatsapp,
         ao.customer_name, ao.arremate_listing_id,
         COALESCE(ao.amount_cents, ROUND(ao.offer_amount * 100)) as amount_cents_resolved
  INTO v_offer
  FROM public.arremate_offers ao
  JOIN public.arremate_listings al ON al.id = ao.arremate_listing_id
  WHERE ao.id = p_offer_id
    AND al.store_id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_found');
  END IF;

  IF v_offer.status = 'accepted' THEN
    RETURN jsonb_build_object('success', true, 'already_accepted', true, 'credits_charged', 0);
  END IF;

  -- ★ FOR UPDATE (novo): trava a linha de saldo contra corrida de duplo-gasto
  SELECT available_credits, consumed_credits
  INTO v_balance, v_consumed
  FROM public.merchant_credit_balances
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND OR v_balance < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits',
      'required', v_total_cost, 'available', COALESCE(v_balance, 0));
  END IF;

  v_new_balance := v_balance - v_total_cost;

  UPDATE public.merchant_credit_balances
  SET available_credits = v_new_balance,
      consumed_credits = COALESCE(v_consumed, 0) + v_total_cost,
      updated_at = now()
  WHERE store_id = p_store_id;

  INSERT INTO public.merchant_credit_ledger (
    store_id, entry_type, amount, balance_before, balance_after,
    reason_code, description, metadata
  ) VALUES (
    p_store_id, 'debit', v_cost_communication, v_balance, v_balance - v_cost_communication,
    'offer_accept_communication',
    'Liberação de comunicação — oferta de ' || COALESCE(v_offer.customer_name, 'cliente'),
    jsonb_build_object('offer_id', p_offer_id, 'listing_id', v_offer.arremate_listing_id,
      'component', 'communication', 'offer_amount', v_offer.offer_amount)
  );

  INSERT INTO public.merchant_credit_ledger (
    store_id, entry_type, amount, balance_before, balance_after,
    reason_code, description, metadata
  ) VALUES (
    p_store_id, 'debit', v_cost_intention, v_balance - v_cost_communication, v_new_balance,
    'offer_accept_intention',
    'Envio de intenção de compra — oferta de ' || COALESCE(v_offer.customer_name, 'cliente'),
    jsonb_build_object('offer_id', p_offer_id, 'listing_id', v_offer.arremate_listing_id,
      'component', 'intention', 'offer_amount', v_offer.offer_amount)
  );

  UPDATE public.arremate_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  INSERT INTO public.merchant_credit_contact_unlocks (
    store_id, offer_id, user_id, credits_charged,
    rule_code, offer_value_cents, channel, already_unlocked
  ) VALUES (
    p_store_id, p_offer_id, v_user_id, v_total_cost,
    'offer_accept', COALESCE(v_offer.amount_cents_resolved, 0)::integer, 'whatsapp', false
  )
  ON CONFLICT (store_id, offer_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'already_accepted', false,
    'credits_charged', v_total_cost,
    'communication_credits', v_cost_communication, 'intention_credits', v_cost_intention);
END;
$$;

-- NOTA (abuso residual): idempotência por intenção NÃO impede um agente
-- anônimo de submeter MUITAS intenções distintas p/ drenar o saldo da loja.
-- Mitigação mais forte (rate-limit / exigir intenção válida vinculada a
-- carrinho real) fica como follow-up de negócio — fora deste lote.
