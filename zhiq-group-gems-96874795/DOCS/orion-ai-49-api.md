# ORION-AI-49 — API (RPCs)

RPCs PostgREST: `POST .../rest/v1/rpc/<funcao>` (apikey + JWT). Guarda: admin/service
— anon negado (`run_soc_commander`→P0001; tabelas→42501, sem SELECT p/ anon).

| Espec / uso | RPC | Descrição |
|---|---|---|
| Executive Dashboard | `soc_dashboard()` | payload completo (overview + healthmap + alerts + incidents + statistics + timeline + config); consolida se snapshot >3min |
| Overview / scores | `soc_overview()` | OSS/ORS/GHS/ECS + analytics + tendência (do último snapshot) |
| Mapa de Saúde | `soc_healthmap()` | 9 scorecards: estado (🟢🟡🟠🔴) + risco_dominio + métricas por IA |
| Alertas | `soc_alerts_view()` | alertas SOC (correlação entre módulos), 7 dias |
| Incidentes | `soc_incidents_view()` | visão consolidada (referência ao módulo dono) |
| Timeline Global | `soc_timeline(modulo?, desde?, limite?)` | union do barramento das 9 origens + SOC, com filtros |
| Estatísticas / Analytics | `soc_statistics_view()` + `soc_analytics()` | série 14d + MTTD/MTTR/MTTC/RPO/RTO |
| Relatórios | `soc_report(tipo)` | diario/semanal/mensal (executivo consolidado) |
| Config | `soc_config_view()` | cron, modelo, módulos coordenados, playbooks |

## Motor / escrita (admin/service)

| RPC | Efeito |
|---|---|
| `run_soc_commander(p_trace?)` | consolida 9 módulos → snapshot + evidência → alertas SOC → stats. Retorna scores + alertas |
| `soc_consolidate()` | scorecards dos 9 módulos (read-only, defensivo por módulo) |
| `soc_scores(cards)` | OSS/ORS/GHS/ECS a partir dos scorecards |
| `soc_register_decision(titulo, contexto, decisao, baseado_em?)` | decisão executiva auditável (aponta evidência) |
| `soc_selftest()` | suíte de 8 testes (COMANDO TESTE) |
| `orion_soc_tick()` | cron `*/2` |

## Exemplo — `run_soc_commander`

```json
POST /rest/v1/rpc/run_soc_commander  {"p_trace":"manual"}
→ {"ok":true,"snapshot":3,
   "scores":{"oss":59,"ors":100,"ghs":67,"ecs":93,"risco_dominio_medio":55,
             "modulos_operacionais":6,"modulos_total":9,"criticos_totais":30},
   "alertas_soc":3}
```

## Exemplo — mapa de saúde (`soc_healthmap`)

```json
[{"ai":"AI-40","nome":"Cyber Defense","estado":"operacional","saude":100,
  "risco_dominio":100,"risco_label":"critico","cron_ativo":true,"abertos":36,"criticos":20,
  "ultimo_evento_min":0,"metricas":{"alertas_abertos":16,"eventos_criticos_abertos":20}}, ...]
```

`estado` = saúde operacional da IA; `risco_dominio`/`risco_label` = risco que a IA vigia
(separados por design). O SOC **nunca** altera as decisões do módulo — só consolida.
