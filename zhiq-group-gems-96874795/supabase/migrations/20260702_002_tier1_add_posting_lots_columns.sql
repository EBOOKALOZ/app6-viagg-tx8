-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 1 · M2: Adicionar colunas ausentes em posting_lots
--
-- Problema:
--   BUG #2 — postadorBridge.ts tenta inserir message_override e source_profile
--            em posting_lots, mas as colunas não existem → INSERT falha silenciosamente
--
-- Colunas adicionadas:
--   message_override TEXT         — mensagem customizada por lote
--   source_profile   TEXT         — categoria que gerou o lote (produtos/imoveis/etc.)
--   source_slot_id   UUID FK      — slot em promoted_listing_slots que originou o lote
--
-- Projeto: broifhfqmnzqoongtokm
-- Aplicar via Supabase SQL Editor — NUNCA usar supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.posting_lots
  ADD COLUMN IF NOT EXISTS message_override TEXT;

ALTER TABLE public.posting_lots
  ADD COLUMN IF NOT EXISTS source_profile TEXT;

ALTER TABLE public.posting_lots
  ADD COLUMN IF NOT EXISTS source_slot_id UUID
    REFERENCES public.promoted_listing_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pl_source_slot
  ON public.posting_lots (source_slot_id);

CREATE INDEX IF NOT EXISTS idx_pl_source_profile
  ON public.posting_lots (source_profile);

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M2 concluída: posting_lots + message_override, source_profile, source_slot_id.';
END $$;
