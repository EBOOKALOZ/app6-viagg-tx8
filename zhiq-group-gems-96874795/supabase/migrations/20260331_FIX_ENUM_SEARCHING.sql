-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: 20260331_FIX_ENUM_SEARCHING.sql
-- FIX: Adicionar status 'searching' ao enum service_order_status
-- ═══════════════════════════════════════════════════════════════

-- NOTA: ALTER TYPE ... ADD VALUE não pode ser executado dentro de um bloco TRANSACTION (DO $$).
-- Deve ser executado como um comando individual no SQL Editor.

ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'searching';

-- Outros status úteis para garantir o fluxo completo
ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'waiting_acceptance';

-- Log de confirmação (opcional)
SELECT 'Status "searching" adicionado com sucesso!' as resultado;
