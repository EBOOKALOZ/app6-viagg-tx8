-- Renovar a oferta existente com nova expiração (30 min)
-- E garantir status pending
UPDATE public.delivery_offers
SET 
    status = 'pending',
    expires_at = now() + interval '30 minutes',
    viewed_at = NULL
WHERE id = 'd140bda4-4c2f-4e54-a609-8807a812b522';

-- Confirmar
SELECT id, status, motoboy_id, expires_at FROM public.delivery_offers WHERE id = 'd140bda4-4c2f-4e54-a609-8807a812b522';
