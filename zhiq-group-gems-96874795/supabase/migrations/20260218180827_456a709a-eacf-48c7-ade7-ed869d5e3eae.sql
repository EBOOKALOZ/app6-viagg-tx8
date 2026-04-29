-- Adiciona política SELECT pública (anon) para footer_contents
-- Necessário para o rodapé público funcionar sem autenticação
CREATE POLICY "Leitura pública de footer contents"
  ON public.footer_contents
  FOR SELECT
  TO anon
  USING (true);