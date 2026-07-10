-- ============================================================
-- FOTO DO SOLICITANTE NA OFERTA + PERFIL PÚBLICO SEGURO
-- 2026-07-10
--
-- Achado (sonda): profiles NÃO é legível entre usuários (RLS) — o
-- motoboy nunca conseguia a foto do cliente, e o cliente não lia
-- nome/foto do profissional. NÃO vamos abrir a RLS de profiles
-- (tem CPF/dados pessoais). Em vez disso:
--
--  1. delivery_offers ganha requester_avatar_snapshot: o criador de
--     ofertas (SECURITY DEFINER) carimba a imagem certa na oferta —
--     loja → logo_url · chamada de cliente → avatar do perfil.
--  2. RPC get_public_profile(uuid): expõe SOMENTE name + avatar_url
--     (para o card do cliente mostrar o profissional, e vice-versa).
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ─── 1. Coluna de snapshot da imagem do solicitante ───────────
ALTER TABLE public.delivery_offers
  ADD COLUMN IF NOT EXISTS requester_avatar_snapshot text;

-- ─── 2. Perfil público mínimo (nome + foto, nada mais) ─────────
CREATE OR REPLACE FUNCTION public.get_public_profile(p_user uuid)
RETURNS TABLE (name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.name, p.avatar_url
    FROM public.profiles p
   WHERE p.id = p_user;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO authenticated, service_role;

-- ─── 3. Criador de ofertas v4: carimba a imagem do solicitante ─
--     (mantém TUDO da fonte única de comissão + coords + nomes)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
    v_is_customer boolean;
    v_store_name text;
    v_avatar text;
    v_pct numeric;
    v_gross numeric;
    v_net numeric;
BEGIN
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

    v_is_customer := (v_order.payer_uid IS NOT NULL AND v_order.payer_uid = v_order.merchant_id);

    v_store_name := COALESCE(
        NULLIF(TRIM(v_order.store_name), ''),
        CASE WHEN v_is_customer THEN NULL
             ELSE (SELECT nome_loja FROM public.merchant_stores
                    WHERE user_id = v_order.merchant_id LIMIT 1) END);

    -- Imagem do solicitante (o definer lê livremente):
    --   cliente → avatar do perfil (fallback: logo da loja dele, se tiver)
    --   loja    → logo (fallback avatar do dono)
    IF v_is_customer THEN
      SELECT avatar_url INTO v_avatar FROM public.profiles WHERE id = v_order.merchant_id;
      IF v_avatar IS NULL THEN
        SELECT logo_url INTO v_avatar FROM public.merchant_stores
         WHERE user_id = v_order.merchant_id LIMIT 1;
      END IF;
    ELSE
      SELECT logo_url INTO v_avatar FROM public.merchant_stores
       WHERE user_id = v_order.merchant_id LIMIT 1;
      IF v_avatar IS NULL THEN
        SELECT avatar_url INTO v_avatar FROM public.profiles WHERE id = v_order.merchant_id;
      END IF;
    END IF;

    v_gross := COALESCE(v_order.total_price, 0);

    FOR v_motoboy IN
        SELECT user_id FROM public.motoboy_profiles
        WHERE is_approved = true AND is_online = true
    LOOP
        v_pct := public.official_motoboy_commission(v_motoboy.user_id);
        v_net := round(v_gross * (1.0 - v_pct / 100.0), 2);

        INSERT INTO public.delivery_offers (
            service_order_id, delivery_order_id,
            motoboy_id, professional_uid,
            store_id, status, offer_status, expires_at,
            distance_km_snapshot, estimated_price_snapshot,
            pickup_address_snapshot, dropoff_address_snapshot,
            store_name_snapshot, customer_name_snapshot, notes_snapshot,
            pickup_lat_snapshot, pickup_lng_snapshot,
            dropoff_lat_snapshot, dropoff_lng_snapshot,
            commission_percent, gross_value, net_value,
            requester_avatar_snapshot
        ) VALUES (
            v_order.id, v_order.id,
            v_motoboy.user_id, v_motoboy.user_id,
            v_order.merchant_id, 'pending', 'pending', now() + interval '8 minutes',
            v_order.distance_km, v_order.total_price,
            v_order.pickup_location, v_order.destination,
            v_store_name, v_order.customer_id, v_order.notes,
            v_order.pickup_lat, v_order.pickup_lng,
            v_order.destination_lat, v_order.destination_lng,
            v_pct, v_gross, v_net,
            v_avatar
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;
