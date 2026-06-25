-- E-mail de confirmação ao anunciante quando ele PUBLICA um anúncio de
-- viagem (ViagemForm sempre insere com visibility_status='published').
-- Espelha notify_advertiser_on_freight_listing_published, só que dispara
-- em INSERT em travel_listings, com listing_module='travel'.

create or replace function public.notify_advertiser_on_travel_listing_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
begin
  if NEW.visibility_status <> 'published' then
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
    body    := jsonb_build_object(
      'source',             'listing_published',
      'advertiser_user_id', NEW.owner_user_id,
      'listing_module',     'travel',
      'listing_id',         NEW.id
    )
  );
  return NEW;
exception when others then
  raise warning 'notify_advertiser_on_travel_listing_published falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_advertiser_on_travel_listing_published on public.travel_listings;
create trigger trg_notify_advertiser_on_travel_listing_published
  after insert on public.travel_listings
  for each row
  execute function public.notify_advertiser_on_travel_listing_published();

select pg_notify('pgrst', 'reload schema');
