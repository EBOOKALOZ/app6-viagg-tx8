-- =====================================================
-- UBER MOTOBOY: FINAL SURGICAL FIX
-- Causa: motoboy_id vs professional_uid mismatch
-- Execute BLOCO A BLOCO no SQL Editor
-- =====================================================

-- BLOCO A: Criar perfil do jetski_test_2 (motoboy logado)
INSERT INTO public.motoboy_profiles (user_id, is_approved, is_online)
VALUES ('bb4da445-07a7-4321-90c7-7be20fcd4ac9', true, true)
ON CONFLICT (user_id) DO UPDATE SET is_approved = true, is_online = true;

-- BLOCO B: Criar oferta para a chamada aberta usando motoboy_id (campo que RLS conhece)
INSERT INTO public.delivery_offers (
    service_order_id,
    delivery_order_id,
    motoboy_id,
    store_id,
    status,
    expires_at,
    pickup_address_snapshot,
    dropoff_address_snapshot,
    distance_km_snapshot,
    estimated_price_snapshot
) VALUES (
    '794468ab-ada7-4829-a1fa-fc48f5e09621',  -- service_order_id (NOT NULL)
    '794468ab-ada7-4829-a1fa-fc48f5e09621',  -- delivery_order_id (FK)
    'bb4da445-07a7-4321-90c7-7be20fcd4ac9',  -- motoboy jetski_test_2
    'e2a05c45-2d94-4601-b672-9d472982e68c',  -- merchant
    'pending',
    now() + interval '15 minutes',
    'Endereço de Coleta',
    'Endereço de Entrega',
    1.5,
    11.4
);

-- BLOCO C: Verificar que foi criada
SELECT id, status, motoboy_id, expires_at
FROM public.delivery_offers
WHERE delivery_order_id = '794468ab-ada7-4829-a1fa-fc48f5e09621';

-- BLOCO D: Trigger para chamadas futuras (usa motoboy_id, sem professional_uid)
CREATE OR REPLACE FUNCTION public.fn_trigger_dispatch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_moto RECORD;
BEGIN
    IF (NEW.status = 'awaiting_professional') THEN
        FOR v_moto IN
            SELECT user_id FROM public.motoboy_profiles
            WHERE is_approved = true AND is_online = true
        LOOP
            INSERT INTO public.delivery_offers (
                delivery_order_id, motoboy_id, store_id,
                status, expires_at,
                pickup_address_snapshot, dropoff_address_snapshot,
                distance_km_snapshot, estimated_price_snapshot
            ) VALUES (
                NEW.id, v_moto.user_id, NEW.merchant_id,
                'pending', now() + interval '10 minutes',
                NEW.pickup_location, NEW.destination,
                NEW.distance_km, NEW.total_price
            ) ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_dispatch_on_order ON public.service_orders;
CREATE TRIGGER trg_dispatch_on_order
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_dispatch();
