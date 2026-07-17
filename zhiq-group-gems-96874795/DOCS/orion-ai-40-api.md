# ORION-AI-40 — API / RPCs (Cyber Defense)

Todas as funções são `SECURITY DEFINER` com guarda (`admin` via `mp_is_admin()` ou `service_role`/`postgres`). Chamada no front via `supabase.rpc(<fn>, args)`. As rotas REST `/api/security/*` do spec são servidas por estas RPCs (o front consome via PostgREST/`supabase-js`).

## Motor
| RPC | Args | Retorno | REST equivalente |
|---|---|---|---|
| `detect_security_threats` | `p_trace text` | `{ok, eventos, alertas, dia, trace}` | `POST /api/security/threats` |
| `orion_cyber_tick` | — | void (chama o motor) | (cron) |

## Leitura / dashboard
| RPC | Retorno | REST |
|---|---|---|
| `cyber_dashboard` | agrega tudo (15 seções) | `GET /api/security` |
| `cyber_overview` | scores + situação | `GET /api/security` |
| `cyber_scores` | TS/RS/SH/AC + fórmula + base | — |
| `cyber_attacks` | por tipo/severidade/módulo (7d) | `GET /api/security/events` |
| `cyber_realtime` | últimos 25 + críticos | `GET /api/security/events` |
| `cyber_map` | origem por cidade (declarado) | — |
| `cyber_ip_intelligence` | IPs bloqueados (declarado) | `GET /api/security/blocked` |
| `cyber_users` | auth suspeita + visitantes bot | — |
| `cyber_apis` | gateway por módulo, endpoints, latência | — |
| `cyber_ai_threats` | eventos de IA + flood de tokens | — |
| `cyber_kpis` | scores + FPR/MTTD/MTTR | `GET /api/security/statistics` |
| `cyber_alerts_list` | alertas 14d priorizados | `GET /api/security/alerts` |
| `cyber_blocked` | bloqueios (100) | `GET /api/security/blocked` |
| `cyber_statistics_list` | 30 dias de rollup | `GET /api/security/statistics` |
| `cyber_actions_list` | auditoria (100) | — |
| `cyber_policies_list` | políticas por categoria | — |
| `cyber_explain` | `p_event_id bigint` → evento p/ IA | `GET /api/security/explain` |
| `cyber_summary` | contexto compacto p/ IA | — |

## Ações (auditadas, sob política, reversíveis)
| RPC | Args | Efeito |
|---|---|---|
| `cyber_record_action` | acao, alvo, motivo, politica, resultado, evidencias, ref_event | registra na auditoria imutável |
| `cyber_block_entity` | tipo, valor, motivo, categoria, minutos, evidencias, ref_event | bloqueio temporário; nega se categoria crítica sem aprovação |
| `cyber_rollback_block` | block_id | reverte bloqueio + marca ação revertida |
| `cyber_set_event_status` | event_id, status | novo/investigando/mitigado/falso_positivo/resolvido |
| `cyber_resolve_alert` | alert_id, responsavel | resolve alerta |
| `cyber_set_policy` | categoria, modo, limiar, monitorado, critico | upsert de política |

## Edge Function
`POST /functions/v1/cyber-defense-engine` — invoca `detect_security_threats()` com service role. Idempotente (dedupe). **DEPLOYADA e ATIVA** (2026-07-17, verify_jwt=false). A detecção contínua roda no banco: pg_cron `orion_cyber_tick` a cada 1 minuto; a edge serve a disparo manual/scheduler externo.

## Códigos de erro esperados (sonda)
- `PGRST202` → função não existe (migration não aplicada).
- `42501 permission denied for function` → existe, guarda funcionando (chamada anon).
- Bloqueio negado → `P0001 bloqueio negado: categoria X e critica e a politica exige aprovacao`.
