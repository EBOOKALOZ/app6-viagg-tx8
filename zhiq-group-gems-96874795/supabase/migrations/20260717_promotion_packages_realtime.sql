-- ============================================================================
-- promotion_packages → realtime · 2026-07-17
-- ============================================================================
-- Sintoma: valores editados no admin (/admin/promotion-packages) não refletiam
--   no grid de planos do lojista sem recarregar. Causa: a tabela não estava na
--   publicação supabase_realtime, então o .on('postgres_changes') do
--   PromotionPlansGrid nunca disparava. Solução: adicionar à publicação.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='promotion_packages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.promotion_packages;
  END IF;
END$$;

-- Verificação (esperado: 1)
SELECT count(*) AS promotion_packages_no_realtime
  FROM pg_publication_tables
 WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='promotion_packages';
