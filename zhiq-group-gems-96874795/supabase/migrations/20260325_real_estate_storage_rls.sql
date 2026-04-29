-- =========================================================
-- STORAGE POLICIES FOR REAL ESTATE MODULE
-- =========================================================

-- 1. Ensure buckets exist (Public for treated, Private for originals)
insert into storage.buckets (id, name, public)
values ('real-estate-public', 'real-estate-public', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('real-estate-original', 'real-estate-original', false)
on conflict (id) do nothing;

-- 2. Allow anonymous and authenticated users to upload to real-estate-public
drop policy if exists "Allow anyone to upload to real-estate-public" on storage.objects;
create policy "Allow anyone to upload to real-estate-public"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'real-estate-public');

-- 3. Allow public reading of real-estate-public
drop policy if exists "Allow anyone to read real-estate-public" on storage.objects;
create policy "Allow anyone to read real-estate-public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'real-estate-public');

-- 4. Allow anonymous and authenticated users to upload to real-estate-original
drop policy if exists "Allow anyone to upload to real-estate-original" on storage.objects;
create policy "Allow anyone to upload to real-estate-original"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'real-estate-original');

-- 5. Strict reading of real-estate-original (Only owner or authenticated with permission)
drop policy if exists "Allow owner to read their originals" on storage.objects;
create policy "Allow owner to read their originals"
on storage.objects for select
to authenticated
using (bucket_id = 'real-estate-original' AND (auth.uid() = owner));

notify pgrst, 'reload schema';
