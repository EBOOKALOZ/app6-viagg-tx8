-- ============================================================
-- AUDITORIA FORMAL DE VALIDAÇÃO DE GRUPOS (2026-08-01)
--
-- Regra nova do produto: registrar em log TODA validação (automática
-- via trigger, manual via admin, veredito de IA, ou reavaliação
-- periódica) — não só as decisões manuais do admin, que hoje ficam
-- em radar_admin_decisions (mantida, continua servindo o fluxo de
-- aprovar/rejeitar/arquivar da tela do Radar IA).
--
-- Alimentada pelos triggers de validação (migration
-- 20260801_enforce_group_validity_min60.sql), pela RPC de
-- transferência (admin) e pela RPC de reavaliação periódica.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.group_validation_audit_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table            text NOT NULL CHECK (source_table IN ('whatsapp_groups', 'driver_whatsapp_groups')),
  source_id               uuid NOT NULL,
  owner_user_id           uuid,
  members_count_at_check  integer,
  validation_result       text NOT NULL CHECK (validation_result IN ('aprovado', 'reprovado', 'aguardando_qualificacao')),
  reason                  text,
  triggered_by            text NOT NULL CHECK (triggered_by IN ('trigger', 'admin', 'ia', 'reavaliacao')),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_audit_source ON public.group_validation_audit_log (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_group_audit_owner ON public.group_validation_audit_log (owner_user_id, created_at);

ALTER TABLE public.group_validation_audit_log ENABLE ROW LEVEL SECURITY;

-- Profissional pode ver o histórico dos próprios grupos; admin vê tudo.
DROP POLICY IF EXISTS group_audit_owner_read ON public.group_validation_audit_log;
CREATE POLICY group_audit_owner_read ON public.group_validation_audit_log
  FOR SELECT USING (owner_user_id = auth.uid() OR public.mp_is_admin());

REVOKE ALL ON public.group_validation_audit_log FROM anon, authenticated;
GRANT SELECT ON public.group_validation_audit_log TO authenticated;
