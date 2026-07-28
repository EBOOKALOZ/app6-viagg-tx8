# AUDITORIA FORENSE — Imagens do Painel Viagens não aparecem

Data: 2026-07-23 · Branch: analise-programador

## 1. Causa raiz

O upload de fotos de viagem passa pela edge `moderate-image`, que classifica
cada imagem como `approved`, `blocked` ou `manual_review` (limiar de
confiança da IA ≥ 85%; qualquer incerteza ou falha do gateway de IA cai em
`manual_review` — `moderate-image/index.ts:181-193`).

Quando o resultado é `manual_review`, o arquivo é gravado no bucket
**privado** `moderacao` (quarentena) e a função devolve `publicUrl: null`
(`moderate-image/index.ts:210-216`). O frontend (`ViagemForm.tsx:319-329`)
grava o `storagePath` retornado em `travel_media.original_storage_path`
mesmo assim, sem registrar em qual bucket o arquivo está — a tabela
`travel_media` não tem coluna `storage_bucket`
(`20260624_travel_listings_base.sql:106-117`).

Na leitura, `getTravelMediaUrl()`/`resolveTravelMediaRow()`
(`travelMedia.ts`) sempre montam a URL assumindo buckets públicos
(`travel-public` → `real-estate-public` → `real-estate-original`). Como
`supabase.storage.from(bucket).getPublicUrl(path)` **nunca retorna erro**
mesmo para bucket/objeto inexistente, o resultado é uma URL sintaticamente
válida que aponta para um objeto que fisicamente está em `moderacao` — 404
garantido no `<img>`, silencioso, sem qualquer erro no fluxo de upload.

Segunda causa, independente e cumulativa: o bucket público oficial
`travel-public` (migration `20260723_travel_storage_bucket_oficial.sql`)
ainda não foi aplicado em produção — mitigado por fallback automático para
`real-estate-public` (`travelMedia.ts::resolveTravelUploadBucket`), mas é
uma dependência implícita de infraestrutura de outro módulo.

Terceira causa, específica do fluxo de moderação manual: quando um admin
aprovava manualmente uma foto retida em quarentena
(`moderate-image` ação `manual_decision`), o arquivo era movido sempre para
o bucket `marketing-materials` e o registro só era escrito em
`advertiser_listing_media` — nunca em `travel_media` (nem nas tabelas de
mídia dos outros módulos: real_estate, vehicle, service, freight). A
aprovação manual "funcionava" no admin, mas a foto nunca voltava a aparecer
no anúncio de origem.

## 2/3. Arquivo e linha responsáveis

| # | Arquivo | Linha | Papel no bug |
|---|---|---|---|
| 1 | `supabase/functions/moderate-image/index.ts` | 190-193 | limiar de auto-aprovação (85%) |
| 2 | `supabase/functions/moderate-image/index.ts` | 210-216 (pré-patch) | upload p/ bucket privado sem expor isso ao caller de forma acionável |
| 3 | `src/pages/advertiser/ViagemForm.tsx` | 319-329 | grava `storagePath` sem saber/registrar o bucket real |
| 4 | `src/lib/viagem/travelMedia.ts` | 92-115 (pré-patch) | monta URL pública sem checar status de moderação |
| 5 | `supabase/migrations/20260624_travel_listings_base.sql` | 106-117 | schema sem coluna de bucket |
| 6 | `supabase/functions/moderate-image/index.ts` | 114-138 (pré-patch) | aprovação manual não reconectava com `travel_media` |

## 4. Por que o upload "funciona" mas a imagem desaparece

Três operações (upload do binário em `moderacao`, INSERT em `travel_media`,
toast de sucesso) retornam sucesso HTTP mesmo no cenário de bug. O erro só
se manifesta depois, na leitura, como `onError` do `<img>` — nunca como uma
mensagem de erro visível ao usuário no momento do upload.

## 5. Por que o Painel Viagens não mostra a imagem

`AdvertiserViagemListingsPage.tsx` e `ViagemForm.tsx` liam
`travel_media.original_storage_path`/`public_masked_storage_path` e
montavam URL pública sem checar `moderation_status`. Path em `moderacao` →
URL pública 404 → `travelImgFallback` esgota a cadeia de buckets → imagem
escondida.

## 6. Por que a URL Mercado não mostra a imagem

Mesma causa raiz (`MercadoLocalViagg.tsx` também usava
`resolveTravelMediaRow` sem `moderation_status` disponível). Adicional:
a policy `travel_media_public_read`
(`20260723_travel_media_visibility_hardening.sql`) corretamente só libera ao
público mídia com `moderation_status` aprovado — isso não é bug, é RLS
funcionando como desenhado; o problema é que mesmo mídia aprovada dependia
do bucket oficial não aplicado.

## 7. Patch aplicado (arquivos no working tree)

1. `supabase/functions/moderate-image/index.ts`
   - Aprovação manual agora move o arquivo para o `target_bucket` original
     (gravado em `metadata.target_bucket` no momento do upload), não sempre
     para `marketing-materials`.
   - Aprovação/rejeição manual agora atualiza a linha correspondente em
     `travel_media`/`real_estate_media`/`vehicle_media`/`service_media`/
     `freight_media` (localizada por `listing_id` + `original_storage_path`,
     já que `media_id` não existe no momento do upload original) — fecha o
     bug de aprovação órfã.
2. `src/lib/viagem/travelMedia.ts`
   - `resolveTravelMediaRow()` agora recebe `moderation_status` e **recusa
     montar URL pública** para qualquer status que não seja aprovado —
     elimina a URL fantasma 404.
3. `src/pages/advertiser/AdvertiserViagemListingsPage.tsx`,
   `src/pages/public/MercadoLocalViagg.tsx`, `src/pages/advertiser/ViagemForm.tsx`
   - Queries de `travel_media` passam a selecionar `moderation_status`.
   - Painel do anunciante e formulário de edição mostram estado visual "Em
     análise" (ícone + texto) em vez de card/imagem quebrada quando a foto
     ainda não tem URL pública.

### Pendente de aplicação em produção (fora do escopo de código)

- `supabase/migrations/20260723_travel_storage_bucket_oficial.sql` — cria o
  bucket `travel-public` e suas policies. Sem isso, o upload continua
  usando o fallback `real-estate-public` (funcional, mas não é o bucket
  correto do módulo).
- `supabase/migrations/20260723_travel_media_visibility_hardening.sql` — já
  documentada em [[certificacao-viagens-admin-2026-07-23]]; confirma que a
  policy de leitura pública de `travel_media` está correta.

Ambas fazem parte do lote de 6 migrations já pendente de aplicação pelo
usuário no SQL Editor, conforme `correcao-painel-viagens-2026-07-23.md`.

## 8. Validação

Esta sessão não tem acesso a Postgres/Supabase real (sem CLI logado, sem
credenciais de banco) — não é possível *executar* os passos abaixo aqui.
Runbook para o usuário validar após aplicar as migrations pendentes:

- [ ] `npm run build` — build limpo (validado nesta sessão, ver abaixo).
- [ ] `npx tsc --noEmit -p tsconfig.app.json` — typecheck limpo nos 5
      arquivos do patch (validado nesta sessão).
- [ ] Aplicar as 6 migrations pendentes no SQL Editor (ordem cronológica).
- [ ] Fazer deploy da edge `moderate-image` atualizada
      (`supabase functions deploy moderate-image`).
- [ ] Upload de uma foto nova em `/anunciante/viagens/anuncios/novo/...`:
  - ✅ se aprovada automaticamente (IA confiante) → aparece imediatamente
    no preview do formulário.
  - ✅ se retida em análise → mostra "Em análise" (não erro/sumiço).
- [ ] Verificar `/anunciante/viagens/meus-anuncios` → card mostra a foto
      (ou "Foto em análise" se pendente).
- [ ] Publicar o anúncio e abrir `/mercado` (ou `/viagens`) → foto aparece
      **somente** se `moderation_status` aprovado (comportamento correto).
- [ ] Como admin, aprovar manualmente uma foto retida em
      `/admin/moderacao-imagens` (ou fila equivalente) → confirmar que ela
      passa a aparecer no painel do anunciante e no Mercado sem reload
      forçado de código (só invalidação de cache do React Query, que já
      ocorre via `refetchInterval`).
  - ✅ persiste após editar o anúncio (path não muda).
  - ✅ persiste após recarregar a página (dado vem do banco, não de estado
        local).
  - ✅ persiste após reiniciar a aplicação (mesma razão).

**Why:** registrar a causa raiz completa e o patch para não reabrir a
investigação do zero numa próxima sessão.
**How to apply:** usuário aplica as migrations pendentes + deploy da edge
`moderate-image`; frontend já está no working tree pronto para build/deploy.
