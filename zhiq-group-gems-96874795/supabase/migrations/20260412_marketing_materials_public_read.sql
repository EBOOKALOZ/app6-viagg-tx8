-- ===================================================================
-- Habilitar leitura pública do bucket marketing-materials
-- Necessário para exibir imagens de produtos dos anunciantes
-- ===================================================================

-- 1. Garantir que o bucket existe e é público
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-materials', 'marketing-materials', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Policy de leitura pública (qualquer pessoa pode ver as imagens)
DROP POLICY IF EXISTS "Public Read marketing-materials" ON storage.objects;
CREATE POLICY "Public Read marketing-materials"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'marketing-materials');

-- 3. Policy de upload (apenas usuários autenticados)
DROP POLICY IF EXISTS "Auth Upload marketing-materials" ON storage.objects;
CREATE POLICY "Auth Upload marketing-materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'marketing-materials');

-- 4. Policy de delete (apenas dono do arquivo)
DROP POLICY IF EXISTS "Owner Delete marketing-materials" ON storage.objects;
CREATE POLICY "Owner Delete marketing-materials"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'marketing-materials' AND (storage.foldername(name))[1] = auth.uid()::text);
