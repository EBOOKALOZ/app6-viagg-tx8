-- ============================================================
-- PASSO 1: DIAGNÓSTICO - Encontrar paths inválidos
-- ============================================================

-- auction_media: storage_path ou original_storage_path contendo apenas nome de arquivo
SELECT 'auction_media (storage_path)' as tabela, id, listing_id, storage_path as path
FROM auction_media
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'auction_media (original_storage_path)', id, listing_id, original_storage_path
FROM auction_media
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'real_estate_media', id, listing_id, original_storage_path
FROM real_estate_media
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'vehicle_media', id, listing_id, original_storage_path
FROM vehicle_media
WHERE original_storage_path IS NOT NULL
  AND original_storage_path NOT LIKE '%/%'
  AND original_storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
-- auction_listings: product_image_url como nome solto
SELECT 'auction_listings', id, NULL as listing_id, product_image_url as path
FROM auction_listings
WHERE product_image_url IS NOT NULL
  AND product_image_url NOT LIKE 'http%'
  AND product_image_url NOT LIKE '%/%'
  AND product_image_url ~ '\.(png|jpg|jpeg|webp|gif)$';
