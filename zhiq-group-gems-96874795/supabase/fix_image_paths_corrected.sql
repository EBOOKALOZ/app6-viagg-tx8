-- ============================================================
-- DIAGNÓSTICO E CORREÇÃO DE PATHS DE IMAGENS INVÁLIDOS
-- Tabelas existentes: real_estate_media, vehicle_media, advertiser_listing_media, auction_listings
-- ============================================================

-- ===================
-- 1. DIAGNÓSTICO
-- ===================
SELECT 'real_estate_media' as tabela, id, original_storage_path as path_candidato
FROM real_estate_media
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'vehicle_media', id, original_storage_path
FROM vehicle_media
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'advertiser_listing_media', id, storage_path
FROM advertiser_listing_media
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'auction_listings', id, product_image_url
FROM auction_listings
WHERE product_image_url IS NOT NULL
  AND product_image_url NOT LIKE 'http%'
  AND product_image_url NOT LIKE '%/%'
  AND product_image_url ~ '\.(png|jpg|jpeg|webp|gif)$';

-- ===================
-- 2. BACKUP (opcional)
-- ===================
CREATE TABLE IF NOT EXISTS _backup_invalid_image_paths AS
SELECT 'real_estate_media' as tabela, id, original_storage_path as path
FROM real_estate_media
WHERE original_storage_path IS NOT NULL AND original_storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'vehicle_media', id, original_storage_path
FROM vehicle_media
WHERE original_storage_path IS NOT NULL AND original_storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'advertiser_listing_media', id, storage_path
FROM advertiser_listing_media
WHERE storage_path IS NOT NULL AND storage_path NOT LIKE '%/%'
UNION ALL
SELECT 'auction_listings', id, product_image_url
FROM auction_listings
WHERE product_image_url IS NOT NULL AND product_image_url NOT LIKE 'http%' AND product_image_url NOT LIKE '%/%';

-- ===================
-- 3. CORREÇÃO
-- ===================

-- Correção 1: real_estate_media.original_storage_path (bucket: real-estate-original)
UPDATE real_estate_media
SET original_storage_path = CONCAT('real-estate-original/', original_storage_path)
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- Correção 2: vehicle_media.original_storage_path (bucket: vehicle-original)
UPDATE vehicle_media
SET original_storage_path = CONCAT('vehicle-original/', original_storage_path)
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- Correção 3: advertiser_listing_media.storage_path (bucket: advertiser-media)
UPDATE advertiser_listing_media
SET storage_path = CONCAT('advertiser-media/', storage_path)
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$';

-- Correção 4: auction_listings.product_image_url (caminhos relativos -> URL pública do Supabase)
-- Descomente apenas se houver registros a corrigir
-- UPDATE auction_listings
-- SET product_image_url = CONCAT('https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/auction-images/', product_image_url)
-- WHERE product_image_url IS NOT NULL
--   AND product_image_url NOT LIKE 'http%'
--   AND product_image_url NOT LIKE '%/%'
--   AND product_image_url ~ '\.(png|jpg|jpeg|webp|gif)$';

-- ===================
-- 4. VERIFICAÇÃO PÓS-CORREÇÃO
-- ===================
SELECT 'real_estate_media' as tabela, COUNT(*) as corrigidos
FROM real_estate_media
WHERE original_storage_path LIKE 'real-estate-original/%' AND original_storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'vehicle_media', COUNT(*)
FROM vehicle_media
WHERE original_storage_path LIKE 'vehicle-original/%' AND original_storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'advertiser_listing_media', COUNT(*)
FROM advertiser_listing_media
WHERE storage_path LIKE 'advertiser-media/%' AND storage_path NOT LIKE '%/%/%'
UNION ALL
SELECT 'auction_listings (URLs)', COUNT(*)
FROM auction_listings
WHERE product_image_url LIKE 'https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/auction-images/%';
