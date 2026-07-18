# ORION-AI-53 — AI Operations (AIOps) AI v1.0

> **Centro Inteligente de Operações Autônomas.** Chave: **`aiops`**. Painel:
> **`/admin/orion-aiops`** (badge AIOPS). Tick: **pg_cron `*/2`**.

## Missão

Monitorar continuamente a **operação técnica** da plataforma, detectar anomalias
operacionais, prever falhas antes de afetarem usuários e automatizar **só ações
seguras/pré-autorizadas** sob governança (AI-50). **Nunca executa ação destrutiva
automaticamente.** Tudo explicável e auditável.

## Não confundir

- **AI-13 Operations AI (`operations`)** = COO/negócio.
- **AI-11 Performance AI** = performance de queries.
- **AI-53 AIOps (`aiops`)** = **operação técnica/runtime** (cron, Gateway, serviços,
  observabilidade) — este documento.

## Fontes REAIS de telemetria (sondadas 07-17)

| Fonte | Sinal |
|---|---|
| `cron.job_run_details` ⨝ `cron.job` | saúde/falhas/duração dos jobs (PRIMÁRIA) |
| `orion_ai_log` (Gateway) | duracao_ms/status/erro/retries/cache_hit por chamada |
| `client_errors` | erros de frontend (pico vs baseline) |
| `orion_obs_service_health` (AI-51) | estado/disponibilidade/latência/erro_rate por serviço |
| `orion_obs_slo` (AI-51) | SLO em risco / error budget |
| `orion_cost_statistics` (AI-52), `orion_incidents` (AI-45), `orion_eventos` | contexto/liveness |

> Prova de valor imediata na homologação: o AIOps detectou que o **`orion_threat_tick`
> estava falhando 118/118 vezes em 24h**, fez o **RCA** (causa: `entidades` NULL em
> `orion_threat_campaigns`) e a correção foi aplicada — o cron voltou a rodar. O loop
> detecção→RCA→correção fechou de ponta a ponta.

## Tabelas (10)

`orion_aiops_events` · `orion_aiops_anomalies` · `orion_aiops_predictions` ·
`orion_aiops_actions` · `orion_aiops_playbooks` · `orion_aiops_statistics` ·
`orion_aiops_health` · `orion_aiops_evidence` (**imutável**) ·
`orion_aiops_automation_policies` · `orion_aiops_recommendations`. RLS admin +
REVOKE ALL/GRANT SELECT; evidências REVOKE UPD/DEL.

## Detecção de anomalias (`aiops_detect`)

`cron_falhando`, `cron_lento` (>8s), `gateway_erro`/`gateway_latencia` (>10s),
`erros_cliente` (pico vs baseline 30d), `servico_degradado` (AI-51), `slo_risco` (AI-51).
Idempotente (dedupe_key por hora, upsert; evidência gravada só na 1ª detecção via `xmax=0`).
Anomalias fecham quando o sinal normaliza.

## Predição de falhas (`aiops_predict`)

Tendência real: job com ≥3 falhas em 3h → alta probabilidade de continuar (prob/impacto/
confiança/justificativa). Muitas anomalias alta/crítica abertas → risco de degradação geral.

## Root Cause Analysis (`aiops_rca`)

Causa provável, serviço responsável, cadeia de dependências, impacto operacional, módulos
afetados, prioridade — a partir da evidência real (ex.: `return_message` do cron).
Encaminhável ao AI-49 SOC / AI-45 Incident.

## Automação segura (`aiops_automate`)

Executa **só** ações pré-autorizadas em `orion_aiops_automation_policies` (defere ao AI-50):
`reexecutar_verificacao`, `atualizar_metricas`, `abrir_incidente` (espelha em
`orion_cyber_events` como `ops_anomaly` → AI-45 responde, AI-49 consolida), `notificar_admin`.
**Ações destrutivas** (reprocessar fila, reiniciar serviço, limpar cache) → viram
**recomendação com aprovação humana**, nunca automáticas. Ação bloqueada por política → alerta.

## Scores (explicáveis)

| Score | Significado |
|---|---|
| **AOS** AI Operations | 50%·RHS + 30%·(100−risco) + 20%·automação |
| **RHS** Runtime Health | média da saúde de runtime por serviço |
| **FRS** Failure Risk (menor=melhor) | críticos·25 + altos·10 + risco predito/4 |
| **OAS** Operational Automation | % de ações auto-executadas com sucesso |
| **APS** Anomaly Prediction | confiança média das predições |

## Playbooks (seed)

cron interrompido, falha/latência no Gateway, serviço degradado (AI-51), pico de erros de
cliente, indisponibilidade total (destrutivo → requer humano). Registram origem, diagnóstico,
ações, evidências.

## IA (via AI-00 Gateway, `gpt-5-mini`)

`aiops.detect`, `aiops.predict`, `aiops.recover`, `aiops.summary`, `aiops.recommendation`.

## Suíte de testes (COMANDO TESTE)

`aiops_selftest()` — 8 casos (detecção de saúde, scores válidos, playbooks, políticas,
RLS, evidências imutáveis, **nenhuma ação destrutiva auto-autorizada**, motor de scores).
Homologação: **8/8 aprovado**.

## Integrações

AI-45 (handoff `aiops.handoff_ai45` + espelho `ops_anomaly`), AI-49 SOC (consolida),
AI-50 Governance (política de automação), AI-51 Observability (serviços/SLO),
AI-52 Cost (contexto). Bus origem `aiops`.

## Segurança

Nunca executa ação destrutiva automaticamente; automação respeita política do AI-50;
toda ação gera evidência; histórico permanente e imutável.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_aiops_ai.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionAiops.tsx` (+ rota/lazy/sidebar badge AIOPS)
- API: `DOCS/orion-ai-53-api.md` · Dashboard: `DOCS/orion-ai-53-dashboard.md` · Certificação: `DOCS/orion-ai-53-certificacao.md`
