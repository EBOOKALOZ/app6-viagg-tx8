-- =========================================================
-- AUTOMATED MODERATION QUEUE FLOW
-- =========================================================

-- 1. Create the trigger function to handle automatic queuing
create or replace function public.handle_real_estate_media_moderation_trigger()
returns trigger
language plpgsql
security definer -- Important: allows bypassing user RLS to ensure queuing
set search_path = public
as $$
begin
  -- Automatically insert into moderation queue on media creation
  insert into public.real_estate_moderation_queue (media_id, listing_id, status)
  values (new.id, new.listing_id, 'pending')
  on conflict (media_id) do nothing; -- Prevent duplicate entries
  
  return new;
end;
$$;

-- 2. Create the trigger on real_estate_media
drop trigger if exists trg_real_estate_media_moderation on public.real_estate_media;
create trigger trg_real_estate_media_moderation
after insert on public.real_estate_media
for each row
execute function public.handle_real_estate_media_moderation_trigger();

-- 3. Update RLS policies for real_estate_moderation_queue
-- Remove old policies to re-apply correctly
drop policy if exists real_estate_moderation_queue_owner_view on public.real_estate_moderation_queue;
drop policy if exists real_estate_moderation_queue_owner_insert on public.real_estate_moderation_queue;

-- Allow owners of the listing to SEE their moderation queue items
create policy real_estate_moderation_queue_owner_view
on public.real_estate_moderation_queue
for select
to authenticated
using (
  exists (
    select 1
    from public.real_estate_listings l
    where l.id = real_estate_moderation_queue.listing_id
      and l.owner_user_id = auth.uid()
  )
);

-- Allow owners of the listing to INSERT (manual backup, though trigger handles it)
create policy real_estate_moderation_queue_owner_insert
on public.real_estate_moderation_queue
for insert
to authenticated
with check (
  exists (
    select 1
    from public.real_estate_listings l
    where l.id = listing_id
      and l.owner_user_id = auth.uid()
  )
);

-- Note: No UPDATE/DELETE policies as this is a secure audit/moderation queue 
-- managed by the system.

notify pgrst, 'reload schema';
