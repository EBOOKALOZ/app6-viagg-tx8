-- Comando Convênio · FASE 1 — bucket de documentos de prestação de contas.
-- Privado: leitura/escrita restritas ao Gestor (is_gestor_convenio()).
-- Publicação real do documento para o público segue via URL assinada gerada
-- no momento da consulta (não fica público por padrão, mesmo com
-- convenio_accountability.status = 'publicada').

INSERT INTO storage.buckets (id, name, public) VALUES ('convenio-documentos', 'convenio-documentos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS convenio_documentos_sel ON storage.objects;
CREATE POLICY convenio_documentos_sel ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'convenio-documentos' AND public.is_gestor_convenio());

DROP POLICY IF EXISTS convenio_documentos_ins ON storage.objects;
CREATE POLICY convenio_documentos_ins ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'convenio-documentos' AND public.is_gestor_convenio());

DROP POLICY IF EXISTS convenio_documentos_del ON storage.objects;
CREATE POLICY convenio_documentos_del ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'convenio-documentos' AND public.is_gestor_convenio());

SELECT (SELECT count(*) FROM storage.buckets WHERE id = 'convenio-documentos') bucket,
       (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'convenio_documentos%') policies;
