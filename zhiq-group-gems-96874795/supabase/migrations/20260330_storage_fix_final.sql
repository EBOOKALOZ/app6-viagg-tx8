-- =========================================================
-- SOLUÇÃO DEFINITIVA DE STORAGE - ABRIR TUDO
-- =========================================================

-- 1. Garante que ambos os buckets sejam PÚBLICOS
UPDATE storage.buckets SET public = true WHERE id IN ('real-estate-original', 'real-estate-public');

-- 2. Abre a leitura SELECT para QUALQUER PESSOA em ambos os buckets
DROP POLICY IF EXISTS "Public Read originals" ON storage.objects;
CREATE POLICY "Public Read originals" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'real-estate-original');

DROP POLICY IF EXISTS "Public Read public" ON storage.objects;
CREATE POLICY "Public Read public" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'real-estate-public');

-- 3. Garante permissão de UPLOAD para você em ambos
DROP POLICY IF EXISTS "Auth Upload originals" ON storage.objects;
CREATE POLICY "Auth Upload originals" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'real-estate-original');

DROP POLICY IF EXISTS "Auth Upload public" ON storage.objects;
CREATE POLICY "Auth Upload public" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'real-estate-public');

notify pgrst, 'reload schema';
