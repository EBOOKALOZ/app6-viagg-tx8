-- DIAGNÓSTICO E RECOVERY MANUAL
-- Execute este script no Supabase SQL Editor

-- 1. VERIFICAR: Trigger existe?
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND event_object_table = 'service_orders';

-- 2. VERIFICAR: Quais profiles existem em motoboy_profiles?
SELECT user_id, is_approved, is_online FROM public.motoboy_profiles;

-- 3. FORCE: Criar perfil para o motoboy que está faltando (jetski_test_2)
INSERT INTO public.motoboy_profiles (user_id, is_approved, is_online)
VALUES ('bb4da445-07a7-4321-90c7-7be20fcd4ac9', true, true)
ON CONFLICT (user_id) DO UPDATE SET is_approved = true, is_online = true;

-- 4. VERIFICAR: Perfil foi criado?
SELECT user_id, is_approved, is_online FROM public.motoboy_profiles WHERE user_id = 'bb4da445-07a7-4321-90c7-7be20fcd4ac9';

-- 5. FORCE DISPATCH: Criar oferta para a chamada mais recente manualmente
SELECT public.create_delivery_offers_for_order('794468ab-ada7-4829-a1fa-fc48f5e09621');

-- 6. VERIFICAR: A oferta foi criada?
SELECT id, status, professional_uid, motoboy_id, expires_at FROM public.delivery_offers
WHERE delivery_order_id = '794468ab-ada7-4829-a1fa-fc48f5e09621';

-- 7. VERIFICAR: Log de diagnóstico
SELECT * FROM public.system_events_log ORDER BY created_at DESC LIMIT 5;
