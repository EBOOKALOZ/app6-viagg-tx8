-- ═══════════════════════════════════════════════════════════════
-- E-mail de RECIBO DE PAGAMENTO para toda compra de créditos
-- Viagg-TX8 Platform — 2026-06-26
--
-- Dispara após QUALQUER transição status→'paid' em pay_payment_orders.
-- Cobre: merchant_store, advertiser, vehicle, real_estate, service, freight, travel.
-- O e-mail de "compra confirmada" (package_purchase) é disparado pelos triggers
-- específicos por grant_kind. Este trigger dispara O RECIBO separado — um e-mail
-- formal de comprovante com: nº pedido, data, produto, créditos, método, total.
--
-- Destinatário:
--   payer_owner_type = 'merchant_store' → store_id = payer_owner_id
--   demais → lookup de store pelo created_by + fallback advertiser_user_id
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_receipt_on_payment_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url      text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon     text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
  v_store_id uuid;
  v_body     jsonb;
begin
  -- Resolve store_id para resolução do destinatário na edge function
  if NEW.payer_owner_type = 'merchant_store' then
    v_store_id := NEW.payer_owner_id;
  elsif NEW.created_by is not null then
    select id into v_store_id
    from public.merchant_stores
    where user_id = NEW.created_by
    limit 1;
  end if;

  v_body := jsonb_build_object(
    'source',          'receipt',
    'store_id',        v_store_id,
    'advertiser_user_id', NEW.created_by,
    'order_short_id',  NEW.id,
    'amount_brl',      NEW.amount,
    'package_name',    coalesce(
                         NEW.product_snapshot ->> 'package_name',
                         NEW.metadata ->> 'package_name'
                       ),
    'credits',         coalesce(
                         NEW.product_snapshot -> 'package_credits',
                         NEW.metadata -> 'credits'
                       ),
    'payment_method',  NEW.provider_name,
    'paid_at',         NEW.updated_at
  );

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := v_body
  );
  return NEW;
exception
  when others then
    raise warning 'notify_receipt_on_payment_paid falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_receipt_on_payment_paid on public.pay_payment_orders;
create trigger trg_notify_receipt_on_payment_paid
  after update on public.pay_payment_orders
  for each row
  when (
    NEW.status = 'paid'
    and OLD.status is distinct from NEW.status
  )
  execute function public.notify_receipt_on_payment_paid();
