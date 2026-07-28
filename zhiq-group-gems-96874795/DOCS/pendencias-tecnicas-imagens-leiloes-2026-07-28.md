# Pendências Técnicas — Imagens (achadas durante o Sprint Visual de Leilões)

> **Não corrigidas neste Sprint** por restrição explícita do prompt (proibido alterar lógica, banco, RPCs ou fluxos homologados). Registradas aqui para ciclo futuro, conforme a cláusula de Restrições do Sprint de Acabamento Visual.

## 1. Leilões não têm upload real de imagem
`src/pages/merchant/MerchantAuctions.tsx:952-962` — o campo "URL da Imagem" é um `<Input>` de texto livre onde o lojista cola/digita a URL manualmente. `useCompressedImageUpload` é importado (linha 7) mas **nunca chamado** — import morto. Não há validação de formato/acessibilidade da URL no frontend.

## 2. `auction_media` sem pipeline de escrita
A tabela tem leitura pronta (`AuctionMarketDetailPage.tsx:99-114` → `AuctionGallery`) e schema robusto (`public_url`, `storage_path`, mesmo padrão de Viagens), mas **nenhuma tela de criação/edição do lojista insere nela**. A galeria de leilão provavelmente está sempre vazia em produção.

## 3. Resolver único não cobre Leilões
`src/services/resolveProduct.ts:36-42` — o mapa `MEDIA_TABLE` (module → tabela de mídia) não inclui `auction`. Diferente de Imóveis/Veículos/Serviços/Fretes/Viagens, o resolver nunca cai para `auction_media` quando `product_image_url` está vazio.

## 4. Campo morto `image_storage_path`
`src/hooks/useAuctions.ts:44` — existe no tipo `AuctionListing` e é exibido como metadado de debug no painel do lojista, mas nunca é lido para montar uma URL de imagem em nenhuma tela pública.

## 5. Quatro verticais exibem imagem sem checar moderação
`VehicleDetailPage.tsx:121`, `ServiceDetailPage.tsx:69`, `FreightDetailPage.tsx:70`, `RealEstateDetailPage.tsx:122` — as queries de mídia não selecionam nem filtram por `moderation_status`, apesar de a coluna existir no schema (`vehicle_media`, etc.). É a mesma classe de bug ("URL fantasma") já corrigida em Viagens via `resolveTravelMedia()` — ver `DOCS/correcao-definitiva-pipeline-imagens-viagens-2026-07-23.md`.

## 6. Cadeia de buckets candidatos ainda ativa fora de Viagens
`src/components/detail/DetailPageLayout.tsx:76-91` (`chainedImgError`) reimplementa o padrão que causou "URL fantasma 404 silenciosa" em Viagens (porque `supabase.storage.getPublicUrl()` nunca retorna erro, mesmo para bucket/path inexistente). Ainda ativo para Imóveis/Veículos/Serviços/Fretes via este layout compartilhado.

## 7. Helper de bucket com nome enganoso
`src/lib/real-estate/mediaUtils.ts:16-22` — hardcoda prefixos `real-estate-public`/`real-estate-original`, mas é reaproveitado por 4 verticais diferentes (`vehicle_media`, `service_media`, `freight_media` também passam por aqui).

## 8. Paths de imagem possivelmente quebrados em produção, sem confirmação de fix
Scripts soltos `supabase/diagnose_invalid_image_paths.sql` / `supabase/fix_invalid_image_paths.sql` documentam `storage_path` sem prefixo de bucket (`NOT LIKE '%/%'`) em `auction_media`, `real_estate_media`, `vehicle_media` e `auction_listings.product_image_url`. Não há evidência de que o fix foi aplicado no banco real — recomenda-se confirmar com `supabase db query --linked` antes do próximo ciclo funcional.

## 9. Migrations/deploys de Viagens não confirmados como aplicados
`resolveTravelMedia()` já é robusto no código, mas depende de `20260723_travel_media_pipeline_definitivo.sql`, `20260723_travel_storage_bucket_oficial.sql` e do deploy da edge `moderate-image` estarem de fato em produção. Os próprios documentos de correção original não confirmam isso — vale reverificar.

---

**Como reabrir:** qualquer um destes itens pode virar uma tarefa funcional independente (fora de um Sprint Visual), com migration própria se necessário, seguindo o fluxo normal de auditoria + homologação SHC.
