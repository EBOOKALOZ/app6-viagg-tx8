-- ══════════════════════════════════════════════════════════════════════
-- LIMPEZA TOTAL: Zerar todas as chamadas/pedidos pendentes para teste
-- Execute no Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════

-- 1. Cancelar TODAS as delivery_offers pendentes
UPDATE public.delivery_offers
SET status = 'cancelled', expires_at = now(), updated_at = now()
WHERE status IN ('pending', 'open');

-- 2. Cancelar TODOS os service_orders de delivery sem motoboy atribuído
UPDATE public.service_orders
SET status = 'cancelled', updated_at = now()
WHERE service_type = 'delivery'
  AND motoboy_id IS NULL
  AND status IN ('searching', 'awaiting_professional', 'pending');

-- 3. Confirmação: deve retornar 0 linhas em ambas
SELECT 'delivery_offers pendentes' AS tabela, COUNT(*) AS total
FROM public.delivery_offers
WHERE status IN ('pending', 'open')
UNION ALL
SELECT 'service_orders sem motoboy' AS tabela, COUNT(*) AS total
FROM public.service_orders
WHERE service_type = 'delivery'
  AND motoboy_id IS NULL
  AND status IN ('searching', 'awaiting_professional', 'pending');
