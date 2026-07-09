-- ============================================================
-- COMISSÃO DO MOTOBOY — FONTE ÚNICA DA VERDADE (definitivo)
-- 2026-07-10 · autorizado pelo usuário após auditoria completa
--
-- PROBLEMAS ELIMINADOS (achados da auditoria):
--  B1) delivery_offers tem status E offer_status; o aceite gravava só
--      status='accepted' e a liquidação/espelho filtravam offer_status
--      → oferta aceita nunca era achada → tier ignorado.
--  B2) Fallbacks divergentes: liquidação 75% × espelho 80% × legados 20%.
--  → Efeito: card prometia o tier, carteira pagava 75%, admin via 80%.
--
-- ARQUITETURA:
--  • O PERCENTUAL nasce em UM lugar: official_motoboy_commission(uuid)
--    (override do admin via profiles.percentual_comissao_atual → tier
--    oficial por grupos válidos → 25).
--  • O LÍQUIDO nasce em UM lugar: na OFERTA (create_delivery_offers_
--    for_order grava commission_percent/gross_value/net_value).
--  • A LIQUIDAÇÃO consome o net da oferta aceita; sem oferta (borda),
--    usa a MESMA função oficial — nunca um número hardcoded.
--  • O ESPELHO (pay_escrow_holds) não recalcula: lê a mesma oferta e,
--    na liquidação, é SOBRESCRITO com os centavos exatos liquidados
--    (UPSERT) → Carteira = Extrato = Dashboard = Admin = Ledger.
--  • status × offer_status: backfill + trigger de sincronização — as
--    duas colunas nunca mais divergem, e os leitores aceitam ambas.
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ─── 1. FONTE ÚNICA DO PERCENTUAL ──────────────────────────────
-- REGRA DO PRODUTO: comissão DECRESCENTE pela quantidade de grupos de
-- WhatsApp válidos, sempre contada AO VIVO (nunca um campo possivelmente
-- desatualizado). Único que passa na frente: override EXPLÍCITO do admin
-- (commission_overrides.custom_rate).
CREATE OR REPLACE FUNCTION public.official_motoboy_commission(p_user uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct    numeric;
  v_groups integer;
BEGIN
  -- 1) Override explícito do admin (precedência)
  BEGIN
    SELECT custom_rate INTO v_pct
      FROM public.commission_overrides WHERE user_id = p_user;
  EXCEPTION WHEN OTHERS THEN v_pct := NULL; END;
  IF v_pct IS NOT NULL AND v_pct >= 0 AND v_pct <= 100 THEN
    RETURN v_pct;
  END IF;

  -- 2) Tier oficial por grupos válidos (0→25 · 1→20 · 2→16 · 3→12 · 4→9 · 5+→6)
  BEGIN
    SELECT count(*) INTO v_groups
      FROM public.whatsapp_groups g
     WHERE g.owner_user_id = p_user
       AND (g.valid_for_commission = true
            OR (g.validation_status = 'approved'
                AND g.is_active = true AND g.is_valid = true));
  EXCEPTION WHEN OTHERS THEN v_groups := 0; END;

  RETURN CASE
    WHEN v_groups >= 5 THEN 6
    WHEN v_groups = 4 THEN 9
    WHEN v_groups = 3 THEN 12
    WHEN v_groups = 2 THEN 16
    WHEN v_groups = 1 THEN 20
    ELSE 25
  END;
END $$;

REVOKE ALL ON FUNCTION public.official_motoboy_commission(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.official_motoboy_commission(uuid) TO authenticated, service_role;

-- ─── 2. FIM DO SPLIT status × offer_status ─────────────────────
-- Backfill: alinha o histórico (inclui as aceitas que a liquidação não achava)
UPDATE public.delivery_offers
   SET offer_status = status
 WHERE status IS NOT NULL
   AND offer_status IS DISTINCT FROM status;

-- Sincronização permanente: quem gravar status, grava offer_status junto.
CREATE OR REPLACE FUNCTION public.tg_sync_offer_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT NULL THEN
    NEW.offer_status := NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_delivery_offers_status_sync ON public.delivery_offers;
CREATE TRIGGER trg_delivery_offers_status_sync
  BEFORE INSERT OR UPDATE ON public.delivery_offers
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_offer_status();

-- ─── 3. ACEITE grava as DUAS colunas (cinto e suspensório) ─────
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_offer RECORD;
    v_order_status text;
BEGIN
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'Oferta não encontrada.'); END IF;
    IF v_offer.status NOT IN ('pending', 'open') THEN RETURN jsonb_build_object('ok', false, 'reason', 'Esta oferta não está mais disponível.'); END IF;

    SELECT status INTO v_order_status FROM public.service_orders WHERE id = v_offer.delivery_order_id FOR UPDATE;
    IF v_order_status NOT IN ('searching', 'pending', 'awaiting_professional') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Esta entrega já foi assumida por outro motoboy.');
    END IF;

    UPDATE public.delivery_offers
    SET status = 'accepted', offer_status = 'accepted',
        motoboy_id = v_user_id, professional_uid = v_user_id,
        accepted_at = now(), updated_at = now()
    WHERE id = p_offer_id;

    UPDATE public.service_orders
    SET status = 'accepted', motoboy_id = v_user_id, accepted_at = now(), updated_at = now()
    WHERE id = v_offer.delivery_order_id;

    UPDATE public.delivery_offers
    SET status = 'cancelled', offer_status = 'cancelled', updated_at = now()
    WHERE delivery_order_id = v_offer.delivery_order_id AND id <> p_offer_id AND status IN ('pending', 'open');

    RETURN jsonb_build_object('ok', true, 'order_id', v_offer.delivery_order_id);
END; $$;

-- ─── 4. OFERTA: único ponto onde o líquido NASCE ───────────────
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
        -- FONTE ÚNICA do percentual
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
            commission_percent, gross_value, net_value
        ) VALUES (
            v_order.id, v_order.id,
            v_motoboy.user_id, v_motoboy.user_id,
            v_order.merchant_id, 'pending', 'pending', now() + interval '8 minutes',
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

-- ─── 5. LIQUIDAÇÃO: consome a oferta; espelho recebe CÓPIA exata ───
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
  v_pct       numeric;
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

  -- net OFICIAL = o da oferta aceita (aceita QUALQUER uma das duas colunas).
  SELECT net_value INTO v_offer_net
    FROM public.delivery_offers
   WHERE service_order_id = p_order_id
     AND (offer_status = 'accepted' OR status = 'accepted')
     AND net_value IS NOT NULL
   ORDER BY accepted_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF v_offer_net IS NOT NULL THEN
    v_net := v_offer_net;
  ELSE
    -- Borda sem oferta: a MESMA fonte oficial — nunca número fixo.
    v_pct := public.official_motoboy_commission(v_prof);
    v_net := round(v_gross * (1.0 - v_pct / 100.0), 2);
  END IF;
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

  -- ESPELHO = CÓPIA EXATA do liquidado (upsert sobrescreve qualquer valor
  -- pré-existente do trigger de delivered) → extrato/admin = carteira/ledger.
  INSERT INTO public.pay_escrow_holds (
    idempotency_key, service_type, service_id,
    payer_user_id, professional_user_id,
    amount_cents, platform_fee_cents, professional_amount_cents,
    status, held_at, released_at, metadata
  ) VALUES (
    'so-' || p_order_id::text,
    CASE WHEN v_ord.service_type::text IN ('delivery','ride','mototaxi','freight','credit_purchase')
         THEN v_ord.service_type::text ELSE 'delivery' END,
    p_order_id,
    COALESCE(v_ord.payer_uid, v_ord.customer_uid, v_ord.merchant_id),
    v_prof,
    round(v_gross * 100)::int,
    round(v_fee   * 100)::int,
    round(v_net   * 100)::int,
    'released',
    COALESCE(v_ord.accepted_at, v_ord.created_at, now()),
    now(),
    jsonb_build_object(
      'source', 'pay_release_ride_payment',
      'commission_percent', CASE WHEN v_gross > 0 THEN round((v_fee / v_gross) * 100, 2) ELSE NULL END,
      'settled_copy', true
    )
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    amount_cents              = EXCLUDED.amount_cents,
    platform_fee_cents        = EXCLUDED.platform_fee_cents,
    professional_amount_cents = EXCLUDED.professional_amount_cents,
    status                    = EXCLUDED.status,
    released_at               = EXCLUDED.released_at,
    metadata                  = EXCLUDED.metadata;

  RETURN jsonb_build_object('ok', true, 'gross', v_gross, 'net', v_net, 'fee', v_fee,
                            'profile', v_owner_t::text, 'tx', v_res);
END $$;

REVOKE ALL ON FUNCTION public.pay_release_ride_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_release_ride_payment(uuid) TO authenticated, service_role;

-- ─── 6. ESPELHO no delivered: consome a oferta / fonte oficial ─────
-- (a liquidação depois sobrescreve com a cópia exata — item 5)
CREATE OR REPLACE FUNCTION public.record_escrow_on_service_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professional uuid;
  v_gross numeric(12,2);
  v_net   numeric(12,2);
  v_fee   numeric(12,2);
  v_offer RECORD;
  v_pct   numeric;
  v_type  text;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN

    v_professional := COALESCE(NEW.courier_id, NEW.motoboy_id, NEW.professional_uid);

    SELECT gross_value, net_value INTO v_offer
    FROM public.delivery_offers
    WHERE service_order_id = NEW.id
      AND (v_professional IS NULL OR professional_uid = v_professional)
      AND (offer_status = 'accepted' OR status = 'accepted')
      AND gross_value IS NOT NULL AND net_value IS NOT NULL
    ORDER BY accepted_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_gross := v_offer.gross_value;
      v_net   := v_offer.net_value;
    ELSE
      -- Borda sem oferta: MESMA fonte oficial (nunca 0.80 fixo).
      v_gross := COALESCE(NEW.total_price, 0);
      v_pct   := public.official_motoboy_commission(v_professional);
      v_net   := round(v_gross * (1.0 - v_pct / 100.0), 2);
    END IF;

    v_fee := v_gross - v_net;

    IF v_gross <= 0 THEN
      RETURN NEW;
    END IF;

    v_type := CASE
      WHEN NEW.service_type::text IN ('delivery','ride','mototaxi','freight','credit_purchase')
        THEN NEW.service_type::text
      ELSE 'delivery'
    END;

    INSERT INTO public.pay_escrow_holds (
      idempotency_key, service_type, service_id,
      payer_user_id, professional_user_id,
      amount_cents, platform_fee_cents, professional_amount_cents,
      status, held_at, released_at, metadata
    ) VALUES (
      'so-' || NEW.id::text,
      v_type,
      NEW.id,
      COALESCE(NEW.payer_uid, NEW.customer_uid, NEW.merchant_id),
      v_professional,
      round(v_gross * 100)::int,
      round(v_fee   * 100)::int,
      round(v_net   * 100)::int,
      'released',
      COALESCE(NEW.accepted_at, NEW.created_at, now()),
      now(),
      jsonb_build_object(
        'source', 'record_escrow_on_service_order_delivered',
        'commission_percent', CASE WHEN v_gross > 0 THEN round((v_fee / v_gross) * 100, 2) ELSE NULL END,
        'from_accepted_offer', FOUND
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_escrow_on_delivered ON public.service_orders;
CREATE TRIGGER trg_record_escrow_on_delivered
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_escrow_on_service_order_delivered();
