-- =========================================================
-- COMANDO VEICULOS - BASE V1
-- =========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'vehicle_type_enum') then
    create type public.vehicle_type_enum as enum ('carro', 'moto', 'barco', 'utilitario');
  end if;

  if not exists (select 1 from pg_type where typname = 'vehicle_condition_enum') then
    create type public.vehicle_condition_enum as enum ('novo', 'seminovo', 'usado');
  end if;

  if not exists (select 1 from pg_type where typname = 'vehicle_fuel_type_enum') then
    create type public.vehicle_fuel_type_enum as enum ('flex', 'gasolina', 'diesel', 'eletrico', 'hibrido', 'gnv');
  end if;

  if not exists (select 1 from pg_type where typname = 'vehicle_transmission_enum') then
    create type public.vehicle_transmission_enum as enum ('manual', 'automatico', 'semi-automatico');
  end if;
end
$$;

-- =========================================================
-- ANUNCIOS DE VEICULOS
-- =========================================================

create table if not exists public.vehicle_listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  title text not null,
  slug text unique,
  description text,
  
  vehicle_type public.vehicle_type_enum not null default 'carro',
  condition public.vehicle_condition_enum not null default 'seminovo',
  
  brand text not null, -- Marca
  model text not null, -- Modelo
  year integer not null, -- Ano Modelo
  color text,
  
  price_brl numeric(14,2),
  kilometers integer default 0,
  
  fuel_type public.vehicle_fuel_type_enum default 'flex',
  transmission public.vehicle_transmission_enum default 'manual',
  plate_end text, -- Final da placa (segurança)
  
  city text not null,
  state text not null,
  neighborhood text,
  public_address_label text,

  visibility_status public.real_estate_listing_status not null default 'draft',
  contact_unlock_cost integer not null default 5,
  
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger updated_at
drop trigger if exists trg_vehicle_listings_updated_at on public.vehicle_listings;
create trigger trg_vehicle_listings_updated_at
before update on public.vehicle_listings
for each row
execute function public.set_updated_at();

-- =========================================================
-- CONTATOS PROTEGIDOS (VEICULOS)
-- =========================================================

create table if not exists public.vehicle_listing_contacts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.vehicle_listings(id) on delete cascade,
  owner_user_id uuid not null,
  contact_name text,
  whatsapp_e164 text,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vehicle_listing_contacts_updated_at on public.vehicle_listing_contacts;
create trigger trg_vehicle_listing_contacts_updated_at
before update on public.vehicle_listing_contacts
for each row
execute function public.set_updated_at();

-- =========================================================
-- MIDIAS (VEICULOS)
-- =========================================================

create table if not exists public.vehicle_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.vehicle_listings(id) on delete cascade,
  owner_user_id uuid not null,
  media_type text not null default 'image',
  sort_order integer not null default 0,
  
  original_storage_path text not null,
  public_masked_storage_path text,
  
  moderation_status public.real_estate_media_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vehicle_media_updated_at on public.vehicle_media;
create trigger trg_vehicle_media_updated_at
before update on public.vehicle_media
for each row
execute function public.set_updated_at();

-- =========================================================
-- RLS - SEGURANCA
-- =========================================================

alter table public.vehicle_listings enable row level security;
alter table public.vehicle_listing_contacts enable row level security;
alter table public.vehicle_media enable row level security;

-- Policies
create policy vehicle_listings_owner_all on public.vehicle_listings for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy vehicle_contacts_owner_all on public.vehicle_listing_contacts for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy vehicle_media_owner_all on public.vehicle_media for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Public visibility
create or replace view public.public_vehicle_listings as
select
  v.id,
  v.title,
  v.slug,
  v.vehicle_type,
  v.brand,
  v.model,
  v.year,
  v.price_brl,
  v.kilometers,
  v.fuel_type,
  v.transmission,
  v.city,
  v.state,
  v.neighborhood,
  v.public_address_label,
  v.published_at
from public.vehicle_listings v
where v.visibility_status = 'published';

grant select on public.public_vehicle_listings to anon, authenticated;

notify pgrst, 'reload schema';
