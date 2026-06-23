-- ═══════════════════════════════════════════════════════════════════════════
-- RPC unlock_freight_intention — desbloqueia o contato de um lead de FRETE
-- debitando a CARTEIRA PRÓPRIA de fretes (freight_credit_balances),
-- NÃO a do lojista/anunciante (espelha unlock_service_intention).
--
-- Custo FIXO de desbloqueio de WhatsApp, configurado no admin em
-- merchant_credit_usage_rules (feature_code = 'freight_unlock_whatsapp').
-- Seed direto em 12 créditos (padrão da plataforma — em serviços foi
-- semeado errado em 9 e precisou de uma migration de correção depois).
--
-- Segurança: SECURITY DEFINER + só o DONO do anúncio (advertiser_user_id =
-- auth.uid()) pode desbloquear.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.unlock_freight_intention(p_intention_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_module   text;
  v_listing  uuid;
  v_status   text;
  v_cost     integer;
  v_active   boolean;
  v_avail    integer;
  v_consumed integer;
  v_before   integer;
  v_after    integer;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select advertiser_user_id, listing_module, listing_id, status
    into v_owner, v_module, v_listing, v_status
  from public.advertiser_contact_intentions
  where id = p_intention_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'intention_not_found');
  end if;
  if v_owner <> v_uid then
    return jsonb_build_object('success', false, 'error', 'not_owner');
  end if;
  if v_module <> 'freight' then
    return jsonb_build_object('success', false, 'error', 'not_freight');
  end if;
  if v_status = 'unlocked' then
    return jsonb_build_object('success', true, 'already_unlocked', true, 'credits_charged', 0);
  end if;

  -- custo FIXO de desbloqueio de WhatsApp (admin → Cobranças). Default 12.
  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'freight_unlock_whatsapp'
  limit 1;

  if v_cost is null then
    v_cost := 12;
  end if;
  if v_active is false then
    v_cost := 0;
  end if;

  insert into public.freight_credit_balances (owner_user_id)
  values (v_uid)
  on conflict (owner_user_id) do nothing;

  select available_credits, consumed_credits
    into v_avail, v_consumed
  from public.freight_credit_balances
  where owner_user_id = v_uid
  for update;

  if v_cost > 0 and coalesce(v_avail, 0) < v_cost then
    return jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'buy_credits_cta', true,
      'required', v_cost,
      'available', coalesce(v_avail, 0)
    );
  end if;

  v_before := coalesce(v_avail, 0);
  v_after  := v_before - v_cost;

  if v_cost > 0 then
    update public.freight_credit_balances
       set available_credits = v_after,
           consumed_credits  = coalesce(v_consumed, 0) + v_cost,
           updated_at = now()
     where owner_user_id = v_uid;

    insert into public.freight_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after, listing_id, metadata)
    values
      (v_uid, 'debit_unlock', v_cost, v_before, v_after, v_listing,
       jsonb_build_object('intention_id', p_intention_id, 'event', 'unlock_whatsapp'));
  end if;

  update public.advertiser_contact_intentions
     set status = 'unlocked',
         credits_cost = v_cost,
         unlock_paid_at = now()
   where id = p_intention_id;

  return jsonb_build_object(
    'success', true,
    'credits_charged', v_cost,
    'balance_after', v_after
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.unlock_freight_intention(uuid) to authenticated;

-- Regra de custo de desbloqueio p/ fretes (default 12, padrão da plataforma).
insert into public.merchant_credit_usage_rules (feature_code, feature_name, credits_cost, is_active)
select 'freight_unlock_whatsapp', 'Desbloqueio de WhatsApp (frete)', 12, true
where not exists (
  select 1 from public.merchant_credit_usage_rules where feature_code = 'freight_unlock_whatsapp'
);

select pg_notify('pgrst', 'reload schema');
