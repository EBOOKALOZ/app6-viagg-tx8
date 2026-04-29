-- ═══════════════════════════════════════════════════════════════
-- DIAGNÓSTICO COMPLETO — Auditar fluxo Loja → delivery_offers → Motoboy
-- Execute no Supabase SQL Editor e analise cada bloco de output
-- ═══════════════════════════════════════════════════════════════

-- ── 1. ESTADO DO MOTOBOY ──────────────────────────────────────
SELECT 
  '1_MOTOBOY_PROFILES' as etapa,
  user_id,
  is_approved,
  is_online,
  created_at
FROM public.motoboy_profiles
ORDER BY created_at DESC LIMIT 10;

-- ── 2. ÚLTIMAS ORDENS CRIADAS ────────────────────────────────
SELECT 
  '2_SERVICE_ORDERS' as etapa,
  id,
  status,
  service_type,
  merchant_id,
  store_name,
  store_address,
  pickup_lat,
  pickup_lng,
  destination_lat,
  destination_lng,
  total_price,
  created_at
FROM public.service_orders
WHERE service_type = 'delivery'
ORDER BY created_at DESC LIMIT 5;

-- ── 3. OFERTAS CRIADAS (últimas 10) ──────────────────────────
SELECT 
  '3_DELIVERY_OFFERS' as etapa,
  id,
  delivery_order_id,
  motoboy_id,
  professional_uid,
  store_id,
  status,
  expires_at,
  now() > expires_at as ja_expirou,
  pickup_address_snapshot,
  dropoff_address_snapshot,
  store_name_snapshot,
  total_price,
  created_at
FROM public.delivery_offers
ORDER BY created_at DESC LIMIT 10;

-- ── 4. CRUZAMENTO: Ordem + Oferta + Motoboy ──────────────────
SELECT 
  '4_CROSS_CHECK' as etapa,
  so.id as order_id,
  so.status as order_status,
  so.created_at as order_created,
  dof.id as offer_id,
  dof.motoboy_id,
  dof.status as offer_status,
  dof.expires_at,
  now() > dof.expires_at as oferta_expirada,
  mp.is_approved,
  mp.is_online
FROM public.service_orders so
LEFT JOIN public.delivery_offers dof ON dof.delivery_order_id = so.id
LEFT JOIN public.motoboy_profiles mp ON mp.user_id = dof.motoboy_id
WHERE so.service_type = 'delivery'
ORDER BY so.created_at DESC LIMIT 10;

-- ── 5. RLS — Simular SELECT como motoboy ──────────────────────
-- (Troque o UUID pelo do motoboy real)
-- Verificar se o motoboy CONSEGUIRIA ler suas ofertas sem SECURITY DEFINER
SELECT
  '5_RLS_CHECK' as etapa,
  id,
  motoboy_id,
  status,
  expires_at
FROM public.delivery_offers
WHERE motoboy_id IN (SELECT user_id FROM public.motoboy_profiles WHERE is_approved = true)
  AND status IN ('pending', 'open')
  AND expires_at > now()
ORDER BY created_at DESC LIMIT 5;

-- ── 6. REALTIME — Verificar se tabela está publicada ──────────
SELECT 
  '6_REALTIME_PUBLICATION' as etapa,
  pubname,
  tablename,
  schemaname
FROM pg_publication_tables
WHERE tablename = 'delivery_offers';

-- ── 7. TRIGGER — Verificar se o trigger de dispatch existe ────
SELECT
  '7_TRIGGERS' as etapa,
  trigger_name,
  event_manipulation,
  action_timing,
  event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'service_orders'
  AND trigger_schema = 'public'
ORDER BY trigger_name;

-- ── 8. DISPATCH LOG — Últimas execuções ──────────────────────
SELECT 
  '8_DISPATCH_LOG' as etapa,
  event_type,
  payload,
  created_at
FROM public.system_events_log
ORDER BY created_at DESC LIMIT 10;

-- ── 9. TESTE DE DISPATCH MANUAL ──────────────────────────────
-- (Descomentar e substituir pelo order_id real para forçar re-dispatch)
-- SELECT public.create_delivery_offers_for_order('COLE_AQUI_O_ORDER_ID_UUID');

-- ── 10. POLÍTICAS RLS ATIVAS em delivery_offers ───────────────
SELECT 
  '10_RLS_POLICIES' as etapa,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'delivery_offers'
ORDER BY policyname;
