-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 PRÉ-2.3 · M31: Módulo de Comissões
--
-- Expande a view postador_commission_eligibility (T2.2 M25) com um
-- ledger transacional completo de comissões por operador.
--
-- Tabela operator_commission_ledger:
--   Cada linha = uma comissão gerada (pending/approved/cancelled/paid)
--   Vinculada ao lote (lot_id) e/ou campanha (campaign_id) que a gerou
--   Auditável: approved_by, approved_at, paid_at
--
-- Views:
--   commission_summary_by_profile — KPIs por profile_type (admin)
--   operator_commission_view      — histórico por usuário (para o operador)
--
-- RPCs:
--   approve_operator_commission(id)  — admin aprova comissão pendente
--   cancel_operator_commission(id)   — admin cancela comissão
--
-- Integra com:
--   Lojista (origin_profile_type='lojista')
--   Motorista/Moto Táxi/Motoboy (operator_promotional_slots)
--
-- Depende de: M17(posting_lots) M08(posting_campaigns) M27(is_admin, has_permission)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: operator_commission_ledger
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operator_commission_ledger (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type   TEXT        NOT NULL,                  -- 'lojista'|'driver'|'motoboy'|'mototaxi'
  lot_id         UUID        REFERENCES public.posting_lots(id) ON DELETE SET NULL,
  campaign_id    UUID        REFERENCES public.posting_campaigns(id) ON DELETE SET NULL,
  amount_cents   INT         NOT NULL DEFAULT 0,        -- valor em centavos (R$1,00 = 100)
  currency       TEXT        NOT NULL DEFAULT 'BRL',
  status         TEXT        NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'cancelled'|'paid'
  reason         TEXT,                                  -- descrição da comissão
  reference_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  approved_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ,
  cancel_reason  TEXT,
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.operator_commission_ledger IS
'Tier 2.2 PRÉ-2.3: Ledger de comissões por operador. Fluxo: pending → approved → paid (ou cancelled).';

-- CHECK constraints
DO $$ BEGIN
  ALTER TABLE public.operator_commission_ledger
    ADD CONSTRAINT commission_profile_type_check
    CHECK (profile_type IN ('lojista','driver','motoboy','mototaxi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.operator_commission_ledger
    ADD CONSTRAINT commission_status_check
    CHECK (status IN ('pending','approved','cancelled','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.operator_commission_ledger
    ADD CONSTRAINT commission_amount_positive
    CHECK (amount_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.trg_fn_commission_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_commission_updated_at ON public.operator_commission_ledger;
CREATE TRIGGER trg_commission_updated_at
  BEFORE UPDATE ON public.operator_commission_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_commission_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Índices
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_commission_user_status   ON public.operator_commission_ledger (user_id, status, reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_commission_profile_date  ON public.operator_commission_ledger (profile_type, reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_commission_status_date   ON public.operator_commission_ledger (status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.operator_commission_ledger ENABLE ROW LEVEL SECURITY;

-- Operador vê apenas suas próprias comissões
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_commission_ledger' AND policyname='commission_select_own') THEN
    CREATE POLICY "commission_select_own"
      ON public.operator_commission_ledger FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Admin/Financeiro vê tudo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_commission_ledger' AND policyname='commission_select_admin') THEN
    CREATE POLICY "commission_select_admin"
      ON public.operator_commission_ledger FOR SELECT TO authenticated
      USING (public.has_permission('commission:read'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. View: commission_summary_by_profile (admin)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.commission_summary_by_profile AS
SELECT
  profile_type,
  COUNT(*) FILTER (WHERE status = 'pending')            AS pending_count,
  COUNT(*) FILTER (WHERE status = 'approved')           AS approved_count,
  COUNT(*) FILTER (WHERE status = 'cancelled')          AS cancelled_count,
  COUNT(*) FILTER (WHERE status = 'paid')               AS paid_count,
  SUM(amount_cents) FILTER (WHERE status = 'pending')   AS pending_cents,
  SUM(amount_cents) FILTER (WHERE status = 'approved')  AS approved_cents,
  SUM(amount_cents) FILTER (WHERE status = 'paid')      AS paid_cents,
  COUNT(DISTINCT user_id)                               AS unique_operators,
  MAX(created_at)                                       AS last_commission_at
FROM public.operator_commission_ledger
GROUP BY profile_type;

COMMENT ON VIEW public.commission_summary_by_profile IS
'Tier 2.2 PRÉ-2.3: KPIs de comissão agregados por perfil. Usado no Admin Centro de Controle.';

GRANT SELECT ON public.commission_summary_by_profile TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. View: operator_commission_view (por operador)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.operator_commission_view AS
SELECT
  ocl.id,
  ocl.user_id,
  ocl.profile_type,
  ocl.lot_id,
  ocl.campaign_id,
  ocl.amount_cents,
  ROUND(ocl.amount_cents::numeric / 100, 2) AS amount_brl,
  ocl.status,
  ocl.reason,
  ocl.reference_date,
  ocl.approved_at,
  ocl.paid_at,
  ocl.created_at,
  -- Saldo disponível para saque (somente approved, não paid)
  SUM(CASE WHEN ocl.status = 'approved' THEN ocl.amount_cents ELSE 0 END)
    OVER (PARTITION BY ocl.user_id, ocl.profile_type)  AS balance_available_cents
FROM public.operator_commission_ledger ocl;

GRANT SELECT ON public.operator_commission_view TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RPCs: approve_operator_commission + cancel_operator_commission
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_operator_commission(
  p_commission_id UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_row RECORD;
BEGIN
  IF NOT public.has_permission('commission:approve') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão: commission:approve');
  END IF;

  SELECT * INTO v_row FROM public.operator_commission_ledger WHERE id = p_commission_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comissão não encontrada');
  END IF;
  IF v_row.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas comissões pendentes podem ser aprovadas. Status atual: ' || v_row.status);
  END IF;

  UPDATE public.operator_commission_ledger
  SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
      metadata = metadata || jsonb_build_object('approval_notes', p_notes)
  WHERE id = p_commission_id;

  PERFORM public.log_posting_event(
    'CommissionApproved', auth.uid(), v_row.campaign_id, v_row.lot_id, NULL, NULL,
    v_row.profile_type, NULL, 'rpc',
    jsonb_build_object('commission_id', p_commission_id, 'amount_cents', v_row.amount_cents),
    true, NULL
  );

  RETURN jsonb_build_object('ok', true, 'commission_id', p_commission_id, 'status', 'approved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_operator_commission(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_operator_commission(
  p_commission_id UUID,
  p_reason        TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_row RECORD;
BEGIN
  IF NOT public.has_permission('commission:approve') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão: commission:approve');
  END IF;

  SELECT * INTO v_row FROM public.operator_commission_ledger WHERE id = p_commission_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comissão não encontrada');
  END IF;
  IF v_row.status IN ('paid','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comissão já ' || v_row.status || ' — não pode ser cancelada');
  END IF;

  UPDATE public.operator_commission_ledger
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
  WHERE id = p_commission_id;

  RETURN jsonb_build_object('ok', true, 'commission_id', p_commission_id, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_operator_commission(UUID, TEXT) TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M31 — operator_commission_ledger criada (3 índices, RLS own+admin, CHECK constraints). Views: commission_summary_by_profile, operator_commission_view. RPCs: approve_operator_commission(), cancel_operator_commission().';
END $$;
