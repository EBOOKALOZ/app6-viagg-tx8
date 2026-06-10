-- ═══════════════════════════════════════════════════════════════
-- Notificação por e-mail ao lojista quando chega um PEDIDO
-- Viagg-TX8 Platform
--
-- Dispara a edge function `send-event-notification` (source = 'order')
-- sempre que uma linha entra em purchase_intentions (visitante finalizou
-- uma intenção de compra na loja via submit_purchase_intention).
--
-- O destinatário é resolvido na edge function a partir de store_id
-- (merchant_stores.email → fallback profiles.email).
--
-- Requisitos: pg_net habilitada + edge function `send-event-notification`
-- publicada + secrets RESEND_API_KEY / EMAIL_FROM.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_store_on_purchase_intention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ⚠️ Função publicada como `swift-action` (Verify JWT OFF). A `send-event-notification`
  -- não permite salvar Verify JWT = OFF, então rejeita a anon key dos triggers (401).
  v_url  text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
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
      'source',            'order',
      'store_id',          NEW.store_id,
      'intention_id',      NEW.id,
      'customer_name',     NEW.customer_name,
      'customer_whatsapp', NEW.customer_whatsapp,
      'customer_email',    NEW.customer_email,
      'customer_note',     NEW.customer_note,
      'subtotal',          NEW.subtotal,
      'total_items',       NEW.total_items,
      'checkout_mode',     NEW.checkout_mode
    )
  );
  return NEW;
exception
  -- Nunca deixar a falha de notificação reverter o pedido
  when others then
    raise warning 'notify_store_on_purchase_intention falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_store_on_purchase_intention on public.purchase_intentions;
create trigger trg_notify_store_on_purchase_intention
  after insert on public.purchase_intentions
  for each row
  execute function public.notify_store_on_purchase_intention();
