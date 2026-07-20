# AUDITORIA — ORION Sound System · Rádios Comunitárias

> **Data:** 2026-07-19 · **Natureza:** auditoria read-only (ZERO alteração de código/banco). Cada item com evidência de arquivo/tabela/RPC verificada ao vivo em `broifhfqmnzqoongtokm`.

---

## FASE 1 — Mapa da arquitetura

**Frontend (cliente):**
| Camada | Arquivo | Papel |
|---|---|---|
| Player/host | `src/components/GlobalAudioPlayer.tsx` | player global; hospeda o Audio Center |
| Centro de áudio | `src/components/orion/OrionAudioCenter.tsx` | EQ/AI Sound + monta `<RadioMundial />` (linha 549) |
| **Rádios (UI)** | `src/components/orion/RadioMundial.tsx` (398 linhas) | buscar/perto/favoritas/histórico/populares + categorias |
| Cliente rádio aberto | `src/lib/radioBrowser.ts` | Community Radio Browser (radio-browser.info) + categorias + CEP |
| Player de stream | `src/lib/radioPlayer.ts` (300 linhas) | play/stop/volume/EQ + favoritos/histórico (localStorage) |
| Motor DSP | `src/lib/orionAudioEngine.ts` | Web Audio (EQ/limiter/AI Sound) |
| **Admin** | `src/pages/admin/AdminOrionAudio.tsx` | `/admin/orion-audio` — CRUD do catálogo curado |

**Banco (6 tabelas `orion_audio_*`, todas com RLS):**
`orion_audio_radio_curated` (**catálogo próprio, 1.564 rádios**) · `orion_audio_radio_stations` (agregado de plays, 0 hoje) · `orion_audio_radio_plays` (log, 0) · `orion_audio_settings` (config EQ por usuário) · `orion_audio_presets` · `orion_audio_events` (telemetria).

**RPCs (9):** `audio_radio_curated_search` (anon+auth), `audio_radio_curated_upsert`/`_delete`/`_admin_list`/`_set_active` (auth/admin), `audio_radio_popular` (anon+auth), `audio_radio_log` (anon+auth), `audio_radio_admin_stats` (auth), `_audio_norm`. **Todas SECURITY DEFINER.**

**Migrations (4):** `20260718_orion_audio_radio.sql`, `20260719_orion_audio_center.sql`, `20260719_orion_audio_curated_unaccent.sql`, `20260719_orion_audio_radio_curated.sql`.
**Edge Functions:** nenhuma (100% client + RPC). **Cron:** **nenhum** para áudio/rádio.
**Rota:** `/admin/orion-audio` (`adminRoutes.tsx:372`). **Doc:** `DOCS/orion-audio-center.md`.

---

## FASE 2 — Funcionalidades (com evidência)

### Suporte a rádios comunitárias — ✅ **IMPLEMENTADO**
- **Categoria dedicada** `comunitaria` em `radioBrowser.ts:208`: `{ key:"comunitaria", label:"Comunitária", emoji:"🏘️", tags:["comunitaria","comunitária","community radio","community"] }`, exibida como chip de categoria na UI (`RadioMundial.tsx:295` "Discovery Engine").
- **27 rádios comunitárias ativas** no catálogo próprio (`SELECT category, count(*) FROM orion_audio_radio_curated WHERE category='comunitaria'` → **27/27 ativas**), dentro de 1.564 curadas.
- Descoberta híbrida: `discoverByCategory(cat)` (radio-browser por tags) **+** `curatedSearch(c.key)` (banco próprio), mescladas (`RadioMundial.tsx:166`).

### Cadastro específico — ✅ **IMPLEMENTADO**
Tabela `orion_audio_radio_curated` com coluna **`category`** (fm/am/web/comunitaria/universitaria/publica/educativa/religiosa/noticias/esportes/musica) + `frequency`, `city`, `state`, `country`, `tags`, `bitrate`, `geo_lat/long`, `ativo`, `fonte` (curado/radio-browser). CRUD via `audio_radio_curated_upsert`/`_delete`/`_set_active`.

### Busca — ✅ **IMPLEMENTADO** (parcial por país)
- Por **cidade/estado**: `searchStations({state})` + filtro do catálogo (`AdminOrionAudio` filtra por city/state/tags).
- Por **gênero/categoria**: `discoverByCategory` + `audio_radio_curated_search` (filtra `category`, evidência: corpo cita `category`).
- Por **nome tolerante**: `smartSearchStations` (remove ruído "rádio/fm/am").
- **País/região:** o catálogo próprio é **BR** (`discoverByCategory` fixa `cc="BR"`); "Internacional" traz top mundial via `topStations`. 🟡 região macro (Norte/Nordeste…) não é filtro dedicado — usa estado (UF).

### Banco próprio de rádios — ✅ **IMPLEMENTADO**
- **Quantidade:** **1.564** rádios em `orion_audio_radio_curated` (todas ativas).
- **Origem:** `fonte` ∈ {`curado`, `radio-browser`} — ingestão do diretório público + curadoria admin.
- **Distribuição:** musica 663 · fm 526 · noticias 131 · religiosa 117 · educativa 36 · **comunitaria 27** · universitaria 19 · esportes 18 · am 14 · publica 13.
- **Estrutura:** ver FASE 3. Cobertura: 118 "estados" (inclui UFs de vários países via radio-browser), **561 com geo**, só **2 `city` distintas preenchidas** (lacuna de cidade) e **1** com `frequency`.

### Descoberta automática — 🟡 **PARCIAL**
- ✅ **Diretório público**: radio-browser.info (`radioBrowser.ts`) — busca por tag/país/estado/nome, top votos, nearby por geo. CORS-friendly, sem chave.
- ✅ **CEP → localização**: BrasilAPI v2 + ViaCEP (`cepToLocation`).
- ❌ **Crawler/scraping próprio**: inexistente (declarado no código: "Nenhum scraping").
- ❌ **Ingestão automática agendada** (cron que popula/atualiza o catálogo): **nenhum cron** — o catálogo é populado manualmente/admin + o que o usuário toca via radio-browser.

### Health check dos streams — ❌ **NÃO IMPLEMENTADO**
- Sem verificação online/offline, latência ou disponibilidade. O único sinal é `onError` do `<audio>` em runtime ("Estação sem URL de stream", `radioPlayer.ts:200`) e o `hidebroken=true` **do radio-browser** (terceiro).
- `bitrate` é **armazenado** (coluna existe, vem do radio-browser), mas **codec/latência não** e não há job que teste os 1.564 streams. Sem coluna `last_checked`/`is_online`.

### IA de recomendação — ❌ **NÃO IMPLEMENTADO**
- Não há recomendação por localização/favoritos/histórico/preferência. Existe `audio_radio_log` (registra o que toca) e `audio_radio_popular` (ranking por play_count) — **base de dados para recomendar existe, o recomendador não**. (A "AI Sound" do módulo é equalização espectral, não recomendação de emissora.)

### Sistema de favoritos — 🟡 **PARCIAL**
- ✅ Favoritos + histórico funcionam (`radioPlayer.ts:279-299`: `getFavorites`/`toggleFavorite`/`getHistory`/`pushHistory`), abas "Favoritas"/"Histórico" na UI.
- 🟡 **Só em `localStorage`** (por aparelho) — **não sincroniza na conta** (ao contrário do EQ, que tem `orion_audio_settings`). ❌ "Coleções" (playlists nomeadas) não existem.

### Geolocalização — ✅ **IMPLEMENTADO**
- **GPS**: `navigator.geolocation` → `stationsNearby(lat,lng,raio)` com Haversine (`radioBrowser.ts:167`, aba "Perto").
- **CEP**: `cepToLocation` → raio (com coordenadas) ou UF.
- Rádios próximas ordenadas por distância. Cidade/estado presentes nos dados.

### Painel administrativo — ✅ **IMPLEMENTADO**
`/admin/orion-audio` (`AdminOrionAudio.tsx`): **inclusão** (`_upsert`), **edição** (upsert por station_uuid), **remoção** (`_delete`), **ativar/desativar** (`_set_active`), filtro/busca, estatísticas (`audio_radio_admin_stats`). 🟡 **Aprovação/moderação** (fila de submissões de usuários) não existe — só admin adiciona; não há submissão pública para aprovar. **Monitoramento** = estatísticas de uso, sem health de stream.

### Integração com Marketplace — ❌ **NÃO IMPLEMENTADO**
Rádios não possuem perfil próprio no marketplace, não vendem, não têm anúncio/loja. São entradas de catálogo de streaming — nenhum vínculo com `advertiser_listings`/`merchant_stores`/pacotes.

---

## FASE 3 — Banco de dados

**`orion_audio_radio_curated`** (1.564 linhas): `id uuid PK, station_uuid text, name, stream_url, homepage, favicon, city, state, country, countrycode, tags, category, frequency, language, bitrate int, geo_lat/long double, ativo bool, fonte text, criado_por uuid, criado_em, atualizado_em`. **RLS on** (1 policy). Índice `unaccent` para busca (migration dedicada).
**`orion_audio_radio_stations`** (0): agregado de play_count/last_played. **`orion_audio_radio_plays`** (0): log bruto.
**RLS:** todas as 6 tabelas com RLS. **RPCs:** 9, todas SECURITY DEFINER; leitura pública em `_search`/`_popular`/`_log` (anon), gestão só `authenticated`/admin. **Triggers:** `atualizado_em` (padrão). **Cron:** nenhum.

---

## FASE 4 — Código incompleto

Varredura por TODO/FIXME/XXX/WIP/stub/"não implementado" nos 5 arquivos do módulo: **nenhum encontrado** (os `placeholder=` achados são atributos de `<input>`, não pendências). Código limpo e finalizado no que se propõe. As ausências (health/recomendação/marketplace) **não estão iniciadas** — não há stubs, são features não começadas.

---

## FASE 5 — Evidências (resumo)

| Funcionalidade | Evidência |
|---|---|
| Rádios comunitárias | `radioBrowser.ts:208` (categoria) + 27 linhas `category='comunitaria'` no banco |
| Cadastro | `orion_audio_radio_curated.category` + `audio_radio_curated_upsert` |
| Busca | `smartSearchStations`, `discoverByCategory`, `audio_radio_curated_search` |
| Banco próprio | 1.564 linhas em `orion_audio_radio_curated` |
| Descoberta | `radioBrowser.ts` (radio-browser) + `cepToLocation` (sem crawler/cron) |
| Health check | ausente (só `onError` runtime + `hidebroken` de terceiro) |
| Recomendação IA | ausente (existe `audio_radio_log`/`_popular`, sem recomendador) |
| Favoritos | `radioPlayer.ts:279-299` (localStorage, sem sync/coleções) |
| Geolocalização | `stationsNearby` (GPS/Haversine) + `cepToLocation` |
| Admin | `AdminOrionAudio.tsx` (CRUD completo) `/admin/orion-audio` |
| Marketplace | ausente |

---

## FASE 6 — Classificação

**Módulo Sound System (geral): 🟢 Completo** para reprodução/EQ/rádio (o Audio Center é robusto).
**Suporte a Rádios Comunitárias especificamente: 🟡 PARCIAL — ~65% implementado.**

Ponderação (rádios comunitárias):
| Área | Peso | Nota |
|---|---|---|
| Categoria + catálogo comunitário | 20 | 20 (27 ativas, categoria dedicada) |
| Cadastro/estrutura | 10 | 10 |
| Busca (cidade/estado/gênero/nome) | 15 | 12 (região macro e cidade fracas) |
| Banco próprio | 10 | 10 (1.564) |
| Descoberta automática | 10 | 5 (público sim; crawler/cron não) |
| **Health check streams** | 12 | 0 |
| **IA de recomendação** | 10 | 0 |
| Favoritos/coleções | 5 | 3 (local, sem sync/coleções) |
| Geolocalização | 8 | 8 |
| Painel admin | 5 | 4 (sem fila de aprovação) |
| Marketplace | 5 | 0 |
| **Total** | 100 | **≈ 65** |

---

## FASE 7 — Pendências

| Pendência | Impacto | Prioridade | Esforço |
|---|---|---|---|
| **Health check dos streams** (online/offline, cron testando os 1.564; `last_checked`/`is_online`, codec/latência) | Alto (usuário clica em rádio morta) | **Alta** | Médio (Edge/cron + 2 colunas) |
| **Sincronizar favoritos/histórico na conta** (hoje localStorage) + **coleções** | Médio (perde favoritos ao trocar aparelho) | **Alta** | Baixo (reusa padrão `orion_audio_settings`) |
| **IA de recomendação** (por localização/histórico/favoritos; base `audio_radio_log`+`_popular` já existe) | Médio (engajamento) | Média | Médio |
| **Descoberta automática agendada** (cron que ingere/atualiza catálogo do radio-browser por tag comunitária) | Médio (catálogo estático) | Média | Médio |
| **Fila de aprovação** (usuário sugere rádio → admin aprova) | Baixo | Baixa | Médio |
| **Filtro por região macro** (Norte/Nordeste/…) e melhorar preenchimento de `city` | Baixo | Baixa | Baixo |
| **Perfil de rádio no marketplace** | Baixo (fora do escopo atual) | Baixa | Alto |

---

## RELATÓRIO FINAL

- **Status geral do Sound System:** 🟢 sólido e finalizado no núcleo (Audio Center: EQ/AI Sound/player/rádio mundial + banco próprio de 1.564 emissoras + admin com CRUD).
- **Suporte a rádios comunitárias:** 🟡 **PARCIAL (~65%)** — **existe e funciona**: categoria dedicada, 27 comunitárias ativas curadas, descoberta por tag, busca, geolocalização e gestão admin. **Faltam**: health check dos streams, recomendação inteligente, sincronização de favoritos na conta e ingestão automática agendada.
- **Implementado:** categoria/cadastro comunitário, banco próprio (1.564), busca (nome/categoria/cidade/estado), descoberta pública (radio-browser + CEP/GPS), favoritos/histórico local, admin CRUD, RLS em tudo.
- **Ausente:** health check de stream, IA de recomendação, favoritos na conta/coleções, crawler/cron próprio, fila de aprovação, integração marketplace.
- **% de conclusão (rádios comunitárias):** **≈ 65%**.
- **Recomendação técnica de evolução (ordem):** (1) **Health check** (maior dor do usuário — rádio offline); (2) **sync de favoritos/coleções na conta** (baixo esforço, reusa `orion_audio_settings`); (3) **recomendação** sobre a base já logada; (4) **cron de ingestão** para manter o catálogo comunitário vivo.

> **Nada foi implementado ou alterado nesta auditoria — somente análise e evidências.**
