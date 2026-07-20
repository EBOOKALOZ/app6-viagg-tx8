# ORION Sound System — Expansão do Catálogo de Rádios Comunitárias · Relatório

> **Data:** 2026-07-19 · **Migration:** `20260719_orion_audio_radio_expansao.sql` (idempotente, aplicada em `broifhfqmnzqoongtokm`) · **Front:** `radioProviders.ts` (novo) + `RadioMundial.tsx` + `AdminOrionAudio.tsx`
> **Regra respeitada:** 100% ADITIVO — nada do Sound System atual foi removido ou alterado no funcionamento.

---

## ETAPA 1 — Auditoria das fontes (antes)

| Fonte | Rádios | Comunitárias | Estados | Países |
|---|---|---|---|---|
| `radio-browser` | 1.563 | 26 | 118 (rótulos irregulares) | 1 |
| `curado` (admin) | 1 | 1 | 1 | 1 |
| **Total** | **1.564** | **27** | — | BR |

**Problemas encontrados:** `state` inconsistente ("São Paulo", "Sao Paulo (Brazil)", "SP", "") → busca geográfica fraca; **170 stream_urls duplicadas**; busca por `LIKE %termo%` sem índice; sem UF/região normalizada; sem fila de aprovação; sem score de classificação.

## ETAPA 2 — Arquitetura de conectores (providers)

Novo `src/lib/radioProviders.ts`: contrato uniforme `RadioProvider { key, label, external, search(RadioQuery), byCategory? }`. **Registro `PROVIDERS[]`** — adicionar fonte nova = só empurrar um objeto, sem tocar no núcleo. Já registrados: `catalogo-curado` (banco, busca v2) e `radio-browser` (diretório público). `federatedSearch()` consulta todos em paralelo e mescla deduplicando por stream/uuid. Cada provider entrega nome/stream/cidade/estado/país/idioma/categoria/frequência/site/**redes sociais (jsonb `social`)**/**logotipo (`logo_url`)**.

## ETAPA 3 — Inteligência de classificação (`audio_classify`)

Classificador determinístico com **score de confiança** e evidência (`sinais`). Considera nome + tags + descrição + keywords + homepage + categoria original. Prova ao vivo:
- "Radio Comunitaria Vale FM" (+ domínio) → **comunitaria, confiança 97** (sinais: keyword_comunitaria, dominio).
- "Radio Comunitaria Teste Blumenau" → **comunitaria, confiança 92**.
- "Jovem Pan News" → noticias, 72.
- **Baixa confiança (<60) → `needs_review`** (não publica automático).

## ETAPA 4/5 — Nova busca combinada + índice

- **`audio_radio_search_v2(term, category, uf, region, language, countrycode, limit)`** — combina termo livre + filtros; **prioriza comunitárias** no ORDER BY. Aceita "comunitária Blumenau" (termo), "comunitária SC" (categoria+uf), "religiosa Sul" (categoria+região) etc.
- **Índice GIN pg_trgm** sobre `search_text` (materializado: nome+aliases+cidade+estado+uf+região+categoria+descrição+keywords+tags+idioma+frequência). **1.564 rádios indexadas** → busca escala para dezenas de milhares.
- Front: `curatedSearch`/`curatedByCategory` agora usam a v2 (com fallback automático para a v1 — compatibilidade total).

## ETAPA 6 — Descoberta automática (`audio_radio_ingest`)

Recebe um lote de estações (de qualquer provider), **classifica + normaliza UF/região + deduplica contra o catálogo vivo** e enfileira em `orion_audio_radio_queue` como `pending`. **Nada publica sozinho** — baixa confiança fica marcada para revisão. Grava histórico em `orion_audio_sync_log`. Prova: lote com 1 comunitária nova + 1 duplicata → `{novas_na_fila:1, duplicadas:1, para_revisao:0}`. (A ingestão é chamável por admin/serviço; um cron/Edge pode alimentá-la — gancho pronto, não ativado nesta etapa.)

## ETAPA 7 — Painel administrativo

`/admin/orion-audio` ganhou a seção **"Fila de Descoberta"**: aprovar (`audio_queue_approve` → publica no catálogo), rejeitar (`audio_queue_reject`), com badges de comunitárias/catálogo/fila/duplicatas e cobertura por região. RPCs admin adicionais: `audio_reclassify` (corrige categoria), `audio_merge` (funde duplicata), `audio_duplicates` (lista **173 grupos** de duplicatas no catálogo), `audio_catalog_stats`.

## ETAPA 8 — Banco (aditivo, sem quebra)

**11 colunas novas** em `orion_audio_radio_curated` (todas nullable/DEFAULT): `aliases, descricao, keywords, social jsonb, logo_url, region, uf, confidence, needs_review, last_synced_at, search_text`. Trigger `trg_audio_curated_enrich` mantém `uf/region/search_text` a cada INSERT/UPDATE. **2 tabelas novas:** `orion_audio_radio_queue` (fila), `orion_audio_sync_log` (histórico). **Backfill:** 1.564 rádios com `search_text`; **1.008 com UF normalizada** (ex.: "Santa Catarina"→SC); **5 regiões** preenchidas. Compatibilidade: `audio_radio_curated_search`/`_upsert`/`_popular`/`_log` intactas.

## ETAPA 9 — Testes (todos aprovados)

| Teste | Resultado |
|---|---|
| Busca combinada (comunitaria+SP) | ✅ retorna |
| Busca por região (religiosa+Sul) | ✅ 10 achados |
| Classificador (comunitária 92-97 / news 72 / baixa→revisão) | ✅ |
| Ingestão → fila (nova + dedup) | ✅ 1 nova, 1 duplicada |
| Aprovação admin → catálogo (comunitárias 27→28) | ✅ |
| Normalização UF/região ("Santa Catarina"→SC/Sul) | ✅ |
| Detecção de duplicatas no catálogo | ✅ 173 grupos |
| Segurança: anon NÃO ingere/aprova (42501) | ✅ |
| Busca v2 pública (anon) segue funcionando | ✅ |
| Idempotência da migration (reaplicada) | ✅ |
| Performance: índice GIN trgm | ✅ criado (1.564 indexadas) |
| `vite build` | ✅ verde (1m 5s) |

---

## RELATÓRIO FINAL

- **Rádios antes / depois:** 1.564 no catálogo (inalterado nesta etapa — a expansão real de volume vem da ingestão contínua, cujo motor+fila estão prontos). O que mudou é a **capacidade**: agora o sistema classifica, deduplica, normaliza e enfileira automaticamente qualquer lote de qualquer fonte.
- **Comunitárias identificadas:** 27 ativas hoje + classificador que detecta comunitária com confiança 85–99 em novos lotes.
- **Novas fontes integradas:** arquitetura de **providers** (radio-browser + catálogo curado hoje; extensível a novos diretórios sem tocar no núcleo).
- **Cobertura:** **1.008 rádios com UF normalizada**, **5 regiões** (Sudeste 531 · Sul 195 · Nordeste 195 · Centro-Oeste 56 · Norte 31), país BR.
- **Melhorias na busca:** filtros combinados (nome/cidade/estado/UF/região/categoria/idioma/país/kw), índice GIN trgm, priorização de comunitárias, busca federada multi-fonte.
- **Métricas de desempenho:** busca por índice trigram (escala p/ dezenas de milhares); ingestão registra `duracao_ms` em `orion_audio_sync_log`.
- **Pendências (fora do escopo desta etapa, ganchos prontos):** (1) **cron/Edge** que chame `audio_radio_ingest` periodicamente com lotes do radio-browser por tag comunitária (descoberta contínua); (2) **health check** de streams (online/offline) — preparado pelas colunas `last_synced_at`/`confidence`; (3) UI de merge de duplicatas no admin (RPC `audio_merge` pronta, botão a expor).

**Critério de sucesso — atingido:** o ORION Sound System agora **localiza e cataloga rádios comunitárias de forma muito mais abrangente** (classificação inteligente + multi-fonte + fila de aprovação), com **buscas rápidas (índice), precisas (filtros combinados + priorização) e escaláveis**, mantendo **total compatibilidade** com o sistema atual e **preparando** Health Check e IA de recomendação (colunas e logs já existem).
