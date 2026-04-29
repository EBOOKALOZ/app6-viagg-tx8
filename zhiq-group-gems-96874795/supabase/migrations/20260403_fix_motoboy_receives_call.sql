-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_fix_motoboy_receives_call.sql
-- Problema: motoboy não recebe chamada do lojista
-- Causa raiz:
--   1. RLS de delivery_offers exige motoboy_id = auth.uid()
--      mas a função broadcast manda para todos.
--      Se o motoboy_id não está na oferta, RLS bloqueia o SELECT.
--   2. Ordens recentes podem não ter tido offers geradas.
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG '=== FIX MOTOBOY RECEIVES CALL START ==='; END $$;

-- ─────────────────────────────────────────────────────────────
-- [1] Substituir policies de SELECT em delivery_offers
--     para que qualquer motoboy aprovado+online veja TODAS as offers abertas
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "do_select_motoboy"          ON public.delivery_offers;
DROP POLICY IF EXISTS "do_select_merchant"         ON public.delivery_offers;
DROP POLICY IF EXISTS "do_select_authenticated"    ON public.delivery_offers;

-- Motoboy aprovado + online pode ver TODA offer aberta (broadcasting model)
CREATE POLICY "do_select_open_offers_approved_motoboy"
ON public.delivery_offers
FOR SELECT
USING (
  -- Offers abertas são visíveis a qualquer motoboy aprovado e online
  (
    status IN ('pending', 'open')
    AND EXISTS (
      SELECT 1 FROM public.motoboy_profiles mp
      WHERE mp.user_id = auth.uid()
        AND mp.is_approved = true
        AND mp.is_online   = true
    )
  )
  -- Motoboy também vê suas próprias offers (qualquer status)
  OR auth.uid() = motoboy_id
  OR auth.uid() = professional_uid
);

-- Lojista vê offers dos seus pedidos
CREATE POLICY "do_select_merchant_own"
ON public.delivery_offers
FOR SELECT
USING (auth.uid() = store_id);

-- ─────────────────────────────────────────────────────────────
-- [2] Garantir que offers NÃO expiradas usem expires_at >= now()
--     (renovar offers recentes que ainda estão dentro do prazo)
-- ─────────────────────────────────────────────────────────────
UPDATE public.delivery_offers
SET
  expires_at = now() + interval '15 minutes',
  status     = 'pending',
  updated_at = now()
WHERE
  status IN ('pending', 'open')
  AND expires_at < now();

-- ─────────────────────────────────────────────────────────────
-- [3] Re-despachar ordens das últimas 6 horas sem offers válidas
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_order      RECORD;
  v_offer_cnt  int;
  v_result     jsonb;
BEGIN
  FOR v_order IN
    SELECT id, status, created_at
    FROM public.service_orders
    WHERE service_type = 'delivery'
      AND status IN ('searching', 'awaiting_professional')
      AND created_at > now() - interval '6 hours'
    ORDER BY created_at DESC
    LIMIT 20
  LOOP
    SELECT COUNT(*) INTO v_offer_cnt
    FROM public.delivery_offers
    WHERE delivery_order_id = v_order.id
      AND status IN ('pending', 'open')
      AND expires_at > now();

    IF v_offer_cnt = 0 THEN
      v_result := public.create_delivery_offers_for_order(v_order.id);
      RAISE LOG '[fix_motoboy] Re-dispatched order %: %', v_order.id, v_result;
    ELSE
      RAISE LOG '[fix_motoboy] Order % already has % valid offers', v_order.id, v_offer_cnt;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- [4] Verificação
-- ─────────────────────────────────────────────────────────────
SELECT 'POLICIES delivery_offers' AS check_type,
       policyname, cmd
FROM pg_policies
WHERE tablename = 'delivery_offers'
ORDER BY policyname;

SELECT 'OFFERS ABERTAS' AS check_type,
       id, motoboy_id, status, expires_at,
       expires_at > now() AS valida
FROM public.delivery_offers
WHERE status IN ('pending', 'open')
ORDER BY created_at DESC
LIMIT 10;

SELECT 'MOTOBOYS ONLINE' AS check_type,
       user_id, is_approved, is_online
FROM public.motoboy_profiles
WHERE is_approved = true AND is_online = true;

DO $$ BEGIN RAISE LOG '=== FIX MOTOBOY RECEIVES CALL COMPLETE ==='; END $$;
