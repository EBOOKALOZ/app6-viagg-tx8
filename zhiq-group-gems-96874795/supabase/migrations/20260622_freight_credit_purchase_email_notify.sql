-- ═══════════════════════════════════════════════════════════════
-- E-mail de confirmação quando o ANUNCIANTE DE FRETES compra um pacote.
-- Viagg-TX8 Platform
--
-- Espelha notify_service_on_credit_purchase. A compra de pacote de FRETES
-- usa walletContext='freight' → metadata.grant_kind='freight' e
-- product_type='freight_credits'. Sem este trigger, a compra de fretes
-- fica SEM e-mail de confirmação/recibo.
--
-- Destinatário = comprador (NEW.created_by). A edge function (swift-action,
-- source='package_purchase') resolve o e-mail por advertiser_user_id e monta
-- o comprovante/recibo a partir da própria ordem (genérico, sem nada
-- específico de segmento).
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_freight_on_credit_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url   text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
  v_buyer uuid := NEW.created_by;
begin
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'source',             'package_purchase',
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
    raise warning 'notify_freight_on_credit_purchase falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_freight_on_credit_purchase on public.pay_payment_orders;
create trigger trg_notify_freight_on_credit_purchase
  after update on public.pay_payment_orders
  for each row
  when (
    NEW.status = 'paid'
    and OLD.status is distinct from NEW.status
    and NEW.metadata->>'grant_kind' = 'freight'
  )
  execute function public.notify_freight_on_credit_purchase();
