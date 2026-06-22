-- =========================================================
-- COMANDO SERVIÇOS - BASE V1
-- Espelha vehicle_listings (20260330_vehicle_listings.sql).
-- =========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_type_enum') then
    create type public.service_type_enum as enum
      ('academia', 'dentista', 'farmacia', 'advogado', 'mecanico', 'salao', 'clinica', 'outro');
  end if;
end
$$;

-- =========================================================
-- ANUNCIOS DE SERVICOS
-- =========================================================

create table if not exists public.service_listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  title text not null,
  slug text unique,
  description text,

  service_type public.service_type_enum not null default 'outro',

  -- Serviço não tem preço fixo comparável (imóvel/veículo têm) — texto livre.
  price_label text,

  city text not null,
  state text not null,
  neighborhood text,
  address_line text,
  address_number text,
  public_address_label text,

  visibility_status public.real_estate_listing_status not null default 'draft',
  contact_unlock_cost integer not null default 9,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_service_listings_updated_at on public.service_listings;
create trigger trg_service_listings_updated_at
before update on public.service_listings
for each row
execute function public.set_updated_at();

-- =========================================================
-- CONTATOS PROTEGIDOS (SERVICOS)
-- =========================================================

create table if not exists public.service_listing_contacts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.service_listings(id) on delete cascade,
  owner_user_id uuid not null,
  contact_name text,
  whatsapp_e164 text,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_service_listing_contacts_updated_at on public.service_listing_contacts;
create trigger trg_service_listing_contacts_updated_at
before update on public.service_listing_contacts
for each row
execute function public.set_updated_at();

-- =========================================================
-- MIDIAS (SERVICOS)
-- =========================================================

create table if not exists public.service_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.service_listings(id) on delete cascade,
  owner_user_id uuid not null,
  media_type text not null default 'image',
  sort_order integer not null default 0,

  original_storage_path text not null,
  public_masked_storage_path text,

  moderation_status public.real_estate_media_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_service_media_updated_at on public.service_media;
create trigger trg_service_media_updated_at
before update on public.service_media
for each row
execute function public.set_updated_at();

-- =========================================================
-- RLS - SEGURANCA
-- =========================================================

alter table public.service_listings enable row level security;
alter table public.service_listing_contacts enable row level security;
alter table public.service_media enable row level security;

create policy service_listings_owner_all on public.service_listings for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy service_contacts_owner_all on public.service_listing_contacts for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy service_media_owner_all on public.service_media for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Public visibility
create or replace view public.public_service_listings as
select
  s.id,
  s.title,
  s.slug,
  s.service_type,
  s.price_label,
  s.city,
  s.state,
  s.neighborhood,
  s.public_address_label,
  s.published_at
from public.service_listings s
where s.visibility_status = 'published';

grant select on public.public_service_listings to anon, authenticated;

notify pgrst, 'reload schema';
