-- =========================================================
-- COMANDO FRETES & TRANSPORTES - BASE V1
-- Espelha service_listings (20260621_service_listings_base.sql), mas
-- "categoria" é tipo de veículo (texto livre, lista fechada no front-end —
-- ver src/lib/freight/vehicleTypes.ts), não setor de negócio.
-- =========================================================

-- =========================================================
-- ANUNCIOS DE FRETES
-- =========================================================

create table if not exists public.freight_listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  title text not null,
  slug text unique,
  description text,

  -- Tipo de veículo do prestador (Moto/Carro/Utilitário/Fiorino/Van/
  -- Caminhão Pequeno/Caminhão Médio) — texto livre, lista fechada no front.
  vehicle_type text not null default 'Van',

  -- Frete não tem preço fixo comparável — texto livre.
  price_label text,

  -- Preço por km rodado (opcional, estruturado p/ comparação entre anúncios).
  price_per_km numeric(10,2),

  -- Rotas/trajetos atendidos pelo autônomo — texto livre
  -- (ex: "São Paulo → Campinas, SP → RJ, Grande SP").
  coverage_routes text,

  city text not null,
  state text not null,
  neighborhood text,
  address_line text,
  address_number text,
  public_address_label text,

  visibility_status public.real_estate_listing_status not null default 'draft',
  contact_unlock_cost integer not null default 9,

  -- Destaque pago (RPC feature_freight_listing).
  is_featured boolean not null default false,
  featured_until timestamptz,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_freight_listings_updated_at on public.freight_listings;
create trigger trg_freight_listings_updated_at
before update on public.freight_listings
for each row
execute function public.set_updated_at();

-- =========================================================
-- CONTATOS PROTEGIDOS (FRETES)
-- =========================================================

create table if not exists public.freight_listing_contacts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.freight_listings(id) on delete cascade,
  owner_user_id uuid not null,
  contact_name text,
  email text,
  whatsapp_e164 text,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_freight_listing_contacts_updated_at on public.freight_listing_contacts;
create trigger trg_freight_listing_contacts_updated_at
before update on public.freight_listing_contacts
for each row
execute function public.set_updated_at();

-- =========================================================
-- MIDIAS (FRETES)
-- =========================================================

create table if not exists public.freight_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.freight_listings(id) on delete cascade,
  owner_user_id uuid not null,
  media_type text not null default 'image',
  sort_order integer not null default 0,

  original_storage_path text not null,
  public_masked_storage_path text,

  moderation_status public.real_estate_media_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_freight_media_updated_at on public.freight_media;
create trigger trg_freight_media_updated_at
before update on public.freight_media
for each row
execute function public.set_updated_at();

-- =========================================================
-- RLS - SEGURANCA
-- =========================================================

alter table public.freight_listings enable row level security;
alter table public.freight_listing_contacts enable row level security;
alter table public.freight_media enable row level security;

create policy freight_listings_owner_all on public.freight_listings for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy freight_contacts_owner_all on public.freight_listing_contacts for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy freight_media_owner_all on public.freight_media for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Leitura pública (visitante anônimo/não-dono) — já incluída desde o início
-- (em Serviços isso só foi adicionado depois, numa correção de bug).
create policy freight_listings_public_read on public.freight_listings for select to anon, authenticated using (true);
create policy freight_media_public_read on public.freight_media for select to anon, authenticated using (true);

-- Public visibility
create or replace view public.public_freight_listings as
select
  f.id,
  f.title,
  f.slug,
  f.vehicle_type,
  f.price_label,
  f.price_per_km,
  f.coverage_routes,
  f.city,
  f.state,
  f.neighborhood,
  f.public_address_label,
  f.is_featured,
  f.published_at
from public.freight_listings f
where f.visibility_status = 'published';

grant select on public.public_freight_listings to anon, authenticated;

notify pgrst, 'reload schema';
