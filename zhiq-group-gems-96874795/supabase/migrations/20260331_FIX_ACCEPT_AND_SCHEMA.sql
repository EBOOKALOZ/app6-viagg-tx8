-- =====================================================
-- FIX: accept_delivery_offer_v2 ambiguity + motoboy_profiles.updated_at
-- Execute no Supabase SQL Editor
-- =====================================================

-- 1. Adicionar coluna updated_at em motoboy_profiles (missing)
ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Remover TODAS as versões de accept_delivery_offer_v2 (há 1-arg e 2-arg causando PGRST203)
DROP FUNCTION IF EXISTS public.accept_delivery_offer_v2(uuid);
DROP FUNCTION IF EXISTS public.accept_delivery_offer_v2(p_offer_id uuid, p_extra text);
DROP FUNCTION IF EXISTS public.accept_delivery_offer_v2(uuid, uuid);
DROP FUNCTION IF EXISTS public.accept_delivery_offer_v2(uuid, text);
-- Garante limpeza total via pg_proc
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'accept_delivery_offer_v2' LOOP
    EXECUTE 'DROP FUNCTION ' || r.oid::regprocedure;
  END LOOP;
END $$;

-- 3. Recriar com assinatura única e clara
CREATE OR REPLACE FUNCTION public.accept_delivery_offer_v2(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offer RECORD;
BEGIN
    -- Buscar e bloquear a oferta
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Oferta não encontrada.');
    END IF;

    IF v_offer.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Esta oferta não está mais disponível.');
    END IF;

    -- Atualizar a oferta como aceita
    UPDATE public.delivery_offers
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = p_offer_id;

    -- Atualizar a order como aceita
    UPDATE public.service_orders
    SET status = 'accepted', courier_id = v_offer.motoboy_id, 
        accepted_at = now(), updated_at = now()
    WHERE id = v_offer.service_order_id;

    -- Cancelar outras ofertas da mesma order
    UPDATE public.delivery_offers
    SET status = 'cancelled', updated_at = now()
    WHERE service_order_id = v_offer.service_order_id
      AND id <> p_offer_id
      AND status = 'pending';

    RETURN jsonb_build_object('ok', true, 'delivery_order_id', v_offer.service_order_id);
END;
$$;

-- 4. Verificar que a função existe com assinatura única
SELECT proname, pronargs FROM pg_proc WHERE proname = 'accept_delivery_offer_v2';
