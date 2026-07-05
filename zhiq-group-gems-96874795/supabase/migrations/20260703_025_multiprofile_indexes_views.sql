-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 · M25: Índices de performance + Views atualizadas
--
-- 1. Índices para hot paths do multi-perfil no Motor Universal
-- 2. Fix da view postador_commission_eligibility (suporta todos os perfis)
-- 3. Nova view operator_promotion_summary (dashboard do operador)
-- 4. Nova view posting_engine_dashboard_summary (admin, todos os perfis)
-- 5. Políticas RLS de leitura admin para tabelas T2
--
-- Todos IF NOT EXISTS — seguro para re-executar.
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Índices (multi-perfil)
-- ─────────────────────────────────────────────────────────────────────────

-- Admin dashboard: campanhas por perfil de origem
CREATE INDEX IF NOT EXISTS idx_campaigns_origin_profile
  ON public.posting_campaigns (origin_profile_type, status, created_at DESC);

-- Rastreabilidade: campanha → slot de operador
CREATE INDEX IF NOT EXISTS idx_campaigns_operator_slot
  ON public.posting_campaigns (operator_slot_id)
  WHERE operator_slot_id IS NOT NULL;

-- Lote → slot de operador
CREATE INDEX IF NOT EXISTS idx_lots_operator_slot
  ON public.posting_lots (operator_slot_id)
  WHERE operator_slot_id IS NOT NULL;

-- posting_lots por source_profile (lojista vs operador)
CREATE INDEX IF NOT EXISTS idx_lots_source_profile
  ON public.posting_lots (source_profile, status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Fix: postador_commission_eligibility — suporta todos os perfis
-- (versão original só considerava motoboy; agora inclui driver e mototaxi)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.postador_commission_eligibility AS
SELECT
  pl.operator_user_id,

  -- Perfil detectado a partir do source_profile do lote
  -- lojista posts têm source_profile IN (produtos, imoveis, etc.)
  -- operador posts têm source_profile IN (driver, motoboy, mototaxi)
  CASE
    WHEN pl.source_profile IN ('driver','motoboy','mototaxi') THEN pl.source_profile
    ELSE 'lojista'
  END AS operator_profile_type,

  COUNT(*)           FILTER (WHERE pl.status = 'posted'
                               AND pl.posted_at >= NOW() - INTERVAL '30 days')
                     AS confirmed_lots_30d,

  COUNT(*)           FILTER (WHERE pl.status = 'posted') AS confirmed_lots_total,

  MAX(pl.posted_at)  AS last_confirmed_at,

  MAX(pl.posted_at) + INTERVAL '30 days' AS eligibility_expires_at,

  -- Elegível se postou pelo menos 1 lote nos últimos 30 dias
  COUNT(*) FILTER (WHERE pl.status = 'posted'
                     AND pl.posted_at >= NOW() - INTERVAL '30 days') > 0
                   AS is_eligible_for_commission,

  GREATEST(0,
    EXTRACT(DAY FROM (MAX(pl.posted_at) + INTERVAL '30 days' - NOW()))
  )::INT           AS days_until_expiry,

  GREATEST(0,
    EXTRACT(DAY FROM (MAX(pl.posted_at) + INTERVAL '30 days' - NOW()))
  )::INT < 7       AS expiry_warning

FROM public.posting_lots pl
WHERE pl.operator_user_id IS NOT NULL
  AND pl.status IN ('posted','cooldown')
GROUP BY pl.operator_user_id, operator_profile_type;

COMMENT ON VIEW public.postador_commission_eligibility IS
'Tier 2.2: Elegibilidade de comissão para todos os perfis de operador (driver/motoboy/mototaxi). Atualizada para incluir source_profile.';

GRANT SELECT ON public.postador_commission_eligibility TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Nova view: operator_promotion_summary
-- Resumo de slots + performance para o painel do operador
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.operator_promotion_summary AS
SELECT
  ops.user_id,
  ops.profile_type,
  COUNT(*)                        FILTER (WHERE ops.status = 'active')   AS active_slots,
  COUNT(*)                        FILTER (WHERE ops.status = 'paused')   AS paused_slots,
  COUNT(*)                        FILTER (WHERE ops.status = 'finished') AS finished_slots,
  SUM(ops.post_count)                                                     AS total_posts,
  MAX(ops.last_posted_at)                                                 AS last_posted_at,
  COUNT(DISTINCT pc.id)           FILTER (WHERE pc.status = 'completed') AS completed_campaigns,
  COUNT(DISTINCT pc.id)           FILTER (WHERE pc.status NOT IN ('completed','cancelled','expired'))
                                                                          AS active_campaigns
FROM public.operator_promotional_slots ops
LEFT JOIN public.posting_campaigns pc
  ON pc.operator_slot_id = ops.id
GROUP BY ops.user_id, ops.profile_type;

COMMENT ON VIEW public.operator_promotion_summary IS
'Tier 2.2: KPIs de auto-promoção por operador. Usado no painel operador e no admin.';

GRANT SELECT ON public.operator_promotion_summary TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Nova view: posting_engine_dashboard_summary
-- Visão geral do Motor Universal por perfil (Admin Control Center)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.posting_engine_dashboard_summary AS
SELECT
  COALESCE(pc.origin_profile_type, 'lojista')      AS profile_type,
  COUNT(*)                                          AS total_campaigns,
  COUNT(*) FILTER (WHERE pc.status = 'draft')      AS draft,
  COUNT(*) FILTER (WHERE pc.status = 'ready')      AS ready,
  COUNT(*) FILTER (WHERE pc.status = 'queued')     AS queued,
  COUNT(*) FILTER (WHERE pc.status = 'generating') AS generating,
  COUNT(*) FILTER (WHERE pc.status = 'posting')    AS posting,
  COUNT(*) FILTER (WHERE pc.status = 'waiting')    AS waiting,
  COUNT(*) FILTER (WHERE pc.status = 'paused')     AS paused,
  COUNT(*) FILTER (WHERE pc.status = 'completed')  AS completed,
  COUNT(*) FILTER (WHERE pc.status = 'cancelled')  AS cancelled,
  COUNT(*) FILTER (WHERE pc.status = 'error')      AS error,
  COUNT(*) FILTER (WHERE pc.status = 'expired')    AS expired,
  COUNT(*) FILTER (WHERE pc.created_at::date = CURRENT_DATE) AS campaigns_today
FROM public.posting_campaigns pc
GROUP BY pc.origin_profile_type;

COMMENT ON VIEW public.posting_engine_dashboard_summary IS
'Tier 2.2: Resumo de campanhas por perfil para o Admin Control Center do Motor Universal.';

GRANT SELECT ON public.posting_engine_dashboard_summary TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS: leitura das tabelas T2 para authenticated
-- (tabelas novas da M21/M22 já têm políticas; garantir tabelas T2.1)
-- ─────────────────────────────────────────────────────────────────────────

-- posting_workers: já tem policy (M07), garantir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_workers'
      AND policyname = 'workers_select_all_authenticated'
  ) THEN
    CREATE POLICY "workers_select_all_authenticated"
      ON public.posting_workers FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- posting_campaigns: leitura do próprio + admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_campaigns'
      AND policyname = 'campaigns_select_own'
  ) THEN
    CREATE POLICY "campaigns_select_own"
      ON public.posting_campaigns FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- posting_metrics_daily: leitura global (agrega, sem PII)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_metrics_daily'
      AND policyname = 'metrics_select_all_authenticated'
  ) THEN
    CREATE POLICY "metrics_select_all_authenticated"
      ON public.posting_metrics_daily FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- alert_rules: leitura global
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'alert_rules'
      AND policyname = 'alert_rules_select_all_authenticated'
  ) THEN
    CREATE POLICY "alert_rules_select_all_authenticated"
      ON public.alert_rules FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M25 — Índices multi-perfil criados, postador_commission_eligibility reescrita, 2 novas views (operator_promotion_summary, posting_engine_dashboard_summary), RLS garantido.';
END $$;
