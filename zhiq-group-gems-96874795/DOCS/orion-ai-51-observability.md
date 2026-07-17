# ORION-AI-51 — Observability AI v1.0

> **Centro de Observabilidade do ORION.** Chave de módulo: **`observability`**.
> Painel: **`/admin/orion-observability`** (badge OBSERVABILITY). Tick: **pg_cron `*/1`**.
> Visão unificada, em tempo real, do comportamento da plataforma — SOMENTE
> leitura das fontes; escreve apenas em `orion_obs_*` + bus + alertas.

## Missão

Responder continuamente: o sistema está saudável? há degradação? onde falhou?
qual serviço/impacto/causa? o desempenho está dentro dos SLOs? Consolida
**métricas, logs, traces distribuídos, performance, disponibilidade, SLI/SLO,
health e RCA** numa visão única — sem duplicar AI-10 (Health) nem AI-11 (Performance).

## Princípios (ORION CORE v1)

1. **Origem rastreável** — toda métrica carrega `origem` + `evidencias` (fonte real).
2. **Segurança em logs** — `obs_sanitize()` mascara tokens/JWT/secrets/senhas
   **antes de gravar**; nada sensível é persistido (provado no selftest).
3. **Idempotência** — métricas com dedupe por janela de minuto (série temporal
   sem dupla contagem); traces por `runid`; logs por id de origem. Ingest
   incremental, nunca recalcula histórico.
4. **Append-only p/ clientes** — metrics/logs/traces com RLS admin + REVOKE.
5. **Lacunas declaradas** — o que não tem fonte SQL é declarado, nunca inventado.

## Fontes REAIS (validadas 07-17)

| Fonte | Uso |
|---|---|
| `cron.job_run_details` (6.106 runs, 116 falhas) + `cron.job` | **traces distribuídos reais** (1 trace/execução), health/disponibilidade por serviço |
| `extensions.pg_stat_statements` (4.900) | latência/throughput de RPC/SQL (mean_exec_time, calls) — literais normalizados, sem secrets |
| `public.client_errors` (171) | logs de erro do frontend (sanitizados) |
| `public.orion_ai_log` (42) | latência/erros do Gateway |
| `public.orion_eventos` (5.233) | eventos por minuto (throughput do barramento) |
| `auth.sessions` | usuários online |
| AI-10 `orion_health_snapshots` / AI-11 `orion_perf_snapshots` | leitura cruzada (consolida; não duplica) |

## Tabelas (`orion_obs_*`)

`orion_obs_metrics` · `orion_obs_logs` · `orion_obs_traces` · `orion_obs_spans` ·
`orion_obs_service_health` · `orion_obs_sli` · `orion_obs_slo` · `orion_obs_alerts` ·
`orion_obs_statistics`. RLS admin-read; `REVOKE ALL` + `GRANT SELECT`.

## Scores (0–100, explicáveis)

| Score | Fórmula |
|---|---|
| **OHS** Observability Health | 0.25·DAS + 0.25·PHS + 0.15·LQS + 0.15·TPS + 0.20·SLO Compliance |
| **PHS** Performance Health | 100 − latência_média_RPC/20 |
| **DAS** Availability | média da disponibilidade dos serviços (**≠** Device Assurance do AI-42/47) |
| **LQS** Log Quality | % de logs com contexto estruturado e não-FATAL |
| **TPS** Trace Precision | % de traces com duração medida e span presente |
| **SLO Compliance** | % de SLOs ativos cumprindo a meta |

## Logs — classificação e segurança

Níveis INFO/WARNING/ERROR/CRITICAL/FATAL. Ingestão de: `client_errors` (ERROR),
`orion_ai_log` com erro/latência alta (ERROR/WARNING), execuções `failed` do cron
(CRITICAL). Porta pública `obs_log_ingest()` para front/backend — **sempre
sanitiza**. Nenhuma senha/token/secret é gravada.

## Traces distribuídos

Cada execução de cron = um trace real (`cron:<runid>`) com span de execução
(serviço, operação, duração, status). Reconstrói a jornada do tick. Porta
`obs_trace_ingest()` para traces de request do app (adoção gradual — DECLARADO).

## SLI / SLO

SLIs medidos das fontes reais: disponibilidade (cron success 24h), latência
(pg_stat), erro (logs de erro / eventos), throughput (eventos/min). SLOs com
alvo, comparador, **compliance, error budget e risco** — 4 SLOs globais seed
(disponibilidade ≥95%, latência ≤500ms, erro ≤1%, throughput ≥0.1 ev/min).
Alerta quando há risco de violação.

## Health Check por serviço

Cada job de cron ORION = um serviço (disponibilidade = % execuções `succeeded`
em 24h) + infra derivada de sinais reais (banco via pg_stat, auth via auditoria,
frontend via client_errors, gateway_ia via orion_ai_log). Storage/realtime/cdn/
edge: sem sinal SQL direto → estado assumido saudável e **DECLARADO**.
Classificação: saudável (≥99%) · atenção (≥95%) · degradado (≥80%) · crítico (<80%).

## Root Cause Analysis — `observability_rca(servico)`

Causa provável a partir de evidência real: falhas recorrentes de cron, taxa de
erro, latência, logs CRITICAL, operações lentas + cadeia de dependências + tempo
estimado de recuperação. **Handoff ao AI-45 Incident Response** quando a
superfície existir.

## Alertas inteligentes (priorizados por impacto)

Serviço degradado/crítico, latência RPC alta, crescimento de erros de frontend,
SLO em risco, cron parado (>90min sem execução). Idempotentes por tipo/serviço/dia,
espelhados em `orion_ai_alerts`. Prioridade ordena por impacto (alto/médio/baixo).

## IA (AI-00 Gateway, `gpt-5-mini`)

`observability.summary` · `observability.anomaly` · `observability.performance` ·
`observability.rootcause` · `observability.recommendation`. Pref em
`orion_ai_module_prefs` (`observability` → `gpt-5-mini`).

## Suíte de testes — COMANDO TESTE

`observability_selftest()` — **12 testes** (tabelas, RLS, grants travados, coleta
de métricas, ingestão+**sanitização** de logs, traces distribuídos, health checks,
SLI/SLO, painéis/dashboards, RCA, alertas, **segurança/sanitização com token+senha
de teste**). Homologação 07-17: **12/12 verdes**.

## Lacunas DECLARADAS

1. CPU/memória de host: Supabase não expõe via SQL (proxies do banco).
2. Web Vitals (LCP/INP/CLS/TTFB/FCP) e tempos de render: telemetria do front via
   `obs_log_ingest`/`obs_trace_ingest` (portas prontas).
3. CDN e uso de Storage em bytes: exigem Management API.
4. Traces de request HTTP do app: porta pronta; hoje traces vêm dos ticks de cron.
5. AI-49 SOC / AI-50 Governance: integração por leitura; detecção dinâmica de superfície.

## Integrações

AI-40 Cyber, AI-44 Security Audit, AI-45 Incident Response (handoff RCA), AI-49
SOC Commander, AI-50 Governance — leitura/detecção dinâmica. Bus `orion_eventos`
(origem `observability`) + `orion_ai_alerts` para os dashboards Executivo/
Financeiro/Analytics/Auditoria/Notificações.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_observability_ai.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionObservability.tsx` (+ rotas/sidebar badge OBSERVABILITY)
- API: `DOCS/orion-ai-51-api.md` · Dashboard: `DOCS/orion-ai-51-dashboard.md`
- Certificação: `DOCS/orion-ai-51-certificacao.md`
