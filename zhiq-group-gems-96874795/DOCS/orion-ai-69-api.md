# ORION-AI-69 — API (Auction Growth & Expansion)

Namespace `orion_agrowth_*` · chave `auction_growth`. Todas as funções são `SECURITY DEFINER` + guarda `agrowth_assert_admin`; funções de dados têm `REVOKE EXECUTE … FROM PUBLIC, anon`. **READ-ONLY sobre o domínio** — só escreve nas próprias tabelas (via tick).

## Consulta / analítica

| Função | Retorno |
|---|---|
| `agrowth_metrics_now()` | métricas atuais reais: vendedores, compradores, leilões, lances, arremates, watchers, gmv, receita, ticket_medio, liquidez, conversão, estágio |
| `agrowth_window_growth()` | novos leilões/lances/vendedores/compradores por dia/semana/mês |
| `agrowth_growth_score()` | Growth Score 0-100 + parcelas (atividade/liquidez/conversão/receita/novos) + base + nota |
| `agrowth_expansion_ranking(p_limit integer)` | participação por UF + top municípios IBGE sem oferta (por população) + universo (5.571) |
| `agrowth_market_penetration()` | penetração municipal/estadual/nacional + densidade |
| `agrowth_retention()` | usuários com lance, recorrentes, taxa de retorno |
| `agrowth_kpis_now()` | GMV, receita, receita_por_uf, ticket, liquidez, conversão, LTV; **CAC declarado indisponível** |
| `agrowth_predict(p_metrica text, p_horizonte integer)` | previsão `regr_slope` + base_estatistica + n_amostras + confiança (métricas: leiloes_total, lances, vendedores, compradores, gmv, receita) |
| `agrowth_cert_scores()` | growth/expansion/prediction/analytics/performance + read_only_compliance |
| `auction_growth_dashboard()` | **payload único** do painel |
| `agrowth_selftest()` | suíte 8/8 |

## Escrita (só no próprio namespace — via tick/cron)

| Função | Efeito |
|---|---|
| `agrowth_detect_opportunities()` | grava top-5 municípios sem oferta em `orion_agrowth_opportunities` (idempotente por `dedupe_key`) |
| `orion_agrowth_tick()` | cron `*/30`: snapshot + geo (UF) + scores + KPIs + oportunidades + previsões — **idempotente por dia** (`ON CONFLICT`) |

## Contratos importantes

- **Nunca** escreve em `auction_listings`/`auction_bids`/`arremate_*`/`orion_auction_settlements`/comissões/créditos.
- Previsão: se `n_amostras < 2` → `valor_previsto = null` e nota "dados insuficientes" (honesto).
- CAC: sempre `null` + nota — não há custo de aquisição no domínio.
- Idempotência: `snapshots`/`scores`/`kpis` por `dia` (PK); `geo` por `(dia,escopo,chave)`; `opportunities`/`predictions` por `dedupe_key` único.

## Exemplo

```sql
SELECT auction_growth_dashboard();          -- payload do painel
SELECT agrowth_expansion_ranking(15);        -- ranking de expansão IBGE
SELECT agrowth_predict('gmv', 7);            -- previsão GMV +7d (declara base/n/confiança)
SELECT orion_agrowth_tick();                 -- roda o ciclo (idempotente)
SELECT agrowth_selftest();                   -- 8/8
```
