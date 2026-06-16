-- ═══════════════════════════════════════════════════════════════
-- Notificação por e-mail quando chega uma OFERTA de arremate
-- Viagg-TX8 Platform
--
-- AFTER INSERT em arremate_offers → edge function `swift-action`
-- (source = 'offer'). A função envia:
--   • e-mail ao LOJISTA (dono da loja do arremate) com a oferta
--   • e-mail de CONFIRMAÇÃO ao COMPRADOR (buyer_user_id) — "torça p/ aceitar"
--
-- Produto (título/imagem/preço) vem de auction_listings:
--   store_id, title, product_image_url, buy_now_price
-- ⚠️ auction_listings NÃO tem owner_user_id. O dono vem de
--    merchant_stores.user_id (via store_id). Mandamos store_id E o user_id
--    do dono (advertiser_user_id) p/ a função resolver o e-mail por 2 caminhos.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_store_on_arremate_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ⚠️ Função publicada como `swift-action` (Verify JWT OFF, aceita a anon key).
  v_url    text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
  v_store  uuid;
  v_owner  uuid;
  v_title  text;
  v_image  text;
  v_price  numeric;
begin
  select al.store_id, al.title, al.product_image_url, al.buy_now_price, ms.user_id
    into v_store, v_title, v_image, v_price, v_owner
  from public.auction_listings al
  left join public.merchant_stores ms on ms.id = al.store_id
  where al.id = NEW.arremate_listing_id;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'source',             'offer',
      'store_id',           v_store,
      'advertiser_user_id', v_owner,
      'offer_amount',       NEW.offer_amount,
      'offer_note',         NEW.note,
      'listing_title',      v_title,
      'listing_image_url',  v_image,
      'listing_price_brl',  v_price,
      'buyer_user_id',      NEW.customer_user_id
    )
  );
  return NEW;
exception
  when others then
    raise warning 'notify_store_on_arremate_offer falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_store_on_arremate_offer on public.arremate_offers;
create trigger trg_notify_store_on_arremate_offer
  after insert on public.arremate_offers
  for each row
  execute function public.notify_store_on_arremate_offer();
