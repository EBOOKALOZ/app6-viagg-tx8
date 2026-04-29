-- Politica RLS para leitura publica de perfis de lojistas
-- Permite que usuarios anonimos leiam dados publicos dos perfis

DROP POLICY IF EXISTS "Leitura publica de perfis" ON public.profiles;
CREATE POLICY "Leitura publica de perfis"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);
