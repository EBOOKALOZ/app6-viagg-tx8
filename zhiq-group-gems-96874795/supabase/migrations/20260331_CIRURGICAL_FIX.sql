-- =====================================================
-- UBER MOTOBOY: CIRURGICAL FIX — Execute no Supabase SQL Editor
-- Cada bloco é independente. Se um falhar, os outros rodam.
-- =====================================================

-- BLOCO 1: Garantir coluna professional_uid em delivery_offers
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS professional_uid uuid;

-- BLOCO 2: Criar perfil do motoboy jetski_test_2 (ON CONFLICT para ser idempotente)
INSERT INTO public.motoboy_profiles (user_id, is_approved, is_online)
VALUES ('bb4da445-07a7-4321-90c7-7be20fcd4ac9', true, true)
ON CONFLICT (user_id) DO UPDATE SET is_approved = true, is_online = true;

-- BLOCO 3: Função de dispatch (sem dependência de colunas problemáticas)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_moto  RECORD;
    v_count int := 0;
BEGIN
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

    FOR v_moto IN
        SELECT user_id FROM public.motoboy_profiles
        WHERE is_approved = true AND is_online = true
    LOOP
        INSERT INTO public.delivery_offers (
            delivery_order_id,
            motoboy_id,
            professional_uid,
            store_id,
            status,
            expires_at,
            pickup_address_snapshot,
            dropoff_address_snapshot,
            total_price,
            distance_km_snapshot
        ) VALUES (
            v_order.id,
            v_moto.user_id,
            v_moto.user_id,
            v_order.merchant_id,
            'pending',
            now() + interval '10 minutes',
            v_order.pickup_location,
            v_order.destination,
            v_order.total_price,
            v_order.distance_km
        )
        ON CONFLICT DO NOTHING;
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_created', v_count);
END; $$;

-- BLOCO 4: Trigger function
CREATE OR REPLACE FUNCTION public.fn_trigger_dispatch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF (NEW.status = 'awaiting_professional') THEN
        PERFORM public.create_delivery_offers_for_order(NEW.id);
    END IF;
    RETURN NEW;
END; $$;

-- BLOCO 5: Instalar trigger
DROP TRIGGER IF EXISTS trg_dispatch_on_order ON public.service_orders;
CREATE TRIGGER trg_dispatch_on_order
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_dispatch();

-- BLOCO 6: FORÇA IMEDIATA — criar oferta para a chamada mais recente pendente
SELECT public.create_delivery_offers_for_order('794468ab-ada7-4829-a1fa-fc48f5e09621');

-- BLOCO 7: VERIFICAÇÃO — mostra o que foi criado
SELECT id, status, professional_uid, motoboy_id, expires_at
FROM public.delivery_offers
WHERE delivery_order_id = '794468ab-ada7-4829-a1fa-fc48f5e09621';
