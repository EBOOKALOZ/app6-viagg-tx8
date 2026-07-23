-- ============================================================
-- VIAGENS — BUCKET OFICIAL DE MÍDIA (travel-public) · 2026-07-23
-- ------------------------------------------------------------
-- CRÍTICO da auditoria: o upload de fotos de viagem vai para o
-- bucket 'travel-public' (ViagemForm → moderate-image), mas o
-- bucket NUNCA foi criado/policiado em migration — e a LEITURA
-- resolvia URLs no bucket 'real-estate-original' (público e com
-- upload aberto sem restrição de dono/pasta).
--
-- Esta migration:
--  1) Versiona a criação do bucket travel-public (leitura pública
--     — as fotos de anúncio são públicas por design; o que é
--     protegido são os CONTATOS, nunca a mídia).
--  2) Policies de storage.objects restritas ao bucket:
--     • SELECT público (vitrine).
--     • INSERT apenas autenticado e apenas na PRÓPRIA pasta
--       (prefixo = auth.uid()). O caminho oficial de upload é a
--       edge moderate-image (service_role, bypassa RLS e modera
--       ANTES de gravar); esta policy fecha o upload direto.
--     • UPDATE/DELETE apenas dono da pasta.
--  3) O frontend passa a LER deste mesmo bucket (helper
--     getTravelMediaUrl) — fim da inconsistência upload/leitura.
--
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. Bucket oficial ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('travel-public', 'travel-public', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 2. Policies do bucket ────────────────────────────────────
DROP POLICY IF EXISTS "travel_public_read" ON storage.objects;
CREATE POLICY "travel_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'travel-public');

DROP POLICY IF EXISTS "travel_public_insert_own_folder" ON storage.objects;
CREATE POLICY "travel_public_insert_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'travel-public'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "travel_public_update_own_folder" ON storage.objects;
CREATE POLICY "travel_public_update_own_folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'travel-public'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "travel_public_delete_own_folder" ON storage.objects;
CREATE POLICY "travel_public_delete_own_folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'travel-public'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Esperado: bucket_ok=1 (public=true) · policies_ok=4
SELECT
  (SELECT count(*)::int FROM storage.buckets
    WHERE id='travel-public' AND public) AS bucket_ok,
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('travel_public_read','travel_public_insert_own_folder',
                         'travel_public_update_own_folder','travel_public_delete_own_folder')) AS policies_ok;
