# ORION-AI-53 — API (RPCs)

RPCs PostgREST: `POST .../rest/v1/rpc/<funcao>` (apikey + JWT). Guarda: admin/service
— anon negado (`run_aiops`→P0001; tabelas→42501, sem SELECT p/ anon).

| Espec / uso | RPC | Descrição |
|---|---|---|
| Dashboard executivo | `aiops_dashboard()` | payload completo (overview + anomalies + predictions + actions + infra + statistics + config) |
| Resumo / scores | `aiops_overview()` | AOS/RHS/FRS/OAS/APS + saúde geral + MTTR + disponibilidade |
| Anomalias | `aiops_anomalies_view()` | anomalias ativas com evidência |
| Predições | `aiops_predictions_view()` | predições de falha (prob/impacto/confiança/justificativa) |
| Ações Automáticas | `aiops_actions_view()` | ações + recomendações + políticas de automação |
| Infraestrutura / Serviços | `aiops_infra_view()` | saúde de runtime por serviço/categoria (RHS) |
| Root Cause | `aiops_rca(p_anomaly_id)` | RCA de uma anomalia (causa/serviço/cadeia/impacto/prioridade) |
| Estatísticas | `aiops_statistics_view()` | série 14d (AOS/RHS/FRS/OAS + anomalias/ações/MTTR) |
| Config | `aiops_config_view()` | cron, modelo, fontes, playbooks, regra |

## Motor / escrita (admin/service)

| RPC | Efeito |
|---|---|
| `run_aiops(p_trace?)` | detect → refresh_health → predict → automate → stats → alertas |
| `aiops_detect()` | detecção de anomalias das fontes reais |
| `aiops_refresh_health()` | saúde de runtime por serviço (cron + observability) |
| `aiops_predict()` | predições de falha por tendência |
| `aiops_automate()` | ações seguras gated por política (destrutivas→recomendação) |
| `aiops_scores()` | AOS/APS/OAS/FRS/RHS |
| `aiops_selftest()` | suíte de 8 testes (COMANDO TESTE) |
| `orion_aiops_tick()` | cron `*/2` |

## Exemplo — `run_aiops`

```json
POST /rest/v1/rpc/run_aiops  {"p_trace":"manual"}
→ {"ok":true,"deteccoes":9,"predicoes":2,"acoes_automaticas":9,
   "scores":{"aos":68,"rhs":96,"frs":100,"oas":100,"aps":95,"anomalias_abertas":10,"anomalias_criticas":7}}
```

## Exemplo — RCA

```json
POST /rest/v1/rpc/aiops_rca  {"p_anomaly_id": 1}
→ {"tipo":"cron_falhando","alvo":"orion_threat_tick","causa_provavel":"Job agendado retornando erro ...",
   "servico_responsavel":"orion_threat_tick","impacto_operacional":"medio","prioridade_correcao":75,
   "cadeia_dependencias":["fonte:cron","servico:orion_threat_tick","plataforma"],
   "evidencias":{"erro":"ERROR: null value in column \"entidades\" ..."}}
```
