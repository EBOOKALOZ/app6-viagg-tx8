-- =====================================================
-- UBER MOTOBOY: STRUCTURAL FIX
-- Causa: delivery_offers.delivery_order_id tem FK apontando
-- para delivery_orders (tabela LEGACY), mas o fluxo atual
-- usa service_orders. Correção estrutural: desacoplar a FK
-- antiga e usar service_order_id como única referência oficial.
-- =====================================================

-- PASSO 1: Remover a FK constraint antiga que aponta para delivery_orders (tabela legacy)
ALTER TABLE public.delivery_offers DROP CONSTRAINT IF EXISTS delivery_offers_delivery_order_id_fkey;

-- PASSO 2: Tornar delivery_order_id nullable (campo legado, não mais obrigatório)
ALTER TABLE public.delivery_offers ALTER COLUMN delivery_order_id DROP NOT NULL;

-- PASSO 3: Confirmar que service_order_id está referenciando service_orders corretamente
-- (já existia na migração 20260324 - só garantindo)
-- service_order_id uuid NOT NULL REFERENCES public.service_orders(id)

-- PASSO 4: Criar perfil do motoboy jetski_test_2
INSERT INTO public.motoboy_profiles (user_id, is_approved, is_online)
VALUES ('bb4da445-07a7-4321-90c7-7be20fcd4ac9', true, true)
ON CONFLICT (user_id) DO UPDATE SET is_approved = true, is_online = true;

-- PASSO 5: Criar oferta para a chamada real aberta
-- professional_uid = motoboy_id (necessário para o trigger _dispatch_stats_on_offer_insert)
INSERT INTO public.delivery_offers (
    service_order_id,
    motoboy_id,
    professional_uid,
    store_id,
    status,
    expires_at,
    pickup_address_snapshot,
    dropoff_address_snapshot,
    distance_km_snapshot,
    estimated_price_snapshot
) VALUES (
    '794468ab-ada7-4829-a1fa-fc48f5e09621',
    'bb4da445-07a7-4321-90c7-7be20fcd4ac9',
    'bb4da445-07a7-4321-90c7-7be20fcd4ac9',  -- mesmo valor (trigger precisa)
    'e2a05c45-2d94-4601-b672-9d472982e68c',
    'pending',
    now() + interval '15 minutes',
    'Endereço de Coleta',
    'Endereço de Entrega',
    1.5,
    11.4
);

-- PASSO 6: Verificar resultado
SELECT id, status, motoboy_id, service_order_id, expires_at
FROM public.delivery_offers
WHERE service_order_id = '794468ab-ada7-4829-a1fa-fc48f5e09621';

-- PASSO 7: Trigger para chamadas futuras (usando service_order_id como referência oficial)
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
                service_order_id,
                motoboy_id,
                professional_uid,
                store_id,
                status,
                expires_at,
                pickup_address_snapshot,
                dropoff_address_snapshot,
                distance_km_snapshot,
                estimated_price_snapshot
            ) VALUES (
                NEW.id,
                v_moto.user_id,
                v_moto.user_id,
                NEW.merchant_id,
                'pending',
                now() + interval '10 minutes',
                NEW.pickup_location,
                NEW.destination,
                NEW.distance_km,
                NEW.total_price
            );
        END LOOP;
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_dispatch_on_order ON public.service_orders;
CREATE TRIGGER trg_dispatch_on_order
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_dispatch();
