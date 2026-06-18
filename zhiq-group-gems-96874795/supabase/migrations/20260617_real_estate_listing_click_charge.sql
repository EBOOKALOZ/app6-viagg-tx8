-- ═══════════════════════════════════════════════════════════════════════════
-- Cobrança por CLIQUE no anúncio de imóvel.
-- Quando alguém abre/clica um anúncio, debita N créditos (default 6) da carteira
-- de imóveis do DONO (real_estate_credit_balances). Configurável no admin →
-- Cobranças (merchant_credit_usage_rules.feature_code = 'real_estate_listing_click').
--
-- Anti-spam: 1 cobrança por (anúncio + visitante) a cada 60 min (dedup por
-- fingerprint). Dono visitando o próprio anúncio NÃO cobra.
-- DÍVIDA: cobra MESMO SEM saldo — o saldo do dono fica NEGATIVO e acumula. Quando
-- ele comprar um pacote, o grant SOMA ao saldo e abate a dívida automaticamente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.real_estate_listing_click_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.real_estate_listings(id) on delete cascade,
  fingerprint text,
  charged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_re_click_log_listing_fp
  on public.real_estate_listing_click_log(listing_id, fingerprint, created_at desc);

alter table public.real_estate_listing_click_log enable row level security;

create or replace function public.charge_real_estate_listing_click(
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
  select owner_user_id into v_owner
  from public.real_estate_listings where id = p_listing_id;

  if v_owner is null then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'listing_not_found');
  end if;

  -- dono vendo o próprio anúncio → não cobra
  if v_uid is not null and v_uid = v_owner then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'owner_view');
  end if;

  -- dedup: já cobrou esse visitante nesse anúncio nos últimos 60 min?
  if p_fingerprint is not null and exists (
    select 1 from public.real_estate_listing_click_log
    where listing_id = p_listing_id
      and fingerprint = p_fingerprint
      and charged = true
      and created_at > now() - interval '60 minutes'
  ) then
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'deduped');
  end if;

  -- custo configurado (default 6)
  select credits_cost, is_active into v_cost, v_active
  from public.merchant_credit_usage_rules
  where feature_code = 'real_estate_listing_click'
  limit 1;

  if v_cost is null then v_cost := 6; end if;
  if v_active is false then
    insert into public.real_estate_listing_click_log (listing_id, fingerprint, charged)
    values (p_listing_id, p_fingerprint, false);
    return jsonb_build_object('success', true, 'charged', false, 'reason', 'charge_disabled');
  end if;

  -- saldo do dono — SEMPRE debita, mesmo sem pacote (saldo fica NEGATIVO = dívida).
  -- Quando o dono comprar um pacote, o grant SOMA ao saldo e abate a dívida.
  insert into public.real_estate_credit_balances (owner_user_id)
  values (v_owner) on conflict (owner_user_id) do nothing;

  select available_credits, consumed_credits into v_avail, v_consumed
  from public.real_estate_credit_balances
  where owner_user_id = v_owner
  for update;

  v_before := coalesce(v_avail, 0);
  v_after  := v_before - v_cost; -- pode ficar negativo (dívida acumulada)

  update public.real_estate_credit_balances
     set available_credits = v_after,
         consumed_credits  = coalesce(v_consumed, 0) + v_cost
   where owner_user_id = v_owner;

  insert into public.real_estate_credit_ledger
    (owner_user_id, entry_type, amount, balance_before, balance_after, listing_id, metadata)
  values
    (v_owner, 'adjustment', v_cost, v_before, v_after, p_listing_id,
     jsonb_build_object('event', 'listing_click', 'fingerprint', p_fingerprint));

  insert into public.real_estate_listing_click_log (listing_id, fingerprint, charged)
  values (p_listing_id, p_fingerprint, true);

  return jsonb_build_object(
    'success', true, 'charged', true, 'credits_charged', v_cost,
    'balance_after', v_after, 'debt', greatest(0, -v_after)
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.charge_real_estate_listing_click(uuid, text) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
