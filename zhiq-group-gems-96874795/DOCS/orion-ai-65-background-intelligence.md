# ORION-AI-65 — Background Intelligence AI

> **Camada de fundos e cenários do ORION Design Ecosystem** (aberto pelo AI-61 Brand Identity).
> Namespace `orion_bg_*` · chave `background_intelligence` · painel `/admin/orion-background` badge **BACKGROUND**.

## 1. O que é (e o que NÃO é)

O Background Intelligence orquestra a **troca/geração de fundos** de imagens de anúncios: remover o fundo original, aplicar um **cenário** do catálogo (estúdio, mármore, madeira, natureza, delivery, leilão…), sombras/reflexos coerentes, correção de perspectiva e exportação (PNG/PSD).

**Honestidade arquitetural (regra do projeto):** SQL **não processa pixel**. O banco é a camada de **orquestração** — catálogo de cenários, **fila de jobs**, versionamento, métricas e score. O processamento de imagem em si roda em **Edge Functions DECLARADAS**, que reivindicam jobs pela fila e devolvem o resultado. Nada de pixel é "inventado" em SQL.

```
┌ App / Painel ┐    cria projeto + enfileira      ┌ orion_bg_jobs (FILA) ┐
│ bg_create_*  │ ───────────────────────────────► │ pendente → …         │
│ remove_bg…   │                                   └──────────┬───────────┘
└──────────────┘                                              │ bg_next_job (service_role, SKIP LOCKED)
        ▲  versão + score                                     ▼
        │                                          ┌ Edge Function (pixel) ┐
        └────────────── bg_complete_job ◄───────── │ remove/gera/exporta   │
                        (url + métricas)           └───────────────────────┘
```

## 2. Fontes reais (LEITURA) e reuso

| Fonte | Uso |
|---|---|
| `merchant_credit_products`, `auction_listings`, `profiles` (logo/avatar) | imagens candidatas a tratamento (pré-lançamento: volume baixo — **declarado**) |
| **AI-61 Brand Identity** (`orion_brand_colors`, `generate_palette`) | **REUSO**: `generate_background` harmoniza a paleta do fundo com a **cor primária da marca** (teoria das cores + contraste WCAG reais, herdados do AI-61) |
| **AI-62 Smart Template** (`orion_tpl_*`) | vizinho no Design Ecosystem; escopos separados (template = layout/definição, background = fundo/cena) |

> Nada é agregado ou reescrito de outro módulo — o AI-65 apenas **lê** o AI-61.

## 3. Modelo de dados (`orion_bg_*`)

| Tabela | Papel |
|---|---|
| `orion_bg_scenes` | **catálogo de cenários** (nome, categoria, estilo, ambiente, premium, paleta) — **30 seeds / 21 categorias** |
| `orion_bg_projects` | projeto por imagem (ref_tipo/ref_id, categoria, marca, objeto, status, score) |
| `orion_bg_jobs` | **FILA** (tipo, params, prioridade, status, tentativas, worker, timestamps) |
| `orion_bg_versions` | versionamento — **v0 = original preservado (imutável)**, v1..n = resultados |
| `orion_bg_metrics` | métricas por versão (naturalidade, realismo, iluminação, sombras, integração, profundidade…) |
| `orion_bg_scores` | Background Score consolidado por projeto |
| `orion_bg_exports` | exportações declaradas (formato, url) |
| `orion_bg_history` | trilha de eventos |
| `orion_bg_models` | modelos/motores declarados (Edge) |
| `orion_bg_statistics` | rollup diário |

## 4. Ciclo de vida de um fundo (o coração do módulo)

1. `bg_create_project(imagem, ref_tipo, ref_id, categoria, brand_id, objeto)` → cria projeto **+ versão v0 = original imutável**.
2. `remove_background(projeto)` / `replace_background(projeto, scene_id)` / `apply_shadows` / `apply_reflections` / `correct_perspective` / `export_background(projeto, formato)` → **enfileiram** um job (não processam nada).
3. A **Edge** chama `bg_next_job(worker)` — reivindica o job mais prioritário com `FOR UPDATE SKIP LOCKED` (concorrência segura entre workers).
4. A Edge processa o pixel e devolve `bg_complete_job(job, resultado_url, metrics, erro)` → cria **nova versão**, grava **métricas** e calcula o **Background Score** (média de naturalidade/realismo/iluminação/sombras/integração/profundidade).
5. `bg_restore_version(projeto, versao)` volta a qualquer versão (o original nunca se perde).

**Resiliência:** `orion_bg_tick()` (cron `*/5`) devolve à fila jobs presos > 15 min (até 3 tentativas) e roda o rollup. Falhas ficam registradas, não somem.

## 5. Recomendação (reuso do AI-61)

`generate_background(categoria, segmento, brand_id)` devolve:
- **cenários** do catálogo ranqueados para a categoria/segmento;
- **paleta de fundo harmonizada com a marca** — lê a cor primária em `orion_brand_colors` e chama `generate_palette` do AI-61 (rotação de matiz HSL + contraste WCAG **reais**);
- nota explícita de que a **geração do pixel é da Edge**.

## 6. Background Score

Por projeto, média das dimensões medidas na última versão concluída: **naturalidade, realismo, iluminação, sombras, integração objeto↔fundo, profundidade** (+ qualidade/consistência quando informadas pela Edge). 0–100, explicável (as parcelas ficam em `orion_bg_metrics`).

## 7. Segurança

- Todas as funções são `SECURITY DEFINER` com guarda de admin (`mp_is_admin()` / `postgres` / `service_role`).
- **RLS admin-read** nas tabelas + `REVOKE ALL … FROM anon, authenticated; GRANT SELECT … TO authenticated`.
- **HARDENING desde o início (lição do AI-61):** `REVOKE EXECUTE … FROM PUBLIC, anon` em **todas as funções de dados** — funções `SECURITY DEFINER` de leitura furam RLS e o Postgres concede EXECUTE a PUBLIC por padrão. Verificado: anon recebe `42501`.
- `bg_next_job` / `bg_complete_job` são **exclusivas da Edge** (`service_role`) — anon/authenticated recebem negação.

## 8. Integração de IA

Via **Gateway** (nunca provedor direto). 5 prompts registrados: `bg.scene_analysis`, `bg.recommend`, `bg.quality`, `bg.fidelity`, `bg.summary`. Modelo preferido `gpt-5-mini`.

## 9. Operação

- Tick: `orion_bg_tick()` cron `*/5` (retry de jobs presos + rollup).
- Selftest: `bg_selftest()` → **8/8** (biblioteca, recomendação, ciclo de job Edge, original preservado, recuperar versão, RLS ativo, fila consistente, modelos declarados).
- Painel: `/admin/orion-background` (Dashboard · Cenários · Projetos · Fila/Jobs · Config).

## 10. Fronteira Edge (DECLARADO — não implementado em SQL)

Remoção de fundo (matting), geração/composição de cenário, sombras/reflexos fotorrealistas, correção de perspectiva, upscaling e export PNG/PSD. O contrato com o banco é **apenas** `bg_next_job` (claim) + `bg_complete_job` (resultado + métricas).
