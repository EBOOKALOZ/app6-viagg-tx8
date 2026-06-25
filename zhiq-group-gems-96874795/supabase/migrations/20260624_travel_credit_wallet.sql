-- ═══════════════════════════════════════════════════════════════════════════
-- CARTEIRA DE CRÉDITOS DE VIAGENS (própria, separada dos demais módulos).
-- Espelha o modelo de fretes (freight_credit_*).
--
--   • travel_credit_balances  — saldo por owner_user_id
--   • travel_credit_ledger    — histórico (clique, desbloqueio, compra, ajuste)
--   • travel_credit_purchases — compras de pacote de viagens
--   • charge_travel_listing_click() — cobra por clique no anúncio
--   • travel_listing_click_log — dedup anti-spam
--   • pay_grant_legacy()       — ganha o ramo 'travel'
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Saldo ──
create table if not exists public.travel_credit_balances (
  owner_user_id uuid primary key,
  available_credits integer not null default 0,
  reserved_credits  integer not null default 0,
  consumed_credits  integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ── Ledger ──
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

-- ── Compras de pacote ──
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

-- ── Log de cliques (dedup) ──
create table if not exists public.travel_listing_click_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.travel_listings(id) on delete cascade,
  fingerprint text,
  charged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_travel_click_log_listing_fp
  on public.travel_listing_click_log(listing_id, fingerprint, created_at desc);

-- ── RLS ──
alter table public.travel_credit_balances  enable row level security;
alter table public.travel_credit_ledger    enable row level security;
alter table public.travel_credit_purchases enable row level security;
alter table public.travel_listing_click_log enable row level security;

drop policy if exists tcb_owner_read on public.travel_credit_balances;
create policy tcb_owner_read on public.travel_credit_balances for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists tcl_owner_read on public.travel_credit_ledger;
create policy tcl_owner_read on public.travel_credit_ledger for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists travel_credit_purchases_owner_all on public.travel_credit_purchases;
create policy travel_credit_purchases_owner_all
on public.travel_credit_purchases
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- Cobrança por CLIQUE no anúncio de viagem (dívida sem pacote)
-- ═══════════════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════════════
-- pay_grant_legacy: acrescenta o ramo 'travel'
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pay_grant_legacy(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order   public.pay_payment_orders;
  v_kind    text;
  v_ref     uuid;
  v_pur     record;
  v_before  integer;
  v_after   integer;
  v_acct    uuid;
  v_cred    integer;
BEGIN
  SELECT * INTO v_order FROM public.pay_payment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order não encontrada'); END IF;

  v_kind := v_order.metadata->>'grant_kind';
  IF v_kind IS NULL THEN RETURN jsonb_build_object('ok', true, 'skipped', 'sem grant_kind'); END IF;

  IF v_kind = 'merchant' THEN
    v_ref := (v_order.metadata->>'credit_purchase_id')::uuid;
    IF v_ref IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'credit_purchase_id ausente'); END IF;
    RETURN jsonb_build_object('ok', true, 'kind', 'merchant', 'result', public.confirm_credit_purchase(v_ref));

  ELSIF v_kind = 'advertiser_credit' THEN
    v_acct := (v_order.metadata->>'advertiser_account_id')::uuid;
    v_cred := COALESCE(NULLIF(v_order.metadata->>'credits','')::integer, 0);
    IF v_acct IS NULL OR v_cred <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'advertiser_account_id/credits ausentes'); END IF;
    IF EXISTS (SELECT 1 FROM public.advertiser_credit_ledger WHERE source_type = 'payment_order' AND source_id = v_order.id) THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind', 'advertiser_credit');
    END IF;
    SELECT available_credits INTO v_before FROM public.advertiser_credit_balances WHERE advertiser_account_id = v_acct FOR UPDATE;
    IF NOT FOUND THEN
      v_before := 0;
      INSERT INTO public.advertiser_credit_balances (advertiser_account_id, available_credits, consumed_credits) VALUES (v_acct, 0, 0);
    END IF;
    v_after := v_before + v_cred;
    UPDATE public.advertiser_credit_balances SET available_credits = v_after, updated_at = now() WHERE advertiser_account_id = v_acct;
    INSERT INTO public.advertiser_credit_ledger (advertiser_account_id, entry_type, amount, balance_before, balance_after, reason_code, description, source_type, source_id)
    VALUES (v_acct, 'credit', v_cred, v_before, v_after, 'credit_purchase', 'Pagamento confirmado (' || v_cred || ' créditos)', 'payment_order', v_order.id);
    RETURN jsonb_build_object('ok', true, 'kind', 'advertiser_credit', 'credits', v_cred, 'new_balance', v_after);

  ELSIF v_kind = 'advertiser' THEN
    v_ref := (v_order.metadata->>'advertiser_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.advertiser_credit_purchases WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'advertiser purchase não encontrada'); END IF;
    IF v_pur.payment_status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind', 'advertiser'); END IF;
    UPDATE public.advertiser_credit_purchases SET payment_status='paid', paid_at=now(), provider_name=COALESCE(v_order.provider_name, provider_name) WHERE id = v_ref;
    SELECT available_credits INTO v_before FROM public.advertiser_credit_balances WHERE advertiser_account_id = v_pur.advertiser_account_id FOR UPDATE;
    IF NOT FOUND THEN v_before := 0; INSERT INTO public.advertiser_credit_balances (advertiser_account_id, available_credits, consumed_credits) VALUES (v_pur.advertiser_account_id, 0, 0); END IF;
    v_after := v_before + v_pur.credits_total;
    UPDATE public.advertiser_credit_balances SET available_credits = v_after, updated_at = now() WHERE advertiser_account_id = v_pur.advertiser_account_id;
    INSERT INTO public.advertiser_credit_ledger (advertiser_account_id, entry_type, amount, balance_before, balance_after, reason_code, description, source_type, source_id)
    VALUES (v_pur.advertiser_account_id, 'credit', v_pur.credits_total, v_before, v_after, 'credit_purchase', 'Pagamento confirmado (' || v_pur.credits_total || ' créditos)', 'advertiser_credit_purchase', v_ref);
    RETURN jsonb_build_object('ok', true, 'kind','advertiser', 'credits', v_pur.credits_total, 'new_balance', v_after);

  ELSIF v_kind = 'real_estate' THEN
    v_ref := (v_order.metadata->>'real_estate_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.real_estate_credit_purchases WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'real_estate purchase não encontrada'); END IF;
    IF v_pur.payment_status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind','real_estate'); END IF;
    UPDATE public.real_estate_credit_purchases SET payment_status='paid', paid_at=now(), provider_name=COALESCE(v_order.provider_name, provider_name) WHERE id = v_ref;
    SELECT available_credits INTO v_before FROM public.real_estate_credit_balances WHERE owner_user_id = v_pur.owner_user_id FOR UPDATE;
    IF NOT FOUND THEN v_before := 0; INSERT INTO public.real_estate_credit_balances (owner_user_id, available_credits, reserved_credits, consumed_credits) VALUES (v_pur.owner_user_id, 0, 0, 0); END IF;
    v_after := v_before + v_pur.credits_total;
    UPDATE public.real_estate_credit_balances SET available_credits = v_after, updated_at = now() WHERE owner_user_id = v_pur.owner_user_id;
    INSERT INTO public.real_estate_credit_ledger (owner_user_id, entry_type, amount, balance_before, balance_after, purchase_id, metadata)
    VALUES (v_pur.owner_user_id, 'purchase', v_pur.credits_total, v_before, v_after, v_ref, jsonb_build_object('order_id', p_order_id));
    RETURN jsonb_build_object('ok', true, 'kind','real_estate', 'credits', v_pur.credits_total, 'new_balance', v_after);

  ELSIF v_kind = 'vehicle' THEN
    v_ref := (v_order.metadata->>'vehicle_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.vehicle_credit_purchases WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'vehicle purchase não encontrada'); END IF;
    IF v_pur.payment_status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind','vehicle'); END IF;
    UPDATE public.vehicle_credit_purchases SET payment_status='paid', paid_at=now(), provider_name=COALESCE(v_order.provider_name, provider_name) WHERE id = v_ref;
    SELECT available_credits INTO v_before FROM public.vehicle_credit_balances WHERE owner_user_id = v_pur.owner_user_id FOR UPDATE;
    IF NOT FOUND THEN v_before := 0; INSERT INTO public.vehicle_credit_balances (owner_user_id, available_credits, reserved_credits, consumed_credits) VALUES (v_pur.owner_user_id, 0, 0, 0); END IF;
    v_after := v_before + v_pur.credits_total;
    UPDATE public.vehicle_credit_balances SET available_credits = v_after, updated_at = now() WHERE owner_user_id = v_pur.owner_user_id;
    INSERT INTO public.vehicle_credit_ledger (owner_user_id, entry_type, amount, balance_before, balance_after, purchase_id, metadata)
    VALUES (v_pur.owner_user_id, 'purchase', v_pur.credits_total, v_before, v_after, v_ref, jsonb_build_object('order_id', p_order_id));
    RETURN jsonb_build_object('ok', true, 'kind','vehicle', 'credits', v_pur.credits_total, 'new_balance', v_after);

  ELSIF v_kind = 'service' THEN
    v_ref := (v_order.metadata->>'service_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.service_credit_purchases WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'service purchase não encontrada'); END IF;
    IF v_pur.payment_status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind','service'); END IF;
    UPDATE public.service_credit_purchases SET payment_status='paid', paid_at=now(), provider_name=COALESCE(v_order.provider_name, provider_name) WHERE id = v_ref;
    SELECT available_credits INTO v_before FROM public.service_credit_balances WHERE owner_user_id = v_pur.owner_user_id FOR UPDATE;
    IF NOT FOUND THEN v_before := 0; INSERT INTO public.service_credit_balances (owner_user_id, available_credits, reserved_credits, consumed_credits) VALUES (v_pur.owner_user_id, 0, 0, 0); END IF;
    v_after := v_before + v_pur.credits_total;
    UPDATE public.service_credit_balances SET available_credits = v_after, updated_at = now() WHERE owner_user_id = v_pur.owner_user_id;
    INSERT INTO public.service_credit_ledger (owner_user_id, entry_type, amount, balance_before, balance_after, purchase_id, metadata)
    VALUES (v_pur.owner_user_id, 'purchase', v_pur.credits_total, v_before, v_after, v_ref, jsonb_build_object('order_id', p_order_id));
    RETURN jsonb_build_object('ok', true, 'kind','service', 'credits', v_pur.credits_total, 'new_balance', v_after);

  ELSIF v_kind = 'freight' THEN
    v_ref := (v_order.metadata->>'freight_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.freight_credit_purchases WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'freight purchase não encontrada'); END IF;
    IF v_pur.payment_status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind','freight'); END IF;
    UPDATE public.freight_credit_purchases SET payment_status='paid', paid_at=now(), provider_name=COALESCE(v_order.provider_name, provider_name) WHERE id = v_ref;
    SELECT available_credits INTO v_before FROM public.freight_credit_balances WHERE owner_user_id = v_pur.owner_user_id FOR UPDATE;
    IF NOT FOUND THEN v_before := 0; INSERT INTO public.freight_credit_balances (owner_user_id, available_credits, reserved_credits, consumed_credits) VALUES (v_pur.owner_user_id, 0, 0, 0); END IF;
    v_after := v_before + v_pur.credits_total;
    UPDATE public.freight_credit_balances SET available_credits = v_after, updated_at = now() WHERE owner_user_id = v_pur.owner_user_id;
    INSERT INTO public.freight_credit_ledger (owner_user_id, entry_type, amount, balance_before, balance_after, purchase_id, metadata)
    VALUES (v_pur.owner_user_id, 'purchase', v_pur.credits_total, v_before, v_after, v_ref, jsonb_build_object('order_id', p_order_id));
    RETURN jsonb_build_object('ok', true, 'kind','freight', 'credits', v_pur.credits_total, 'new_balance', v_after);

  -- ─── VIAGENS (novo) ───────────────────────────────────────────────────────
  ELSIF v_kind = 'travel' THEN
    v_ref := (v_order.metadata->>'travel_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.travel_credit_purchases WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'travel purchase não encontrada'); END IF;
    IF v_pur.payment_status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind','travel'); END IF;
    UPDATE public.travel_credit_purchases SET payment_status='paid', paid_at=now(), provider_name=COALESCE(v_order.provider_name, provider_name) WHERE id = v_ref;
    SELECT available_credits INTO v_before FROM public.travel_credit_balances WHERE owner_user_id = v_pur.owner_user_id FOR UPDATE;
    IF NOT FOUND THEN
      v_before := 0;
      INSERT INTO public.travel_credit_balances (owner_user_id, available_credits, reserved_credits, consumed_credits) VALUES (v_pur.owner_user_id, 0, 0, 0);
    END IF;
    v_after := v_before + v_pur.credits_total;
    UPDATE public.travel_credit_balances SET available_credits = v_after, updated_at = now() WHERE owner_user_id = v_pur.owner_user_id;
    INSERT INTO public.travel_credit_ledger (owner_user_id, entry_type, amount, balance_before, balance_after, purchase_id, metadata)
    VALUES (v_pur.owner_user_id, 'purchase', v_pur.credits_total, v_before, v_after, v_ref, jsonb_build_object('order_id', p_order_id));
    RETURN jsonb_build_object('ok', true, 'kind','travel', 'credits', v_pur.credits_total, 'new_balance', v_after);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'grant_kind desconhecido: ' || v_kind);
END $$;

REVOKE ALL ON FUNCTION public.pay_grant_legacy(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_grant_legacy(uuid) TO service_role;

insert into public.merchant_credit_usage_rules (feature_code, feature_name, credits_cost, is_active)
select 'travel_listing_click', 'Clique no anúncio de viagem', 6, true
where not exists (
  select 1 from public.merchant_credit_usage_rules where feature_code = 'travel_listing_click'
);

select pg_notify('pgrst', 'reload schema');
