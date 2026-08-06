-- ═══════════════════════════════════════════════════════════════════════════
-- ORION-QA 002 · FASE 2 — view enriquecida p/ Prioridade IA e Dashboard
--
-- INCREMENTAL sobre a Fase 1 (20260804_orion_qa_central_problemas.sql):
-- NÃO altera tabelas, triggers, RLS ou grants existentes.
--
-- qa_issues_enriched = qa_issues + contadores agregados usados pelo motor de
-- Score IA (comentários, alterações, anexos, reaberturas) em UMA única query
-- (evita N+1 no painel e viabiliza paginação server-side com contagem exata).
--
-- SEGURANÇA: security_invoker=true ⇒ a RLS admin-only (is_admin()) das
-- tabelas base continua valendo para quem consulta a view. anon sem acesso.
--
-- Projeto: broifhfqmnzqoongtokm — idempotente; aplicar via SQL Editor ou
-- supabase db query --file — NUNCA supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP VIEW IF EXISTS public.qa_issues_enriched;
CREATE VIEW public.qa_issues_enriched
WITH (security_invoker = true) AS
SELECT
  i.*,
  (SELECT count(*) FROM public.qa_issue_comments c WHERE c.issue_id = i.id)    AS comments_count,
  (SELECT count(*) FROM public.qa_issue_history h WHERE h.issue_id = i.id)     AS history_count,
  (SELECT count(*) FROM public.qa_issue_attachments a WHERE a.issue_id = i.id) AS attachments_count,
  (SELECT count(*) FROM public.qa_issue_history h
     WHERE h.issue_id = i.id AND h.event_type = 'reabertura')                  AS reopen_count
FROM public.qa_issues i;

COMMENT ON VIEW public.qa_issues_enriched IS
'ORION-QA Fase 2: qa_issues + contadores (comentários/alterações/anexos/reaberturas) para o Score IA e o dashboard. security_invoker ⇒ herda a RLS admin-only das tabelas base.';

-- Defesa em profundidade contra a default ACL do schema public (que concede
-- ALL a anon E authenticated em objeto novo): view é estritamente leitura.
REVOKE ALL ON public.qa_issues_enriched FROM anon;
REVOKE ALL ON public.qa_issues_enriched FROM authenticated;
GRANT SELECT ON public.qa_issues_enriched TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ ORION-QA Fase 2 — view qa_issues_enriched criada (security_invoker, SELECT p/ authenticated, anon bloqueado).';
END $$;
