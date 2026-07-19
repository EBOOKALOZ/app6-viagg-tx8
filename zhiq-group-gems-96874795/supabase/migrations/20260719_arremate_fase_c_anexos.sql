-- Bucket privado para anexos/comprovantes do chat do arremate (FASE C).
INSERT INTO storage.buckets (id, name, public) VALUES ('arremate-anexos','arremate-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: o usuário é parte do arremate cujo listing_id = primeira pasta do path?
CREATE OR REPLACE FUNCTION public.arremate_pode_anexo(p_name text)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','storage' STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orion_auction_settlements s
    WHERE s.listing_id::text = split_part(p_name,'/',1)
      AND (s.winner_user_id = auth.uid() OR s.seller_user_id = auth.uid() OR public.mp_is_admin())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.arremate_pode_anexo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arremate_pode_anexo(text) TO authenticated, service_role;

-- Policies party-scoped no storage.objects (leitura e upload só das partes).
DROP POLICY IF EXISTS arremate_anexo_sel ON storage.objects;
CREATE POLICY arremate_anexo_sel ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='arremate-anexos' AND public.arremate_pode_anexo(name));
DROP POLICY IF EXISTS arremate_anexo_ins ON storage.objects;
CREATE POLICY arremate_anexo_ins ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='arremate-anexos' AND public.arremate_pode_anexo(name) AND owner = auth.uid());

SELECT (SELECT count(*) FROM storage.buckets WHERE id='arremate-anexos') bucket,
       (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'arremate_anexo%') policies;
