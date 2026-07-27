-- ============================================================================
-- SHC v2.0 — Expansão do enum shc_status (raiz do BUG-07)
-- O enum original só tinha: pending | running | passed | failed.
-- O SHCEngine grava 'active' / 'active_corrected' / 'inactive' em
-- shc_modules.status e 'error' em shc_runs.result — todos REJEITADOS pelo
-- enum, o que fazia todo UPDATE de módulo falhar silenciosamente e os
-- módulos ficarem eternamente em 'pending' (score 0).
-- A migration 20260726180000 tentou corrigir, mas mirou no tipo errado
-- (shc_module_status, que não existe em produção).
--
-- ATENÇÃO: ALTER TYPE ... ADD VALUE não roda dentro de bloco de transação.
-- Aplicar cada statement isoladamente (o SQL Editor do Supabase e o
-- `supabase db query` aplicam um arquivo como transação única — execute
-- statement a statement se necessário).
-- ============================================================================

ALTER TYPE public.shc_status ADD VALUE IF NOT EXISTS 'error';
ALTER TYPE public.shc_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.shc_status ADD VALUE IF NOT EXISTS 'inactive';
ALTER TYPE public.shc_status ADD VALUE IF NOT EXISTS 'active_corrected';
