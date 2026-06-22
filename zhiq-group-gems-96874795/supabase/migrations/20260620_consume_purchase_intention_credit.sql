-- ═══════════════════════════════════════════════════════════════════════════
-- Cobrança ao lojista quando recebe uma intenção de compra (CESTA1/finalizar
-- pedido). Substitui a lógica antiga no cliente (useGlobalCart.ts) que
-- debitava 1 crédito fixo direto do navegador, sem trava (race condition) e
-- ignorando o valor real configurado em merchant_credit_usage_rules
-- (feature_code 'purchase_intention_received', já em 5 — bate com
-- CREDIT_COSTS.visitor_checkout).
-- ═══════════════════════════════════════════════════════════════════════════

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
