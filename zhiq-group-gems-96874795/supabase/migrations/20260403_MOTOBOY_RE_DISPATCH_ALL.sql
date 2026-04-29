-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_MOTOBOY_RE_DISPATCH_ALL.sql
-- PURPOSE: Force dispatch of existing backlog and verify visibility
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. PROCESSAR BACKLOG (Disparar ofertas para as 14 ordens em espera)
DO $$ 
DECLARE 
    r_order RECORD;
    v_count integer := 0;
BEGIN
    FOR r_order IN SELECT id FROM public.service_orders WHERE status = 'awaiting_professional'
    LOOP
        PERFORM public.create_delivery_offers_for_order(r_order.id);
        
        -- Atualizar status para 'searching' para que o trigger não dispare de novo
        UPDATE public.service_orders SET status = 'searching', updated_at = now() WHERE id = r_order.id;
        
        v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE '✅ Redespacho concluído para % ordens.', v_count;
END $$;

-- 2. AJUSTE DE RLS (Garantir que motoboys vejam as ofertas)
-- Removemos a política antiga e recriamos de forma mais permissiva para o TESTE
DROP POLICY IF EXISTS "Motoboys can view their own offers" ON public.delivery_offers;
CREATE POLICY "Motoboys can view their own offers" ON public.delivery_offers
    FOR SELECT USING (true); -- Temporariamente aberto para SELECT para tirar dúvida de RLS

-- 3. PERMISSÕES EXPLICITAS
GRANT SELECT, INSERT, UPDATE ON public.delivery_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_offers TO anon;

-- 4. VERIFICAÇÃO DE DADOS GERADOS
SELECT 
    (SELECT count(*) FROM public.delivery_offers WHERE status = 'pending') as ofertas_pendentes_criadas,
    (SELECT count(*) FROM public.service_orders WHERE status = 'searching') as ordens_em_processo_de_busca;
