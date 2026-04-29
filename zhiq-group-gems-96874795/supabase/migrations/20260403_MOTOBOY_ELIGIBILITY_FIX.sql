-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_MOTOBOY_ELIGIBILITY_FIX.sql
-- PURPOSE: Ensure testers are eligible to receive calls and avoid SQL errors
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. SEGURANÇA NA PUBLICAÇÃO (Evitar o erro 42710)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_offers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
    RAISE NOTICE '✅ Tabela delivery_offers adicionada à publicação realtime';
  ELSE
    RAISE NOTICE '⚠️ Tabela delivery_offers já é membro da publicação realtime. Ignorando.';
  END IF;
END $$;

-- 2. FORÇAR ELEGIBILIDADE PARA TESTES
-- Garante que todos os perfis existentes estejam Online e Aprovados
UPDATE public.motoboy_profiles 
SET is_approved = true, is_online = true, updated_at = now();

-- 3. AUTO-APROVAÇÃO PARA NOVOS TESTADORES
-- Criar trigger para aprovar automaticamente qualquer novo perfil (útil em dev)
CREATE OR REPLACE FUNCTION public.fn_auto_approve_motoboy()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_approved := true;
    NEW.is_online := true;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_approve_motoboy ON public.motoboy_profiles;
CREATE TRIGGER trigger_auto_approve_motoboy
BEFORE INSERT ON public.motoboy_profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_approve_motoboy();

-- 4. DISPATCH ENGINE COM LOGS DE DEPURAÇÃO (NOTICE)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
BEGIN
    -- 1. Buscar a ordem
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN
        RAISE NOTICE '❌ Ordem % não encontrada.', p_delivery_order_id;
        RETURN jsonb_build_object('ok', false, 'reason', 'Ordem não encontrada.');
    END IF;

    RAISE NOTICE '📡 Iniciando despacho para ordem % (Status: %)', v_order.id, v_order.status;

    -- 2. Selecionar motoboys elegíveis
    FOR v_motoboy IN 
        SELECT user_id FROM public.motoboy_profiles 
        WHERE is_approved = true AND is_online = true
    LOOP
        INSERT INTO public.delivery_offers (
            delivery_order_id, motoboy_id, store_id,
            distance_km_snapshot, estimated_price_snapshot,
            pickup_address_snapshot, dropoff_address_snapshot,
            store_name_snapshot, customer_name_snapshot, notes_snapshot,
            expires_at
        ) VALUES (
            v_order.id, v_motoboy.user_id, v_order.merchant_id,
            v_order.distance_km, v_order.total_price,
            v_order.pickup_location, v_order.destination,
            (SELECT nome_loja FROM public.merchant_stores WHERE user_id = v_order.merchant_id LIMIT 1),
            v_order.customer_name, v_order.order_description,
            now() + interval '5 minutes'
        );
        v_offer_count := v_offer_count + 1;
        RAISE NOTICE '✅ Oferta criada para motoboy ID: %', v_motoboy.user_id;
    END LOOP;

    IF v_offer_count = 0 THEN
        RAISE NOTICE '⚠️ Nenhum motoboy online/aprovado encontrado para a ordem %', p_delivery_order_id;
    ELSE
        RAISE NOTICE '🚀 Despacho concluído: % ofertas geradas.', v_offer_count;
    END IF;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;

-- 5. RE-FORÇAR TRIGGER DE DISPACHO
DROP TRIGGER IF EXISTS trigger_service_order_dispatch_engine ON public.service_orders;
CREATE TRIGGER trigger_service_order_dispatch_engine
AFTER INSERT ON public.service_orders
FOR EACH ROW
WHEN (NEW.status = 'awaiting_professional' AND NEW.service_type = 'delivery')
EXECUTE FUNCTION public.fn_trigger_service_order_dispatch();

-- 6. VERIFICAÇÃO DE STATUS ATUAL
SELECT 
    (SELECT count(*) FROM public.motoboy_profiles WHERE is_approved = true AND is_online = true) as motoboys_online,
    (SELECT count(*) FROM public.service_orders WHERE status = 'awaiting_professional') as ordens_em_espera;
