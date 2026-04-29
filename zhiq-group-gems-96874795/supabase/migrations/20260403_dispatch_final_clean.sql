-- ══════════════════════════════════════════════════════════════
-- DISPATCH FINAL FIX — Remove loop + duplicatas definitivamente
-- Cole no Supabase SQL Editor e execute
-- ══════════════════════════════════════════════════════════════

-- ── 1. LIMPEZA IMEDIATA: parar o loop agora ──────────────────
UPDATE public.delivery_offers
SET status = 'cancelled', expires_at = now()
WHERE status IN ('pending', 'open');

-- ── 2. REMOVER todos os triggers de dispatch duplicados ───────
DROP TRIGGER IF EXISTS service_orders_dispatch_when_ready     ON public.service_orders;
DROP TRIGGER IF EXISTS trg_dispatch_on_order                  ON public.service_orders;
DROP TRIGGER IF EXISTS trigger_service_order_dispatch_engine  ON public.service_orders;
DROP TRIGGER IF EXISTS trigger_dispatch_single                ON public.service_orders;

-- ── 3. CRIAR função de dispatch IDEMPOTENTE ───────────────────
--    Sem UPDATE service_orders interno (era o que causava o loop)
--    Usa debounce de 30s para evitar dupla execução
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_order       RECORD;
  v_motoboy     RECORD;
  v_offer_count integer := 0;
  v_commission  numeric := 20;
  v_store_name  text;
  v_net_value   numeric;
  v_dest_address text;
BEGIN
  -- Buscar o pedido
  SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'order_not_found');
  END IF;

  -- ★ DEBOUNCE: Se já existe oferta criada para este pedido nos últimos 30s,
  --   sair sem criar duplicatas (evita loop de triggers)
  IF EXISTS (
    SELECT 1 FROM public.delivery_offers
    WHERE delivery_order_id = p_delivery_order_id
      AND created_at > now() - interval '30 seconds'
  ) THEN
    RAISE LOG '[dispatch] Debounce ativo para order %, saindo', p_delivery_order_id;
    RETURN jsonb_build_object('skipped', 'debounce_active');
  END IF;

  -- Nome da loja
  v_store_name := v_order.store_name;
  IF v_store_name IS NULL OR TRIM(v_store_name) = '' THEN
    BEGIN
      SELECT COALESCE(ms.nome_loja, 'Loja Parceira') INTO v_store_name
      FROM public.merchant_stores ms
      WHERE ms.user_id = v_order.merchant_id
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_store_name := 'Loja Parceira'; END;
  END IF;
  v_store_name := COALESCE(NULLIF(TRIM(v_store_name), ''), 'Loja Parceira');

  -- Endereço de entrega (sem coordenadas brutas)
  v_dest_address := v_order.destination;
  IF v_dest_address IS NOT NULL
     AND v_dest_address ~ '^-?[0-9]+\.[0-9]+,\s*-?[0-9]+\.[0-9]+' THEN
    v_dest_address := NULL;
  END IF;
  v_dest_address := COALESCE(NULLIF(TRIM(v_dest_address), ''), 'Entrega no Cliente');

  -- Loop pelos motoboys online e aprovados
  FOR v_motoboy IN
    SELECT user_id
    FROM public.motoboy_profiles
    WHERE is_approved = true AND is_online = true
  LOOP
    BEGIN
      SELECT COALESCE(percentual_comissao_atual, 20) INTO v_commission
      FROM public.profiles WHERE id = v_motoboy.user_id;
    EXCEPTION WHEN OTHERS THEN v_commission := 20; END;

    v_net_value := COALESCE(v_order.total_price, 0) * (1.0 - v_commission / 100.0);

    -- Cancelar qualquer oferta pending deste motoboy (de qualquer order)
    -- para que ele receba apenas 1 chamada por vez
    UPDATE public.delivery_offers
    SET status = 'cancelled', expires_at = now()
    WHERE motoboy_id = v_motoboy.user_id
      AND status IN ('pending', 'open');

    -- Inserir oferta nova
    INSERT INTO public.delivery_offers (
      service_order_id, delivery_order_id, motoboy_id, professional_uid, store_id,
      status, expires_at,
      pickup_address_snapshot, dropoff_address_snapshot, store_name_snapshot,
      pickup_lat_snapshot, pickup_lng_snapshot, dropoff_lat_snapshot, dropoff_lng_snapshot,
      total_price, estimated_price_snapshot, distance_km_snapshot,
      commission_percent, gross_value, net_value
    ) VALUES (
      v_order.id, v_order.id,
      v_motoboy.user_id, v_motoboy.user_id, v_order.merchant_id,
      'pending', now() + interval '10 minutes',
      COALESCE(NULLIF(TRIM(v_order.pickup_location), ''), v_order.store_address, 'Coleta na Loja'),
      v_dest_address,
      v_store_name,
      v_order.pickup_lat, v_order.pickup_lng,
      v_order.destination_lat, v_order.destination_lng,
      v_order.total_price, v_order.total_price, v_order.distance_km,
      v_commission, v_order.total_price, v_net_value
    );

    v_offer_count := v_offer_count + 1;
  END LOOP;

  -- ★ NÃO atualizar service_orders aqui (evita loop de trigger)
  -- O status será atualizado pelo trigger após a função retornar

  RETURN jsonb_build_object('offers_created', v_offer_count);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[create_delivery_offers] order=%: %', p_delivery_order_id, SQLERRM;
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ── 4. CRIAR função do trigger (com guard de status) ──────────
CREATE OR REPLACE FUNCTION public.fn_dispatch_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Só dispara quando status é 'awaiting_professional' (apenas no INSERTs relevantes)
  IF NEW.status = 'awaiting_professional' THEN
    BEGIN
      PERFORM public.create_delivery_offers_for_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[dispatch_trigger] order=%: %', NEW.id, SQLERRM;
    END;

    -- Atualizar status para 'searching' AQUI (no trigger, não na função)
    -- Usar UPDATE direto sem disparar o trigger novamente (SET session var)
    BEGIN
      UPDATE public.service_orders
      SET status = 'searching', updated_at = now()
      WHERE id = NEW.id AND status = 'awaiting_professional';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[dispatch_trigger] status update failed for order=%: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. CRIAR 1 único trigger de dispatch ─────────────────────
--    Apenas INSERT — não UPDATE (evita loop quando muda status)
CREATE TRIGGER trigger_dispatch_final
  AFTER INSERT ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_dispatch_trigger();

-- ── 6. CONFIRMAR: apenas 1 trigger de dispatch ───────────────
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'service_orders'
ORDER BY trigger_name;
