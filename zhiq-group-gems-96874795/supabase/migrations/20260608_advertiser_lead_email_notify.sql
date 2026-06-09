-- ═══════════════════════════════════════════════════════════════
-- Notificação por e-mail ao lojista quando chega um INTERESSADO
-- Viagg-TX8 Platform
--
-- Dispara a edge function `send-event-notification` (source = 'lead')
-- sempre que uma linha entra em advertiser_contact_intentions
-- (visitante demonstrou interesse num produto/imóvel/veículo).
--
-- Requisitos: pg_net habilitada + edge function publicada + SMTP_* secrets.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_advertiser_on_intention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ⚠️ Função publicada como `swift-action` (a nova `send-event-notification`
  -- não permite salvar Verify JWT = OFF, então rejeita a anon key). swift-action
  -- está com Verify JWT OFF e aceita a anon key dos triggers.
  v_url  text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  -- Chave anon (pública). A função roda com verify_jwt = false.
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
begin
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'source',             'lead',
      'advertiser_user_id', NEW.advertiser_user_id,
      'listing_module',     NEW.listing_module,
      'listing_id',         NEW.listing_id,
      'interest_type',      NEW.interest_type,
      'visitor_name',       NEW.visitor_name,
      'visitor_phone',      NEW.visitor_phone,
      'visitor_message',    NEW.visitor_message,
      'city',               NEW.city
    )
  );
  return NEW;
exception
  when others then
    raise warning 'notify_advertiser_on_intention falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_advertiser_on_intention on public.advertiser_contact_intentions;
create trigger trg_notify_advertiser_on_intention
  after insert on public.advertiser_contact_intentions
  for each row
  execute function public.notify_advertiser_on_intention();
