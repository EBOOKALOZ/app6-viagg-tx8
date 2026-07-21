-- ════════════════════════════════════════════════════════════════════════════
-- Leilão: e-mail aos 2 lados a cada lance (loja + quem deu o lance) · 2026-07-20
--
-- REGRA DO PROJETO: sempre e-mail aos 2 lados. Hoje place_auction_bid NÃO notifica.
-- Esta migration enfileira um evento 'auction_bid' em notification_events com os
-- dados dos DOIS destinatários (lojista e autor do lance) a cada lance registrado.
-- A entrega do e-mail é feita pela edge send-event-notification (ver nota no fim).
--
-- ADITIVO: só adiciona o enqueue no fim do place_auction_bid (2-arg canônica).
-- Idempotente. Não altera a lógica de lance (validações/gravação preservadas).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.place_auction_bid(p_listing_id uuid, p_amount_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_listing record;
  v_bid_id uuid;
  v_user_id uuid := auth.uid();
  v_current_bid_cents integer;
  v_min_increment_cents integer;
  v_store_user uuid; v_store_nome text; v_store_email text;
  v_bidder_email text;
BEGIN
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_listing IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;
  IF v_listing.status != 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não está ativo'); END IF;
  IF v_listing.ends_at < now() THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão encerrado'); END IF;

  v_current_bid_cents := COALESCE((v_listing.current_bid * 100)::integer, 0);
  v_min_increment_cents := COALESCE((v_listing.minimum_increment * 100)::integer, 100);
  IF p_amount_cents < (v_current_bid_cents + v_min_increment_cents) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lance abaixo do mínimo');
  END IF;

  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning)
  VALUES (p_listing_id, v_user_id, p_amount_cents, true) RETURNING id INTO v_bid_id;
  UPDATE public.auction_listings SET
    current_bid = (p_amount_cents::numeric / 100), total_bids = COALESCE(total_bids, 0) + 1, updated_at = now()
  WHERE id = p_listing_id;

  -- ── NOTIFICAÇÃO AOS 2 LADOS (enfileira; a edge envia os e-mails) ──
  BEGIN
    -- e-mail da loja (dono do leilão): via merchant_stores + auth.users
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
        -- lado LOJA
        'store_user_id', coalesce(v_store_user, v_listing.owner_user_id),
        'store_name', v_store_nome,
        'store_email', v_store_email,
        -- lado COMPRADOR (quem deu o lance)
        'bidder_user_id', v_user_id,
        'bidder_email', v_bidder_email
      ));
  EXCEPTION WHEN others THEN
    -- notificação NUNCA derruba o lance (o lance é o que importa)
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount_cents', p_amount_cents);
END;
$function$;

-- VERIFICAÇÃO
SELECT (pg_get_functiondef(p.oid) ILIKE '%enqueue_notification_event%')::text AS agora_notifica
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='place_auction_bid'
  AND pg_get_function_identity_arguments(p.oid)='p_listing_id uuid, p_amount_cents integer';
