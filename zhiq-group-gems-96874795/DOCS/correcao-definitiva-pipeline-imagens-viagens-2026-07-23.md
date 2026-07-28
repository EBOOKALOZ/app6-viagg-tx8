# MISSÃO ORION — Correção definitiva do pipeline de imagens (Painel Viagens + Mercado)

Data: 2026-07-23 · Branch: `analise-programador`

Continuação de [auditoria-forense-imagens-viagens-2026-07-23.md](auditoria-forense-imagens-viagens-2026-07-23.md).
A revalidação nesta missão encontrou uma **segunda causa raiz**, mais grave, não coberta no
relatório anterior. Este documento substitui aquele como referência de arquitetura atual.

## FASE 1 — Divergências encontradas na revalidação

O relatório anterior tratou a causa raiz como "URL fantasma por falta de coluna de bucket" e
propôs `resolveTravelMediaRow` recusando montar URL sem `moderation_status` aprovado. Isso era
necessário mas **não suficiente**. A revalidação encontrou:

1. **Existem dois sistemas de aprovação manual desconectados.** A tela real usada pelo admin
   (`/admin/viagens/aprovacao-imagens`, componente `AdminTravelImageModeration.tsx`) não chama a
   edge `moderate-image` — chama a RPC SQL `admin_moderate_travel_media`
   (`supabase/migrations/20260723_travel_admin_moderacao_oficial.sql:245-289`).
2. **Essa RPC nunca moveu o arquivo físico.** RPCs em Postgres/PostgREST não têm acesso à API de
   Storage do Supabase — `admin_moderate_travel_media` apenas fazia
   `UPDATE travel_media SET moderation_status = 'approved'`. O arquivo permanecia para sempre no
   bucket privado `moderacao`. Resultado: **toda aprovação manual pelo admin, desde que esse painel
   existe, "funcionava" no banco mas nunca tornava a foto visível** — nem o patch anterior (que só
   mexeu na edge `moderate-image`, não usada por essa tela) resolvia isso.
3. `travel_media` não tinha coluna de bucket nem de URL pública resolvida — schema confirmado em
   `supabase/migrations/20260624_travel_listings_base.sql:106-117`.

## FASE 2 — Arquitetura definitiva implementada

Migration nova: [supabase/migrations/20260723_travel_media_pipeline_definitivo.sql](../supabase/migrations/20260723_travel_media_pipeline_definitivo.sql)

`travel_media` ganhou as colunas pedidas:
- `bucket` — bucket real onde `storage_path` existe HOJE.
- `storage_path` — path canônico (substitui a ambiguidade entre `original_storage_path`/`public_masked_storage_path`).
- `public_url` — URL pública já resolvida no momento da aprovação. **Nunca montada em runtime.**
- `approved_at`, `approved_by` — auditoria de quem/quando aprovou.
- `moderation_record_id` — vínculo com `image_moderation_records.id` (FK NOT VALID), permite a
  edge localizar a linha certa sem depender de `listing_id + path` como chave frágil.
- **CHECK constraint** `travel_media_approved_needs_url_ck`: torna estruturalmente impossível
  existir uma linha `moderation_status = approved` com `public_url IS NULL` — a classe exata do
  bug fica proibida em nível de banco, não apenas evitada por convenção de código.
- Backfill best-effort das linhas legadas já aprovadas.

A RPC `admin_moderate_travel_media` foi **reescrita para recusar `approve`**, retornando
`{success: false, error: 'use_edge_function'}` — ela nunca teve como mover o arquivo, e agora isso
é explícito em vez de mascarado por um `UPDATE` que parecia funcionar. `reject` continua permitido
por SQL puro (não precisa mexer em Storage).

## FASE 3 — Edge function `moderate-image` reescrita

[supabase/functions/moderate-image/index.ts](../supabase/functions/moderate-image/index.ts)

- **Upload (`action: analyze`)**: quando `category === 'travel'` e `listing_id` presente, a edge
  agora **insere a linha em `travel_media` diretamente** (com `bucket`, `storage_path`,
  `public_url`, `moderation_record_id`, `sort_order`) — o frontend não faz mais INSERT. Isso fecha
  a janela de divergência entre "a edge respondeu sucesso" e "o frontend gravou a linha".
- **Nova ação `approve_travel_media`** (admin only, via `mp_is_admin`): localiza a mídia por
  `media_id`, baixa o arquivo de `moderacao`, faz upload no bucket de destino real
  (`metadata.target_bucket` do registro de moderação original, com fallback `travel-public`),
  remove da quarentena, e atualiza `travel_media` com `bucket`, `storage_path`, `public_url`,
  `moderation_status = 'approved'`, `approved_at`, `approved_by` — tudo numa única operação
  atômica do ponto de vista do cliente. Grava também em `travel_audit_log`.
- **Nova ação `reject_travel_media`**: marca `moderation_status = 'rejected'` e audita.
- Fluxo legado (`manual_decision`/`preview`) mantido para módulos sem tabela de mídia dedicada
  (fallback `advertiser_listing_media`); chaves do `MODULE_MEDIA_TABLE` corrigidas para bater com
  o `category` real enviado por cada formulário (`vehicles`/`services` no plural).
- 2 erros de lint corrigidos (`prefer-const`, `no-useless-escape`).

## FASE 5 — Resolver único

[src/lib/viagem/travelMedia.ts](../src/lib/viagem/travelMedia.ts) — reescrito do zero.

`resolveTravelMedia(row)` é a **única** função que qualquer tela pode usar para decidir o que
mostrar. Contrato:
- Confia exclusivamente em `row.public_url` — nunca monta URL a partir de bucket+path em runtime.
- Retorna `{kind: 'ready', url}` | `{kind: 'reviewing'}` | `{kind: 'empty'}` — nunca uma URL
  fantasma.
- `resolveTravelMediaUrl(row)` — açúcar sintático para quem só quer `string | null`.
- `resolveTravelCoverMedia(rows)` — resolve a capa de uma lista (primeiro item não-vazio).
- `travelImgFallback` mantido só como defesa em profundidade (esconde `<img>` em erro de rede) —
  **não** faz mais fallback entre buckets, porque não há mais ambiguidade de bucket a percorrer.

As funções antigas (`getTravelMediaUrl`, `resolveTravelMediaRow`, `resolveTravelUploadBucket`,
`TRAVEL_UPLOAD_BUCKET`) foram **removidas** — não existe mais nenhum caminho de código que monte
URL manualmente.

## FASES 6-9 — Telas migradas (grep de confirmação: zero referências à API antiga)

Todas as 10 telas que liam `travel_media` foram migradas para `resolveTravelMedia`/`resolveTravelMediaUrl`,
com as queries `select()` atualizadas para trazer `bucket, storage_path, public_url, moderation_status`:

| Arquivo | Papel |
|---|---|
| `src/pages/advertiser/ViagemForm.tsx` | Upload novo + substituição de foto — usa `mediaId`/`bucket`/`publicUrl` retornados pela edge, não faz mais INSERT |
| `src/pages/advertiser/AdvertiserViagemListingsPage.tsx` | Painel "Meus Anúncios" — estado visual "Em análise" quando `reviewing` |
| `src/pages/advertiser/AdvertiserViagemPage.tsx` | Dashboard resumido |
| `src/pages/public/MercadoLocalViagg.tsx` | Vitrine `/mercado` |
| `src/pages/public/PublicTravelHome.tsx` | Vitrine `/viagens` |
| `src/pages/public/TravelDetailPage.tsx` | Página de detalhe isolada |
| `src/pages/public/StorePublicPage.tsx` | Página pública da agência |
| `src/components/travel/TravelFullView.tsx` | Conteúdo do pacote completo |
| `src/pages/admin/AdminTravelModeration.tsx` | Fila de moderação de ANÚNCIOS (RPC SQL inalterada — não mexe em Storage) |
| `src/pages/admin/AdminTravelImageModeration.tsx` | Fila de moderação de MÍDIA — reescrita para chamar `approve_travel_media`/`reject_travel_media` da edge em vez da RPC SQL; preview de item em quarentena via signed URL (`action: preview`) |

`src/lib/moderation/moderatedUpload.ts` — `ModerationResult` ganhou `mediaId` e `bucket`;
`moderatedUpload()` ganhou `opts.sortOrder`.

`src/components/travel/MarketTravelCard.tsx` — sem alteração necessária (só usa `travelImgFallback`,
que manteve nome/assinatura compatíveis).

## FASE 10 — Cache

- Upload (`ViagemForm.tsx`): já invalidava `public-travel`, `public-travel-home`,
  `viagens-meus-anuncios` no save do formulário.
- Aprovação manual (`AdminTravelImageModeration.tsx`): **adicionado** — antes só invalidava a
  própria fila (`admin-travel-image-moderation`); agora também invalida `viagens-meus-anuncios`,
  `public-travel`, `public-travel-home`, para que a foto aprovada apareça no Painel Viagens e no
  Mercado sem reload manual (Teste Funcional 3 da missão).
- Edição/exclusão de foto (`handleDeleteExisting`, substituição): já invalidava `viagem-form-media`.

## Evidências desta sessão (validação ESTÁTICA)

- `npx tsc --noEmit -p tsconfig.app.json` — **0 erros** em todo o projeto (13 arquivos do patch
  incluídos).
- `npm run build` — **sucesso**, `✓ built in 1m 3s`, mesmo warning pré-existente de chunk size.
- `npx eslint <13 arquivos>` — 0 erros novos introduzidos. Os únicos erros pré-existentes tocados
  (`prefer-const`, `no-useless-escape` em `moderate-image/index.ts`) foram corrigidos. O restante
  dos ~200 erros reportados nesses arquivos é `@typescript-eslint/no-explicit-any`, o padrão já
  dominante em todo o codebase (~5000 ocorrências no projeto inteiro) — não é regressão desta
  sessão.
- Grep de confirmação: zero ocorrências de `getTravelMediaUrl`/`resolveTravelMediaRow`/
  `resolveTravelUploadBucket` em código `.ts`/`.tsx` (só restam em comentários/documentação
  histórica).

## O QUE NÃO FOI (E NÃO PODE SER) VALIDADO NESTA SESSÃO

Esta sessão **não tem acesso a Postgres/Supabase real, nem a produção** (sem CLI logado, sem
credenciais de banco, sem browser real). Isso é uma limitação de ambiente, não uma escolha —
ver [[ambiente-sem-execucao-sql]] na memória do projeto. Consequência direta: os itens abaixo,
exigidos pela missão (Fases 11-13, Testes Funcionais 1-7), **não foram executados** e não devem
ser considerados aprovados até o usuário rodá-los.

### Runbook obrigatório (usuário executa em ambiente real)

**Pré-requisito — aplicar em produção, nesta ordem:**
1. `supabase/migrations/20260723_travel_media_pipeline_definitivo.sql` (SQL Editor,
   `broifhfqmnzqoongtokm`) — confirma `cols_ok=6 · check_ok=1 · rpc_find_ok=1` na query de
   verificação ao final do arquivo.
2. Se ainda não aplicadas: as 6 migrations do lote anterior (`20260723_travel_storage_bucket_oficial.sql`
   e as demais listadas em `correcao-painel-viagens-2026-07-23` na memória).
3. `supabase functions deploy moderate-image`.

**Teste Funcional 1 — upload aprovado automaticamente**
- Enviar uma foto clara/óbvia em um pacote de viagem novo.
- Esperado: aparece imediatamente no preview do formulário (sem reload), no Painel Viagens
  (`/anunciante/viagens/meus-anuncios`) e — após publicar — em `/mercado` e `/viagens`.

**Teste Funcional 2 — upload retido em análise**
- Forçar `manual_review` (imagem ambígua, ou desligar temporariamente o gateway de IA).
- Esperado: card mostra "Em análise" (ícone `Loader2`/`Clock`, não `<img>` quebrada); nenhuma
  requisição de rede retorna 404 para essa imagem (porque nenhuma URL é montada).

**Teste Funcional 3 — aprovação manual pelo admin**
- Em `/admin/viagens/aprovacao-imagens`, aprovar uma foto retida.
- Esperado: a resposta da edge (`approve_travel_media`) deve trazer `ok: true` e uma
  `publicUrl` não-nula. Sem editar o anúncio nem dar reload manual, o Painel Viagens do
  anunciante e o Mercado devem mostrar a foto assim que o React Query revalidar (cache já
  invalidado pela mutação — ver Fase 10 acima; `public-travel`/`public-travel-home` também têm
  `refetchInterval` de 8-10s como rede de segurança).

**Teste Funcional 4 — editar anúncio**: reabrir o formulário de edição, confirmar que a foto
aprovada aparece com o badge "Salvo" (não "Em análise").

**Teste Funcional 5 — reload**: F5 na página do Painel Viagens e no Mercado — a imagem deve
persistir (o dado vem do banco via `public_url`, não de estado local/cache de sessão).

**Teste Funcional 6 — novo login**: logout/login (ou aba anônima) e conferir que a imagem
continua correta — sem dependência de `sessionStorage`/`localStorage` para a resolução de URL.

**Teste Funcional 7 — produção**: após deploy, repetir os testes 1-3 no domínio de produção.

**Fase 13 — validação de rede/console**: abrir DevTools → Network durante os testes acima e
confirmar: nenhum 403, nenhum 404, nenhuma URL contendo `/moderacao/` no `<img src>` (bucket
privado nunca deve aparecer como src de imagem pública), nenhum "broken image" no Console.

## Confirmações da missão

1. **Painel Viagens e Mercado usam exatamente o mesmo pipeline de imagens** — ambos leem
   `travel_media` e resolvem via `resolveTravelMedia`/`resolveTravelMediaUrl`; nenhuma lógica
   duplicada ou divergente entre os dois.
2. **Toda URL é gerada exclusivamente por `resolveTravelMedia()`** (ou seu açúcar sintático
   `resolveTravelMediaUrl`) — confirmado por grep: zero chamadas a
   `supabase.storage.from(...).getPublicUrl(...)` relacionadas a `travel_media` fora de
   `travelMedia.ts` e da edge function (que é quem grava `public_url`, não quem lê para exibir).
3. **Não existem mais buckets implícitos no código de leitura** — a leitura nunca escolhe bucket;
   ela só lê `row.public_url`, que foi escrito pelo backend no momento exato da aprovação.
4. **Aprovação órfã fica estruturalmente impossível** — o CHECK constraint
   `travel_media_approved_needs_url_ck` impede a existência de uma linha aprovada sem
   `public_url`, e a RPC SQL que causava esse estado foi desativada para a ação `approve`.

**Why:** documentar a segunda causa raiz (RPC sem acesso a Storage) que o relatório anterior não
cobriu, e deixar claro o que ainda depende de execução do usuário em ambiente real.
**How to apply:** aplicar a migration nova + deploy da edge antes de considerar a missão
funcionalmente encerrada; rodar o runbook de 7 testes acima.
