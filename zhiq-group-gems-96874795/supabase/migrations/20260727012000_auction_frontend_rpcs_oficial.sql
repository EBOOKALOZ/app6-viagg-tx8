-- ============================================================================
-- LEILÕES — RPCs chamadas pelo front que estavam AUSENTES em produção
-- (BUG-03 update_auction_listing · BUG-04 auction_set_status ·
--  BUG-05 auction_buy_now · BUG-11 increment_auction_view)
--
-- Origem: 20260723_auction_enterprise_postsale_admin_oficial.sql e
-- 20260723_auction_enterprise_security_bidengine_oficial.sql — cuja aplicação
-- integral falha em produção por divergência de schema em tabelas legadas
-- (auction_events.auction_listing_id, auction_financial_rules sem "scope").
-- Este arquivo extrai SOMENTE as funções necessárias ao front, adaptadas ao
-- schema vivo verificado em 2026-07-27:
--   • auction_listings.buy_now_price (numeric, REAIS — não existe *_cents)
--   • auction_bids(listing_id, user_id, amount_cents, is_winning, source)
--   • deps vivas: auction_log(uuid,text,text,jsonb), mp_is_admin(),
--     orion_auction_settle(uuid), auction_listings.views_count
-- Idempotente (CREATE OR REPLACE). Sem statements destrutivos.
-- ============================================================================

-- 1) Contador de views (fire-and-forget do front; visitante conta) -----------
CREATE OR REPLACE FUNCTION public.increment_auction_view(p_listing_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.auction_listings
     SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = p_listing_id;
$$;

-- 2) State machine de status (pausar/republicar/cancelar) --------------------
CREATE OR REPLACE FUNCTION public.auction_set_status(p_listing_id uuid, p_new_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid(); v_ok boolean := false;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_l.owner_user_id <> v_uid AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner'); END IF;

  v_ok := CASE
    WHEN p_new_status = 'active'    AND v_l.status IN ('draft','paused') THEN true
    WHEN p_new_status = 'paused'    AND v_l.status = 'active' THEN true
    WHEN p_new_status = 'cancelled' AND v_l.status IN ('draft','active','paused') THEN true
    WHEN p_new_status = 'draft'     AND v_l.status = 'draft' THEN true
    ELSE false END;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition',
      'from', v_l.status, 'to', p_new_status); END IF;

  UPDATE public.auction_listings SET status = p_new_status, updated_at = now() WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'status_change', coalesce(v_uid::text,'system'),
    jsonb_build_object('from', v_l.status, 'to', p_new_status));
  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END $$;

-- 3) BUY-NOW: encerra na hora, registra vencedor e liquida -------------------
CREATE OR REPLACE FUNCTION public.auction_buy_now(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid(); v_settle jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_l.buy_now_price IS NULL OR v_l.buy_now_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'buy_now_indisponivel'); END IF;
  IF v_l.status <> 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'nao_ativo'); END IF;
  IF v_uid = v_l.owner_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'self_purchase'); END IF;

  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning, source)
  VALUES (p_listing_id, v_uid, (v_l.buy_now_price*100)::int, true, 'rpc');

  UPDATE public.auction_listings
     SET status = 'ended', winner_user_id = v_uid, current_bid = v_l.buy_now_price,
         ends_at = now(), updated_at = now()
   WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'buy_now', v_uid::text, jsonb_build_object('price', v_l.buy_now_price));

  BEGIN v_settle := public.orion_auction_settle(p_listing_id);
  EXCEPTION WHEN others THEN v_settle := jsonb_build_object('settle_deferred', true); END;

  RETURN jsonb_build_object('success', true, 'winner', v_uid, 'price', v_l.buy_now_price, 'settle', v_settle);
END $$;

-- 4) Atualização segura pelo dono (whitelist de campos; schema vivo) ---------
CREATE OR REPLACE FUNCTION public.update_auction_listing(p_listing_id uuid, p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado'); END IF;

  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;

  IF v_l.owner_user_id <> v_uid AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada'); END IF;

  UPDATE public.auction_listings
     SET title             = COALESCE((p_updates->>'title')::text, title),
         description       = COALESCE((p_updates->>'description')::text, description),
         product_image_url = COALESCE((p_updates->>'product_image_url')::text, product_image_url),
         fulfillment_type  = COALESCE((p_updates->>'fulfillment_type')::text, fulfillment_type),
         -- aceita reais (buy_now_price) e o formato legado em centavos
         buy_now_price     = COALESCE((p_updates->>'buy_now_price')::numeric,
                                      ((p_updates->>'buy_now_price_cents')::numeric / 100.0),
                                      buy_now_price),
         updated_at        = now()
   WHERE id = p_listing_id;

  PERFORM public.auction_log(p_listing_id, 'listing_updated', v_uid::text,
    jsonb_build_object('fields', (SELECT array_agg(k) FROM jsonb_object_keys(p_updates) k)));

  RETURN jsonb_build_object('success', true);
END $$;

-- 5) Permissões: nunca anon; sempre via usuário autenticado -------------------
REVOKE ALL ON FUNCTION public.increment_auction_view(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.auction_set_status(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.auction_buy_now(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.update_auction_listing(uuid, jsonb) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.increment_auction_view(uuid) TO anon, authenticated; -- view conta p/ visitante
GRANT EXECUTE ON FUNCTION public.auction_set_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auction_buy_now(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_auction_listing(uuid, jsonb) TO authenticated;
