-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 1 · M6: Criar VIEW posting_audit_log
--
-- Problema:
--   BUG #6 — CampaignTrackingCard.tsx e PromotionActiveDashboard.tsx consultam
--            posting_audit_log mas a view nunca foi criada → erro em runtime
--
-- Colunas esperadas pelos componentes:
--   id, profile_type, success, created_at
--
-- Fonte: posting_timeline_events (criada em 20260629_posting_audit_trail.sql)
--
-- Projeto: broifhfqmnzqoongtokm
-- Aplicar via Supabase SQL Editor — NUNCA usar supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.posting_audit_log AS
SELECT
  id,
  COALESCE(actor_profile, 'postador')                                        AS profile_type,
  (event_type IN ('completed','posted','sent','confirmed','success',
                  'slot_posted'))                                             AS success,
  created_at
FROM public.posting_timeline_events;

GRANT SELECT ON public.posting_audit_log TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '✅ M6 concluída: VIEW posting_audit_log criada sobre posting_timeline_events.';
  RAISE NOTICE '   Colunas: id, profile_type (actor_profile), success (event_type IN ...), created_at';
END $$;
