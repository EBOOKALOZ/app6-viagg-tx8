-- ═══════════════════════════════════════════════════════════════
-- Notificação por e-mail ao lojista quando ele COMPRA SALDO p/ chamar motoboy
-- Viagg-TX8 Platform
--
-- Dispara a edge function de e-mail (source = 'wallet_topup') sempre que uma
-- ordem de recarga de saldo (merchant_wallet) é confirmada como 'paid' pelo
-- webhook do Mercado Pago.
--
-- A recarga de saldo ("Comprar + Saldo" / chamar motoboy) é marcada no frontend
-- com metadata.kind = 'wallet_topup' (WalletTopupButton + MerchantCredits).
-- A compra de PACOTE de créditos NÃO é marcada assim (manda grant_kind), então
-- não dispara este e-mail — evita duplicidade com o e-mail de crédito do ledger.
--
-- O destinatário é resolvido na edge function a partir de store_id
-- (= payer_owner_id quando payer_owner_type = 'merchant_store').
--
-- Requisitos: pg_net habilitada + edge function publicada (swift-action) +
-- secrets RESEND_API_KEY / EMAIL_FROM.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_merchant_on_wallet_topup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ⚠️ Função publicada como `swift-action` (Verify JWT OFF) — mesma usada pelos
  -- demais triggers de e-mail. A `send-event-notification` rejeita a anon key (401).
  v_url  text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
begin
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'source',     'wallet_topup',
      'store_id',   NEW.payer_owner_id,
      'amount_brl', NEW.amount,
      'order_id',   NEW.id
    )
  );
  return NEW;
exception
  -- Nunca deixar a falha de notificação reverter a confirmação do pagamento
  when others then
    raise warning 'notify_merchant_on_wallet_topup falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_merchant_on_wallet_topup on public.pay_payment_orders;
create trigger trg_notify_merchant_on_wallet_topup
  after update on public.pay_payment_orders
  for each row
  when (
    NEW.status = 'paid'
    and OLD.status is distinct from NEW.status
    and NEW.payer_owner_type = 'merchant_store'
    and (NEW.metadata ->> 'kind') = 'wallet_topup'
  )
  execute function public.notify_merchant_on_wallet_topup();
