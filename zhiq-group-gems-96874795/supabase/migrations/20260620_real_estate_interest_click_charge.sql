-- ═══════════════════════════════════════════════════════════════════════════
-- Cobrança por clique no botão INTERESSE de imóvel (9 cr, igual veículos).
-- Espelha charge_vehicle_interest_click: sempre cobra, sem exceção pro dono e
-- sem dedup — substitui a função antiga/órfã rpc_register_property_click
-- (p_amount fixo de 5, não usava merchant_credit_usage_rules).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.charge_real_estate_interest_click(
  p_listing_id uuid,
  p_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_cost    integer;
  v_active  boolean;
  v_avail   integer;
  v_consumed integer;
  v_before  integer;
  v_after   integer;
begin
  select owner_user_id into v_owner
  from public.real_estate_listings where id = p_listing_id;

  if v_owner is null then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'listing_not_found');
  end if;

  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'real_estate_interest_click'
  limit 1;

  if v_cost is null then v_cost := 9; end if;
  if v_active is false then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'charge_disabled');
  end if;

  insert into public.real_estate_credit_balances (owner_user_id)
  values (v_owner) on conflict (owner_user_id) do nothing;

  select available_credits, consumed_credits into v_avail, v_consumed
  from public.real_estate_credit_balances
  where owner_user_id = v_owner
  for update;

  v_before := coalesce(v_avail, 0);
  v_after  := v_before - v_cost;

  update public.real_estate_credit_balances
     set available_credits = v_after,
         consumed_credits  = coalesce(v_consumed, 0) + v_cost
   where owner_user_id = v_owner;

  insert into public.real_estate_credit_ledger
    (owner_user_id, entry_type, amount, balance_before, balance_after, listing_id, metadata)
  values
    (v_owner, 'adjustment', v_cost, v_before, v_after, p_listing_id,
     jsonb_build_object('event', 'interest_click', 'fingerprint', p_fingerprint));

  return jsonb_build_object(
    'success', true, 'charged', true, 'credits_charged', v_cost,
    'balance_after', v_after, 'debt', greatest(0, -v_after)
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.charge_real_estate_interest_click(uuid, text) to anon, authenticated;
