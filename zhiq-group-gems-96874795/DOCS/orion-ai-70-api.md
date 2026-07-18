# ORION-AI-70 — Auction Ecosystem Orchestrator · API

> Superfície pública (admin). `REVOKE EXECUTE FROM PUBLIC,anon` em todas as `aeo_*`.
> READ-ONLY sobre leilão/financeiro — escreve só `orion_aeo_*`.

## RPCs públicas

| RPC | Retorno |
|---|---|
| `aeo_dashboard()`        | **fonte única do painel** (scores/BI/health/módulos/workflow/quality/performance/alertas/previsões/eventos) |
| `aeo_scores()`           | os 7 scores do dia |
| `aeo_orchestrate_rpc()`  | dispara uma orquestração completa (admin) |
| `aeo_selftest()`         | COMANDO TESTE (14 provas) |

## Motor (service_role — não expostos ao front)

`aeo_orchestrate` (mestre, idempotente) · `aeo_discover` · `aeo_health_check` ·
`aeo_ingest_events` · `aeo_workflow_validate` · `aeo_quality_check` ·
`aeo_performance_snapshot` · `aeo_alerts_generate` · `aeo_bi_consolidate` · `aeo_predict` ·
`aeo_scores_refresh(jsonb,jsonb,jsonb,jsonb)` · `orion_auction_orchestrator_tick()` (cron `*/10`).
Helpers: `aeo_count_safe` / `aeo_sum_safe` / `aeo_call_safe` (chamada defensiva read-only) / `aeo_emit` / `aeo_audit`.

## Entregáveis → implementação

| Entregável | Onde |
|---|---|
| Auction Orchestrator Engine | `aeo_orchestrate` + `orion_aeo_runs` |
| Workflow Engine | `aeo_workflow_validate` + `orion_aeo_workflow` (17 etapas) |
| Health Engine | `aeo_health_check` + `orion_aeo_health` |
| Quality Engine | `aeo_quality_check` + `orion_aeo_quality` (6 invariantes) |
| Executive Dashboard | `aeo_dashboard` + painel |
| Alert Center | `aeo_alerts_generate` + `orion_aeo_alerts` |
| Event Engine | `aeo_ingest_events` + `orion_aeo_events` (trace_id) |
| Performance Monitor | `aeo_performance_snapshot` + `orion_aeo_performance` |

## Exemplos

```sql
SELECT public.aeo_selftest();          -- COMANDO TESTE
SELECT public.aeo_dashboard();         -- painel
SELECT public.aeo_scores();            -- 7 scores
SELECT public.aeo_orchestrate_rpc();   -- rodar uma orquestração agora

-- estado bruto
SELECT dia, orchestration_score, health_score, workflow_score, performance_score,
       reliability_score, security_score, integration_score FROM public.orion_aeo_scores;
SELECT * FROM public.orion_aeo_bi ORDER BY dia DESC;
SELECT stage_key, ordem, status, consistencia_pct FROM public.orion_aeo_workflow ORDER BY ordem;
SELECT check_key, categoria, ok, achados FROM public.orion_aeo_quality;
SELECT componente, status FROM public.orion_aeo_health;
SELECT tipo, previsao, confianca, dados_analisados FROM public.orion_aeo_predictions;
```

## Certificação (números)

RPCs públicas: 4 · funções `aeo_*`: ~26 · tabelas: 12 · workflow: 17 etapas ·
quality checks: 6 · health components: 12 · engines coordenados: 7 · dashboards: 1 ·
alertas inteligentes: cron/backlog/risco_financeiro/fraude · cron: `*/10` · selftest: 14.
