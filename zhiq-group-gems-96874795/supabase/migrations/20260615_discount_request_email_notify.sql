-- ═══════════════════════════════════════════════════════════════
-- Notificação por e-mail no "Minha Oferta é..." (proposta de desconto)
-- Viagg-TX8 Platform
--
-- O botão "Minha Oferta é..." grava em discount_requests (NÃO em
-- arremate_offers). Esta migration:
--   1. adiciona customer_email (o modal passa a capturar o e-mail do comprador)
--   2. cria trigger AFTER INSERT → edge function `swift-action` (source='offer')
--      • e-mail ao LOJISTA (store_id → dono) com o valor ofertado + produto
--      • e-mail de CONFIRMAÇÃO ao COMPRADOR (se informou customer_email)
--
-- Produto (imagem/título/preço) é resolvido na função por listing_id=product_id
-- (módulo 'product' → merchant_marketing_products / advertiser_listings).
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

alter table public.discount_requests add column if not exists customer_email text;

-- Faz o PostgREST recarregar o schema (senão o insert do front reclama que a
-- coluna não existe — "schema cache").
notify pgrst, 'reload schema';

create or replace function public.notify_store_on_discount_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ⚠️ Função publicada como `swift-action` (Verify JWT OFF, aceita a anon key).
  v_url   text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
  v_owner     uuid;
  v_title     text;
  v_image     text;
  v_price     numeric;
  v_price_txt text;
begin
  -- Dono da loja (p/ resolver o e-mail do lojista por mais de um caminho).
  select user_id into v_owner
  from public.merchant_stores
  where id = NEW.store_id;

  -- Produto (título/imagem/preço) resolvido no SQL e enviado pronto, p/ o
  -- e-mail mostrar imagem+preço mesmo na função antiga. Tenta campanha
  -- (merchant_marketing_products) e depois marketplace (advertiser_listings).
  select mmp.title, mmp.image_url, mmp.price_label
    into v_title, v_image, v_price_txt
  from public.merchant_marketing_products mmp
  where mmp.id = NEW.product_id;

  if v_title is null then
    select al.title, al.cover_image_url, al.price::text
      into v_title, v_image, v_price_txt
    from public.advertiser_listings al
    where al.id = NEW.product_id;
  end if;

  begin
    v_price := nullif(regexp_replace(replace(coalesce(v_price_txt,''), ',', '.'), '[^0-9.]', '', 'g'), '')::numeric;
  exception when others then v_price := null;
  end;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'source',             'offer',
      'store_id',           NEW.store_id,
      'advertiser_user_id', v_owner,
      'offer_amount',       NEW.requested_price,
      'offer_note',         NEW.message,
      'listing_id',         NEW.product_id,
      'listing_module',     'product',
      'listing_title',      v_title,
      'listing_image_url',  v_image,
      'listing_price_brl',  v_price,
      'customer_name',      NEW.customer_name,
      'customer_email',     NEW.customer_email
    )
  );
  return NEW;
exception
  when others then
    raise warning 'notify_store_on_discount_request falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_store_on_discount_request on public.discount_requests;
create trigger trg_notify_store_on_discount_request
  after insert on public.discount_requests
  for each row
  execute function public.notify_store_on_discount_request();
