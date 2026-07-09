-- ════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO — "chamada feita, motoboy não recebe". SOMENTE LEITURA.
-- Cadeia: service_orders → trigger despacho → delivery_offers → painel.
-- SQL Editor (broifhfqmnzqoongtokm). Rodar D1→D4 e me mandar os resultados.
-- ════════════════════════════════════════════════════════════════════════

-- ─── D1. A chamada entrou? Em que status ficou? ───────────────────────────
-- ESPERADO: sua chamada recente com status 'searching' (trigger rodou)
-- ou 'awaiting_professional' (trigger NÃO rodou).
SELECT id, status, service_type, motoboy_id, courier_id, professional_uid,
       store_name, created_at
  FROM public.service_orders
 ORDER BY created_at DESC
 LIMIT 5;

-- ─── D2. O despacho criou OFERTAS para a chamada? ─────────────────────────
-- Troque <ORDER_ID> pelo id do D1.
-- ESPERADO: 1 linha por motoboy online/aprovado, status 'pending'.
-- Se vier VAZIO → o trigger não encontrou NENHUM motoboy elegível (ver D3)
-- ou o trigger não disparou (ver D4).
SELECT id, professional_uid, status, created_at, expires_at
  FROM public.delivery_offers
 WHERE order_id = '<ORDER_ID>'
 ORDER BY created_at;

-- ─── D3. O motoboy do teste está ELEGÍVEL? (aprovado + online) ────────────
-- O trigger só oferta para is_approved = true E is_online = true.
SELECT user_id, name, is_approved, is_online, updated_at
  FROM public.motoboy_profiles
 ORDER BY updated_at DESC
 LIMIT 10;

-- ─── D4. O trigger de despacho está ativo na service_orders? ──────────────
-- ESPERADO: trigger_dispatch_final (ou similar) com tgenabled = 'O'.
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid = 'public.service_orders'::regclass AND NOT tgisinternal
 ORDER BY tgname;
