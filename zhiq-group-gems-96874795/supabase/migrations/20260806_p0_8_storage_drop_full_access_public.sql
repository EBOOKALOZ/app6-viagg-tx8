-- ============================================================================
-- P0-8 (CRÍTICO) — storage.objects: remover acesso total público a TODOS os
--                  buckets (incl. privados)
-- ============================================================================
-- Causa raiz:
--   Duas policies PERMISSIVE em storage.objects com ALL USING(true)
--   WITH CHECK(true) para {public}:
--     - "Full Access"
--     - "Permissao Total Original"
--   Combinando por OR, anulam TODAS as ~70 policies granulares por-bucket
--   (leitura pública só dos buckets públicos, upload/leitura por pasta do
--   usuário, is_admin(), is_gestor_convenio() etc.). Resultado: qualquer
--   visitante anônimo lê/manipula objetos de QUALQUER bucket, inclusive os
--   privados: carrier-documents (CNH/docs de transportadora),
--   vehicles-documents, convenio-documentos, moderacao, qa-attachments,
--   arremate-anexos.
--   Comprovado no banco vivo: anon leu 1 objeto do bucket privado 'moderacao'.
--
-- Correção (fail-closed):
--   DROP das duas policies ALL USING(true). As policies granulares legítimas
--   permanecem e cobrem todos os fluxos:
--     - leitura pública: buckets públicos têm SELECT public próprio
--       (avatars, product-images, logos_lojas, marketing-materials,
--        real-estate-public/original, travel-public, vehicles-public, ...);
--     - buckets privados: leitura/escrita só por dono/admin/gestor.
--
-- Sobre grants de tabela: storage.objects pertence a supabase_storage_admin;
-- o papel que executa esta migration NÃO consegue revogar grants dela
-- (REVOKE é silenciosamente inefetivo — verificado no banco vivo). Isso é
-- inócuo do ponto de vista de segurança: RLS está ATIVO em storage.objects,
-- então um grant de tabela (INSERT/UPDATE/DELETE/TRUNCATE) sem uma policy
-- PERMISSIVE que o habilite não permite operação alguma. Removidas as duas
-- policies USING(true), cada operação passa a exigir uma policy granular
-- específica por bucket. Comprovado no banco vivo (replay): anon lê 0 objetos
-- de bucket privado, continua lendo buckets públicos, e DELETE é negado.
--
-- Idempotente: DROP POLICY IF EXISTS + guard fail-closed.
-- ============================================================================

BEGIN;

-- Remover acesso total público ----------------------------------------------
DROP POLICY IF EXISTS "Full Access"              ON storage.objects;
DROP POLICY IF EXISTS "Permissao Total Original" ON storage.objects;

-- Guard fail-closed: nenhuma policy ALL USING(true) para anon/public deve
-- restar em storage.objects.
DO $$
DECLARE v_offender text;
BEGIN
  SELECT policyname INTO v_offender
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND cmd='ALL' AND qual='true'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
  LIMIT 1;
  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-8: ainda existe policy ALL USING(true) em storage.objects: %', v_offender;
  END IF;
END $$;

COMMIT;
