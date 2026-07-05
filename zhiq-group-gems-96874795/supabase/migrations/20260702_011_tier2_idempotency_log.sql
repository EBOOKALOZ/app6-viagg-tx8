-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M11: idempotency_log
-- Seção 5 — Idempotência
--
-- Garante que nenhuma postagem aconteça duas vezes, mesmo em caso de retry
-- após falha de worker ou timeout de rede.
--
-- Chave de idempotência:
--   MD5(campaign_id || ':' || slot_id || ':' || group_id || ':' || planned_date)
--   Gerada em create_posting_campaign() e verificada antes de cada postagem.
--
-- Fluxo:
--   1. check_idempotency(key) → status ou NULL
--   2. Se NULL: proceeder com postagem
--   3. Se 'pending': outro worker está processando → aguardar/skip
--   4. Se 'executed': operação já concluída → retornar resultado cacheado
--   5. record_idempotency(key, ..., 'executed', result) → marcar como concluído
--
-- Depende de: M08 (posting_campaigns)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.idempotency_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  TEXT        NOT NULL UNIQUE,
  campaign_id      UUID        REFERENCES public.posting_campaigns(id) ON DELETE SET NULL,
  slot_id          UUID        REFERENCES public.promoted_listing_slots(id) ON DELETE SET NULL,
  group_id         TEXT,
  planned_at       TIMESTAMPTZ,
  executed_at      TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','executed','failed')),
  result           JSONB       DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.idempotency_log IS
'Tier 2 §5: Chave de idempotência por postagem. Key = MD5(campaign+slot+group+date). Garante que retries não duplicam postagens. check_idempotency() verifica antes; record_idempotency() marca como executed após.';

ALTER TABLE public.idempotency_log ENABLE ROW LEVEL SECURITY;

-- Acesso somente via RPCs SECURITY DEFINER (check_idempotency, record_idempotency)
-- Sem SELECT público — informação interna do sistema

CREATE INDEX IF NOT EXISTS idx_idem_campaign ON public.idempotency_log (campaign_id);
CREATE INDEX IF NOT EXISTS idx_idem_slot     ON public.idempotency_log (slot_id);
-- Limpeza periódica de registros antigos
CREATE INDEX IF NOT EXISTS idx_idem_created  ON public.idempotency_log (created_at DESC);

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M11 — idempotency_log criada com chave UNIQUE.'; END $$;
