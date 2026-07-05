-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 1 · M1: Fix promoted_listing_slots
--
-- Problemas corrigidos:
--   BUG #1 — constraint listing_type aceita singular ('produto','imovel','veiculo')
--            mas o frontend envia plural ('produtos','imoveis','veiculos', ...)
--   BUG #6 — colunas position, status, removed_at, finished_at, added_by,
--            last_posted_at, post_count ausentes (necessárias para o módulo Fila)
--
-- Projeto: broifhfqmnzqoongtokm
-- Aplicar via Supabase SQL Editor — NUNCA usar supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Remover constraint antiga (nomes no singular) ─────────────────────
DO $$ BEGIN
  ALTER TABLE public.promoted_listing_slots
    DROP CONSTRAINT IF EXISTS promoted_listing_slots_listing_type_check;
END $$;

-- ── 2. Migrar dados existentes: singular → plural ─────────────────────────
UPDATE public.promoted_listing_slots
SET listing_type = CASE listing_type
  WHEN 'produto'  THEN 'produtos'
  WHEN 'imovel'   THEN 'imoveis'
  WHEN 'veiculo'  THEN 'veiculos'
  ELSE listing_type
END
WHERE listing_type IN ('produto', 'imovel', 'veiculo');

-- ── 3. Nova constraint com nomes plurais (igual ao CategoryTab do frontend) ─
DO $$ BEGIN
  ALTER TABLE public.promoted_listing_slots
    ADD CONSTRAINT promoted_listing_slots_listing_type_check
    CHECK (listing_type IN ('produtos','imoveis','veiculos','servicos','fretes','viagens'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Coluna position (ordenação dentro da fila do usuário) ──────────────
ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;

-- Backfill: posição sequencial por usuário, ordenada por created_at
UPDATE public.promoted_listing_slots pls
SET position = sub.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC)::INT AS rn
  FROM public.promoted_listing_slots
) sub
WHERE pls.id = sub.id;

-- ── 5. Coluna status ──────────────────────────────────────────────────────
ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$ BEGIN
  ALTER TABLE public.promoted_listing_slots
    ADD CONSTRAINT promoted_listing_slots_status_check
    CHECK (status IN ('active','paused','finished','removed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Colunas de ciclo de vida e estatísticas ───────────────────────────
ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS removed_at     TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS finished_at    TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS added_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS post_count     INT NOT NULL DEFAULT 0;

-- ── 7. Garantir RLS habilitado ────────────────────────────────────────────
ALTER TABLE public.promoted_listing_slots ENABLE ROW LEVEL SECURITY;

-- ── 8. Políticas RLS (drop + recreate para idempotência) ─────────────────
DROP POLICY IF EXISTS "pls_select_own" ON public.promoted_listing_slots;
DROP POLICY IF EXISTS "pls_insert_own" ON public.promoted_listing_slots;
DROP POLICY IF EXISTS "pls_update_own" ON public.promoted_listing_slots;
DROP POLICY IF EXISTS "pls_delete_own" ON public.promoted_listing_slots;

CREATE POLICY "pls_select_own" ON public.promoted_listing_slots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "pls_insert_own" ON public.promoted_listing_slots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pls_update_own" ON public.promoted_listing_slots
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "pls_delete_own" ON public.promoted_listing_slots
  FOR DELETE USING (auth.uid() = user_id);

-- ── 9. Índices para consultas eficientes da fila ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_pls_user_status_pos
  ON public.promoted_listing_slots (user_id, status, position ASC);

CREATE INDEX IF NOT EXISTS idx_pls_listing_id
  ON public.promoted_listing_slots (listing_id);

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M1 concluída: promoted_listing_slots corrigida e expandida.';
  RAISE NOTICE '   constraint: plural types | colunas: position, status, removed_at, finished_at, added_by, last_posted_at, post_count';
END $$;
