-- ============================================================
-- HOMOLOGAÇÃO ENTERPRISE — MÓDULO VIAGENS · 2026-07-23
-- ------------------------------------------------------------
-- Rode este script INTEIRO no SQL Editor do Supabase (projeto
-- broifhfqmnzqoongtokm) DEPOIS de aplicar, na ordem:
--   1) 20260723_travel_schema_sync_oficial.sql
--   2) 20260723_travel_storage_bucket_oficial.sql
--   3) 20260723_travel_policies_hardening.sql
--   4) 20260723_travel_promocao_divulgacao_oficial.sql
--   5) 20260723_travel_aposenta_creditos_oficial.sql
--   6) 20260723_travel_admin_moderacao_oficial.sql
--   7) 20260723_travel_media_visibility_hardening.sql
--
-- Cada bloco imprime PASS/FAIL. Cole o resultado de volta para o
-- parecer objetivo de certificação. NÃO altera dados (só lê).
-- ============================================================

-- ── 1. STORAGE: bucket oficial existe e é público ────────────
SELECT '1. bucket travel-public' AS checagem,
  CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='travel-public' AND public)
       THEN 'PASS' ELSE 'FAIL — aplicar 20260723_travel_storage_bucket_oficial.sql' END AS resultado;

-- ── 2. STORAGE: policies do bucket (read + insert/update/delete próprios) ──
SELECT '2. policies travel-public' AS checagem,
  CASE WHEN (SELECT count(*) FROM pg_policies
             WHERE schemaname='storage' AND tablename='objects'
               AND policyname IN ('travel_public_read','travel_public_insert_own_folder',
                                  'travel_public_update_own_folder','travel_public_delete_own_folder')) = 4
       THEN 'PASS' ELSE 'FAIL' END AS resultado;

-- ── 3. RLS travel_listings: público só vê 'published' ────────
SELECT '3. travel_listings public_read sem USING(true)' AS checagem,
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                        WHERE tablename='travel_listings'
                          AND policyname='travel_listings_public_read' AND qual='true')
       THEN 'PASS' ELSE 'FAIL — RLS ainda expõe rascunhos' END AS resultado;

-- ── 4. RLS travel_media: acompanha status + moderação ────────
SELECT '4. travel_media public_read sem USING(true)' AS checagem,
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                        WHERE tablename='travel_media'
                          AND policyname='travel_media_public_read' AND qual='true')
       THEN 'PASS' ELSE 'FAIL' END AS resultado;

-- ── 5. travel_credit_purchases: sem policy FOR ALL (fraude de recibo) ──
SELECT '5. travel_credit_purchases sem FOR ALL' AS checagem,
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                        WHERE tablename='travel_credit_purchases' AND cmd='ALL')
       THEN 'PASS' ELSE 'FAIL' END AS resultado;

-- ── 6. RPCs de moderação admin existem e são SECURITY DEFINER ─
SELECT '6. RPCs admin_moderate_travel_*' AS checagem,
  CASE WHEN (SELECT count(*) FROM pg_proc p
             WHERE p.pronamespace='public'::regnamespace
               AND p.proname IN ('admin_moderate_travel_listing','admin_moderate_travel_media')
               AND p.prosecdef) = 2
       THEN 'PASS' ELSE 'FAIL' END AS resultado;

-- ── 7. RPCs de moderação têm search_path fixo (anti-hijack) ──
SELECT '7. search_path fixo nas RPCs admin' AS checagem,
  CASE WHEN (SELECT count(*) FROM pg_proc p
             WHERE p.pronamespace='public'::regnamespace
               AND p.proname IN ('admin_moderate_travel_listing','admin_moderate_travel_media')
               AND array_to_string(p.proconfig,',') LIKE '%search_path%') = 2
       THEN 'PASS' ELSE 'FAIL' END AS resultado;

-- ── 8. RPCs legadas de clique revogadas de anon/authenticated ─
SELECT '8. charge_travel_* sem EXECUTE p/ anon' AS checagem,
  CASE WHEN NOT EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN LATERAL aclexplode(p.proacl) a ON true
         JOIN pg_roles r ON r.oid = a.grantee
         WHERE p.pronamespace='public'::regnamespace
           AND p.proname IN ('charge_travel_listing_click','charge_travel_interest_click')
           AND r.rolname IN ('anon','authenticated') AND a.privilege_type='EXECUTE')
       THEN 'PASS' ELSE 'FAIL — anon ainda drena créditos' END AS resultado;

-- ── 9. Soft delete + auditoria + FKs ─────────────────────────
SELECT '9. deleted_at + travel_audit_log + FKs' AS checagem,
  CASE WHEN (SELECT count(*) FROM information_schema.columns
             WHERE table_name='travel_listings' AND column_name='deleted_at') = 1
       AND EXISTS (SELECT 1 FROM pg_tables WHERE tablename='travel_audit_log')
       AND (SELECT count(*) FROM pg_constraint
            WHERE conname IN ('travel_listings_owner_fk','travel_media_owner_fk','travel_contacts_owner_fk')) = 3
       THEN 'PASS' ELSE 'FAIL' END AS resultado;

-- ── 10. Índices de vitrine/owner/media/deleted ───────────────
SELECT '10. índices travel_*' AS checagem,
  CASE WHEN (SELECT count(*) FROM pg_indexes
             WHERE tablename IN ('travel_listings','travel_media')
               AND indexname IN ('idx_travel_listings_vitrine','idx_travel_listings_owner',
                                 'idx_travel_media_listing_sort','idx_travel_listings_deleted')) >= 3
       THEN 'PASS' ELSE 'PARCIAL — conferir lista abaixo' END AS resultado;

-- ── 11. STORAGE: mídia ÓRFÃ (row em travel_media sem objeto no bucket) ──
-- Lista até 20 paths de travel_media que NÃO têm objeto correspondente em
-- nenhum dos buckets candidatos. Resultado VAZIO = PASS (nenhum 404).
WITH tm AS (
  SELECT id, listing_id, coalesce(public_masked_storage_path, original_storage_path) AS path
  FROM public.travel_media
  WHERE coalesce(public_masked_storage_path, original_storage_path) IS NOT NULL
)
SELECT '11. mídia órfã (vazio=PASS)' AS checagem, tm.id AS media_id, tm.listing_id, tm.path
FROM tm
WHERE NOT EXISTS (
  SELECT 1 FROM storage.objects o
  WHERE o.bucket_id IN ('travel-public','real-estate-public','real-estate-original')
    AND o.name = tm.path
)
LIMIT 20;

-- ── 12. CONSISTÊNCIA: nenhum id de travel_listings colide com outros módulos ──
-- (a mistura de dados vinha de colisão de id entre tabelas). Vazio = PASS.
SELECT '12. colisão de id entre módulos (vazio=PASS)' AS checagem, tl.id
FROM public.travel_listings tl
WHERE EXISTS (SELECT 1 FROM public.real_estate_listings x WHERE x.id = tl.id)
   OR EXISTS (SELECT 1 FROM public.vehicle_listings   x WHERE x.id = tl.id)
   OR EXISTS (SELECT 1 FROM public.service_listings   x WHERE x.id = tl.id)
   OR EXISTS (SELECT 1 FROM public.freight_listings   x WHERE x.id = tl.id)
LIMIT 20;

-- ── 13. RELOAD do schema (PostgREST enxerga RPCs novas) ──────
SELECT pg_notify('pgrst', 'reload schema') AS reload_enviado;

-- ============================================================
-- LEITURA DO RESULTADO:
--   Blocos 1–10: coluna 'resultado' deve ser PASS.
--   Blocos 11–12: devem retornar 0 linhas (nenhuma mídia órfã, nenhuma colisão).
-- Se todos PASS + 11/12 vazios → banco/segurança/storage homologados.
-- A validação de EXPERIÊNCIA (galeria exibindo, upload real, anon×admin) é
-- feita no app rodando — ver checklist manual no relatório de certificação.
-- ============================================================
