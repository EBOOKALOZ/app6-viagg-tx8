-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 PRÉ-2.3 · M30: Auditoria Expandida — Campaign Change Log
--
-- Registra automaticamente (via trigger) cada alteração em posting_campaigns:
--   status, priority, worker_id, scheduled_at, name, metadata
--
-- Campos de cada registro:
--   campaign_id    — referência à campanha alterada
--   changed_by     — auth.uid() no momento da alteração (NULL para workers/RPCs)
--   changed_at     — timestamp automático
--   field_name     — campo que mudou
--   old_value      — valor anterior (TEXT cast)
--   new_value      — valor novo (TEXT cast)
--   origin         — quem fez: 'rpc' | 'trigger' | 'worker' | 'admin' | 'scheduler'
--   metadata       — contexto extra (campaign_state, profile_type, etc.)
--
-- Permite consulta cronológica e futura implementação de rollback lógico.
-- A aba "Histórico de Alterações" no PostingEngineAdmin consulta esta tabela.
--
-- Depende de: M08 (posting_campaigns)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campaign_change_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES public.posting_campaigns(id) ON DELETE CASCADE,
  changed_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_name   TEXT        NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  origin       TEXT        NOT NULL DEFAULT 'trigger',  -- 'rpc'|'trigger'|'worker'|'admin'|'scheduler'
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.campaign_change_log IS
'Tier 2.2 PRÉ-2.3: Histórico field-level de alterações em posting_campaigns. Preenchido automaticamente por trigger.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Índices
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ccl_campaign_id ON public.campaign_change_log (campaign_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccl_changed_at  ON public.campaign_change_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccl_field_name  ON public.campaign_change_log (field_name, changed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.campaign_change_log ENABLE ROW LEVEL SECURITY;

-- Auditor e admin leem tudo; owner da campanha lê seu próprio histórico
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campaign_change_log' AND policyname='ccl_select_admin') THEN
    CREATE POLICY "ccl_select_admin"
      ON public.campaign_change_log FOR SELECT TO authenticated
      USING (public.is_admin() OR public.has_permission('audit:read'));
  END IF;
END $$;

-- Owner vê apenas alterações das próprias campanhas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campaign_change_log' AND policyname='ccl_select_own') THEN
    CREATE POLICY "ccl_select_own"
      ON public.campaign_change_log FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.posting_campaigns pc
          WHERE pc.id = campaign_change_log.campaign_id
            AND pc.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Trigger AFTER UPDATE em posting_campaigns
-- Rastreia: status, priority, worker_id, scheduled_at, name
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_campaign_change_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_meta JSONB;
BEGIN
  -- Contexto compartilhado para todos os registros desta linha
  v_meta := jsonb_build_object(
    'profile_type', COALESCE(NEW.origin_profile_type, 'lojista'),
    'campaign_id',  NEW.id
  );

  -- status
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.campaign_change_log
      (campaign_id, changed_by, field_name, old_value, new_value, origin, metadata)
    VALUES
      (NEW.id, auth.uid(), 'status', OLD.status, NEW.status, 'trigger', v_meta);
  END IF;

  -- priority
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.campaign_change_log
      (campaign_id, changed_by, field_name, old_value, new_value, origin, metadata)
    VALUES
      (NEW.id, auth.uid(), 'priority', OLD.priority, NEW.priority, 'trigger', v_meta);
  END IF;

  -- worker_id
  IF OLD.worker_id IS DISTINCT FROM NEW.worker_id THEN
    INSERT INTO public.campaign_change_log
      (campaign_id, changed_by, field_name, old_value, new_value, origin, metadata)
    VALUES
      (NEW.id, auth.uid(), 'worker_id',
       OLD.worker_id::text, NEW.worker_id::text, 'trigger', v_meta);
  END IF;

  -- scheduled_at
  IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
    INSERT INTO public.campaign_change_log
      (campaign_id, changed_by, field_name, old_value, new_value, origin, metadata)
    VALUES
      (NEW.id, auth.uid(), 'scheduled_at',
       OLD.scheduled_at::text, NEW.scheduled_at::text, 'trigger', v_meta);
  END IF;

  -- name
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO public.campaign_change_log
      (campaign_id, changed_by, field_name, old_value, new_value, origin, metadata)
    VALUES
      (NEW.id, auth.uid(), 'name', OLD.name, NEW.name, 'trigger', v_meta);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_change_log ON public.posting_campaigns;
CREATE TRIGGER trg_campaign_change_log
  AFTER UPDATE ON public.posting_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_campaign_change_log();

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M30 — campaign_change_log criada (3 índices, RLS admin+own). Trigger trg_campaign_change_log ativo em posting_campaigns (rastreia: status, priority, worker_id, scheduled_at, name).';
END $$;
