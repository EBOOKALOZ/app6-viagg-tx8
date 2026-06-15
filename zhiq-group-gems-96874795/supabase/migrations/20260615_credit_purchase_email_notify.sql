-- ═══════════════════════════════════════════════════════════════
-- Notificação por e-mail ao lojista quando ele COMPRA UM PACOTE DE CRÉDITOS
-- Viagg-TX8 Platform
--
-- Dispara a edge function de e-mail (source = 'package_purchase') quando uma
-- ordem de compra de pacote de créditos é confirmada como 'paid' pelo webhook
-- (ou pela reconciliação manual / payments-reconcile).
--
-- Distinção: a compra de pacote SEMPRE leva metadata.grant_kind (ex.: 'merchant',
-- 'real_estate'), enquanto a recarga de saldo ("wallet_topup") NÃO leva. Por isso
-- este trigger filtra `metadata ? 'grant_kind'` e o de recarga filtra kind=wallet_topup
-- → nunca disparam os dois para a mesma ordem.
--
-- Destinatário resolvido na edge function por store_id (= payer_owner_id quando
-- payer_owner_type = 'merchant_store').
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_merchant_on_credit_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
      'source',       'package_purchase',
      'store_id',     NEW.payer_owner_id,
      'amount_brl',   NEW.amount,
      'package_name', NEW.product_snapshot ->> 'package_name',
      'credits',      NEW.product_snapshot -> 'package_credits',
      'order_id',     NEW.id
    )
  );
  return NEW;
exception
  when others then
    raise warning 'notify_merchant_on_credit_purchase falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_merchant_on_credit_purchase on public.pay_payment_orders;
create trigger trg_notify_merchant_on_credit_purchase
  after update on public.pay_payment_orders
  for each row
  when (
    NEW.status = 'paid'
    and OLD.status is distinct from NEW.status
    and NEW.payer_owner_type = 'merchant_store'
    and (NEW.metadata ? 'grant_kind')
  )
  execute function public.notify_merchant_on_credit_purchase();
