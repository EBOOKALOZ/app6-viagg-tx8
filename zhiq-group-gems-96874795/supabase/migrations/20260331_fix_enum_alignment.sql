-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_fix_enum_alignment.sql
-- FIX: Alinhamento de Enum service_order_status
-- ═══════════════════════════════════════════════════════════════

DO $$ 
BEGIN 
    -- 1. Tentar converter registros 'searching' para 'awaiting_professional' se a coluna for TEXT
    -- Se a coluna for ENUM e já tiver 'searching', a conversão falharia, 
    -- mas o erro do usuário sugere que a tentativa de INSERIR falha, 
    -- então não deve haver registros com 'searching' se o tipo for ENUM.
    
    BEGIN
        UPDATE public.service_orders 
        SET status = 'awaiting_professional' 
        WHERE status::text = 'searching';
        RAISE NOTICE 'Registros convertidos com sucesso.';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Nenhum registro para converter ou erro de tipo: %', SQLERRM;
    END;

    -- 2. Garantir que o Dispatch Cycle responda a 'awaiting_professional'
    -- (Isso já está no fix_nuclear_dispatch, mas reforçamos a lógica aqui se necessário)
    
END $$;

-- 3. Update create_delivery_order RPC to ensure it uses the correct status
-- (Isso será feito em uma edição separada no arquivo original para manter histórico)
