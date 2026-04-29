-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260401_MOTOBOY_OFFER_CARD_FINAL.sql
-- CARD DE CHAMADA DO MOTOBOY — Fix Definitivo
-- Resolve: status mismatch, lat/lng ausentes, campos do card
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG '=== INICIANDO MOTOBOY OFFER CARD FINAL ==='; END $$;

-- ═══════════════════════════════════
-- 1. ADICIONAR COLUNAS FALTANTES
-- ═══════════════════════════════════

-- Coordenadas geográficas snapshot (necessárias para o mapa no card)
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS pickup_lat_snapshot  double precision;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS pickup_lng_snapshot  double precision;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS dropoff_lat_snapshot double precision;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS dropoff_lng_snapshot double precision;

-- Snapshot do nome da loja (pode ter sido omitido nas migrations anteriores)
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS store_name_snapshot  text;

-- Valor total explícito (algumas versões usavam estimated_price_snapshot)
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS total_price         numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS commission_percent  numeric(5,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS gross_value         numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS net_value           numeric(10,2);
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS professional_uid    uuid;

-- ═══════════════════════════════════
-- 2. GARANTIR REALTIME ATIVO
-- ═══════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
    RAISE LOG 'delivery_offers adicionada ao supabase_realtime';
  ELSE
    RAISE LOG 'delivery_offers já estava no supabase_realtime';
  END IF;
END $$;

-- ═══════════════════════════════════
-- 3. REBUILD: create_delivery_offers_for_order
--    Status = 'pending' (alinhado ao frontend)
--    Lat/Lng populados a partir de service_orders
-- ═══════════════════════════════════
DROP FUNCTION IF EXISTS public.create_delivery_offers_for_order(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order        RECORD;
    v_motoboy      RECORD;
    v_offer_count  integer := 0;
    v_commission   numeric := 20;
    v_store_name   text;
    v_net_value    numeric;
BEGIN
    -- Buscar ordem com dados denormalizados da loja
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
    END IF;

    -- Buscar nome da loja: primeiro tenta denormalizado, depois join
    v_store_name := v_order.store_name;
    IF v_store_name IS NULL OR v_store_name = '' THEN
        SELECT nome_loja INTO v_store_name
        FROM public.merchant_stores
        WHERE user_id = v_order.merchant_id
        LIMIT 1;
    END IF;
    v_store_name := COALESCE(v_store_name, 'Loja Parceira');

    -- Disparar para todos motoboys aprovados e online
    FOR v_motoboy IN
        SELECT user_id FROM public.motoboy_profiles
        WHERE is_approved = true AND is_online = true
    LOOP
        -- Buscar comissão do motoboy
        BEGIN
            SELECT COALESCE(percentual_comissao_atual, 20) INTO v_commission
            FROM public.profiles WHERE id = v_motoboy.user_id;
        EXCEPTION WHEN OTHERS THEN
            v_commission := 20;
        END;

        -- Calcular valor líquido
        v_net_value := COALESCE(v_order.total_price, 0) * (1.0 - v_commission / 100.0);

        -- Evitar duplicidade
        IF NOT EXISTS (
            SELECT 1 FROM public.delivery_offers
            WHERE delivery_order_id = v_order.id
              AND motoboy_id = v_motoboy.user_id
              AND status IN ('pending', 'open')
        ) THEN
            INSERT INTO public.delivery_offers (
                delivery_order_id,
                motoboy_id,
                professional_uid,
                store_id,
                status,
                expires_at,
                -- Snapshots textuais
                pickup_address_snapshot,
                dropoff_address_snapshot,
                store_name_snapshot,
                -- Coordenadas para o mapa no card
                pickup_lat_snapshot,
                pickup_lng_snapshot,
                dropoff_lat_snapshot,
                dropoff_lng_snapshot,
                -- Financeiro
                total_price,
                estimated_price_snapshot,
                distance_km_snapshot,
                commission_percent,
                gross_value,
                net_value
            ) VALUES (
                v_order.id,
                v_motoboy.user_id,
                v_motoboy.user_id,
                v_order.merchant_id,
                'pending',  -- ← PADRONIZADO: frontend usa 'pending'
                now() + interval '10 minutes',
                -- Endereços
                COALESCE(v_order.pickup_location,  v_order.store_address, 'Coleta na Loja'),
                COALESCE(v_order.destination, 'Entrega no Cliente'),
                v_store_name,
                -- Latitudes / Longitudes
                v_order.pickup_lat,
                v_order.pickup_lng,
                v_order.destination_lat,
                v_order.destination_lng,
                -- Financeiro
                v_order.total_price,
                v_order.total_price,         -- estimated_price_snapshot (legado)
                v_order.distance_km,
                v_commission,
                v_order.total_price,
                v_net_value
            );
            v_offer_count := v_offer_count + 1;
        END IF;
    END LOOP;

    -- Logar evento
    INSERT INTO public.system_events_log (event_type, payload)
    VALUES ('dispatch_card_final_v8', jsonb_build_object(
        'order_id',      p_delivery_order_id,
        'offers_sent',   v_offer_count,
        'store_name',    v_store_name,
        'pickup_lat',    v_order.pickup_lat,
        'pickup_lng',    v_order.pickup_lng
    ));

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count, 'store', v_store_name);
END;
$$;

-- ═══════════════════════════════════
-- 4. REBUILD: accept_delivery_offer
--    Aceita status 'pending' OR 'open'
-- ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_offer        RECORD;
    v_order_status text;
BEGIN
    -- Bloquear a oferta para escrita atômica
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'offer_not_found');
    END IF;

    -- Verificar se a oferta ainda está disponível (aceitar 'pending' ou 'open')
    IF v_offer.status NOT IN ('pending', 'open') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'offer_no_longer_available');
    END IF;

    -- Verificar se a ordem ainda está disponível
    SELECT status INTO v_order_status
    FROM public.service_orders
    WHERE id = v_offer.delivery_order_id
    FOR UPDATE;

    IF v_order_status NOT IN ('searching', 'pending', 'calculating', 'awaiting_professional', 'open') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'order_already_taken');
    END IF;

    -- Atualizar a ordem: atribuir motoboy
    UPDATE public.service_orders
    SET
        courier_id  = v_offer.motoboy_id,
        motoboy_id  = v_offer.motoboy_id,
        status      = 'accepted',
        accepted_at = now(),
        updated_at  = now()
    WHERE id = v_offer.delivery_order_id;

    -- Marcar esta oferta como aceita
    UPDATE public.delivery_offers
    SET
        status      = 'accepted',
        accepted_at = now(),
        updated_at  = now()
    WHERE id = p_offer_id;

    -- Cancelar todas as outras ofertas da mesma ordem
    UPDATE public.delivery_offers
    SET
        status     = 'cancelled',
        updated_at = now()
    WHERE delivery_order_id = v_offer.delivery_order_id
      AND id <> p_offer_id
      AND status IN ('pending', 'open');

    RETURN jsonb_build_object(
        'ok',               true,
        'delivery_order_id', v_offer.delivery_order_id
    );
END;
$$;

-- ═══════════════════════════════════
-- 5. REBUILD: reject_delivery_offer
--    Aceita 'pending' ou 'open'
-- ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.reject_delivery_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    UPDATE public.delivery_offers
    SET
        status      = 'rejected',
        rejected_at = now(),
        updated_at  = now()
    WHERE id = p_offer_id
      AND motoboy_id = auth.uid()
      AND status IN ('pending', 'open');

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ═══════════════════════════════════
-- 6. REBUILD TRIGGER FUNCTION
--    (garante consistência com nova versão do dispatch)
-- ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_trigger_service_order_dispatch()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'awaiting_professional') THEN
        PERFORM public.create_delivery_offers_for_order(NEW.id);
        NEW.status     := 'searching';
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_service_order_dispatch_engine ON public.service_orders;
CREATE TRIGGER trigger_service_order_dispatch_engine
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_service_order_dispatch();

-- ═══════════════════════════════════
-- 7. BACKFILL: Atualizar ofertas existentes
--    com lat/lng e store_name da ordem original
-- ═══════════════════════════════════
UPDATE public.delivery_offers do_upd
SET
    pickup_lat_snapshot  = so.pickup_lat,
    pickup_lng_snapshot  = so.pickup_lng,
    dropoff_lat_snapshot = so.destination_lat,
    dropoff_lng_snapshot = so.destination_lng,
    store_name_snapshot  = COALESCE(do_upd.store_name_snapshot, so.store_name,
                                     (SELECT nome_loja FROM public.merchant_stores ms WHERE ms.user_id = so.merchant_id LIMIT 1),
                                     'Loja Parceira'),
    total_price          = COALESCE(do_upd.total_price, so.total_price),
    gross_value          = COALESCE(do_upd.gross_value, so.total_price),
    -- status: normalizar 'open' → 'pending' para alinhar com frontend
    status               = CASE WHEN do_upd.status = 'open' THEN 'pending' ELSE do_upd.status END,
    updated_at           = now()
FROM public.service_orders so
WHERE do_upd.delivery_order_id = so.id
  AND (
    do_upd.pickup_lat_snapshot IS NULL
    OR do_upd.store_name_snapshot IS NULL
    OR do_upd.status = 'open'
  );

DO $$ BEGIN RAISE LOG '=== MOTOBOY OFFER CARD FINAL COMPLETO ==='; END $$;
