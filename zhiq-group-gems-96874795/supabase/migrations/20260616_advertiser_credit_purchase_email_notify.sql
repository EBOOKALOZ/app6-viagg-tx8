-- ═══════════════════════════════════════════════════════════════
-- E-mail de confirmação quando o ANUNCIANTE compra um pacote de créditos
-- Viagg-TX8 Platform
--
-- O trigger existente (trg_notify_merchant_on_credit_purchase) só cobre
-- payer_owner_type='merchant_store'. A compra do anunciante
-- (RealEstateCheckoutContent, walletContext='advertiser') usa
-- payer_owner_type='platform' + metadata.grant_kind='advertiser_credit' →
-- aquele trigger não dispara. Este cobre esse caso.
--
-- Destinatário: resolvido na edge function por advertiser_account_id (+ o
-- user_id do dono como fallback). Pacote/créditos vêm de product_snapshot
-- (o frontend passou a gravar package_name/package_credits); credits cai p/
-- metadata.credits se faltar.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_advertiser_on_credit_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
  -- Destinatário = QUEM COMPROU (dono da conta que pagou). created_by é o
  -- usuário logado que criou a ordem. Resolvemos pelo store_id dele (a função
  -- usa o e-mail de LOGIN do dono) e mandamos o user_id como fallback.
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
      'source',            'package_purchase',
      'store_id',          v_store,
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
    raise warning 'notify_advertiser_on_credit_purchase falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_advertiser_on_credit_purchase on public.pay_payment_orders;
create trigger trg_notify_advertiser_on_credit_purchase
  after update on public.pay_payment_orders
  for each row
  when (
    NEW.status = 'paid'
    and OLD.status is distinct from NEW.status
    and NEW.metadata->>'grant_kind' = 'advertiser_credit'
  )
  execute function public.notify_advertiser_on_credit_purchase();
