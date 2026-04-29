-- =========================================================
-- CREATE NEW PUBLIC BUCKET FOR REAL ESTATE IMAGES
-- =========================================================

-- 1. Create the bucket as PUBLIC
insert into storage.buckets (id, name, public)
values ('real-estate-public', 'real-estate-public', true)
on conflict (id) do update set public = true;

-- 2. RESET POLICIES for the new bucket to ensure clean state
drop policy if exists "Public Read Access" on storage.objects;
drop policy if exists "Authenticated Upload Access" on storage.objects;
drop policy if exists "Owner Delete Access" on storage.objects;

-- 3. ALLOW PUBLIC READING (The absolute fix for images not loading)
create policy "Public Read Access"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'real-estate-public');

-- 4. ALLOW AUTHENTICATED UPLOADS
create policy "Authenticated Upload Access"
on storage.objects for insert
to authenticated
with check (bucket_id = 'real-estate-public');

-- 5. ALLOW OWNERS TO DELETE THEIR FILES
create policy "Owner Delete Access"
on storage.objects for delete
to authenticated
using (bucket_id = 'real-estate-public' AND (auth.uid() = owner));

notify pgrst, 'reload schema';
