-- =========================================================
-- PRODUCT LISTINGS - DEFINITIVE ISOLATED TABLE
-- =========================================================

-- 1. Create Enums if not exists
do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_listing_status') then
    create type public.product_listing_status as enum (
      'draft', 
      'pending_review', 
      'active', 
      'paused', 
      'rejected', 
      'sold', 
      'archived'
    );
  end if;
end
$$;

-- 2. Create Table: product_listings (Isolated and Consistent)
create table if not exists public.product_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  owner_user_id uuid not null references auth.users(id),
  advertiser_account_id uuid, -- Optional link to advertiser module
  store_id uuid, -- Optional link to store module

  title text not null,
  slug text unique,
  description text,
  short_description text,

  category_id uuid,
  category_name text,

  condition text not null default 'new', -- new / used
  price numeric(14,2) not null default 0,
  promotional_price numeric(14,2),
  currency text not null default 'BRL',

  stock_quantity integer,
  sku text,

  city text not null,
  state text not null,
  region text,
  neighborhood text,

  cover_image_url text,
  gallery_urls jsonb default '[]'::jsonb,

  status public.product_listing_status not null default 'draft',
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

-- 3. Indices
create index if not exists idx_product_listings_owner on public.product_listings(owner_user_id);
create index if not exists idx_product_listings_status on public.product_listings(status);
create index if not exists idx_product_listings_active on public.product_listings(is_active);
create index if not exists idx_product_listings_approved on public.product_listings(is_approved);
create index if not exists idx_product_listings_city on public.product_listings(city);
create index if not exists idx_product_listings_state on public.product_listings(state);
create index if not exists idx_product_listings_created on public.product_listings(created_at);
create index if not exists idx_product_listings_slug on public.product_listings(slug);

-- 4. Triggers
drop trigger if exists trg_product_listings_updated_at on public.product_listings;
create trigger trg_product_listings_updated_at
before update on public.product_listings
for each row
execute function public.set_updated_at();

-- 5. RLS Security
alter table public.product_listings enable row level security;

-- Policies

-- 1. ADM: Manage all
create policy "Admins can manage all product listings"
on public.product_listings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- 2. OWN: Manage own
create policy "Owners can manage their own product listings"
on public.product_listings
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- 3. PUB: View active and approved
create policy "Public can view active and approved product listings"
on public.product_listings
for select
to anon, authenticated
using (status = 'active' and is_approved = true and is_active = true);

-- Cleanup previous attempt if exists
drop table if exists public.marketplace_products;

notify pgrst, 'reload schema';
