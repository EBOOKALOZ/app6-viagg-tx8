# ORION-AI-46 — API (RPCs)

RPCs PostgREST: `POST .../rest/v1/rpc/<funcao>` (apikey + JWT). Guarda: admin/service
— anon negado (`run_backup_recovery`→P0001; tabelas→42501, sem SELECT p/ anon).

Mapa espec → RPC:

| Espec | RPC | Descrição |
|---|---|---|
| `/api/backup` | `backup_dashboard()` | payload completo (overview + catalog + restore + plans + alerts + history + statistics + config) |
| `/api/backup/catalog` | `backup_catalog_view()` | catálogo de pontos de backup por componente |
| `/api/backup/restore` | `backup_restore_view()` | último teste + histórico + integridade (checksums por categoria) |
| `/api/backup/plans` | `backup_plans_view()` | planos de recuperação + eventos DR |
| `/api/backup/alerts` | `backup_alerts_view()` | alertas de continuidade (7 dias) |
| `/api/backup/statistics` | `backup_statistics_view()` | série diária BRS/RRS/DIS/CRI + RPO/RTO |
| `/api/backup/scores` | `backup_scores()` + `backup_cri()` | BRS/RRS/DIS/CRI + RPO/RTO + cobertura |

## Motor / escrita (auditados, admin/service)

| RPC | Efeito |
|---|---|
| `run_backup_recovery(p_trace?)` | snapshot → restore test → alertas → stats (retorna BRS/RRS/DIS/CRI) |
| `backup_snapshot(p_trace?)` | manifesto de schema + evidências md5 + drift |
| `backup_sync_catalog(p_state jsonb)` | ingere estado real da Management API (walg/pitr/backups[]) |
| `backup_validate_integrity()` | compara 2 últimos manifestos por categoria |
| `backup_restore_test()` | validação NÃO-destrutiva (6 casos) + RTO estimado |
| `backup_generate_alerts()` | alertas + espelho `orion_cyber_events` + handoff AI-45 |
| `backup_request_recovery(plan_id, motivo)` | solicita restauração (pendente_aprovacao) |
| `backup_approve_recovery(event_id, aprovar, motivo?)` | aprova/nega — **não executa restore** |
| `backup_selftest()` | suíte de 8 testes automatizados (COMANDO TESTE) |
| `orion_backup_tick()` | cron `*/15` |

## Exemplo — `run_backup_recovery`

```json
POST /rest/v1/rpc/run_backup_recovery  {"p_trace":"manual"}
→ {"ok":true,"brs":80,"rrs":53,"dis":30,"cri":67}
```

## Exemplo — sincronizar catálogo com a Management API

```json
POST /rest/v1/rpc/backup_sync_catalog
  {"p_state": {"walg_enabled": true, "pitr_enabled": false, "backups": []}}
→ {"ok":true,"componentes":5,"walg":true,"pitr":false}
```

O `p_state` é o corpo de `GET /v1/projects/{ref}/database/backups` da Management API.
Sync contínuo = edge com token de gestão (secret); o motor DB só valida o catálogo.
