-- ============================================================
-- DIAGNÓSTICO: Encontrar paths de imagens inválidos
-- Problema: storage_path contém apenas nome de arquivo (ex: "image.png")
-- sem o caminho completo do bucket, causando erro na Edge Function
-- ============================================================

-- Encontrar registros suspeitos em todas as tabelas de mídia
SELECT 'auction_media' as tabela, id, listing_id, storage_path, original_storage_path
FROM auction_media
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'real_estate_media' as tabela, id, listing_id, storage_path, original_storage_path
FROM real_estate_media
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
SELECT 'vehicle_media' as tabela, id, listing_id, storage_path, original_storage_path
FROM vehicle_media
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%'
  AND storage_path ~ '\.(png|jpg|jpeg|webp|gif)$'
UNION ALL
-- Também verificar auction_listings (campo product_image_url)
SELECT 'auction_listings' as tabela, id, NULL as listing_id, product_image_url as storage_path, NULL
FROM auction_listings
WHERE product_image_url IS NOT NULL
  AND product_image_url NOT LIKE 'http%'
  AND product_image_url ~ '\.(png|jpg|jpeg|webp|gif)$';
