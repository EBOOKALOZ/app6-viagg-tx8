-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M16: scheduled_postings
-- Seção 15 — Scheduler Inteligente
--
-- Agendamentos de campanhas com suporte a:
--   - Execução única (recurrence = 'once')
--   - Recorrência diária / semanal / customizada
--   - Filtros de região (city, state, bairro)
--   - Prioridade por agendamento
--   - Integração com retry e rate limit (via RPCs T2.2)
--
-- Fluxo:
--   1. Lojista cria scheduled_posting via create_scheduled_posting()
--   2. pg_cron chama process_due_schedules() a cada minuto (Tier 2.2)
--   3. process_due_schedules() cria posting_campaign para cada due schedule
--   4. Após execução: status → triggered, next_run_at calculado (se recorrente)
--
-- Depende de: M08 (posting_campaigns)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_postings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID        REFERENCES public.posting_campaigns(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_id           UUID        REFERENCES public.promoted_listing_slots(id) ON DELETE SET NULL,
  profile_type      TEXT        NOT NULL,

  -- ── Agendamento ──
  scheduled_at      TIMESTAMPTZ NOT NULL,
  next_run_at       TIMESTAMPTZ,           -- calculado após cada execução recorrente
  recurrence        TEXT        CHECK (recurrence IN ('once','daily','weekly','custom')),
  recurrence_config JSONB,
  -- Exemplo: { "days": ["mon","wed","fri"], "time": "09:00", "timezone": "America/Sao_Paulo" }

  -- ── Filtros ──
  region_filter     JSONB,
  -- Exemplo: { "city": "São Paulo", "state": "SP", "bairros": ["Centro","Vila Madalena"] }

  -- ── Prioridade ──
  priority          TEXT        NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('urgent','high','medium','normal','low')),

  -- ── Status ──
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','triggered','completed','skipped','cancelled')),

  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  metadata          JSONB       DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.scheduled_postings IS
'Tier 2 §15: Agendamentos de postagem com recorrência e filtros de região. process_due_schedules() (pg_cron, Tier 2.2) verifica next_run_at e cria posting_campaigns automaticamente.';

ALTER TABLE public.scheduled_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_select_own"  ON public.scheduled_postings;
DROP POLICY IF EXISTS "schedule_insert_own"  ON public.scheduled_postings;

CREATE POLICY "schedule_select_own" ON public.scheduled_postings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "schedule_insert_own" ON public.scheduled_postings
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE via create_scheduled_posting() / cancel_scheduled_posting() (SECURITY DEFINER)

CREATE INDEX IF NOT EXISTS idx_schedule_user      ON public.scheduled_postings (user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_campaign  ON public.scheduled_postings (campaign_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slot      ON public.scheduled_postings (slot_id);
-- Hot path: pg_cron busca agendamentos pendentes prontos para disparar
CREATE INDEX IF NOT EXISTS idx_schedule_due
  ON public.scheduled_postings (next_run_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_schedule_status    ON public.scheduled_postings (status);

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M16 — scheduled_postings criada (scheduler inteligente).'; END $$;
