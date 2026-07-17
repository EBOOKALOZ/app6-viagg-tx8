# ORION-AI-45 — API (Incident Response)

Escritas só por RPC `SECURITY DEFINER` com guarda admin/service (`incident_guard`). Leituras gated por RLS `mp_is_admin()`; `anon` não lê nada. Helpers internos (`incident_open/notify/timeline_add/evidence_add/action_add/emit`) sem EXECUTE público — só o motor DEFINER os usa.

## Motor

### `respond_to_incidents(p_trace text default null) → jsonb`
Ciclo completo: ingestão incremental (watermark `orion_incident_state`; nunca reprocessa) das fontes reais → abre/reabre incidentes (dedupe `cyber:<event_id>` / `campanha:<id>`; reincidência++) → classifica → executa playbook → fecha os cuja fonte resolveu → estatísticas → notificações. Retorna `{ok, trace, processados, resolvidos, playbooks, ativos}`.

### `incident_run_playbook(p_incident bigint) → jsonb`
Executa o playbook da categoria. Passos seguros rodam sozinhos; bloqueios invocam `cyber_block_entity` (AI-40) / `identity_device_block` (AI-42) — **a política deles decide**; negado → `aguardando_humano`. Passos não implementáveis registram ação `declarada`.

## Ações humanas (auditadas)

- `incident_resolve(p_id, p_nota)` / `incident_close(p_id, p_conclusao)` (só resolvido fecha) 
- `incident_assign(p_id, p_responsavel, p_papel)`
- `incident_rollback_action(p_action_id)` — reverte via RPC do módulo dono; histórico preservado
- `incident_ack_notification(p_notif_id uuid)` — confirmação de leitura (lida=true + timeline)
- `incident_playbook_set(p_categoria, p_passos?, p_automatico?, p_ativo?)`

## Leituras

- `incident_dashboard()` — kpis/ativos/criticos/playbooks/statistics/notificacoes/atualizado_em
- `incident_search(p_filtros jsonb)` — user_id, categoria, severidade, status, modulo, trace, device_id, de/ate, texto (loja/sessão: quando presentes no `ref` — declarado)
- `incident_detail(p_id)` — incidente + timeline + ações + evidências + responsáveis
- `incident_scores()` / `incident_kpis()` — IRS/ICS/RTS/Recovery + MTTA/MTTR/auto vs humano/reincidências (fórmulas declaradas)
- `incident_summary()` — contexto compacto p/ IA

## Suite de testes (COMANDO TESTE)

`incident_selftest() → jsonb` — 17 checks com detalhe por item; `{ok, checks, falhas, detalhe[]}`. Entrada oficial e estável para o COMANDO TESTE.

## Prompts (Registry, gpt-5-mini)

`incident.classify` · `incident.respond` · `incident.summary` · `incident.timeline` · `incident.recommendation`

## Cron

`orion_incident_tick` — `*/2 * * * *` (pg_cron, ativo). Sem edge própria: o motor vive no banco; disparo manual pelo painel ("Responder agora") ou por qualquer scheduler via RPC.
