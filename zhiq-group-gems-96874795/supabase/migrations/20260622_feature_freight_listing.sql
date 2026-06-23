-- ═══════════════════════════════════════════════════════════════════════════
-- RPC feature_freight_listing — "Destacar anúncio" (item exclusivo de Fretes,
-- sem equivalente em Serviços/Veículos/Imóveis ainda).
--
-- Debita freight_credit_balances (feature_code 'freight_listing_feature',
-- default 15cr) e marca o anúncio com is_featured=true + featured_until =
-- now()+7 dias. PublicFreightHome ordena por is_featured desc.
--
-- Segurança: SECURITY DEFINER + só o DONO do anúncio pode destacar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.feature_freight_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_cost     integer;
  v_active   boolean;
  v_avail    integer;
  v_consumed integer;
  v_before   integer;
  v_after    integer;
  v_until    timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select owner_user_id into v_owner from public.freight_listings where id = p_listing_id;
  if v_owner is null then
    return jsonb_build_object('success', false, 'error', 'listing_not_found');
  end if;
  if v_owner <> v_uid then
    return jsonb_build_object('success', false, 'error', 'not_owner');
  end if;

  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'freight_listing_feature'
  limit 1;
  if v_cost is null then v_cost := 15; end if;
  if v_active is false then v_cost := 0; end if;

  insert into public.freight_credit_balances (owner_user_id)
  values (v_uid) on conflict (owner_user_id) do nothing;

  select available_credits, consumed_credits into v_avail, v_consumed
  from public.freight_credit_balances where owner_user_id = v_uid for update;

  if v_cost > 0 and coalesce(v_avail, 0) < v_cost then
    return jsonb_build_object(
      'success', false, 'error', 'insufficient_credits', 'buy_credits_cta', true,
      'required', v_cost, 'available', coalesce(v_avail, 0)
    );
  end if;

  v_before := coalesce(v_avail, 0);
  v_after  := v_before - v_cost;
  v_until  := now() + interval '7 days';

  if v_cost > 0 then
    update public.freight_credit_balances
       set available_credits = v_after,
           consumed_credits  = coalesce(v_consumed, 0) + v_cost,
           updated_at = now()
     where owner_user_id = v_uid;

    insert into public.freight_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after, listing_id, metadata)
    values
      (v_uid, 'debit_unlock', v_cost, v_before, v_after, p_listing_id,
       jsonb_build_object('event', 'feature_listing'));
  end if;

  update public.freight_listings
     set is_featured = true,
         featured_until = v_until
   where id = p_listing_id;

  return jsonb_build_object(
    'success', true, 'credits_charged', v_cost, 'balance_after', v_after,
    'featured_until', v_until
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.feature_freight_listing(uuid) to authenticated;

insert into public.merchant_credit_usage_rules (feature_code, feature_name, credits_cost, is_active)
select 'freight_listing_feature', 'Destacar anúncio de frete (7 dias)', 15, true
where not exists (
  select 1 from public.merchant_credit_usage_rules where feature_code = 'freight_listing_feature'
);

select pg_notify('pgrst', 'reload schema');
