-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M18: Índices de Performance
-- Seção 17 — Performance (partial indexes, composite, hot paths)
--
-- Índices adicionais após todas as tabelas e alterações estarem criadas.
-- Cobre os hot paths identificados nas RPCs M19/M20.
-- Todos IF NOT EXISTS — seguro para re-executar.
--
-- Hot paths críticos:
--   1. get_campaigns_for_processing(): priority_score DESC, WHERE status IN (ready,queued)
--   2. acquire_lock(): UNIQUE parcial (já em M10) + lookup por resource
--   3. check_and_increment_rate_limit(): profile + window_type + window_start
--   4. get_next_slots_for_posting(): listing_type + status + position (já em M01)
--   5. deactivate_dead_workers(): status + last_heartbeat
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── posting_campaigns ─────────────────────────────────────────────────────

-- Workers chamam get_campaigns_for_processing() → esta query é o hot path principal
CREATE INDEX IF NOT EXISTS idx_campaigns_processing_order
  ON public.posting_campaigns (priority_score DESC, created_at ASC)
  WHERE status IN ('ready','queued') AND worker_id IS NULL;

-- Dashboard: campanhas em andamento
CREATE INDEX IF NOT EXISTS idx_campaigns_active
  ON public.posting_campaigns (user_id, status, updated_at DESC)
  WHERE status NOT IN ('completed','cancelled','expired');

-- Expiração automática (Tier 2.2 pg_cron)
CREATE INDEX IF NOT EXISTS idx_campaigns_to_expire
  ON public.posting_campaigns (expires_at ASC)
  WHERE status NOT IN ('completed','cancelled','expired') AND expires_at IS NOT NULL;


-- ── posting_lots ──────────────────────────────────────────────────────────

-- Cooldown check eficiente (confirm_posting_lot usa isso)
CREATE INDEX IF NOT EXISTS idx_lots_cooldown_check
  ON public.posting_lots (store_user_id, status, updated_at)
  WHERE status = 'cooldown';

-- Lotes expirados para cleanup
CREATE INDEX IF NOT EXISTS idx_lots_to_expire
  ON public.posting_lots (updated_at ASC)
  WHERE status = 'cooldown';


-- ── promoted_listing_slots ────────────────────────────────────────────────

-- Já tem idx_pls_user_status_pos do T1.
-- Adicional para get_next_slots_for_posting() por listing_type
CREATE INDEX IF NOT EXISTS idx_pls_type_active
  ON public.promoted_listing_slots (listing_type, position ASC)
  WHERE status = 'active';


-- ── posting_event_log ─────────────────────────────────────────────────────

-- Agregação de métricas (success rate por perfil no dashboard)
CREATE INDEX IF NOT EXISTS idx_event_log_metrics
  ON public.posting_event_log (profile, success, timestamp DESC)
  WHERE event_type IN ('LotPosted','LotConfirmed','LotExpired');


-- ── rate_limit_windows ────────────────────────────────────────────────────

-- Janela corrente por perfil (lookup mais frequente)
CREATE INDEX IF NOT EXISTS idx_rl_windows_current
  ON public.rate_limit_windows (profile_type, window_type, window_end DESC)
  WHERE window_end > NOW();


-- ── posting_workers ───────────────────────────────────────────────────────

-- Workers ativos para deactivate_dead_workers()
CREATE INDEX IF NOT EXISTS idx_workers_alive_check
  ON public.posting_workers (last_heartbeat ASC)
  WHERE status IN ('starting','idle','busy','paused');


-- ── posting_history (existente do T1) ────────────────────────────────────

-- Melhora queries de métricas históricas no dashboard
CREATE INDEX IF NOT EXISTS idx_posting_history_date_status
  ON public.posting_history (DATE(posted_at) DESC, final_status)
  WHERE posted_at IS NOT NULL;


-- ── campaign_state_log ────────────────────────────────────────────────────

-- Timeline de uma campanha (detalhe no admin)
CREATE INDEX IF NOT EXISTS idx_state_log_timeline
  ON public.campaign_state_log (campaign_id, created_at ASC);


-- ── posting_dead_letter_queue ─────────────────────────────────────────────

-- Paginação do painel admin de DLQ
CREATE INDEX IF NOT EXISTS idx_dlq_admin_view
  ON public.posting_dead_letter_queue (status, failed_at DESC);


-- ── alerts_history ────────────────────────────────────────────────────────

-- Alertas pendentes de acknowledgemento
CREATE INDEX IF NOT EXISTS idx_alerts_unacked
  ON public.alerts_history (fired_at DESC)
  WHERE acknowledged_at IS NULL AND resolved_at IS NULL;

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M18 — Índices de performance criados (hot paths T2 cobertos).'; END $$;
