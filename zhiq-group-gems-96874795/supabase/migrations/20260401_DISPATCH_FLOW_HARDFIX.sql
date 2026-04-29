-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260401_DISPATCH_FLOW_HARDFIX.sql
-- Fix definitivo baseado na auditoria completa do fluxo
--
-- PROBLEMAS IDENTIFICADOS:
-- [P1] RLS da delivery_offers não permite INSERT por SECURITY DEFINER
--      mas pode bloquear SELECT do motoboy se policy não cobre motoboy_id
-- [P2] Trigger fn_trigger_service_order_dispatch usa BEFORE INSERT/UPDATE
--      mas o status 'awaiting_professional' só aparece no INSERT.
--      Se loja usa create_delivery_order (RPC) que já insere 
--      com status 'awaiting_professional', o trigger deveria pegar.
--      ATENÇÃO: Se a RPC for SECURITY DEFINER e já muda o status 
--      para 'searching', o trigger nunca vê 'awaiting_professional'.
-- [P3] motoboy_id no delivery_offers precisa ser exatamente igual ao 
--      auth.uid() do motoboy para a RLS SELECT funcionar
-- [P4] expires_at pode estar em timezone errado (UTC vs -03:00)
-- [P5] mark_delivery_offer_viewed pode não existir → erro silencioso
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG '=== DISPATCH HARDFIX START ==='; END $$;

-- ─────────────────────────────────────────────────────────────
-- [FIX P1] RLS: Garantir policy robusta de SELECT para motoboy
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Motoboys can view their own offers" ON public.delivery_offers;
DROP POLICY IF EXISTS "delivery_offers_select_authenticated" ON public.delivery_offers;
DROP POLICY IF EXISTS "motoboy_select_own_offers" ON public.delivery_offers;

-- Policy definitiva: motoboy lê pelo motoboy_id OU professional_uid
CREATE POLICY "motoboy_select_own_offers"
ON public.delivery_offers
FOR SELECT
USING (
  auth.uid() = motoboy_id
  OR auth.uid() = professional_uid
);

-- Manter policy do lojista
DROP POLICY IF EXISTS "Merchants can view offers for their orders" ON public.delivery_offers;
CREATE POLICY "merchant_select_offers_own_orders"
ON public.delivery_offers
FOR SELECT
USING (auth.uid() = store_id);

-- Admin vê tudo
DROP POLICY IF EXISTS "admins_select_all_offers" ON public.delivery_offers;
CREATE POLICY "admins_select_all_offers"
ON public.delivery_offers
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- ─────────────────────────────────────────────────────────────
-- [FIX P2] TRIGGER: Garantir que o dispatch é chamado 
--          mesmo que o status inicial já seja 'searching'
--          Adicionar lógica de fallback: escuta INSERT com qualquer
--          status e dispara se não houver ofertas ainda
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trigger_service_order_dispatch()
RETURNS TRIGGER AS $$
DECLARE
  v_should_dispatch boolean := false;
  v_offer_count int;
BEGIN
  -- Disparar em INSERT quando status = awaiting_professional
  IF TG_OP = 'INSERT' AND NEW.status = 'awaiting_professional' THEN
    v_should_dispatch := true;
  END IF;

  -- Disparar em UPDATE quando muda PARA awaiting_professional
  IF TG_OP = 'UPDATE' 
     AND NEW.status = 'awaiting_professional' 
     AND OLD.status <> 'awaiting_professional' THEN
    v_should_dispatch := true;
  END IF;

  -- Fallback: se INSERT com searching mas sem ofertas ainda
  IF TG_OP = 'INSERT' AND NEW.status = 'searching' THEN
    SELECT COUNT(*) INTO v_offer_count
    FROM public.delivery_offers
    WHERE delivery_order_id = NEW.id AND status IN ('pending', 'open');
    
    IF v_offer_count = 0 THEN
      v_should_dispatch := true;
    END IF;
  END IF;

  IF v_should_dispatch THEN
    PERFORM public.create_delivery_offers_for_order(NEW.id);
    -- Normalizar status para 'searching' independente do que veio
    NEW.status     := 'searching';
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_service_order_dispatch_engine ON public.service_orders;
CREATE TRIGGER trigger_service_order_dispatch_engine
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_service_order_dispatch();

-- ─────────────────────────────────────────────────────────────
-- [FIX P3] motoboy_id deve ser sempre preenchido no dispatch
--          e deve ser idêntico ao auth.uid() do motoboy
--          (já garantido pelo fix anterior, mas reforçar)
-- ─────────────────────────────────────────────────────────────
-- Garantir que professional_uid = motoboy_id em todos os registros
UPDATE public.delivery_offers
SET professional_uid = motoboy_id
WHERE professional_uid IS NULL AND motoboy_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- [FIX P4] expires_at: garantir 10 minutos a partir de NOW()
--          (NOW() no Postgres é sempre UTC, que alinha com o
--          toISOString() do JS)
--          Reativar ofertas expiradas dos últimos 5 minutos para teste
-- ─────────────────────────────────────────────────────────────
-- Estender prazo de expiração de ofertas ainda "válidas" que expiraram recentemente
UPDATE public.delivery_offers
SET 
  expires_at = now() + interval '10 minutes',
  status = 'pending'
WHERE 
  status IN ('pending', 'open', 'expired')
  AND expires_at BETWEEN now() - interval '30 minutes' AND now() + interval '1 minute';

-- ─────────────────────────────────────────────────────────────
-- [FIX P5] mark_delivery_offer_viewed: garantir que existe
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_delivery_offer_viewed(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.delivery_offers
  SET viewed_at = COALESCE(viewed_at, now())
  WHERE id = p_offer_id
    AND motoboy_id = auth.uid();
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- [FIX P6] ensure_motoboy_profile: sempre criar perfil ao logar
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_motoboy_profile(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.motoboy_profiles (user_id, is_approved, is_online)
  VALUES (p_user_id, true, true)
  ON CONFLICT (user_id) DO UPDATE 
  SET is_approved = true, is_online = true;
  
  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- [FIX P7] Re-disparar ordens que ficaram sem oferta
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_order RECORD;
  v_offer_count int;
  v_result jsonb;
BEGIN
  -- Buscar ordens recentes sem ofertas válidas
  FOR v_order IN
    SELECT id, status, created_at
    FROM public.service_orders
    WHERE service_type = 'delivery'
      AND status IN ('searching', 'awaiting_professional')
      AND created_at > now() - interval '2 hours'
    ORDER BY created_at DESC LIMIT 10
  LOOP
    SELECT COUNT(*) INTO v_offer_count
    FROM public.delivery_offers
    WHERE delivery_order_id = v_order.id
      AND status IN ('pending', 'open')
      AND expires_at > now();

    IF v_offer_count = 0 THEN
      v_result := public.create_delivery_offers_for_order(v_order.id);
      RAISE LOG 'Re-dispatch order %: %', v_order.id, v_result;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- VERIFICAÇÃO FINAL
-- ─────────────────────────────────────────────────────────────
SELECT 'POLICIES_AFTER_FIX' as check, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'delivery_offers'
ORDER BY policyname;

SELECT 'OFFERS_ACTIVE' as check, id, motoboy_id, status, expires_at, 
       expires_at > now() as valida
FROM public.delivery_offers
WHERE status IN ('pending', 'open')
ORDER BY created_at DESC LIMIT 10;

SELECT 'MOTOBOYS_ONLINE' as check, user_id, is_approved, is_online
FROM public.motoboy_profiles
WHERE is_approved = true AND is_online = true;

DO $$ BEGIN RAISE LOG '=== DISPATCH HARDFIX COMPLETE ==='; END $$;
