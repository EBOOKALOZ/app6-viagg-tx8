-- ============================================================
-- PASSO 2: CORREÇÃO - Prefixar paths com nome do bucket
-- Execute APÓS conferir o diagnóstico
-- ============================================================

-- Backup (opcional mas seguro)
CREATE TABLE IF NOT EXISTS _backup_invalid_image_paths AS
SELECT 'auction_media' as tabela, id, storage_path, original_storage_path
FROM auction_media
WHERE storage_path IS NOT NULL AND storage_path NOT LIKE '%/%'
   OR original_storage_path IS NOT NULL AND original_storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'real_estate_media', id, storage_path, original_storage_path
FROM real_estate_media
WHERE original_storage_path IS NOT NULL AND original_storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'vehicle_media', id, storage_path, original_storage_path
FROM vehicle_media
WHERE original_storage_path IS NOT NULL AND original_storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'auction_listings', id, product_image_url as storage_path, NULL
FROM auction_listings
WHERE product_image_url IS NOT NULL
  AND product_image_url NOT LIKE 'http%'
  AND product_image_url NOT LIKE '%/%'
  AND product_image_url ~ '\.(png|jpg|jpeg|webp|gif)$';

-- CORREÇÃO 1: auction_media.storage_path (bucket: auction-images)
UPDATE auction_media
SET storage_path = CONCAT('auction-images/', storage_path)
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- CORREÇÃO 2: auction_media.original_storage_path (mesmo bucket)
UPDATE auction_media
SET original_storage_path = CONCAT('auction-images/', original_storage_path)
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- CORREÇÃO 3: real_estate_media.original_storage_path (bucket: real-estate-original)
UPDATE real_estate_media
SET original_storage_path = CONCAT('real-estate-original/', original_storage_path)
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- CORREÇÃO 4: vehicle_media.original_storage_path (bucket: vehicle-original)
UPDATE vehicle_media
SET original_storage_path = CONCAT('vehicle-original/', original_storage_path)
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- CORREÇÃO 5: auction_listings.product_image_url (caminhos relativos -> URL pública)
-- Substitua SEU_PROJECT_ID pelo ID do projeto Supabase (ex: abcdefghijklmnopqrst)
-- Se não souber o Project ID, pegue no URL do Supabase Studio: https://app.supabase.com/project/<PROJECT_ID>/...
-- Exemplo: https://app.supabase.com/project/abcdefg/...
-- O PROJECT_ID é "abcdefg"
--
-- ATENÇÃO: Execute APENAS se encontrar registros na query de diagnóstico
-- UPDATE auction_listings
-- SET product_image_url = CONCAT('https://SEU_PROJECT_ID.supabase.co/storage/v1/object/public/auction-images/', product_image_url)
-- WHERE product_image_url IS NOT NULL
--   AND product_image_url NOT LIKE 'http%'
--   AND product_image_url NOT LIKE '%/%'
--   AND product_image_url ~ '\.(png|jpg|jpeg|webp|gif)$';

-- VERIFICAÇÃO pós-correção
SELECT
  'auction_media storage_path' as tabela,
  COUNT(*) as corrigidos
FROM auction_media
WHERE storage_path LIKE 'auction-images/%' AND storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'auction_media original_storage_path', COUNT(*)
FROM auction_media
WHERE original_storage_path LIKE 'auction-images/%' AND original_storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'real_estate_media', COUNT(*)
FROM real_estate_media
WHERE original_storage_path LIKE 'real-estate-original/%' AND original_storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'vehicle_media', COUNT(*)
FROM vehicle_media
WHERE original_storage_path LIKE 'vehicle-original/%' AND original_storage_path NOT LIKE '%/%/%';
