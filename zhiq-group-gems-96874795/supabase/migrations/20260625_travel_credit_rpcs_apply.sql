-- ═══════════════════════════════════════════════════════════════════════════
-- APLICAR NO SUPABASE DASHBOARD > SQL Editor
-- Cria tabelas de créditos de viagem + RPCs de cobrança por clique/interesse
-- (idempotente — pode rodar mais de uma vez sem dano)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tabelas ──────────────────────────────────────────────────────────────

create table if not exists public.travel_credit_balances (
  owner_user_id uuid primary key,
  available_credits integer not null default 0,
  reserved_credits  integer not null default 0,
  consumed_credits  integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.travel_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  entry_type text not null,
  amount integer not null,
  balance_before integer not null,
  balance_after integer not null,
  listing_id uuid,
  unlock_id uuid,
  purchase_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_travel_credit_ledger_owner
  on public.travel_credit_ledger(owner_user_id, created_at desc);

create table if not exists public.travel_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  package_id uuid,
  credits_base integer not null default 0,
  credits_bonus integer not null default 0,
  credits_total integer not null default 0,
  amount_brl numeric(12,2) not null default 0,
  payment_status text not null default 'pending',
  provider_name text,
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.travel_listing_click_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.travel_listings(id) on delete cascade,
  fingerprint text,
  charged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_travel_click_log_listing_fp
  on public.travel_listing_click_log(listing_id, fingerprint, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.travel_credit_balances  enable row level security;
alter table public.travel_credit_ledger    enable row level security;
alter table public.travel_credit_purchases enable row level security;
alter table public.travel_listing_click_log enable row level security;

drop policy if exists tcb_owner_read on public.travel_credit_balances;
create policy tcb_owner_read on public.travel_credit_balances
  for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists tcl_owner_read on public.travel_credit_ledger;
create policy tcl_owner_read on public.travel_credit_ledger
  for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists travel_credit_purchases_owner_all on public.travel_credit_purchases;
create policy travel_credit_purchases_owner_all on public.travel_credit_purchases
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ── RPC: charge_travel_listing_click (6 cr, dedup 60 min por fingerprint) ──

create or replace function public.charge_travel_listing_click(
  p_listing_id uuid,
  p_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_cost    integer;
  v_active  boolean;
  v_avail   integer;
  v_consumed integer;
  v_before  integer;
  v_after   integer;
begin
  select owner_user_id into v_owner from public.travel_listings where id = p_listing_id;
  if v_owner is null then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'listing_not_found');
  end if;

  if v_uid is not null and v_uid = v_owner then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'owner_view');
  end if;

  if p_fingerprint is not null and exists (
    select 1 from public.travel_listing_click_log
    where listing_id = p_listing_id and fingerprint = p_fingerprint
      and charged = true and created_at > now() - interval '60 minutes'
  ) then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'deduped');
  end if;

  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'travel_listing_click' limit 1;
  if v_cost is null then v_cost := 6; end if;
  if v_active is false then
    insert into public.travel_listing_click_log (listing_id, fingerprint, charged)
    values (p_listing_id, p_fingerprint, false);
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'charge_disabled');
  end if;

  insert into public.travel_credit_balances (owner_user_id)
  values (v_owner) on conflict (owner_user_id) do nothing;

  select available_credits, consumed_credits into v_avail, v_consumed
  from public.travel_credit_balances where owner_user_id = v_owner for update;

  v_before := coalesce(v_avail, 0);
  v_after  := v_before - v_cost;

  update public.travel_credit_balances
     set available_credits = v_after,
         consumed_credits  = coalesce(v_consumed, 0) + v_cost,
         updated_at = now()
   where owner_user_id = v_owner;

  insert into public.travel_credit_ledger
    (owner_user_id, entry_type, amount, balance_before, balance_after, listing_id, metadata)
  values
    (v_owner, 'adjustment', v_cost, v_before, v_after, p_listing_id,
     jsonb_build_object('event', 'listing_click', 'fingerprint', p_fingerprint));

  insert into public.travel_listing_click_log (listing_id, fingerprint, charged)
  values (p_listing_id, p_fingerprint, true);

  return jsonb_build_object('success', true, 'charged', true, 'credits_charged', v_cost,
                            'balance_after', v_after, 'debt', greatest(0, -v_after));
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.charge_travel_listing_click(uuid, text) to anon, authenticated;

-- ── RPC: charge_travel_interest_click (9 cr, sem dedup — cobra sempre) ──

create or replace function public.charge_travel_interest_click(
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
  select owner_user_id into v_owner from public.travel_listings where id = p_listing_id;
  if v_owner is null then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'listing_not_found');
  end if;

  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'travel_interest_click' limit 1;
  if v_cost is null then v_cost := 9; end if;
  if v_active is false then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'charge_disabled');
  end if;

  insert into public.travel_credit_balances (owner_user_id)
  values (v_owner) on conflict (owner_user_id) do nothing;

  select available_credits, consumed_credits into v_avail, v_consumed
  from public.travel_credit_balances where owner_user_id = v_owner for update;

  v_before := coalesce(v_avail, 0);
  v_after  := v_before - v_cost;

  update public.travel_credit_balances
     set available_credits = v_after,
         consumed_credits  = coalesce(v_consumed, 0) + v_cost
   where owner_user_id = v_owner;

  insert into public.travel_credit_ledger
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

grant execute on function public.charge_travel_interest_click(uuid, text) to anon, authenticated;

-- ── Regras de custo (idempotente) ─────────────────────────────────────────

insert into public.merchant_credit_usage_rules (feature_code, feature_name, credits_cost, is_active)
select 'travel_listing_click', 'Visualização de anúncio de viagem', 6, true
where not exists (
  select 1 from public.merchant_credit_usage_rules where feature_code = 'travel_listing_click'
);

insert into public.merchant_credit_usage_rules (feature_code, feature_name, credits_cost, is_active)
select 'travel_interest_click', 'Clique em Interesse (viagem)', 9, true
where not exists (
  select 1 from public.merchant_credit_usage_rules where feature_code = 'travel_interest_click'
);

select pg_notify('pgrst', 'reload schema');
