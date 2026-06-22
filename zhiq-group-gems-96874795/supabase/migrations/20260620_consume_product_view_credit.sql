-- ═══════════════════════════════════════════════════════════════════════════
-- Cobrança ao lojista quando um visitante abre a página de um produto
-- específico (CREDIT_COSTS.visitor_product_click = 1cr). Espelha
-- consume_marketplace_product_click (owner-skip, pool advertiser > merchant).
-- Recebe owner_user_id direto (resolve a loja internamente) — a página de
-- produto às vezes só tem o user_id do dono, não o merchant_stores.id.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.product_view_click_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  owner_user_id uuid not null,
  visitor_user_id uuid,
  status text not null,
  credits_charged integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.consume_product_view_credit(
  p_product_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visitor_id    uuid := auth.uid();
  v_store_id      uuid;
  v_advertiser_id uuid;
  v_pool          text;
  v_cost          integer;
  v_active        boolean;
  v_balance       integer;
  v_consumed      integer;
  v_new_balance   integer;
begin
  if p_owner_user_id is null then
    return jsonb_build_object('charged', false, 'reason', 'owner_not_found');
  end if;

  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'visitor_product_click'
  limit 1;

  if v_cost is null then v_cost := 1; end if;
  if v_active is false then
    return jsonb_build_object('charged', false, 'reason', 'charge_disabled');
  end if;

  if v_visitor_id is not null and v_visitor_id = p_owner_user_id then
    insert into public.product_view_click_events (product_id, owner_user_id, visitor_user_id, status, credits_charged)
    values (p_product_id, p_owner_user_id, v_visitor_id, 'owner_skip', 0);
    return jsonb_build_object('charged', false, 'reason', 'owner_self_view');
  end if;

  select id into v_store_id from public.merchant_stores where user_id = p_owner_user_id limit 1;
  select id into v_advertiser_id from public.advertiser_accounts where user_id = p_owner_user_id limit 1;

  if v_advertiser_id is not null then
    select available_credits, coalesce(consumed_credits, 0) into v_balance, v_consumed
    from public.advertiser_credit_balances where advertiser_account_id = v_advertiser_id for update;
    if v_balance is not null and v_balance >= v_cost then
      v_pool := 'advertiser';
    end if;
  end if;

  if v_pool is null and v_store_id is not null then
    select available_credits, coalesce(consumed_credits, 0) into v_balance, v_consumed
    from public.merchant_credit_balances where store_id = v_store_id for update;
    if v_balance is not null and v_balance >= v_cost then
      v_pool := 'merchant';
    end if;
  end if;

  if v_pool is null then
    insert into public.product_view_click_events (product_id, owner_user_id, visitor_user_id, status, credits_charged)
    values (p_product_id, p_owner_user_id, v_visitor_id, 'insufficient_balance', 0);
    return jsonb_build_object('charged', false, 'reason', 'insufficient_balance');
  end if;

  v_new_balance := v_balance - v_cost;

  if v_pool = 'advertiser' then
    update public.advertiser_credit_balances
       set available_credits = v_new_balance, consumed_credits = v_consumed + v_cost, updated_at = now()
     where advertiser_account_id = v_advertiser_id;

    insert into public.advertiser_credit_ledger
      (advertiser_account_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata, source_type)
    values
      (v_advertiser_id, 'debit', v_cost, v_balance, v_new_balance, 'visitor_product_click',
       'Clique em produto — ' || v_cost || ' créditos',
       jsonb_build_object('product_id', p_product_id, 'visitor_user_id', v_visitor_id),
       'consumption');
  else
    update public.merchant_credit_balances
       set available_credits = v_new_balance, consumed_credits = v_consumed + v_cost, updated_at = now()
     where store_id = v_store_id;

    insert into public.merchant_credit_ledger
      (store_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata)
    values
      (v_store_id, 'debit', v_cost, v_balance, v_new_balance, 'visitor_product_click',
       'Clique em produto — ' || v_cost || ' créditos',
       jsonb_build_object('product_id', p_product_id, 'visitor_user_id', v_visitor_id));
  end if;

  insert into public.product_view_click_events (product_id, owner_user_id, visitor_user_id, status, credits_charged)
  values (p_product_id, p_owner_user_id, v_visitor_id, 'charged', v_cost);

  return jsonb_build_object('charged', true, 'credits_charged', v_cost, 'balance_after', v_new_balance, 'pool', v_pool);
exception
  when others then
    return jsonb_build_object('charged', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.consume_product_view_credit(uuid, uuid) to anon, authenticated;

insert into public.merchant_credit_usage_rules (feature_code, feature_name, credits_cost, is_active)
select 'visitor_product_click', 'Clique em produto (visualização)', 1, true
where not exists (
  select 1 from public.merchant_credit_usage_rules where feature_code = 'visitor_product_click'
);
