-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 · M26: RLS bypass para Admin no Motor Universal
--
-- Problema: posting_campaigns + posting_event_log têm policy `auth.uid() = user_id`.
-- Admin consultando essas tabelas via PostingEngineAdmin vê 0 linhas porque
-- nunca criou campanhas. Views derivadas (posting_engine_dashboard_summary)
-- ficam vazias pelo mesmo motivo.
--
-- Fix: adicionar policies de leitura para usuários com role='admin' em
-- app_metadata (padrão Supabase para admins da plataforma).
-- Leitura cross-user não viola Regra Arquitetural #1 (que proíbe ESCRITA direta).
--
-- Depende de: M08 (posting_campaigns), M13 (posting_event_log), M17 (posting_lots)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Helper: função inline para checar se o JWT atual é admin
-- Supabase armazena o role em app_metadata (setado via Dashboard ou Edge Function)
-- Exemplo: { app_metadata: { role: "admin" } }

-- ─────────────────────────────────────────────────────────────────────────
-- 1. posting_campaigns: admin lê todas
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_campaigns'
      AND policyname = 'campaigns_select_admin'
  ) THEN
    CREATE POLICY "campaigns_select_admin"
      ON public.posting_campaigns
      FOR SELECT TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. posting_event_log: admin lê todos os eventos
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_event_log'
      AND policyname = 'event_log_select_admin'
  ) THEN
    CREATE POLICY "event_log_select_admin"
      ON public.posting_event_log
      FOR SELECT TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. posting_lots: admin lê todos os lotes (aba Fila)
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_lots'
      AND policyname = 'lots_select_admin'
  ) THEN
    CREATE POLICY "lots_select_admin"
      ON public.posting_lots
      FOR SELECT TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. posting_dead_letter_queue: admin lê a DLQ
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_dead_letter_queue'
      AND policyname = 'dlq_select_admin'
  ) THEN
    CREATE POLICY "dlq_select_admin"
      ON public.posting_dead_letter_queue
      FOR SELECT TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. operator_promotional_slots: admin lê todos os slots (visão cross-user)
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'operator_promotional_slots'
      AND policyname = 'ops_select_admin'
  ) THEN
    CREATE POLICY "ops_select_admin"
      ON public.operator_promotional_slots
      FOR SELECT TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. alerts_history: admin lê todos os alertas
-- (complementa alert_rules_select_all_authenticated do M25)
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'alerts_history'
      AND policyname = 'alerts_history_select_admin'
  ) THEN
    CREATE POLICY "alerts_history_select_admin"
      ON public.alerts_history
      FOR SELECT TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END $$;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M26 — RLS admin bypass adicionado para: posting_campaigns, posting_event_log, posting_lots, posting_dead_letter_queue, operator_promotional_slots, alerts_history.';
END $$;
