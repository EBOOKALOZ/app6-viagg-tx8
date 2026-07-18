# ORION-AI-56 — Autonomous Operations AI · API

> RPCs Postgres via PostgREST (`POST /rest/v1/rpc/<funcao>`), JWT Supabase.
> Painéis e ações exigem admin (`mp_is_admin()`).

## Orquestração

- `orchestrate_operations() → jsonb` — tick completo: ingere eventos → snapshot de
  recursos → decide eventos novos → otimiza → estatísticas. (pg_cron `*/2` via `orion_aoc_tick()`.)
- `process_event(p_event_id bigint) → jsonb` — decide um evento pontual.
- `execute_policy(p_policy_key text) → jsonb` — reavalia eventos novos por uma política.
- `execute_workflow(p_workflow_key text) → jsonb` — roda um workflow **seguro** do
  catálogo (não-seguro exige aprovação por passo).

## Decisões (aprovação humana / reversão)

- `aoc_approve_decision(p_decision_id, p_aprovar boolean=true, p_motivo text) → jsonb`
  — aprova (executa a ação) ou recusa uma decisão semi/manual.
- `aoc_rollback_decision(p_decision_id, p_motivo) → jsonb` — reverte por linha
  compensatória (recusa reversão dupla).

## Leitura / painéis

- `get_operation_status() → jsonb` — Automation/Health/Reliability Score, MTTR,
  eventos, operações ativas, decisões, aguardando aprovação, incidentes, gargalos, alertas.
- `get_operation_metrics(p_secao) → jsonb` — `eventos | decisoes | dispatch |
  incidentes | recursos | politicas | workflows | alertas | estatisticas`.
- `automation_dashboard() → jsonb` — status + todas as seções + lacunas (emite `aoc.dashboard`).

## Motor (internas; via tick)

`aoc_ingest_events` · `aoc_snapshot_resources` · `aoc_decide` · `aoc_execute_decision`
· `aoc_dispatch` · `aoc_open_incident` · `aoc_recover` · `aoc_optimize` ·
`aoc_alert_put` · `aoc_statistics_rollup`.

## Testes — COMANDO TESTE

`aoc_selftest() → jsonb` — 12 testes com evidência (inclui prova da **guarda financeira**).

## Eventos no bus (`orion_eventos`, origem `autonomous_ops`)

`aoc.orchestrate` · `aoc.approve` · `aoc.workflow` · `aoc.dashboard`.

## Prompts (Gateway AI-00 · `gpt-5-mini`)

`autonomous_ops.summary` · `.decision` · `.incident` · `.policy` · `.optimization`.

## Segurança

- 10 tabelas RLS admin-read; `REVOKE ALL` + `GRANT SELECT`.
- `SECURITY DEFINER` com guarda admin/service; decisões/eventos append-only.
- **Financeiro nunca automático**; infra = recomendação (não executa).
- Recuperação automática restrita a ticks idempotentes (nunca `pay/settle/escrow`).
