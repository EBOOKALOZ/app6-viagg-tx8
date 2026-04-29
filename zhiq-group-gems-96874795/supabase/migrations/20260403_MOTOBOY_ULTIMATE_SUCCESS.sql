-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_MOTOBOY_ULTIMATE_SUCCESS.sql
-- PURPOSE: Unified schema, Clean RPC Rebuild, and Realtime Stabilization
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. UNIFICAR SCHEMA (Garantir motoboy_id na service_orders)
DO $$ 
BEGIN 
    -- Tenta adicionar a coluna principal que o frontend usa
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'motoboy_id') THEN
        ALTER TABLE public.service_orders ADD COLUMN motoboy_id uuid REFERENCES auth.users(id);
        RAISE LOG '✅ Coluna motoboy_id adicionada à service_orders';
    END IF;

    -- Sincronizar dados de colunas antigas/alternativas para a nova motoboy_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'professional_id') THEN
        UPDATE public.service_orders SET motoboy_id = professional_id WHERE motoboy_id IS NULL AND professional_id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'courier_id') THEN
        UPDATE public.service_orders SET motoboy_id = courier_id WHERE motoboy_id IS NULL AND courier_id IS NOT NULL;
    END IF;
END $$;

-- 2. LIMPEZA ATÔMICA (Remover funções com erro de retorno/assinatura)
DROP FUNCTION IF EXISTS public.accept_delivery_offer(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reject_delivery_offer(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.mark_delivery_offer_viewed(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_delivery_offers_for_order(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.complete_service_order(uuid, uuid, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.accept_ride(uuid) CASCADE;

-- 3. RECONSTRUÇÃO DAS RPCs

-- [RPC] Aceitar Oferta de Entrega
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_offer RECORD;
    v_order_status text;
BEGIN
    -- 1. Travar oferta e verificar validade
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'Oferta não encontrada.'); END IF;
    IF v_offer.status NOT IN ('pending', 'open') THEN RETURN jsonb_build_object('ok', false, 'reason', 'Esta oferta não está mais disponível.'); END IF;

    -- 2. Travar ordem e verificar se ainda está disponível
    SELECT status INTO v_order_status FROM public.service_orders WHERE id = v_offer.delivery_order_id FOR UPDATE;
    IF v_order_status NOT IN ('searching', 'pending', 'awaiting_professional') THEN 
        RETURN jsonb_build_object('ok', false, 'reason', 'Esta entrega já foi assumida por outro motoboy.');
    END IF;

    -- 3. Marcar Oferta como Aceita
    UPDATE public.delivery_offers 
    SET status = 'accepted', motoboy_id = v_user_id, professional_uid = v_user_id, accepted_at = now(), updated_at = now() 
    WHERE id = p_offer_id;

    -- 4. Atualizar Ordem Principal (Unificado para motoboy_id)
    UPDATE public.service_orders
    SET status = 'accepted', motoboy_id = v_user_id, accepted_at = now(), updated_at = now()
    WHERE id = v_offer.delivery_order_id;

    -- 5. Cancelar outras ofertas da mesma ordem
    UPDATE public.delivery_offers 
    SET status = 'cancelled', updated_at = now() 
    WHERE delivery_order_id = v_offer.delivery_order_id AND id <> p_offer_id AND status IN ('pending', 'open');

    RETURN jsonb_build_object('ok', true, 'order_id', v_offer.delivery_order_id);
END; $$;

-- [RPC] Marcar como Visualizada (Retorno JSONB fixo)
CREATE OR REPLACE FUNCTION public.mark_delivery_offer_viewed(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.delivery_offers SET viewed_at = now(), updated_at = now()
    WHERE id = p_offer_id AND motoboy_id = auth.uid() AND viewed_at IS NULL;
    RETURN jsonb_build_object('ok', true);
END; $$;

-- [RPC] Rejeitar Oferta
CREATE OR REPLACE FUNCTION public.reject_delivery_offer(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.delivery_offers SET status = 'rejected', rejected_at = now(), updated_at = now()
    WHERE id = p_offer_id AND motoboy_id = auth.uid();
    RETURN jsonb_build_object('ok', true);
END; $$;

-- [RPC] Finalizar Ordem (Liberação de Pagamento)
CREATE OR REPLACE FUNCTION public.complete_service_order(_motoboy_id uuid, _order_id uuid, _platform_fee_percent numeric DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_fee numeric;
    v_net numeric;
BEGIN
    SELECT * INTO v_order FROM public.service_orders WHERE id = _order_id AND motoboy_id = _motoboy_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'Ordem não encontrada ou não pertence ao motoboy.'); END IF;
    IF v_order.status = 'completed' THEN RETURN jsonb_build_object('ok', true); END IF;

    -- Calcular taxas
    v_fee := (v_order.total_price * _platform_fee_percent / 100);
    v_net := v_order.total_price - v_fee;

    -- Atualizar status
    UPDATE public.service_orders SET status = 'completed', updated_at = now() WHERE id = _order_id;

    -- Log financeiro (Simples para esta fase)
    INSERT INTO public.system_events_log (event_type, payload)
    VALUES ('order_payment_release', jsonb_build_object('order_id', _order_id, 'motoboy_id', _motoboy_id, 'net_value', v_net));

    RETURN jsonb_build_object('ok', true, 'net_released', v_net);
END; $$;

-- 4. PERMISSÕES E REALTIME
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_offers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
  END IF;
END $$;

-- 5. VERIFICAÇÃO FINAL
SELECT 'Schema & RPC Alignment Complete' as status;
