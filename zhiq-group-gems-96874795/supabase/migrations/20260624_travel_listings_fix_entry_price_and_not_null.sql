-- Fix 1: entry_price deve ser text (campo livre como "R$ 2.990/pessoa")
alter table public.travel_listings
  alter column entry_price type text using entry_price::text;

-- Fix 2: city e state nao podem ser NOT NULL sem campo no formulario
alter table public.travel_listings
  alter column city drop not null;

alter table public.travel_listings
  alter column state drop not null;

-- Fix 3: publicar listings que ficaram como draft
update public.travel_listings
set visibility_status = 'published',
    published_at = coalesce(published_at, now())
where visibility_status = 'draft'
  and owner_user_id is not null;

-- Fix 4: garantir que anon pode ler travel_listings publicadas
drop policy if exists travel_listings_public_read on public.travel_listings;
create policy travel_listings_public_read
  on public.travel_listings for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
