-- ═══════════════════════════════════════════════════════════════
-- Notificação por e-mail ao lojista a CADA evento de produto
-- Viagg-TX8 Platform
--
-- Dispara a edge function `send-event-notification` sempre que uma
-- linha entra em advertiser_credit_ledger (entrada/saída de créditos
-- = todo evento de produto do lojista).
--
-- Requisitos:
--   - Extensão pg_net habilitada (Database → Extensions → pg_net)
--   - Edge function send-event-notification publicada
--   - Secrets SMTP_* configurados no projeto
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_advertiser_on_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ⚠️ AJUSTE a URL se o ref do projeto mudar.
  v_url  text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/send-event-notification';
  -- Chave anon (pública). A função roda com verify_jwt = false; o header é só boa prática.
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
begin
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'ledger_id',             NEW.id,
      'advertiser_account_id', NEW.advertiser_account_id,
      'entry_type',            NEW.entry_type,
      'amount',                NEW.amount,
      'reason_code',           NEW.reason_code,
      'description',           NEW.description
    )
  );
  return NEW;
exception
  -- Nunca deixar a falha de notificação reverter o débito/crédito
  when others then
    raise warning 'notify_advertiser_on_ledger falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_advertiser_on_ledger on public.advertiser_credit_ledger;
create trigger trg_notify_advertiser_on_ledger
  after insert on public.advertiser_credit_ledger
  for each row
  execute function public.notify_advertiser_on_ledger();
