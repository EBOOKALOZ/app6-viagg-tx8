-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260403_fix_trigger_after_insert.sql
-- BUG CRÍTICO: trigger era BEFORE INSERT
-- A função create_delivery_offers_for_order faz SELECT na service_orders
-- mas em BEFORE INSERT o registro ainda não existe na tabela.
-- Resultado: order_not_found → nenhuma offer criada para pedidos novos.
-- FIX: mudar para AFTER INSERT e usar UPDATE separado para o status.
-- ═══════════════════════════════════════════════════════════════

-- Remove trigger antigo (BEFORE)
DROP TRIGGER IF EXISTS trigger_service_order_dispatch_engine ON public.service_orders;

-- Rebuild trigger function para AFTER (não pode modificar NEW, mas pode fazer UPDATE)
CREATE OR REPLACE FUNCTION public.fn_trigger_service_order_dispatch()
RETURNS TRIGGER AS $$
BEGIN
    -- Só disparar quando status for 'awaiting_professional'
    IF NEW.status = 'awaiting_professional' THEN
        -- Agora a linha JÁ EXISTE no banco (AFTER INSERT), o SELECT funciona
        PERFORM public.create_delivery_offers_for_order(NEW.id);

        -- Atualizar status para 'searching' (UPDATE separado, não modifica NEW)
        UPDATE public.service_orders
        SET status = 'searching', updated_at = now()
        WHERE id = NEW.id AND status = 'awaiting_professional';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar como AFTER INSERT OR UPDATE
CREATE TRIGGER trigger_service_order_dispatch_engine
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_service_order_dispatch();

-- Verificação: trigger está ativo?
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'service_orders'
  AND trigger_name = 'trigger_service_order_dispatch_engine';
