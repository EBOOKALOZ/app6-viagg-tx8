-- ============================================================
-- VIAGENS — VISIBILIDADE DE MÍDIA POR STATUS DE MODERAÇÃO · 2026-07-23
-- ------------------------------------------------------------
-- Complementa 20260723_travel_policies_hardening.sql. Aquela migration já
-- amarrou a leitura pública de travel_media à visibilidade do anúncio-pai
-- (só 'published'). Esta fecha o último vetor: mídia PENDENTE ou REJEITADA
-- num anúncio publicado NÃO pode aparecer na vitrine — a imagem deve
-- acompanhar exatamente o status de moderação, não só o do anúncio.
--
-- Público/anon: vê apenas mídia aprovada de anúncio publicado.
-- Dono/admin: continuam vendo tudo (edição/moderação).
--
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

DROP POLICY IF EXISTS travel_media_public_read ON public.travel_media;
CREATE POLICY travel_media_public_read ON public.travel_media
  FOR SELECT TO anon, authenticated
  USING (
    -- dono e admin: acesso total (edição, fila de moderação)
    owner_user_id = auth.uid()
    OR public.is_admin()
    OR (
      -- público: anúncio publicado E mídia aprovada
      EXISTS (
        SELECT 1 FROM public.travel_listings tl
        WHERE tl.id = listing_id
          AND tl.visibility_status = 'published'
      )
      AND moderation_status IN
        ('approved', 'approved_clean', 'approved_masked', 'masked')
    )
  );

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Esperado: policy_ok=1 · sem USING(true) em travel_media
SELECT
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='travel_media' AND policyname='travel_media_public_read') AS policy_ok,
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='travel_media' AND policyname='travel_media_public_read'
      AND qual = 'true') AS ainda_using_true;
