-- ═══════════════════════════════════════════════════════════════
-- E-mail de confirmação quando o ANUNCIANTE DE IMÓVEIS compra um pacote.
-- Viagg-TX8 Platform
--
-- Contexto: após o fix do checkout, a compra de pacote de IMÓVEIS passa a usar
-- walletContext='real_estate' → metadata.grant_kind='real_estate' e
-- product_type='real_estate_credits'. Os triggers existentes NÃO cobrem esse caso:
--   • trg_notify_merchant_on_credit_purchase  → exige payer_owner_type='merchant_store'
--   • trg_notify_advertiser_on_credit_purchase → exige grant_kind='advertiser_credit'
-- Sem este trigger, a compra de imóveis ficaria SEM e-mail de confirmação.
--
-- Destinatário = comprador (NEW.created_by). A edge function resolve o e-mail por
-- advertiser_user_id (advertiser_accounts → merchant_stores → profiles).
-- O comprovante/recibo é montado na própria edge function a partir da ordem.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_real_estate_on_credit_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url   text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
  v_buyer uuid := NEW.created_by;
  v_store uuid;
begin
  select id into v_store from public.merchant_stores where user_id = v_buyer limit 1;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'source',             'package_purchase',
      'store_id',           v_store,
      'advertiser_user_id', v_buyer,
      'amount_brl',         NEW.amount,
      'package_name',       NEW.product_snapshot ->> 'package_name',
      'credits',            coalesce(NEW.product_snapshot -> 'package_credits', NEW.metadata -> 'credits'),
      'order_id',           NEW.id
    )
  );
  return NEW;
exception
  when others then
    raise warning 'notify_real_estate_on_credit_purchase falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_real_estate_on_credit_purchase on public.pay_payment_orders;
create trigger trg_notify_real_estate_on_credit_purchase
  after update on public.pay_payment_orders
  for each row
  when (
    NEW.status = 'paid'
    and OLD.status is distinct from NEW.status
    and NEW.metadata->>'grant_kind' = 'real_estate'
  )
  execute function public.notify_real_estate_on_credit_purchase();
