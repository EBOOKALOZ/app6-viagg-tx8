-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 1 · M3: Adicionar source_slot_id em posting_lot_items
--
-- Permite rastrear qual promoted_listing_slots originou cada item do lote,
-- cumprindo o requisito arquitetural de rastreabilidade ponta a ponta
-- (Passo 7 da validação: estatísticas do slot são atualizadas).
--
-- Projeto: broifhfqmnzqoongtokm
-- Aplicar via Supabase SQL Editor — NUNCA usar supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.posting_lot_items
  ADD COLUMN IF NOT EXISTS source_slot_id UUID
    REFERENCES public.promoted_listing_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pli_source_slot
  ON public.posting_lot_items (source_slot_id);

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M3 concluída: posting_lot_items + source_slot_id.';
END $$;
