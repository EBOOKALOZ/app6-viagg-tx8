CREATE OR REPLACE FUNCTION public.place_auction_bid(p_auction_listing_id uuid, p_bidder_user_id uuid, p_bid_amount numeric)
 RETURNS TABLE(auction_listing_id uuid, current_bid numeric, total_bids integer, bid_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_bid numeric;
  v_minimum_increment numeric;
  v_status text;
  v_ends_at timestamptz;
  v_bid_id uuid;
begin
  select
    l.current_bid,
    l.minimum_increment,
    l.status,
    l.ends_at
  into
    v_current_bid,
    v_minimum_increment,
    v_status,
    v_ends_at
  from public.auction_listings l
  where l.id = p_auction_listing_id
  for update;

  if v_status <> 'active' then
    raise exception 'Leilão não está ativo';
  end if;

  if now() > v_ends_at then
    raise exception 'Leilão encerrado';
  end if;

  if p_bid_amount < (v_current_bid + v_minimum_increment) then
    raise exception 'Lance abaixo do mínimo permitido';
  end if;

  insert into public.auction_bids (
    auction_listing_id,
    bidder_user_id,
    bid_amount,
    status
  )
  values (
    p_auction_listing_id,
    p_bidder_user_id,
    p_bid_amount,
    'winning'
  )
  returning id into v_bid_id;

  update public.auction_bids
     set status = 'outbid'
   where auction_listing_id = p_auction_listing_id
     and id <> v_bid_id
     and status = 'winning';

  update public.auction_listings
     set current_bid = p_bid_amount,
         total_bids = total_bids + 1,
         updated_at = now()
   where id = p_auction_listing_id;

  insert into public.auction_events (
    auction_listing_id,
    event_type,
    event_payload
  )
  values (
    p_auction_listing_id,
    'bid_placed',
    jsonb_build_object(
      'bid_id', v_bid_id,
      'bidder_user_id', p_bidder_user_id,
      'bid_amount', p_bid_amount
    )
  );

  update public.auction_conversion_metrics
     set bids_count = bids_count + 1,
         updated_at = now()
   where listing_type = 'auction'
     and listing_id = p_auction_listing_id;

  return query
  select
    l.id,
    l.current_bid,
    l.total_bids,
    v_bid_id
  from public.auction_listings l
  where l.id = p_auction_listing_id;
end;
$function$


-- -----
CREATE OR REPLACE FUNCTION public.create_auction_listing(p_store_id uuid, p_title text, p_description text DEFAULT NULL::text, p_product_image_url text DEFAULT NULL::text, p_starting_bid numeric DEFAULT 0, p_buy_now_price numeric DEFAULT NULL::numeric, p_reserve_price numeric DEFAULT NULL::numeric, p_minimum_increment numeric DEFAULT 1, p_city text DEFAULT NULL::text, p_neighborhood text DEFAULT NULL::text, p_state text DEFAULT 'TX'::text, p_duration_hours integer DEFAULT 24, p_product_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id uuid;
  v_ends_at timestamptz;
BEGIN
  v_ends_at := now() + (p_duration_hours || ' hours')::interval;

  INSERT INTO public.auction_listings (
    store_id, product_id, title, description, product_image_url,
    starting_bid, current_bid, buy_now_price, reserve_price,
    minimum_increment, city, neighborhood, state,
    starts_at, ends_at, status
  ) VALUES (
    p_store_id, p_product_id, p_title, p_description, p_product_image_url,
    p_starting_bid, p_starting_bid, p_buy_now_price, p_reserve_price,
    p_minimum_increment, p_city, p_neighborhood, p_state,
    now(), v_ends_at, 'active'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'ends_at', v_ends_at
  );
END;
$function$


-- -----
CREATE OR REPLACE FUNCTION public.create_auction_listing(p_store_id uuid, p_title text, p_description text DEFAULT NULL::text, p_product_image_url text DEFAULT NULL::text, p_starting_bid numeric DEFAULT 0, p_buy_now_price numeric DEFAULT NULL::numeric, p_reserve_price numeric DEFAULT NULL::numeric, p_minimum_increment numeric DEFAULT 1, p_city text DEFAULT NULL::text, p_neighborhood text DEFAULT NULL::text, p_state text DEFAULT 'TX'::text, p_duration_hours integer DEFAULT 24, p_product_id uuid DEFAULT NULL::uuid, p_listing_type text DEFAULT 'auction'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id uuid;
  v_ends_at timestamptz;
  v_type text;
BEGIN
  -- Validate listing_type
  v_type := CASE WHEN p_listing_type IN ('auction', 'arremate') THEN p_listing_type ELSE 'auction' END;

  v_ends_at := now() + (p_duration_hours || ' hours')::interval;

  INSERT INTO public.auction_listings (
    store_id, product_id, title, description, product_image_url,
    starting_bid, current_bid, buy_now_price, reserve_price,
    minimum_increment, city, neighborhood, state,
    starts_at, ends_at, status, listing_type
  ) VALUES (
    p_store_id, p_product_id, p_title, p_description, p_product_image_url,
    p_starting_bid, p_starting_bid, p_buy_now_price, p_reserve_price,
    p_minimum_increment, p_city, p_neighborhood, p_state,
    now(), v_ends_at, 'active', v_type
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'ends_at', v_ends_at,
    'listing_type', v_type
  );
END;
$function$


-- -----
CREATE OR REPLACE FUNCTION public.create_auction_listing(p_store_id uuid, p_product_id uuid, p_title text, p_description text, p_product_image_url text, p_city text, p_state text, p_neighborhood text, p_starting_bid numeric, p_minimum_increment numeric, p_buy_now_price numeric, p_reserve_price numeric, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_listing_id uuid;
  v_credit_cost numeric(12,2);
begin
  if p_ends_at <= p_starts_at then
    raise exception 'ends_at deve ser maior que starts_at';
  end if;

  select credits_cost
    into v_credit_cost
  from public.merchant_credit_usage_rules
  where feature_code = 'auction_publish'
    and is_active = true
  limit 1;

  if v_credit_cost is null then
    raise exception 'Regra de crédito auction_publish não encontrada';
  end if;

  insert into public.auction_listings (
    store_id,
    product_id,
    title,
    description,
    product_image_url,
    city,
    state,
    neighborhood,
    starting_bid,
    current_bid,
    minimum_increment,
    buy_now_price,
    reserve_price,
    status,
    starts_at,
    ends_at
  )
  values (
    p_store_id,
    p_product_id,
    p_title,
    p_description,
    p_product_image_url,
    p_city,
    p_state,
    p_neighborhood,
    p_starting_bid,
    p_starting_bid,
    coalesce(p_minimum_increment, 1),
    p_buy_now_price,
    p_reserve_price,
    'active',
    p_starts_at,
    p_ends_at
  )
  returning id into v_listing_id;

  perform public.debit_merchant_credits(
    p_store_id,
    v_credit_cost,
    'debit',
    'auction_publish',
    'Débito de créditos por publicação de leilão',
    jsonb_build_object(
      'module', 'leilao',
      'auction_listing_id', v_listing_id,
      'product_id', p_product_id
    ),
    null,
    p_created_by
  );

  insert into public.auction_events (
    auction_listing_id,
    event_type,
    event_payload
  )
  values (
    v_listing_id,
    'auction_created',
    jsonb_build_object(
      'store_id', p_store_id,
      'product_id', p_product_id,
      'credits_debited', v_credit_cost
    )
  );

  insert into public.auction_conversion_metrics (
    listing_type,
    listing_id
  )
  values (
    'auction',
    v_listing_id
  )
  on conflict do nothing;

  return v_listing_id;
end;
$function$


-- -----
CREATE OR REPLACE FUNCTION public.create_auction_listing(p_buy_now_price_cents bigint, p_category_id uuid, p_condition text, p_description text, p_duration_hours integer, p_fulfillment_type text, p_image_url text, p_listing_type text, p_merchant_id uuid, p_min_bid_increment_cents bigint, p_neighborhood text, p_opportunity_price_cents bigint, p_original_price_cents bigint, p_starting_price_cents bigint, p_store_id uuid, p_title text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_listing_id uuid;
  v_city text;
  v_state text;
begin
  -- tenta puxar cidade/estado reais da loja, se existir
  select
    coalesce(ms.cidade, ms.city),
    ms.estado
  into
    v_city,
    v_state
  from public.merchant_stores ms
  where ms.id = p_store_id
  limit 1;

  v_listing_id := public.create_auction_listing(
    p_store_id := p_store_id,
    p_product_id := p_category_id,
    p_title := p_title,
    p_description := p_description,
    p_product_image_url := p_image_url,
    p_city := v_city,
    p_state := v_state,
    p_neighborhood := p_neighborhood,
    p_starting_bid := coalesce(p_starting_price_cents, 0) / 100.0,
    p_minimum_increment := greatest(coalesce(p_min_bid_increment_cents, 100), 1) / 100.0,
    p_buy_now_price := case
      when p_buy_now_price_cents is null then null
      else p_buy_now_price_cents / 100.0
    end,
    p_reserve_price := case
      when p_opportunity_price_cents is null then null
      else p_opportunity_price_cents / 100.0
    end,
    p_starts_at := now(),
    p_ends_at := now() + make_interval(hours => coalesce(p_duration_hours, 24)),
    p_created_by := p_merchant_id
  );

  return v_listing_id;
end;
$function$


-- -----
CREATE OR REPLACE FUNCTION public.create_auction_listing(p_store_id uuid, p_merchant_id uuid, p_title text, p_description text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_listing_type text DEFAULT 'auction'::text, p_starting_price_cents integer DEFAULT 0, p_buy_now_price_cents integer DEFAULT NULL::integer, p_opportunity_price_cents integer DEFAULT NULL::integer, p_original_price_cents integer DEFAULT NULL::integer, p_min_bid_increment_cents integer DEFAULT 500, p_category text DEFAULT 'geral'::text, p_condition text DEFAULT 'novo'::text, p_fulfillment_type text DEFAULT 'pickup'::text, p_city text DEFAULT NULL::text, p_neighborhood text DEFAULT NULL::text, p_duration_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id uuid;
  v_ends_at timestamptz;
BEGIN
  v_ends_at := now() + (p_duration_hours || ' hours')::interval;

  INSERT INTO public.auction_listings (
    store_id, merchant_id, title, description, image_url,
    listing_type, starting_price_cents, current_price_cents,
    buy_now_price_cents, opportunity_price_cents, original_price_cents,
    min_bid_increment_cents, category, condition, fulfillment_type,
    city, neighborhood, starts_at, ends_at, status
  ) VALUES (
    p_store_id, p_merchant_id, p_title, p_description, p_image_url,
    p_listing_type, p_starting_price_cents, p_starting_price_cents,
    p_buy_now_price_cents, p_opportunity_price_cents, p_original_price_cents,
    p_min_bid_increment_cents, p_category, p_condition, p_fulfillment_type,
    p_city, p_neighborhood, now(), v_ends_at, 'active'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'ends_at', v_ends_at
  );
END;
$function$

