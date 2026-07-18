# ORION-AI-69 — Auction Growth & Expansion AI

> Inteligência de **crescimento sustentável** do Ecossistema de Leilões ORION.
> Namespace `orion_agrowth_*` · chave `auction_growth` · painel `/admin/orion-auction-growth` badge **GROWTH** · tick `*/30`.
> **Modo READ-ONLY**: analisa, compara, prevê e recomenda — **nunca altera** leilões, lances, arremates, comissões ou créditos.

## 1. Princípio

Toda saída deriva de **dado real**. Nada é inventado. Onde o volume ainda é de pré-lançamento, o módulo **declara** o estágio e produz scores baixos honestos — em vez de fabricar números. Previsões só são emitidas quando há histórico; caso contrário a IA informa "dados insuficientes".

## 2. Fontes reais (LEITURA) e reuso

| Fonte | Uso |
|---|---|
| `auction_listings` | oferta, vendedores (store_id), cidades/estados, valores, status, duração |
| `auction_bids` | compradores (user_id), lances (amount_cents), atividade |
| `arremate_listings` / `arremate_offers` | oferta e demanda do fluxo "faça sua oferta" |
| `auction_watchers` / `auction_events` | sinais de demanda/engajamento |
| **`orion_auction_settlements`** (AI-65) | **GMV e receita reais** (valor_final, comissao_valor, valor_liquido) |
| **`orion_municipios`** | **5.571 municípios / 27 UFs** com população → base de expansão geográfica |

Namespace próprio `orion_agrowth_*` — o módulo **só escreve nas próprias tabelas** (via tick). **Não colide** com o AI-07 `growth` nem com `orion_auction_*` (AI-65 Settlement / AI-67 Intelligence).

## 3. Motores

- **Growth Engine** — vendedores, compradores, leilões ativos, lances, liquidez, ticket médio, receita, conversão.
- **Growth Score (0-100)** — explicável, 5 parcelas de 0-20: atividade, liquidez, conversão, receita, novos (mês). Cada parcela vem de métrica real.
- **Expansion Engine** — ranking de municípios IBGE **sem oferta** por população (oportunidade de aquisição de vendedores) + participação por UF (oferta real).
- **Market Penetration** — penetração municipal, estadual (/27 UFs) e nacional; densidade de oferta.
- **Aquisição** — regiões/categorias com pouca oferta (vendedores) e baixa demanda (compradores).
- **Retenção** — usuários com lance, recorrentes, taxa de retorno (lances por usuário/dia).
- **KPIs** — GMV, receita, receita por UF, ticket médio, liquidez, conversão, LTV estimado. **CAC declarado indisponível** (não há custo de marketing por canal no domínio — honestidade).
- **IA Preditiva** — `regr_slope` sobre snapshots diários; sempre informa **base estatística + n_amostras + confiança**. Sem ≥2 snapshots, não emite (declara).
- **Oportunidades** — detecção idempotente (dedupe_key) de expansão/oferta baixa/demanda alta, com evidência + potencial + confiança.

## 4. Modelo de dados (`orion_agrowth_*`)

| Tabela | Papel |
|---|---|
| `orion_agrowth_snapshots` | série diária de métricas (PK dia — idempotente) |
| `orion_agrowth_geo` | oferta/demanda/GMV/participação por cidade/estado (PK dia+escopo+chave) |
| `orion_agrowth_scores` | Growth/Expansion/Prediction/Analytics/Performance por dia |
| `orion_agrowth_opportunities` | oportunidades detectadas (dedupe_key único, evidência, potencial, confiança) |
| `orion_agrowth_recommendations` | recomendações vendedor/comprador (dedupe_key) |
| `orion_agrowth_predictions` | previsões com base + n + confiança (dedupe_key) |
| `orion_agrowth_kpis` | KPIs diários (jsonb) |
| `orion_agrowth_alerts` | alertas de crescimento |

## 5. Segurança & performance

- `SECURITY DEFINER` + guarda de admin (`agrowth_assert_admin`).
- **RLS admin-read** + `REVOKE ALL/GRANT SELECT` + **`REVOKE EXECUTE … FROM PUBLIC, anon`** em todas as funções de dados (lição AI-61). Verificado: anon → `42501`, inclusive `orion_agrowth_tick`.
- **Read-only compliance**: nunca escreve no domínio; o selftest verifica que anon não tem INSERT/UPDATE/DELETE em `auction_listings` e que `read_only_compliance = true`.
- **Performance**: snapshots diários = cache; índices em `snapshots(dia)`, `geo(dia,escopo)`, `opportunities(ativo,tipo)`, `predictions(metrica)`. Consultas ao domínio usam PK/FK.

## 6. IA (via Gateway) e operação

- Prompts: `agrowth.summary`, `agrowth.expansion`, `agrowth.opportunity`. Modelo `gpt-5-mini`.
- Tick `orion_agrowth_tick()` cron `*/30`: snapshot + geo + scores + KPIs + oportunidades + previsões (idempotente por dia).
- `agrowth_selftest()` → **8/8**. Painel único via `auction_growth_dashboard()`.
