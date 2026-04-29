-- =========================================================
-- PRODUCT LISTINGS - FINAL DEFINITIVE RESET
-- =========================================================

-- 1. CLEANUP PREVIOUS ATTEMPTS
drop table if exists public.marketplace_products cascade;
drop table if exists public.product_listings cascade;
drop type if exists public.product_listing_status cascade;

-- 2. CREATE TYPE
create type public.product_listing_status as enum (
  'draft', 
  'pending_review', 
  'active', 
  'paused', 
  'rejected', 
  'sold', 
  'archived'
);

-- 3. CREATE TABLE: product_listings
create table public.product_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  owner_user_id uuid not null references auth.users(id) on delete cascade,
  advertiser_account_id uuid,
  store_id uuid,

  title text not null,
  slug text unique,
  description text,
  short_description text,

  category_id uuid,
  category_name text,

  condition text not null default 'new',
  price numeric(14,2) not null default 0,
  promotional_price numeric(14,2),
  currency text not null default 'BRL',

  stock_quantity integer default 1,
  sku text,

  city text not null,
  state text not null,
  region text,
  neighborhood text,

  cover_image_url text,
  gallery_urls jsonb default '[]'::jsonb,

  has_invoice boolean not null default false,

  status public.product_listing_status not null default 'pending_review',
  is_active boolean not null default false,
  is_approved boolean not null default false,
  is_featured boolean not null default false,

  views_count integer not null default 0,
  clicks_count integer not null default 0,
  leads_count integer not null default 0,

  admin_notes text,
  rejection_reason text,

  published_at timestamptz,
  expires_at timestamptz
);

-- 4. INDICES
create index idx_product_listings_owner on public.product_listings(owner_user_id);
create index idx_product_listings_status on public.product_listings(status);
create index idx_product_listings_active on public.product_listings(is_active);
create index idx_product_listings_approved on public.product_listings(is_approved);
create index idx_product_listings_location on public.product_listings(city, state);
create index idx_product_listings_created on public.product_listings(created_at desc);

-- 5. TRIGGER FOR UPDATED_AT
create trigger trg_product_listings_updated_at
before update on public.product_listings
for each row
execute function public.set_updated_at();

-- 6. RLS SECURITY - ALIGNED WITH PROJECT STANDARD
alter table public.product_listings enable row level security;

-- Policies

-- ADM: Can see and manage EVERYTHING
create policy "Admins can manage all product listings"
on public.product_listings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- OWN: Can see and manage OWN items
create policy "Owners can manage their own product listings"
on public.product_listings
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- PUB: Can see APPROVED and ACTIVE items
create policy "Public can view active and approved product listings"
on public.product_listings
for select
to anon, authenticated
using (is_approved = true and is_active = true and status = 'active');

-- 7. NOTIFY SCHEMA RELOAD
notify pgrst, 'reload schema';
