-- ===================================================================
-- footer_contents: permitir que ADMINS gravem (insert/update/delete).
-- A leitura pública já existe (policy "Allow public read access").
--
-- Neste ambiente o admin é reconhecido pelo e-mail (ADMIN_TEST_EMAILS no app)
-- e/ou pela flag profiles.is_admin — a infra de user_roles/has_role não está
-- aplicada aqui. A policy abaixo cobre os dois jeitos via auth.email().
-- ===================================================================

ALTER TABLE public.footer_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage footer_contents" ON public.footer_contents;
CREATE POLICY "Admins manage footer_contents"
ON public.footer_contents
FOR ALL
TO authenticated
USING (
  auth.email() IN ('angelo_zanatta@hotmail.com', 'angelozanatta100@gmail.com')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
)
WITH CHECK (
  auth.email() IN ('angelo_zanatta@hotmail.com', 'angelozanatta100@gmail.com')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);
