-- ============================================================================
-- VIAGENS — Criação bloqueada das 2 tabelas ausentes em produção
-- (travel_negotiation_messages · travel_audit_log)
--
-- Origens: 20260625_travel_negotiation_messages.sql e
-- 20260723_travel_admin_moderacao_oficial.sql — a aplicação integral falha
-- porque (a) a policy original usa aci.contact_user_id, coluna que NÃO existe
-- no schema vivo de advertiser_contact_intentions (modelo lead-based:
-- visitor_name/visitor_phone, sem FK de usuário comprador) e (b) o arquivo de
-- moderação depende de funções de uma migration anterior não aplicada.
--
-- Este arquivo cria as tabelas com o schema oficial + RLS + anon revogado
-- (contrato da suíte tests/security). Policies do lado comprador ficam para o
-- ciclo de reconciliação do módulo Viagens (exige FK de usuário na intenção).
-- Idempotente. Sem statements destrutivos.
-- ============================================================================

-- ── 1. travel_negotiation_messages ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.travel_negotiation_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  intention_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tnm_intention_created
  ON public.travel_negotiation_messages(intention_id, created_at);

ALTER TABLE public.travel_negotiation_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.travel_negotiation_messages FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.travel_negotiation_messages FROM authenticated;

-- Participantes no schema vivo: o anunciante da intenção e o autor da mensagem.
DROP POLICY IF EXISTS tnm_select ON public.travel_negotiation_messages;
CREATE POLICY tnm_select ON public.travel_negotiation_messages
  FOR SELECT TO authenticated USING (
    sender_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.advertiser_contact_intentions aci
      WHERE aci.id = travel_negotiation_messages.intention_id
        AND aci.advertiser_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tnm_insert ON public.travel_negotiation_messages;
CREATE POLICY tnm_insert ON public.travel_negotiation_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.advertiser_contact_intentions aci
      WHERE aci.id = travel_negotiation_messages.intention_id
    )
  );

-- ── 2. travel_audit_log (trilha imutável; escrita só via definer/service) ───
CREATE TABLE IF NOT EXISTS public.travel_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity        text NOT NULL,
  entity_id     uuid,
  action        text NOT NULL,
  actor_user_id uuid DEFAULT auth.uid(),
  reason        text,
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_audit_entity
  ON public.travel_audit_log (entity, entity_id, created_at DESC);

ALTER TABLE public.travel_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS travel_audit_admin_read ON public.travel_audit_log;
CREATE POLICY travel_audit_admin_read ON public.travel_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.travel_audit_log FROM PUBLIC, anon;
GRANT SELECT ON public.travel_audit_log TO authenticated;
GRANT ALL ON public.travel_audit_log TO service_role;
