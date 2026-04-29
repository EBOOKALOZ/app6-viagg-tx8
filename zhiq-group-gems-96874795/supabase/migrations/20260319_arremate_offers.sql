-- ═══════════════════════════════════════════════════════════════
-- ARREMATE OFFERS — RPCs com schema REAL do banco
-- Viagg-TX8 Platform — 2026-03-19
--
-- Schema real (via information_schema):
--   arremate_offers: arremate_listing_id, customer_user_id,
--                    offer_amount, note, status, quantity
--   auction_events:  auction_listing_id, event_type, event_payload
--   auction_listings: store_id, listing_type, status
--                     (no merchant_id — owner via merchant_stores.user_id)
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. RPC: submit_arremate_offer ─────────────────────────
-- Comprador envia oferta. Frontend envia:
--   p_listing_id (uuid), p_amount_cents (integer), p_message (text)

DROP FUNCTION IF EXISTS public.submit_arremate_offer(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.submit_arremate_offer(
  p_listing_id uuid,
  p_amount_cents integer,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_listing record;
  v_offer_id uuid;
  v_user_id uuid := auth.uid();
  v_store_owner uuid;
BEGIN
  -- Buscar listing
  SELECT * INTO v_listing
  FROM public.auction_listings
  WHERE id = p_listing_id;

  IF v_listing IS NULL OR v_listing.listing_type != 'arremate' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Arremate não encontrado');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Arremate não está ativo');
  END IF;

  -- Verificar se não é o dono da loja (via merchant_stores.user_id)
  SELECT user_id INTO v_store_owner
  FROM public.merchant_stores
  WHERE id = v_listing.store_id;

  IF v_store_owner = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não pode enviar oferta no próprio arremate');
  END IF;

  -- Inserir oferta (colunas REAIS do banco)
  INSERT INTO public.arremate_offers (
    arremate_listing_id,
    customer_user_id,
    offer_amount,
    quantity,
    note,
    status
  ) VALUES (
    p_listing_id,
    v_user_id,
    p_amount_cents / 100.0,   -- converter centavos → reais
    1,
    p_message,
    'pending'
  )
  RETURNING id INTO v_offer_id;

  -- Registrar evento (colunas REAIS)
  BEGIN
    INSERT INTO public.auction_events (auction_listing_id, event_type, event_payload)
    VALUES (
      p_listing_id,
      'offer_sent',
      jsonb_build_object('offer_id', v_offer_id, 'amount_cents', p_amount_cents, 'user_id', v_user_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id);
END;
$fn$;


-- ─── 2. RPC: respond_arremate_offer ────────────────────────
-- Lojista aceita/rejeita oferta. Frontend envia:
--   p_offer_id (uuid), p_accept (boolean), p_response_message (text)

DROP FUNCTION IF EXISTS public.respond_arremate_offer(uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.respond_arremate_offer(
  p_offer_id uuid,
  p_accept boolean,
  p_response_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_offer record;
  v_listing record;
  v_user_id uuid := auth.uid();
  v_store_owner uuid;
BEGIN
  -- Buscar oferta (colunas REAIS)
  SELECT * INTO v_offer
  FROM public.arremate_offers
  WHERE id = p_offer_id;

  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta não encontrada');
  END IF;

  -- Buscar listing
  SELECT * INTO v_listing
  FROM public.auction_listings
  WHERE id = v_offer.arremate_listing_id;

  -- Verificar permissão (dono da loja)
  SELECT user_id INTO v_store_owner
  FROM public.merchant_stores
  WHERE id = v_listing.store_id;

  IF v_store_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada');
  END IF;

  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta já respondida');
  END IF;

  -- Atualizar oferta
  UPDATE public.arremate_offers SET
    status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
    updated_at = now()
  WHERE id = p_offer_id;

  -- Se aceita: vender listing + rejeitar demais ofertas
  IF p_accept THEN
    UPDATE public.auction_listings SET
      status = 'sold',
      winner_user_id = v_offer.customer_user_id,
      updated_at = now()
    WHERE id = v_offer.arremate_listing_id;

    UPDATE public.arremate_offers
    SET status = 'rejected', updated_at = now()
    WHERE arremate_listing_id = v_offer.arremate_listing_id
      AND id != p_offer_id
      AND status = 'pending';
  END IF;

  -- Evento
  BEGIN
    INSERT INTO public.auction_events (auction_listing_id, event_type, event_payload)
    VALUES (
      v_offer.arremate_listing_id,
      CASE WHEN p_accept THEN 'offer_accepted' ELSE 'offer_rejected' END,
      jsonb_build_object('offer_id', p_offer_id, 'accepted', p_accept, 'user_id', v_user_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'accepted', p_accept);
END;
$fn$;
