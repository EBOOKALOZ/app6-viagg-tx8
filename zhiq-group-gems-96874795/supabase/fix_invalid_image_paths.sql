-- ============================================================
-- CORREÇÃO: Prefixar storage_path com o nome do bucket
-- Execute APÓS validar com a query de diagnóstico
-- ============================================================

-- backup先：criar uma tabela de backup (opcional mas recomendado)
CREATE TABLE IF NOT EXISTS _backup_invalid_image_paths AS
SELECT 'auction_media' as tabela, id, storage_path, original_storage_path
FROM auction_media
WHERE storage_path IS NOT NULL AND storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'real_estate_media', id, storage_path, original_storage_path
FROM real_estate_media
WHERE storage_path IS NOT NULL AND storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'vehicle_media', id, storage_path, original_storage_path
FROM vehicle_media
WHERE storage_path IS NOT NULL AND storage_path NOT LIKE '%/%';

-- CORREÇÃO para auction_media (bucket: auction-images)
UPDATE auction_media
SET storage_path = CONCAT('auction-images/', storage_path)
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- CORREÇÃO para real_estate_media (bucket: real-estate-original)
UPDATE real_estate_media
SET storage_path = CONCAT('real-estate-original/', storage_path)
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- CORREÇÃO para vehicle_media (bucket: vehicle-original)
UPDATE vehicle_media
SET storage_path = CONCAT('vehicle-original/', storage_path)
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- Se houver auction_listings com product_image_url relativo, corrigir para URL completa do Supabase
-- (substitua SEU_PROJECT_ID pelo ID do seu projeto Supabase)
-- UPDATE auction_listings
-- SET product_image_url = CONCAT('https://SEU_PROJECT_ID.supabase.co/storage/v1/object/public/auction-images/', product_image_url)
-- WHERE product_image_url IS NOT NULL
--   AND product_image_url NOT LIKE 'http%'
--   AND product_image_url ~ '\.(png|jpg|jpeg|webp|gif)$';

-- Verificação pós-correção
SELECT 'auction_media' as tabela, COUNT(*) as total_corrigidos
FROM auction_media
WHERE storage_path LIKE 'auction-images/%' AND storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'real_estate_media', COUNT(*)
FROM real_estate_media
WHERE storage_path LIKE 'real-estate-original/%' AND storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'vehicle_media', COUNT(*)
FROM vehicle_media
WHERE storage_path LIKE 'vehicle-original/%' AND storage_path NOT LIKE '%/%/%';
