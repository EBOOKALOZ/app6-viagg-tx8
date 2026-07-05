-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 · M24: ALTER para suporte multi-perfil no Motor Universal
--
-- Adiciona rastreabilidade de perfil de origem em:
--   posting_campaigns  → origin_profile_type, operator_slot_id
--   posting_lots       → operator_slot_id (FK para rastreabilidade bidirecional)
--   operator_promotional_slots → latest_campaign_id (FK agora que campaigns existe)
--
-- Todas as alterações são NULLABLE ou com DEFAULT → zero breaking changes.
-- Não altera nenhum contrato público do Tier 1 ou 2.1.
--
-- Depende de: M08 (posting_campaigns), M17 (posting_lots alterado),
--             M21 (operator_promotional_slots)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. posting_campaigns: origem do perfil + FK para slot do operador
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.posting_campaigns
  ADD COLUMN IF NOT EXISTS origin_profile_type TEXT NOT NULL DEFAULT 'lojista',
  ADD COLUMN IF NOT EXISTS operator_slot_id     UUID
    REFERENCES public.operator_promotional_slots(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.posting_campaigns.origin_profile_type IS
'Tier 2.2: Perfil que originou esta campanha. lojista | driver | motoboy | mototaxi. Permite filtro no Admin Dashboard por perfil.';

COMMENT ON COLUMN public.posting_campaigns.operator_slot_id IS
'Tier 2.2: Slot de operador que gerou esta campanha (NULL para campanhas de lojista).';

-- Constraint de origin_profile_type
DO $$ BEGIN
  ALTER TABLE public.posting_campaigns
    ADD CONSTRAINT posting_campaigns_origin_profile_check
    CHECK (origin_profile_type IN ('lojista','driver','motoboy','mototaxi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. posting_lots: FK para slot do operador (rastreabilidade bidirecional)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.posting_lots
  ADD COLUMN IF NOT EXISTS operator_slot_id UUID
    REFERENCES public.operator_promotional_slots(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.posting_lots.operator_slot_id IS
'Tier 2.2: Referência ao slot de operador que originou este lote. NULL para lotes de lojista.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. operator_promotional_slots: FK para última campanha
-- (FK não pôde ser criada em M21 pois posting_campaigns era dependência circular)
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE public.operator_promotional_slots
    ADD CONSTRAINT ops_latest_campaign_fk
    FOREIGN KEY (latest_campaign_id)
    REFERENCES public.posting_campaigns(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.operator_promotional_slots.latest_campaign_id IS
'Tier 2.2: FK para a campanha T2.1 mais recente gerada a partir deste slot.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Atualizar rate_limit_config para incluir perfis de operador
-- (M12 já tem 'lojista', 'motoboy', 'mototaxi', 'driver' possivelmente)
-- Inserir os que faltam com limites adequados por perfil
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.rate_limit_config (profile_type, max_per_minute, max_per_hour, max_per_day, cooldown_seconds)
VALUES
  ('driver',   3, 15, 60, 30),
  ('mototaxi', 3, 15, 60, 30)
ON CONFLICT (profile_type) DO NOTHING;

-- Garantir que motoboy tem limites (pode já existir do seed original)
INSERT INTO public.rate_limit_config (profile_type, max_per_minute, max_per_hour, max_per_day, cooldown_seconds)
VALUES ('motoboy', 3, 15, 60, 30)
ON CONFLICT (profile_type) DO NOTHING;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M24 — posting_campaigns + posting_lots alteradas (origin_profile_type, operator_slot_id). FK de operator_promotional_slots.latest_campaign_id adicionada. Rate limits para driver e mototaxi inseridos.';
END $$;
