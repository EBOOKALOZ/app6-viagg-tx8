-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260405_FIX_TRIGGER_STATUS.sql
--
-- BUG: Trigger verifica NEW.status = 'awaiting_professional'
--      mas create_delivery_order insere com status = 'searching' direto.
--      Resultado: trigger nunca dispara, nenhuma oferta é criada.
--
-- FIX: Trigger disparar em INSERT quando status = 'searching'
--      (que é o status real que a ordem recebe ao ser criada).
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Recriar a função do trigger com condição correta ───────────────
CREATE OR REPLACE FUNCTION public.fn_trigger_service_order_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Dispara quando:
  --   INSERT com status 'searching' (novo pedido criado diretamente)
  --   UPDATE de qualquer status para 'searching' (redespacho)
  IF (TG_OP = 'INSERT' AND NEW.service_type = 'delivery' AND NEW.status = 'searching')
  OR (TG_OP = 'UPDATE' AND NEW.service_type = 'delivery'
      AND NEW.status = 'searching'
      AND (OLD.status IS DISTINCT FROM 'searching'))
  THEN
    -- Executar em background (PERFORM = fire-and-forget no trigger)
    PERFORM public.create_delivery_offers_for_order(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Recriar o trigger (DROP + CREATE para garantir) ─────────────────
DROP TRIGGER IF EXISTS trigger_dispatch_final ON public.service_orders;

CREATE TRIGGER trigger_dispatch_final
  AFTER INSERT OR UPDATE OF status
  ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trigger_service_order_dispatch();

-- ── 3. TESTE: verificar trigger ativo ────────────────────────────────
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'service_orders'
  AND trigger_name = 'trigger_dispatch_final';
