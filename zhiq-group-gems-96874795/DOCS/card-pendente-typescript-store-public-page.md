# CARD PENDENTE — Erros de TypeScript em StorePublicPage.tsx

**Status:** Aberto — aguardando investigação
**Origem:** Detectados pelo IDE em 2026-08-05 durante a correção visual do overflow dos cards no mobile (correção exclusivamente de layout, que NÃO tocou nas regiões abaixo).
**Escopo:** Somente tipos/TypeScript. Nenhum destes erros foi introduzido ou alterado pela correção do carrossel.

## Erros observados (pré-existentes)

Arquivo: `src/pages/public/StorePublicPage.tsx`

| Linha | Código TS | Mensagem resumida |
|---|---|---|
| 241–242 | TS2589 | Type instantiation is excessively deep and possibly infinite |
| 1647 | TS2322 | `productId`/`storeId` não existem em `TravelFullViewProps` |
| 1652, 1654 (×3) | TS2339 | `video_url` não existe em `StoreProduct` |
| 1688 | TS2304 | `displayPriceLabel` não declarado |
| 1702 | TS2353 | `id` não existe em `{ productId: string; quantity?: number }` |
| 1707 | TS2339 | `merchant_store_id` não existe em `StoreProduct` |
| 1712, 1714 | TS2552 | `product` não declarado (sugestão: `products`) |
| 1716 | TS2322 | `"add_to_cart"` não é atribuível a `M1EventType` |

## Hipótese inicial

O tipo `StoreProduct` é exportado por `src/components/public/store/StorePremiumCard.tsx` (arquivo marcado como modificado no working tree por sessão paralela). Possível divergência entre a interface atual e campos consumidos pela seção de full view de Viagens (`video_url`, `merchant_store_id`) e pelo tracking (`M1EventType`). Verificar também se o bloco das linhas 1640–1720 veio de merge/edição paralela incompleta.

## Critérios de fechamento

1. `npx tsc --noEmit` limpo para `StorePublicPage.tsx` (ou erros restantes justificados como pré-existentes de outro domínio).
2. Nenhuma regressão funcional na full view de Viagens e no add-to-cart.
3. Não misturar com alterações visuais/responsivas.
