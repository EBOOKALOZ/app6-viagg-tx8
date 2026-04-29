-- =========================================================
-- COMANDO IMOVEIS - BASE V1
-- =========================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'real_estate_property_type') then
    create type public.real_estate_property_type as enum ('chacara', 'sitio', 'fazenda', 'lote', 'terreno');
  end if;

  if not exists (select 1 from pg_type where typname = 'real_estate_operation_type') then
    create type public.real_estate_operation_type as enum ('sale', 'rent');
  end if;

  if not exists (select 1 from pg_type where typname = 'real_estate_listing_status') then
    create type public.real_estate_listing_status as enum ('draft', 'pending_review', 'published', 'paused', 'rejected', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'real_estate_media_status') then
    create type public.real_estate_media_status as enum ('queued', 'processing', 'approved', 'masked', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'real_estate_credit_entry_type') then
    create type public.real_estate_credit_entry_type as enum ('purchase', 'bonus', 'debit_unlock', 'refund', 'adjustment', 'expiration');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- ANUNCIOS
-- =========================================================

create table if not exists public.real_estate_listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  agency_name text,
  agent_name text,
  title text not null,
  slug text unique,
  property_type public.real_estate_property_type not null,
  operation_type public.real_estate_operation_type not null default 'sale',
  description text,
  price_brl numeric(14,2),
  total_area_m2 numeric(14,2),
  built_area_m2 numeric(14,2),
  bedrooms integer default 0,
  bathrooms integer default 0,
  parking_spots integer default 0,

  address_line text,
  address_number text,
  neighborhood text,
  city text not null,
  state text not null,
  postal_code text,
  lat double precision,
  lng double precision,

  public_address_label text, -- ex: "Região da Velha, Blumenau/SC"
  contact_unlock_cost integer not null default 5,

  visibility_status public.real_estate_listing_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_real_estate_listings_updated_at on public.real_estate_listings;
create trigger trg_real_estate_listings_updated_at
before update on public.real_estate_listings
for each row
execute function public.set_updated_at();

-- =========================================================
-- CONTATO REAL DO ANUNCIO (PROTEGIDO)
-- =========================================================

create table if not exists public.real_estate_listing_contacts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.real_estate_listings(id) on delete cascade,
  owner_user_id uuid not null,
  contact_name text,
  whatsapp_e164 text,
  phone_e164 text,
  email text,
  show_whatsapp boolean not null default true,
  show_phone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_real_estate_listing_contacts_updated_at on public.real_estate_listing_contacts;
create trigger trg_real_estate_listing_contacts_updated_at
before update on public.real_estate_listing_contacts
for each row
execute function public.set_updated_at();

-- =========================================================
-- MIDIAS
-- =========================================================

create table if not exists public.real_estate_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.real_estate_listings(id) on delete cascade,
  owner_user_id uuid not null,
  media_type text not null default 'image',
  sort_order integer not null default 0,

  original_storage_path text not null,
  public_masked_storage_path text,
  thumb_masked_storage_path text,

  moderation_status public.real_estate_media_status not null default 'queued',
  contains_sensitive_contact boolean not null default false,
  blur_applied boolean not null default false,
  exif_stripped boolean not null default false,
  ocr_hits jsonb not null default '[]'::jsonb,
  moderation_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_real_estate_media_updated_at on public.real_estate_media;
create trigger trg_real_estate_media_updated_at
before update on public.real_estate_media
for each row
execute function public.set_updated_at();

create table if not exists public.real_estate_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null unique references public.real_estate_media(id) on delete cascade,
  listing_id uuid not null references public.real_estate_listings(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_real_estate_moderation_queue_updated_at on public.real_estate_moderation_queue;
create trigger trg_real_estate_moderation_queue_updated_at
before update on public.real_estate_moderation_queue
for each row
execute function public.set_updated_at();

-- =========================================================
-- CREDITOS
-- =========================================================

create table if not exists public.real_estate_credit_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  package_type text not null default 'avulso', -- avulso / mensal / semestral / anual
  credits_amount integer not null,
  bonus_credits integer not null default 0,
  price_brl numeric(12,2) not null,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_real_estate_credit_packages_updated_at on public.real_estate_credit_packages;
create trigger trg_real_estate_credit_packages_updated_at
before update on public.real_estate_credit_packages
for each row
execute function public.set_updated_at();

create table if not exists public.real_estate_credit_balances (
  owner_user_id uuid primary key,
  available_credits integer not null default 0,
  reserved_credits integer not null default 0,
  consumed_credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_real_estate_credit_balances_updated_at on public.real_estate_credit_balances;
create trigger trg_real_estate_credit_balances_updated_at
before update on public.real_estate_credit_balances
for each row
execute function public.set_updated_at();

create table if not exists public.real_estate_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  entry_type public.real_estate_credit_entry_type not null,
  amount integer not null,
  balance_before integer not null,
  balance_after integer not null,
  listing_id uuid references public.real_estate_listings(id) on delete set null,
  unlock_id uuid,
  purchase_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.real_estate_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  package_id uuid not null references public.real_estate_credit_packages(id),
  credits_base integer not null,
  credits_bonus integer not null default 0,
  credits_total integer not null,
  amount_brl numeric(12,2) not null,
  payment_status text not null default 'pending',
  provider_name text,
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- =========================================================
-- LEADS / LIBERACAO DE CONTATO
-- =========================================================

create table if not exists public.real_estate_interest_leads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.real_estate_listings(id) on delete cascade,
  owner_user_id uuid not null,
  visitor_user_id uuid not null,
  visitor_name text,
  visitor_phone text,
  visitor_message text,
  lead_status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_real_estate_interest_leads_updated_at on public.real_estate_interest_leads;
create trigger trg_real_estate_interest_leads_updated_at
before update on public.real_estate_interest_leads
for each row
execute function public.set_updated_at();

create table if not exists public.real_estate_contact_unlocks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.real_estate_listings(id) on delete cascade,
  owner_user_id uuid not null,
  visitor_user_id uuid not null,
  lead_id uuid references public.real_estate_interest_leads(id) on delete set null,
  credits_debited integer not null,
  unlock_status text not null default 'active',
  revealed_whatsapp text,
  revealed_phone text,
  revealed_contact_name text,
  revealed_address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, visitor_user_id)
);

drop trigger if exists trg_real_estate_contact_unlocks_updated_at on public.real_estate_contact_unlocks;
create trigger trg_real_estate_contact_unlocks_updated_at
before update on public.real_estate_contact_unlocks
for each row
execute function public.set_updated_at();

create table if not exists public.real_estate_events_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.real_estate_listings(id) on delete set null,
  owner_user_id uuid,
  visitor_user_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- INDICES
-- =========================================================

create index if not exists idx_real_estate_listings_owner on public.real_estate_listings(owner_user_id);
create index if not exists idx_real_estate_listings_status_city on public.real_estate_listings(visibility_status, city, state);
create index if not exists idx_real_estate_listings_property_type on public.real_estate_listings(property_type);
create index if not exists idx_real_estate_media_listing on public.real_estate_media(listing_id, sort_order);
create index if not exists idx_real_estate_leads_owner on public.real_estate_interest_leads(owner_user_id, created_at desc);
create index if not exists idx_real_estate_unlocks_owner on public.real_estate_contact_unlocks(owner_user_id, created_at desc);
create index if not exists idx_real_estate_unlocks_visitor on public.real_estate_contact_unlocks(visitor_user_id, created_at desc);
create index if not exists idx_real_estate_credit_ledger_owner on public.real_estate_credit_ledger(owner_user_id, created_at desc);

-- =========================================================
-- VIEW PUBLICA PROTEGIDA
-- =========================================================

create or replace view public.public_real_estate_listings as
select
  l.id,
  l.slug,
  l.title,
  l.property_type,
  l.operation_type,
  l.description,
  l.price_brl,
  l.total_area_m2,
  l.built_area_m2,
  l.bedrooms,
  l.bathrooms,
  l.parking_spots,
  l.neighborhood,
  l.city,
  l.state,
  coalesce(l.public_address_label, concat_ws(', ', l.neighborhood, l.city, l.state)) as public_location,
  l.contact_unlock_cost,
  l.published_at,
  l.created_at
from public.real_estate_listings l
where l.visibility_status = 'published';

grant select on public.public_real_estate_listings to anon, authenticated;

create or replace view public.public_real_estate_media as
select
  m.id,
  m.listing_id,
  m.sort_order,
  m.media_type,
  m.public_masked_storage_path,
  m.thumb_masked_storage_path
from public.real_estate_media m
join public.real_estate_listings l on l.id = m.listing_id
where l.visibility_status = 'published'
  and m.moderation_status in ('approved', 'masked')
  and m.public_masked_storage_path is not null;

grant select on public.public_real_estate_media to anon, authenticated;

-- =========================================================
-- FUNCOES DE CREDITOS
-- =========================================================

create or replace function public.ensure_real_estate_credit_balance(p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.real_estate_credit_balances (owner_user_id)
  values (p_owner_user_id)
  on conflict (owner_user_id) do nothing;
end;
$$;

create or replace function public.request_real_estate_contact_unlock(
  p_listing_id uuid,
  p_visitor_name text,
  p_visitor_phone text,
  p_visitor_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_cost integer;
  v_balance integer;
  v_lead_id uuid;
  v_unlock_id uuid;
  v_contact_name text;
  v_whatsapp text;
  v_phone text;
  v_address jsonb;
begin
  if v_actor is null then
    raise exception 'Usuário não autenticado';
  end if;

  select
    l.owner_user_id,
    l.contact_unlock_cost,
    jsonb_build_object(
      'address_line', l.address_line,
      'address_number', l.address_number,
      'neighborhood', l.neighborhood,
      'city', l.city,
      'state', l.state,
      'postal_code', l.postal_code
    )
  into v_owner, v_cost, v_address
  from public.real_estate_listings l
  where l.id = p_listing_id
    and l.visibility_status = 'published'
  for update;

  if v_owner is null then
    raise exception 'Anúncio não encontrado ou não publicado';
  end if;

  if exists (
    select 1
    from public.real_estate_contact_unlocks u
    where u.listing_id = p_listing_id
      and u.visitor_user_id = v_actor
  ) then
    select
      u.id,
      u.revealed_contact_name,
      u.revealed_whatsapp,
      u.revealed_phone,
      u.revealed_address
    into v_unlock_id, v_contact_name, v_whatsapp, v_phone, v_address
    from public.real_estate_contact_unlocks u
    where u.listing_id = p_listing_id
      and u.visitor_user_id = v_actor;

    return jsonb_build_object(
      'ok', true,
      'already_unlocked', true,
      'unlock_id', v_unlock_id,
      'contact_name', v_contact_name,
      'whatsapp', v_whatsapp,
      'phone', v_phone,
      'address', v_address
    );
  end if;

  perform public.ensure_real_estate_credit_balance(v_owner);

  select available_credits
  into v_balance
  from public.real_estate_credit_balances
  where owner_user_id = v_owner
  for update;

  if coalesce(v_balance, 0) < coalesce(v_cost, 0) then
    raise exception 'O anunciante está sem créditos suficientes para liberar este contato';
  end if;

  insert into public.real_estate_interest_leads (
    listing_id,
    owner_user_id,
    visitor_user_id,
    visitor_name,
    visitor_phone,
    visitor_message
  )
  values (
    p_listing_id,
    v_owner,
    v_actor,
    p_visitor_name,
    p_visitor_phone,
    p_visitor_message
  )
  returning id into v_lead_id;

  update public.real_estate_credit_balances
  set
    available_credits = available_credits - v_cost,
    consumed_credits = consumed_credits + v_cost,
    updated_at = now()
  where owner_user_id = v_owner;

  select
    c.contact_name,
    c.whatsapp_e164,
    c.phone_e164
  into v_contact_name, v_whatsapp, v_phone
  from public.real_estate_listing_contacts c
  where c.listing_id = p_listing_id;

  insert into public.real_estate_contact_unlocks (
    listing_id,
    owner_user_id,
    visitor_user_id,
    lead_id,
    credits_debited,
    revealed_whatsapp,
    revealed_phone,
    revealed_contact_name,
    revealed_address
  )
  values (
    p_listing_id,
    v_owner,
    v_actor,
    v_lead_id,
    v_cost,
    v_whatsapp,
    v_phone,
    v_contact_name,
    v_address
  )
  returning id into v_unlock_id;

  insert into public.real_estate_credit_ledger (
    owner_user_id,
    entry_type,
    amount,
    balance_before,
    balance_after,
    listing_id,
    unlock_id,
    metadata
  )
  values (
    v_owner,
    'debit_unlock',
    -v_cost,
    v_balance,
    v_balance - v_cost,
    p_listing_id,
    v_unlock_id,
    jsonb_build_object(
      'lead_id', v_lead_id,
      'visitor_user_id', v_actor
    )
  );

  insert into public.real_estate_events_log (
    listing_id,
    owner_user_id,
    visitor_user_id,
    event_type,
    metadata
  )
  values (
    p_listing_id,
    v_owner,
    v_actor,
    'contact_unlocked',
    jsonb_build_object(
      'unlock_id', v_unlock_id,
      'lead_id', v_lead_id,
      'credits_debited', v_cost
    )
  );

  return jsonb_build_object(
    'ok', true,
    'already_unlocked', false,
    'unlock_id', v_unlock_id,
    'contact_name', v_contact_name,
    'whatsapp', v_whatsapp,
    'phone', v_phone,
    'address', v_address,
    'credits_debited', v_cost
  );
end;
$$;

grant execute on function public.request_real_estate_contact_unlock(uuid, text, text, text) to authenticated;

-- =========================================================
-- RLS
-- =========================================================

alter table public.real_estate_listings enable row level security;
alter table public.real_estate_listing_contacts enable row level security;
alter table public.real_estate_media enable row level security;
alter table public.real_estate_moderation_queue enable row level security;
alter table public.real_estate_credit_packages enable row level security;
alter table public.real_estate_credit_balances enable row level security;
alter table public.real_estate_credit_ledger enable row level security;
alter table public.real_estate_credit_purchases enable row level security;
alter table public.real_estate_interest_leads enable row level security;
alter table public.real_estate_contact_unlocks enable row level security;
alter table public.real_estate_events_log enable row level security;

drop policy if exists real_estate_listings_owner_all on public.real_estate_listings;
create policy real_estate_listings_owner_all
on public.real_estate_listings
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists real_estate_listing_contacts_owner_all on public.real_estate_listing_contacts;
create policy real_estate_listing_contacts_owner_all
on public.real_estate_listing_contacts
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists real_estate_media_owner_all on public.real_estate_media;
create policy real_estate_media_owner_all
on public.real_estate_media
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists real_estate_moderation_queue_owner_view on public.real_estate_moderation_queue;
create policy real_estate_moderation_queue_owner_view
on public.real_estate_moderation_queue
for select
to authenticated
using (
  exists (
    select 1
    from public.real_estate_listings l
    where l.id = listing_id
      and l.owner_user_id = auth.uid()
  )
);

drop policy if exists real_estate_credit_packages_read on public.real_estate_credit_packages;
create policy real_estate_credit_packages_read
on public.real_estate_credit_packages
for select
to authenticated
using (is_active = true);

drop policy if exists real_estate_credit_balances_owner_view on public.real_estate_credit_balances;
create policy real_estate_credit_balances_owner_view
on public.real_estate_credit_balances
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists real_estate_credit_ledger_owner_view on public.real_estate_credit_ledger;
create policy real_estate_credit_ledger_owner_view
on public.real_estate_credit_ledger
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists real_estate_credit_purchases_owner_all on public.real_estate_credit_purchases;
create policy real_estate_credit_purchases_owner_all
on public.real_estate_credit_purchases
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists real_estate_interest_leads_owner_view on public.real_estate_interest_leads;
create policy real_estate_interest_leads_owner_view
on public.real_estate_interest_leads
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists real_estate_contact_unlocks_owner_or_visitor_view on public.real_estate_contact_unlocks;
create policy real_estate_contact_unlocks_owner_or_visitor_view
on public.real_estate_contact_unlocks
for select
to authenticated
using (owner_user_id = auth.uid() or visitor_user_id = auth.uid());

drop policy if exists real_estate_events_log_owner_view on public.real_estate_events_log;
create policy real_estate_events_log_owner_view
on public.real_estate_events_log
for select
to authenticated
using (owner_user_id = auth.uid());

notify pgrst, 'reload schema';
