-- ORION LEILÕES — Regras de Lance: validação por GRADE do incremento
-- ------------------------------------------------------------------------------
-- O `minimum_increment` (numeric, já persistido em auction_listings) passa a ser
-- ENFORÇADO de verdade em place_auction_bid: um lance só é aceito quando é
-- MÚLTIPLO EXATO do incremento a partir do lance inicial E não é inferior ao
-- próximo mínimo permitido. Antes o RPC só exigia >= atual + incremento
-- (aceitava valores fora da grade, ex.: 1013, 1050).
--
-- Regras (universais, sempre ativas — leilão profissional):
--   • bloquear valores inferiores ao mínimo permitido;
--   • permitir apenas múltiplos do incremento (grade = lance_inicial + k*incremento);
--   • validar automaticamente todo lance no servidor (fonte única de verdade).
--
-- Retorna next_min_cents + increment_cents para o front exibir a mensagem clara
-- "O próximo lance mínimo permitido é R$ X". Não move dinheiro (leilão = contato
-- direto). Notificações aos 2 lados preservadas exatamente.

CREATE OR REPLACE FUNCTION public.place_auction_bid(p_listing_id uuid, p_amount_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_listing record;
  v_bid_id uuid;
  v_user_id uuid := auth.uid();
  v_current_bid_cents integer;
  v_min_increment_cents integer;
  v_starting_cents integer;
  v_next_min_cents integer;
  v_store_user uuid; v_store_nome text; v_store_email text;
  v_bidder_email text;
BEGIN
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_listing IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;
  IF v_listing.status != 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não está ativo'); END IF;
  IF v_listing.ends_at < now() THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão encerrado'); END IF;

  v_current_bid_cents   := COALESCE((v_listing.current_bid       * 100)::integer, 0);
  v_starting_cents      := COALESCE((v_listing.starting_bid      * 100)::integer, 0);
  v_min_increment_cents := COALESCE((v_listing.minimum_increment * 100)::integer, 100);
  IF v_min_increment_cents <= 0 THEN v_min_increment_cents := 100; END IF;

  -- Próximo lance mínimo VÁLIDO = primeiro ponto da grade (lance_inicial + k*incremento)
  -- que seja >= (lance atual + incremento). Robusto mesmo se o atual estiver fora da grade
  -- (leilões antigos anteriores a esta regra).
  v_next_min_cents := v_starting_cents
    + CEIL(
        GREATEST(v_current_bid_cents + v_min_increment_cents - v_starting_cents, v_min_increment_cents)::numeric
        / v_min_increment_cents
      )::integer * v_min_increment_cents;

  -- 1) não pode ser inferior ao mínimo permitido
  IF p_amount_cents < v_next_min_cents THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'below_min',
      'error', 'Lance abaixo do mínimo permitido.',
      'next_min_cents', v_next_min_cents, 'increment_cents', v_min_increment_cents);
  END IF;

  -- 2) deve respeitar o incremento (múltiplo exato a partir do lance inicial)
  IF ((p_amount_cents - v_starting_cents) % v_min_increment_cents) <> 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'off_grid',
      'error', 'O lance deve respeitar o incremento configurado.',
      'next_min_cents', v_next_min_cents, 'increment_cents', v_min_increment_cents);
  END IF;

  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning)
  VALUES (p_listing_id, v_user_id, p_amount_cents, true) RETURNING id INTO v_bid_id;
  UPDATE public.auction_listings SET
    current_bid = (p_amount_cents::numeric / 100), total_bids = COALESCE(total_bids, 0) + 1, updated_at = now()
  WHERE id = p_listing_id;

  -- ── NOTIFICAÇÃO AOS 2 LADOS (enfileira; a edge envia os e-mails) ──
  BEGIN
    SELECT ms.user_id, ms.nome_loja INTO v_store_user, v_store_nome
      FROM merchant_stores ms WHERE ms.id = v_listing.store_id;
    SELECT email INTO v_store_email FROM auth.users WHERE id = coalesce(v_store_user, v_listing.owner_user_id);
    SELECT email INTO v_bidder_email FROM auth.users WHERE id = v_user_id;

    PERFORM enqueue_notification_event(
      'auction_bid', 'auction_bids', v_bid_id, NULL, v_listing.city,
      jsonb_build_object(
        'source', 'auction_bid',
        'listing_id', p_listing_id,
        'listing_title', v_listing.title,
        'amount', (p_amount_cents::numeric / 100),
        'city', v_listing.city,
        'store_user_id', coalesce(v_store_user, v_listing.owner_user_id),
        'store_name', v_store_nome,
        'store_email', v_store_email,
        'bidder_user_id', v_user_id,
        'bidder_email', v_bidder_email
      ));
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- next_min_cents no sucesso = próximo ponto da grade acima deste lance
  RETURN jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount_cents', p_amount_cents,
    'next_min_cents', p_amount_cents + v_min_increment_cents, 'increment_cents', v_min_increment_cents);
END;
$function$;
