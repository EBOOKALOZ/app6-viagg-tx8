-- ============================================================
-- COMISSÃO PADRÃO 25% NAS CORRIDAS/ENTREGAS (decisão 2026-07-09)
--
-- Estava descontando 20% (defaults espalhados). Agora:
--  1. create_delivery_offers_for_order grava commission_percent /
--     gross_value / net_value na oferta, calculando pela TABELA OFICIAL
--     de grupos válidos do motoboy (whatsapp_groups):
--       0 grupos → 25% · 1 → 20% · 2 → 16% · 3 → 12% · 4 → 9% · 5+ → 6%
--     (mesma regra de calculateCommissionRate no front).
--  2. pay_release_ride_payment: fallback sem oferta 0.80 → 0.75
--     (com oferta, vale o net_value gravado — consistente).
--  3. Front alinhado (default 25 no listener) — deploy junto.
--
-- Substitui a versão de 20260709_offers_snapshot_coords (mantém as
-- coordenadas + detecção de chamada de cliente). Idempotente.
-- SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

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
    v_pct numeric;
    v_groups integer;
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

    v_gross := COALESCE(v_order.total_price, 0);

    FOR v_motoboy IN
        SELECT user_id FROM public.motoboy_profiles
        WHERE is_approved = true AND is_online = true
    LOOP
        -- Comissão POR MOTOBOY pela tabela oficial de grupos válidos:
        -- 0→25% · 1→20% · 2→16% · 3→12% · 4→9% · 5+→6%
        BEGIN
            SELECT count(*) INTO v_groups
              FROM public.whatsapp_groups g
             WHERE g.owner_user_id = v_motoboy.user_id
               AND (g.valid_for_commission = true
                    OR (g.validation_status = 'approved'
                        AND g.is_active = true AND g.is_valid = true));
        EXCEPTION WHEN OTHERS THEN v_groups := 0; END;
        v_pct := CASE
            WHEN v_groups >= 5 THEN 6
            WHEN v_groups = 4 THEN 9
            WHEN v_groups = 3 THEN 12
            WHEN v_groups = 2 THEN 16
            WHEN v_groups = 1 THEN 20
            ELSE 25
        END;
        v_net := round(v_gross * (1.0 - v_pct / 100.0), 2);

        INSERT INTO public.delivery_offers (
            service_order_id, delivery_order_id,
            motoboy_id, professional_uid,
            store_id, status, expires_at,
            distance_km_snapshot, estimated_price_snapshot,
            pickup_address_snapshot, dropoff_address_snapshot,
            store_name_snapshot, customer_name_snapshot, notes_snapshot,
            pickup_lat_snapshot, pickup_lng_snapshot,
            dropoff_lat_snapshot, dropoff_lng_snapshot,
            commission_percent, gross_value, net_value
        ) VALUES (
            v_order.id, v_order.id,
            v_motoboy.user_id, v_motoboy.user_id,
            v_order.merchant_id, 'pending', now() + interval '8 minutes',
            v_order.distance_km, v_order.total_price,
            v_order.pickup_location, v_order.destination,
            v_store_name, v_order.customer_id, v_order.notes,
            v_order.pickup_lat, v_order.pickup_lng,
            v_order.destination_lat, v_order.destination_lng,
            v_pct, v_gross, v_net
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;

-- ─── Escrow release: fallback 75/25 (com oferta aceita, vale o net dela) ───
CREATE OR REPLACE FUNCTION public.pay_release_ride_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_ord       public.service_orders%ROWTYPE;
  v_prof      uuid;
  v_gross     numeric(12,2);
  v_net       numeric(12,2);
  v_fee       numeric(12,2);
  v_offer_net numeric(12,2);
  v_owner_t   public.pay_owner_type;
  v_acct_t    public.pay_account_type;
  v_escrow    uuid;
  v_prof_acct uuid;
  v_platform  uuid;
  v_res       jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — requer autenticação' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ord FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_order % não existe', p_order_id USING ERRCODE = '23503';
  END IF;

  v_prof  := COALESCE(v_ord.courier_id, v_ord.motoboy_id, v_ord.professional_uid);
  v_gross := COALESCE(v_ord.total_price, 0);
  IF v_gross <= 0 OR v_prof IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'sem valor ou sem profissional', 'order_id', p_order_id);
  END IF;

  -- net = oferta aceita (se tiver), senão 75/25 (comissão padrão 25%)
  SELECT net_value INTO v_offer_net
    FROM public.delivery_offers
   WHERE service_order_id = p_order_id
     AND offer_status = 'accepted'
     AND net_value IS NOT NULL
   ORDER BY accepted_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  v_net := COALESCE(v_offer_net, round(v_gross * 0.75, 2));
  v_fee := v_gross - v_net;

  CASE v_ord.service_type::text
    WHEN 'mototaxi' THEN v_owner_t := 'mototaxi_profile'; v_acct_t := 'mototaxi_wallet';
    WHEN 'ride'     THEN v_owner_t := 'driver_profile';   v_acct_t := 'driver_wallet';
    ELSE                 v_owner_t := 'motoboy_profile';  v_acct_t := 'motoboy_wallet';
  END CASE;

  v_escrow    := public._pay_account_system('platform', NULL, 'platform_escrow');
  v_prof_acct := public._pay_account_system(v_owner_t, v_prof, v_acct_t);
  v_platform  := public._pay_account_system('platform', NULL, 'platform_main');

  v_res := public.pay_post_transaction(
    'ride_release',
    'ride_release:' || p_order_id::text,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', v_escrow, 'direction', 'debit', 'entry_type', 'payment_out',
        'amount', v_gross, 'reference_type', 'service_order', 'reference_id', p_order_id
      ),
      jsonb_build_object(
        'account_id', v_prof_acct, 'direction', 'credit', 'entry_type', 'motoboy_earning',
        'amount', v_net, 'reference_type', 'service_order', 'reference_id', p_order_id,
        'metadata', jsonb_build_object('gross', v_gross, 'fee', v_fee, 'profile', v_owner_t::text)
      ),
      jsonb_build_object(
        'account_id', v_platform, 'direction', 'credit', 'entry_type', 'commission_income',
        'amount', v_fee, 'reference_type', 'service_order', 'reference_id', p_order_id
      )
    ),
    'service_order', p_order_id,
    jsonb_build_object('kind', 'ride_release', 'service_type', v_ord.service_type)
  );

  RETURN jsonb_build_object('ok', true, 'gross', v_gross, 'net', v_net, 'fee', v_fee,
                            'profile', v_owner_t::text, 'tx', v_res);
END $$;

REVOKE ALL ON FUNCTION public.pay_release_ride_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_release_ride_payment(uuid) TO authenticated, service_role;
