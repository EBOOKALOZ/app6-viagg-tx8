# ORION-AI-51 — Observability AI · API

> RPCs Postgres via PostgREST (`POST /rest/v1/rpc/<funcao>`), JWT Supabase.
> Painéis exigem admin (`mp_is_admin()`). Portas de ingestão aceitam authenticated.

## Portas de ingestão (front/backend)

- `obs_log_ingest(p_nivel, p_origem, p_mensagem, p_servico?, p_contexto?) → bigint`
  — grava log **sempre sanitizado** (nunca token/senha/secret). Nível inválido → INFO.
- `obs_trace_ingest(p_trace_id, p_servico, p_operacao, p_duracao_ms, p_status?, p_started_at?, p_evid?) → text`
  — registra trace + span raiz (upsert idempotente).
- `obs_sanitize(p_texto) → text` — mascara segredos (usado internamente e exposto).

## Motor (tick `*/1`; executáveis por admin)

- `obs_collect_metrics() → int` — snapshot de métricas reais (RPC/cron/eventos/online).
- `obs_ingest_logs() → int` — centraliza+classifica+sanitiza (client_errors/gateway/cron).
- `obs_collect_traces() → int` — traces de `cron.job_run_details` (incremental).
- `obs_health_refresh() → int` — health por serviço (cron + infra derivada).
- `obs_sli_slo_refresh() → int` — SLIs medidos + SLOs (compliance/budget/risco).
- `obs_alerts() → int` — alertas priorizados por impacto (idempotentes).
- `obs_statistics_rollup() → void` — estatística diária + 6 scores.
- `orion_observability_tick() → void` — orquestra tudo (pg_cron `*/1`).

## Root Cause Analysis

- `observability_rca(p_servico text) → jsonb` — causa provável, recomendação,
  cadeia de dependências, tempo estimado de recuperação, falhas 24h, logs
  recentes, operações lentas, handoff AI-45. Guarda admin.

## Painéis (admin)

- `obs_overview() → jsonb` — dashboard executivo (OHS/uptime, disponibilidade,
  resp. média, taxa de erro, serviços ativos/degradados, logs/min, traces,
  usuários/lojas online, eventos/min, alertas, incidentes).
- `obs_panel(p_secao) → jsonb` — `metricas | logs | traces | performance |
  disponibilidade | sli | slo | servicos | dependencias | alertas |
  estatisticas | config`.
- `obs_summary()` (overview + 12 seções) · `obs_dashboard()` (summary + emite `observability.score`).

## Testes — COMANDO TESTE

- `observability_selftest() → jsonb` — 12 testes com evidência (inclui prova de
  sanitização com token+senha). Entrada do COMANDO TESTE.

## Eventos no bus (`orion_eventos`, origem `observability`)

`observability.alerts` · `observability.score`.

## Prompts (Gateway AI-00 · `gpt-5-mini`)

`observability.summary` · `observability.anomaly` · `observability.performance` ·
`observability.rootcause` · `observability.recommendation`.

## Segurança

- 9 tabelas com RLS admin-read; `REVOKE ALL` + `GRANT SELECT`.
- Funções `SECURITY DEFINER` com guarda admin/service; ingestão sanitiza.
- **Nunca registra senha/token/secret** (obs_sanitize; provado no selftest).
- Toda métrica com origem rastreável; toda recomendação/alerta com evidência.
