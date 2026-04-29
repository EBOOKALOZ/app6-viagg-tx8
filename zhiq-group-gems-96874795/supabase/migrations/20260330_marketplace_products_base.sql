-- =========================================================
-- MARKETPLACE PRODUCTS - BASE V1
-- =========================================================

-- 1. Create Enums if not exists
do $$
begin
  if not exists (select 1 from pg_type where typname = 'marketplace_product_status') then
    create type public.marketplace_product_status as enum (
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

-- 2. Create Table
create table if not exists public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  owner_user_id uuid not null references auth.users(id),
  profile_id uuid, -- Link optional
  store_id uuid, -- Link optional
  advertiser_account_id uuid, -- Link optional

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

  status public.marketplace_product_status not null default 'draft',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  is_approved boolean not null default false,

  credits_cost_to_publish integer,
  views_count integer not null default 0,
  clicks_count integer not null default 0,
  leads_count integer not null default 0,

  admin_notes text,
  rejection_reason text,

  published_at timestamptz,
  expires_at timestamptz
);

-- 3. Indices
create index if not exists idx_mkt_products_owner on public.marketplace_products(owner_user_id);
create index if not exists idx_mkt_products_status on public.marketplace_products(status);
create index if not exists idx_mkt_products_active on public.marketplace_products(is_active);
create index if not exists idx_mkt_products_approved on public.marketplace_products(is_approved);
create index if not exists idx_mkt_products_city on public.marketplace_products(city);
create index if not exists idx_mkt_products_state on public.marketplace_products(state);
create index if not exists idx_mkt_products_created on public.marketplace_products(created_at);

-- 4. Triggers
drop trigger if exists trg_marketplace_products_updated_at on public.marketplace_products;
create trigger trg_marketplace_products_updated_at
before update on public.marketplace_products
for each row
execute function public.set_updated_at();

-- 5. RLS Security
alter table public.marketplace_products enable row level security;

-- Policies
-- Admin can see and manage everything
create policy "Admins can manage all marketplace products"
on public.marketplace_products
for all
to authenticated
using (has_role(auth.uid(), 'admin'::app_role));

-- Owners can see and manage their own products
create policy "Owners can manage their own marketplace products"
on public.marketplace_products
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- Public can see active and approved products
create policy "Public can view active and approved products"
on public.marketplace_products
for select
to anon, authenticated
using (status = 'active' and is_approved = true and is_active = true);

-- 6. RPC and Views (Optional but good for scalability)
create or replace view public.active_marketplace_listings as
select 
  id, title, slug, price, promotional_price, currency, 
  city, state, cover_image_url, category_name, condition,
  views_count, created_at
from public.marketplace_products
where status = 'active' and is_approved = true and is_active = true;

grant select on public.active_marketplace_listings to anon, authenticated;

notify pgrst, 'reload schema';
