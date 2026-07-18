# ORION-AI-56 — Autonomous Operations AI v1.0 (AOC)

> **Autonomous Operations Center.** Chave de módulo: **`autonomous_ops`**.
> Painel: **`/admin/orion-autonomous-ops`** (badge AUTO OPS). Tick: **pg_cron `*/2`**.
> Camada de **orquestração por políticas**: evento operacional → decisão
> (automática/semi/manual) → dispatch aos módulos + incidentes com MTTR.

## Missão

Coordenar continuamente os processos operacionais: detectar eventos reais,
decidir dentro de POLÍTICAS, distribuir tarefas aos módulos ORION e recuperar
falhas. **NÃO substitui decisão estratégica humana.** Executa **apenas** ações
autorizadas por política. **NUNCA move dinheiro** — toda ação financeira é
semi/manual com aprovação humana.

## Posição no ecossistema (anti-sobreposição)

- **AI-13 Operations (COO)** — estratégia operacional (achados→missões). AI-56 lê.
- **AI-51 Observability** — mede saúde (métricas/logs/traces). AI-56 **consome** alertas.
- **AI-53 AIOps** (`orion_aiops_*`) — anomalias/playbooks de infra. AI-56 **consome** eventos.
- **AI-45 Incident Response** — incidentes de segurança. AI-56 **encaminha**.
- AI-56 = camada de ORQUESTRAÇÃO (evento→decisão→dispatch), distinta das acima.
  Namespace próprio `orion_aoc_*`.

## Princípios

Evidências obrigatórias · idempotência (dedupe) · decisões/eventos append-only
(RLS admin + REVOKE) · reversão = linha compensatória · auditoria completa ·
**financeiro nunca automático** · infra sem SQL = recomendação, não execução.

## Fontes REAIS (validadas 07-17)

`orion_eventos` (bus, ~507 ev/h) · `orion_obs_alerts` (AI-51) · `cron.job_run_details`
(falhas) · `orion_aiops_events` (AI-53) · filas (`campaign_queue`/`fila_postagens`/
`orion_dispatch_queue`) · `pay_payment_orders` (pagamentos presos >2h) ·
`pg_stat_activity` (conexões). Homologação ingeriu **31 eventos reais**.

## Tabelas (`orion_aoc_*`, 10)

`events` · `policies` · `decisions` · `dispatch` · `incidents` · `recovery` ·
`resources` · `workflows` · `alerts` · `statistics`.

## Camadas implementadas

- **C2 Event Driven** — `aoc_ingest_events()`: cron falha, SLO risco (AI-51),
  AIOps (AI-53), pagamento preso (financeiro), fila congestionada, fraude crítica (bus).
- **C9/C10 Políticas + Decisão** — `aoc_decide()`: casa política por condição,
  classifica autonomia; **financeiro força ≥ semi**; motivo/evidências/impacto/confiança.
- **C3 Dispatch** — `aoc_dispatch()`: livro de tarefas aos módulos; ticks
  idempotentes seguros (observability/health/performance/aiops) executam; demais = recomendação.
- **C5 Incident Response** — `aoc_open_incident()` + `aoc_recover()`: retry
  idempotente da whitelist (`orion_*_tick`, nunca financeiro), senão escala (AI-45); **MTTR** medido.
- **C6 Resources** — `aoc_snapshot_resources()`: filas, conexões DB, eventos/min,
  jobs de cron ativos (reais). CPU/memória/Redis/cloud = DECLARADO.
- **C8 Optimization** — `aoc_optimize()`: recomendações de gargalo/latência (evidência real).
- **C11 Alerts** — alertas priorizados por impacto (idempotentes; espelho em `orion_ai_alerts`).

## Autonomia das decisões (C10)

`automatica` (executa ação segura já) · `semi` (aguarda aprovação humana) ·
`manual` (só humano). **Regra de ouro:** evento de categoria `financeiro` ou
política `financeiro=true` **nunca** resulta em `automatica`. Provado no selftest
(guarda financeira) e na homologação: **0 violações** — os 2 pagamentos presos
viraram decisão `manual`/`aguardando_aprovacao`.

## Scores

**Automation Score** (% decisões automáticas executadas ok) · **Health Score**
(OHS do AI-51 − 10·incidentes abertos − 5·gargalos) · **Reliability** (% dispatches
sem falha) · **MTTR** (segundos, incidente aberto→resolvido). Homologação:
Automation 94, Health 95.

## RPCs (spec)

`orchestrate_operations()` (tick) · `process_event()` · `execute_policy()` ·
`execute_workflow()` · `aoc_approve_decision()` · `aoc_rollback_decision()` ·
`get_operation_status()` · `get_operation_metrics()` · `automation_dashboard()`.
(dispatch_operation/handle_incident/recover_service/schedule_operation/
rebalance_resources/optimize_operations = internos `aoc_dispatch`/`aoc_open_incident`/
`aoc_recover`/`aoc_snapshot_resources`/`aoc_optimize`.)

## IA (AI-00 Gateway, `gpt-5-mini`)

`autonomous_ops.summary` · `.decision` · `.incident` · `.policy` · `.optimization`.

## Suíte de testes — COMANDO TESTE

`aoc_selftest()` — **12 testes** incluindo **guarda financeira** (evento financeiro
nunca vira automática), ingestão real, snapshot de recursos, orquestração,
painéis, cron. Homologação **12/12 verde**.

## Lacunas DECLARADAS

1. NÃO controla CPU/memória/Redis/Firebase/Google Cloud/worker/edge real (sem
   superfície SQL) — registra recomendação, não executa.
2. Ações financeiras nunca automáticas (pagamento preso = incidente humano).
3. Recuperação automática = re-executar ticks idempotentes; falha determinística → escala.
4. Filas hoje em volume baixo/pré-lançamento — motor pronto e armado.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_autonomous_operations_ai.sql` (ROLLBACK ao fim)
- Painel: `src/pages/admin/AdminOrionAutonomousOps.tsx` (+ rotas/sidebar badge AUTO OPS)
- API: `DOCS/orion-ai-56-api.md` · Dashboard: `DOCS/orion-ai-56-dashboard.md`
- Certificação: `DOCS/orion-ai-56-certificacao.md`
