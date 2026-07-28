-- ============================================================
-- VIAGENS — BACKFILL DE MÍDIA LEGADA · 2026-07-28
-- (Auditoria "Mais Produtos desta Loja": cards de Viagens só
--  mostravam placeholder)
-- ------------------------------------------------------------
-- CAUSA RAIZ (evidência coletada no banco vivo em 2026-07-28):
--  1) As mídias dos anúncios de Viagens foram enviadas em
--     2026-06-25, ANTES do pipeline definitivo (migration
--     20260723_travel_media_pipeline_definitivo). Ficaram presas
--     em moderation_status='queued' com public_url NULL — o
--     resolver oficial (resolveTravelMedia, fail-closed) devolve
--     null e o card cai no placeholder. Os ARQUIVOS, porém,
--     existem no bucket PÚBLICO 'real-estate-original' (MIME
--     image/* correto) — ou seja, já são publicamente acessíveis
--     hoje; só os METADADOS estão defasados.
--  2) O anúncio "Cruzeiro de fim de ano" tem o arquivo no Storage
--     mas NENHUMA linha em travel_media (insert perdido no upload
--     legado) — impossível exibir sem reconstruir a linha.
--
-- O backfill abaixo apenas registra a realidade: para mídia
-- legada 'queued' cujo arquivo JÁ ESTÁ em bucket público, grava
-- bucket/storage_path/public_url e marca aprovada (satisfazendo o
-- CHECK travel_media_approved_needs_url_ck). Não move arquivo,
-- não expõe nada novo. Tudo auditado em travel_audit_log.
--
-- Idempotente: reexecutar não encontra linhas-alvo.
-- ============================================================

-- ── 1. Mídias legadas 'queued' com arquivo em bucket público ──
WITH alvo AS (
  SELECT tm.id AS media_id, obj.bucket_id, obj.name,
         tm.moderation_status::text AS old_status
  FROM public.travel_media tm
  CROSS JOIN LATERAL (
    SELECT o.bucket_id, o.name
    FROM storage.objects o
    JOIN storage.buckets b ON b.id = o.bucket_id AND b.public
    WHERE o.name = tm.original_storage_path
      AND (o.metadata->>'mimetype') LIKE 'image/%'
    ORDER BY o.created_at DESC
    LIMIT 1
  ) obj
  WHERE tm.public_url IS NULL
    AND tm.moderation_status::text IN ('queued','processing','pending_ai_analysis','ai_processing')
    AND tm.original_storage_path IS NOT NULL
),
upd AS (
  UPDATE public.travel_media tm
     SET bucket            = a.bucket_id,
         storage_path      = a.name,
         public_url        = 'https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/' || a.bucket_id || '/' || a.name,
         moderation_status = 'approved',
         approved_at       = now()
    FROM alvo a
   WHERE tm.id = a.media_id
   RETURNING tm.id, a.old_status
)
INSERT INTO public.travel_audit_log (entity, entity_id, action, actor_user_id, reason, old_data, new_data)
SELECT 'travel_media', u.id, 'moderate:backfill_legado_bucket_publico', NULL,
       'Backfill 2026-07-28: mídia pré-pipeline em bucket público; metadados sincronizados com o Storage',
       jsonb_build_object('moderation_status', u.old_status, 'public_url', NULL),
       jsonb_build_object('moderation_status', 'approved')
FROM upd u;

-- ── 2. Anúncio publicado SEM linha de mídia, mas COM arquivo ──
-- Reconstrói apenas a capa (arquivo image/* mais recente do
-- próprio listing em bucket público). Não toca em anúncios que já
-- têm alguma linha em travel_media (evita ressuscitar duplicatas
-- de tentativas antigas de upload).
WITH orfaos AS (
  SELECT tl.id AS listing_id, tl.owner_user_id, obj.bucket_id, obj.name
  FROM public.travel_listings tl
  CROSS JOIN LATERAL (
    SELECT o.bucket_id, o.name
    FROM storage.objects o
    JOIN storage.buckets b ON b.id = o.bucket_id AND b.public
    WHERE (o.name LIKE '%/travel/' || tl.id || '/%' OR o.name LIKE 'travel/' || tl.id || '/%')
      AND (o.metadata->>'mimetype') LIKE 'image/%'
    ORDER BY o.created_at DESC
    LIMIT 1
  ) obj
  WHERE tl.visibility_status = 'published'
    AND NOT EXISTS (SELECT 1 FROM public.travel_media tm WHERE tm.listing_id = tl.id)
),
ins AS (
  INSERT INTO public.travel_media
    (listing_id, owner_user_id, media_type, sort_order, original_storage_path,
     bucket, storage_path, public_url, moderation_status, approved_at)
  SELECT listing_id, owner_user_id, 'image', 0, name,
         bucket_id, name,
         'https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/' || bucket_id || '/' || name,
         'approved', now()
  FROM orfaos
  RETURNING id, listing_id
)
INSERT INTO public.travel_audit_log (entity, entity_id, action, actor_user_id, reason, old_data, new_data)
SELECT 'travel_media', i.id, 'moderate:backfill_linha_reconstruida', NULL,
       'Backfill 2026-07-28: arquivo existia no Storage sem linha em travel_media (insert perdido no upload legado)',
       '{}'::jsonb,
       jsonb_build_object('listing_id', i.listing_id, 'moderation_status', 'approved')
FROM ins i;

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
SELECT tl.id AS listing_id,
       left(tl.title, 40) AS title,
       count(tm.id) AS midias,
       count(tm.id) FILTER (WHERE tm.public_url IS NOT NULL
         AND tm.moderation_status::text IN ('approved','approved_clean','approved_masked','masked')) AS midias_visiveis
FROM public.travel_listings tl
LEFT JOIN public.travel_media tm ON tm.listing_id = tl.id
WHERE tl.visibility_status = 'published'
GROUP BY tl.id, tl.title
ORDER BY max(tl.created_at) DESC;
