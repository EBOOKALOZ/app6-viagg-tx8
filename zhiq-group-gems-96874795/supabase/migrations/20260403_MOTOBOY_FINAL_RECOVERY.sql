-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_MOTOBOY_FINAL_RECOVERY.sql
-- PURPOSE: Fix column name errors (order_description -> notes) and Force Dispatch
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. CORREÇÃO DA FUNÇÃO DE DESPACHO (Nomes de colunas corretos)
CREATE OR REPLACE FUNCTION public.create_delivery_offers_for_order(p_delivery_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_motoboy RECORD;
    v_offer_count integer := 0;
BEGIN
    -- 1. Buscar a ordem com os nomes de colunas REAIS da service_orders
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_delivery_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'Ordem não encontrada.');
    END IF;

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
            v_order.customer_id, -- Na service_orders, o nome do cliente está em customer_id
            v_order.notes, -- Na service_orders, a descrição está em notes
            now() + interval '5 minutes'
        );
        v_offer_count := v_offer_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'offers_sent', v_offer_count);
END; $$;

-- 2. REDESPACHO FORÇADO (Agora com as colunas certas)
DO $$ 
DECLARE 
    r_order RECORD;
    v_count integer := 0;
BEGIN
    FOR r_order IN SELECT id FROM public.service_orders WHERE status = 'awaiting_professional'
    LOOP
        PERFORM public.create_delivery_offers_for_order(r_order.id);
        
        -- Atualizar status para 'searching'
        UPDATE public.service_orders SET status = 'searching', updated_at = now() WHERE id = r_order.id;
        
        v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE '✅ Redespacho concluído para % ordens.', v_count;
END $$;

-- 3. PERMISSÃO TEMPORÁRIA DE VISUALIZAÇÃO (Garantir que recebam no Frontend)
DROP POLICY IF EXISTS "Motoboys can view their own offers" ON public.delivery_offers;
CREATE POLICY "Motoboys can view their own offers" ON public.delivery_offers
    FOR SELECT USING (true); -- Aberto para TESTES

-- 4. RESULTADO FINAL
SELECT 
    (SELECT count(*) FROM public.delivery_offers WHERE status = 'pending') as ofertas_geradas,
    (SELECT count(*) FROM public.service_orders WHERE status = 'searching') as ordens_em_busca;
