# ORION-AI-69 — Certificação (Auction Growth & Expansion)

**Data:** 2026-07-18 · **Ambiente:** produção (`broifhfqmnzqoongtokm`) · **Migration:** `supabase/migrations/20260718_orion_auction_growth_ai69.sql` (Management API — HTTP 201, cron agendado).

## 1. Selftest — `agrowth_selftest()` → **8/8 aprovado**

```json
{"suite":"orion-ai-69-auction-growth","total":8,"passou":8,"aprovado":true,"casos":[
  {"t":"metricas_reais","ok":true},
  {"t":"growth_score_0_100","ok":true},
  {"t":"expansao_usa_ibge","ok":true},
  {"t":"penetracao","ok":true},
  {"t":"previsao_declara_base_e_n","ok":true},
  {"t":"kpis_gmv","ok":true},
  {"t":"read_only_dominio","ok":true},
  {"t":"read_only_compliance","ok":true}
]}
```

## 2. Homologação em dados reais

**Métricas reais** (de `auction_*` + `orion_auction_settlements`):
```
GMV R$ 189,90 · receita R$ 11,39 · vendedores 1 · compradores 0 · leilões 2 (1 ativo)
liquidez 0.5 · ticket médio R$ 189,90 · leilões liquidados 1
estágio: "pre-lancamento (dados esparsos — declarado)"
```

**Growth Score = 11** (honesto p/ pré-lançamento), parcelas: liquidez 10, atividade 0.8, receita 0.2, novos 0.4, conversão 0. Nota: "score baixo é honesto: plataforma pré-lançamento".

**Scores da certificação:** growth 11 · expansion 44 · prediction 0 (sem histórico) · analytics 80 · performance 100 · **read_only_compliance true**.

**Expansão (reusa IBGE):** universo **5.571 municípios**; top oportunidades = São Paulo (11,9M), Rio de Janeiro (6,7M), Brasília (3,0M) — maiores populações **sem oferta**.

**Preditiva honesta:** `agrowth_predict('leiloes_total',7)` sem histórico → `valor_previsto=null`, `n_amostras=0`, `confianca=0`, nota "dados insuficientes — previsão não emitida".

**Ciclo do tick + idempotência:**
```
1º tick → 1 snapshot, 5 oportunidades (potencial máx 100), 3 previsões
2º tick → continua 1 snapshot e 5 oportunidades (ON CONFLICT / dedupe_key)
```

## 3. Segurança verificada (anon → 42501)

| Chamada (anon) | Resultado |
|---|---|
| `auction_growth_dashboard` | `42501 permission denied` ✅ |
| `agrowth_metrics_now` | `42501` ✅ |
| `agrowth_cert_scores` | `42501` ✅ |
| `orion_agrowth_tick` | `42501` (só admin/cron) ✅ |

RLS admin-read + `REVOKE ALL/GRANT SELECT` + `REVOKE EXECUTE FROM PUBLIC,anon`. Read-only: o selftest confirma que anon não tem INSERT/UPDATE/DELETE no domínio.

## 4. Certificação oficial

| Item | Valor |
|---|---|
| Growth Score | 11 (real, pré-lançamento) |
| Expansion Score | 44 |
| Prediction Score | 0 (sobe com histórico de snapshots) |
| Analytics Score | 80 |
| Performance Score | 100 |
| Read-only Compliance | ✅ true (provado) |
| RPCs | 13 |
| Views/payloads | `auction_growth_dashboard` + 8 tabelas |
| KPIs | GMV, receita, receita/UF, ticket, liquidez, conversão, LTV (CAC declarado indisponível) |
| Dashboards | 1 (`/admin/orion-auction-growth`, 5 abas) |
| Conformidade Arquitetura ORION | 100% (chave única, IA via Gateway, recomenda-nunca-executa, evidência, idempotência, RLS+REVOKE) |

**Veredito:** ✅ **CERTIFICADO** — ORION-AI-69 Auction Growth & Expansion AI v1.0. Selftest 8/8, dados 100% reais, read-only provado, expansão sobre IBGE, previsão honesta, guardas anon confirmadas, `npx vite build` ✓.
