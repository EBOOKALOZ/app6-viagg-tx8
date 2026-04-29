
-- 1. Permitir que Administradores vejam e gerenciem TODOS os anúncios de imóveis
drop policy if exists real_estate_listings_admin_all on public.real_estate_listings;
create policy real_estate_listings_admin_all
on public.real_estate_listings
for all
to authenticated
using (
  auth.uid() in (
    select user_id from public.user_roles where role = 'admin'
  )
  OR 
  (select is_admin from public.profiles where id = auth.uid()) = true
);

-- 2. Permitir que Administradores vejam e gerenciem TODAS as mídias de imóveis
drop policy if exists real_estate_media_admin_all on public.real_estate_media;
create policy real_estate_media_admin_all
on public.real_estate_media
for all
to authenticated
using (
  auth.uid() in (
    select user_id from public.user_roles where role = 'admin'
  )
  OR 
  (select is_admin from public.profiles where id = auth.uid()) = true
);

-- 3. Garantir que Perfis sejam visíveis para o Administrador identificar o dono do anúncio
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select
on public.profiles
for select
to authenticated
using (true);
