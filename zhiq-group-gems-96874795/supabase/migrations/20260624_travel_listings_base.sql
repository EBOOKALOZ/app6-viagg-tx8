-- =========================================================
-- MÓDULO VIAGENS & TURISMO - BASE V1
-- Espelha freight_listings (20260622_freight_listings_base.sql).
-- "category" é o tipo de oferta (Hotel, Pousada, Resort, Excursão, etc.)
-- =========================================================

create table if not exists public.travel_listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  title text not null,
  slug text unique,
  description text,

  -- Categoria (lista fechada no front-end — travelCategories.ts)
  category text not null default 'Pacotes Turísticos',

  -- Tipo de viagem
  trip_type text, -- 'nacional' | 'internacional'

  -- Destino
  destination text,
  country text default 'Brasil',

  city text not null,
  state text not null,
  neighborhood text,

  -- Datas da viagem
  departure_date date,
  return_date date,
  duration_days integer,

  -- Vagas
  available_spots integer,
  min_people integer,
  max_people integer,

  -- Preços
  price_per_person numeric(12,2),
  total_price numeric(12,2),
  entry_price numeric(12,2),
  installments_available boolean not null default false,

  -- O que está incluso
  includes_accommodation boolean not null default false,
  includes_breakfast boolean not null default false,
  includes_lunch boolean not null default false,
  includes_dinner boolean not null default false,
  includes_transport boolean not null default false,
  includes_guide boolean not null default false,
  includes_insurance boolean not null default false,
  includes_tours boolean not null default false,
  includes_airport_transfer boolean not null default false,

  -- O que não está incluso (campo livre)
  not_included text,

  -- Mídia extra
  video_url text,
  youtube_url text,

  visibility_status public.real_estate_listing_status not null default 'draft',
  contact_unlock_cost integer not null default 9,

  -- Destaque pago (RPC feature_travel_listing)
  is_featured boolean not null default false,
  featured_until timestamptz,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_travel_listings_updated_at on public.travel_listings;
create trigger trg_travel_listings_updated_at
before update on public.travel_listings
for each row
execute function public.set_updated_at();

-- =========================================================
-- CONTATOS PROTEGIDOS (VIAGENS)
-- =========================================================

create table if not exists public.travel_listing_contacts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.travel_listings(id) on delete cascade,
  owner_user_id uuid not null,
  contact_name text,
  email text,
  whatsapp_e164 text,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_travel_listing_contacts_updated_at on public.travel_listing_contacts;
create trigger trg_travel_listing_contacts_updated_at
before update on public.travel_listing_contacts
for each row
execute function public.set_updated_at();

-- =========================================================
-- MÍDIAS (VIAGENS)
-- =========================================================

create table if not exists public.travel_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.travel_listings(id) on delete cascade,
  owner_user_id uuid not null,
  media_type text not null default 'image',
  sort_order integer not null default 0,
  original_storage_path text not null,
  public_masked_storage_path text,
  moderation_status public.real_estate_media_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_travel_media_updated_at on public.travel_media;
create trigger trg_travel_media_updated_at
before update on public.travel_media
for each row
execute function public.set_updated_at();

-- =========================================================
-- RLS - SEGURANÇA
-- =========================================================

alter table public.travel_listings enable row level security;
alter table public.travel_listing_contacts enable row level security;
alter table public.travel_media enable row level security;

create policy travel_listings_owner_all on public.travel_listings for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy travel_contacts_owner_all on public.travel_listing_contacts for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy travel_media_owner_all on public.travel_media for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy travel_listings_public_read on public.travel_listings for select to anon, authenticated using (true);
create policy travel_media_public_read on public.travel_media for select to anon, authenticated using (true);

-- Vista pública
create or replace view public.public_travel_listings as
select
  t.id,
  t.title,
  t.slug,
  t.category,
  t.trip_type,
  t.destination,
  t.country,
  t.city,
  t.state,
  t.neighborhood,
  t.departure_date,
  t.return_date,
  t.duration_days,
  t.price_per_person,
  t.total_price,
  t.available_spots,
  t.is_featured,
  t.published_at
from public.travel_listings t
where t.visibility_status = 'published';

grant select on public.public_travel_listings to anon, authenticated;

notify pgrst, 'reload schema';
