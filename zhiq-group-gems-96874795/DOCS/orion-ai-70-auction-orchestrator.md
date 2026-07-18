# ORION-AI-70 — Auction Ecosystem Orchestrator AI v1.0

> **Camada superior de coordenação** do Ecossistema de Leilões ORION.
> Chave `auction_orchestrator` · namespace `orion_aeo_*` (funções `aeo_*`) · painel `/admin/orion-auction-orchestrator` (badge ORQUESTRADOR).
> Migration: `supabase/migrations/20260718_orion_auction_orchestrator_ai.sql`.

## O que é

Inteligência central que **coordena (não substitui)** os motores de leilão existentes,
garantindo sincronização, saúde, rastreabilidade, performance, qualidade e decisão
baseada **exclusivamente em dados reais**. **ESTRITAMENTE READ-ONLY** sobre leilão e
financeiro — escreve apenas em `orion_aeo_*`. Nunca modifica dado financeiro, nunca
ação destrutiva.

## Motores coordenados (auto-descobertos, reais)

| engine_key | Motor | Tabela/base |
|---|---|---|
| `bidding` | Leilão core (lances/listings) | `auction_listings` / `auction_bids` |
| `commission` | Comissão & Arremate | `orion_auction_commissions` |
| `finalize` | Finalização/Encerramento | `orion_auction_finalize_log` |
| `settlement` | Liquidação | `orion_auction_settlements` |
| `intelligence` | Auction Intelligence | `auction_conversion_metrics` |
| `autoclose` | Auto-close | cron `orion_auction_autoclose` |
| `command` | Comando Leilão (growth/stats) | `auction_command_dashboard` |

> A numeração dos módulos de leilão divergiu (várias sessões em paralelo). O AI-70
> coordena os **motores reais** por descoberta (existência de tabelas/crons/RPCs),
> não por número.

## Engines de orquestração

- **Orchestration Engine** (`aeo_orchestrate`): pipeline criação→publicação→campanhas→
  divulgação→lances→monitoramento→encerramento→arremate→liquidação→comissão→créditos→
  liberação de contato→pós-venda→reputação→analytics→growth→BI (17 etapas).
- **Health Monitor** (`aeo_health_check`): 4 crons (último status via `cron.job_run_details`)
  + 6 RPCs críticas + backlog de encerramento + banco → **Health Score**. Realtime/Edge = DECLARADO.
- **Event Orchestration** (`aeo_ingest_events`): consolida `auction_events` com `trace_id` (rastreabilidade).
- **Workflow Engine** (`aeo_workflow_validate`): consistência por etapa (liquidados/finalizados, comissão_ok/liquidados, backlog).
- **Performance** (`aeo_performance_snapshot`): duração/atraso de finalização (`orion_auction_finalize_log`) + duração de cron.
- **Quality** (`aeo_quality_check`): 6 invariantes read-only — comissão calculada consistente, créditos debitados vs devidos, finalize sem settlement, lance após encerramento, settlement sem certificado, settlement órfão.
- **Alert Center** (`aeo_alerts_generate`): cron inativo, backlog (fila parada), risco financeiro, fraude (fraude_score alto).
- **BI** (`aeo_bi_consolidate`): GMV (settlements.valor_final), receita (comissão), leilões ativos/encerrados, arremates, lances, participantes, backlog.
- **IA Preditiva** (`aeo_predict`): sobrecarga / gargalo / otimização — sempre com **base, confiança e nº de dados**.

## 7 Scores

Orchestration (composto) · Health · Workflow · Performance · Reliability (taxa de sucesso da
finalização) · Security (integridade financeira + ausência de fraude) · Integration (motores ativos/esperados).

## Segurança

- **Read-only** sobre leilão/financeiro (provado: contagens de `auction_bids`/`orion_auction_settlements`/`orion_auction_commissions` inalteradas antes×depois do orquestrar).
- **Nunca modifica dinheiro, nunca ação destrutiva.** Escreve só `orion_aeo_*`.
- RLS admin + REVOKE ALL/GRANT SELECT; **`REVOKE EXECUTE FROM PUBLIC,anon`** em todas as `aeo_*` (lição AI-61); trilha de auditoria imutável (`orion_aeo_audits`, `orion_aeo_runs`).

## Operação

- `orion_auction_orchestrator_tick()` (cron `*/10`) → `aeo_orchestrate`.
- Prompts gpt-5-mini: `auction_orchestrator.summary/alert/prediction`.
- COMANDO TESTE: `SELECT public.aeo_selftest();` (14 provas).
