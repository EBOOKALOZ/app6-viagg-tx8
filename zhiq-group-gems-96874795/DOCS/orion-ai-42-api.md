# ORION-AI-42 — Identity & Access AI · API

> Todas as portas são **RPCs Postgres** expostas via PostgREST
> (`POST /rest/v1/rpc/<funcao>`), autenticadas com JWT do Supabase.
> Convenção do ORION: sem HTTP extra — o "endpoint" é a RPC (equivalências
> `/api/identity/*` abaixo). Painéis exigem admin (`mp_is_admin()`).

## Mapa API → RPC

| API lógica | RPC | Guarda |
|---|---|---|
| `/api/identity` | `identity_dashboard()` / `identity_summary()` | admin |
| `/api/identity/profile` | `identity_panel('identidade')` · `validate_identity(user, sessão?, device?)` | admin · admin/service/próprio usuário |
| `/api/identity/sessions` | `identity_panel('sessoes')` | admin |
| `/api/identity/devices` | `identity_panel('dispositivos')` · `identity_device_block/unblock` | admin |
| `/api/identity/events` | `identity_panel('eventos')` · `identity_mark` | admin |
| `/api/identity/policies` | `identity_panel('politicas')` · `identity_policy_set` | admin |
| `/api/identity/explain` | AI-00 Gateway com prompts `identity.*` (gpt-5-mini) | conforme Gateway |

## RPCs

### `validate_identity(p_user_id uuid, p_session_id uuid = null, p_device_id text = null) → jsonb`
Porta oficial de validação. Retorna `identity_score` (IS), `access_trust_score`
(ATS), `session_risk_score` (SRS), `device_confidence_score` (DCS), nível,
status, `dispositivo_bloqueado`, `evidencias` (componentes+pesos+fonte),
`acao_recomendada` (`permitir | reautenticacao | exigir_mfa | revisao_manual |
validacao_adicional | negar_acesso`) e `politica_aplicada`.
Guarda: admin/service **ou `auth.uid() = p_user_id`** (o usuário valida a própria identidade).

### Motor (chamadas pelo tick; também executáveis por admin)
- `identity_ingest_audit() → int` — ingere auditoria GoTrue (30d, dedupe `audit:<id>`;
  token_refreshed/revoked ficam de fora do ingest e são agregados pelo detector T6).
- `identity_sync_sessions() → int` — espelha `auth.sessions`, deriva dispositivos,
  calcula SRS/DCS, encerra sessões ausentes.
- `identity_detect() → int` — detectores T1..T9 (ver doc principal).
- `identity_sync_profiles() → int` — IS/ATS por usuário + diff de permissões.
- `identity_respond() → jsonb` — política `identity_politica_v1`: resposta,
  alerta, ponte AI-40.
- `identity_statistics_rollup() → void` — estatística diária (IS/ATS/SRS/DCS/MAR/III).
- `orion_identity_tick() → void` — orquestra tudo (pg_cron `*/2`).

### Ações humanas (auditadas)
- `identity_mark(p_event_id bigint, p_status text, p_motivo text = null) → jsonb` —
  `em_analise | confirmada | falso_positivo | resolvida`; gera evento `marcacao_humana`.
- `identity_device_block(p_device_id text, p_motivo text = null) → jsonb` — DCS→0,
  evento `dispositivo_bloqueado`; **reversível** por
  `identity_device_unblock(p_device_id, p_motivo)`.
- `identity_policy_set(p_policy_key text, p_min_score int = null, p_mfa bool = null,
  p_ativa bool = null, p_acao text = null, p_motivo text = null) → jsonb` —
  altera política com **antes/depois** na trilha (`politica_alterada`);
  rollback = reaplicar os valores de antes (retornados na resposta).

### Painéis (admin)
- `identity_overview() → jsonb` — IS/ATS/SRS/DCS médios, III, MAR, sessões
  ativas/risco alto, MFA hoje, dispositivos (+bloqueados), logins/tentativas hoje,
  usuários confiáveis/observação/bloqueados, eventos abertos.
- `identity_panel(p_secao text) → jsonb` — `sessoes | dispositivos | identidade |
  admin | eventos | politicas`.
- `identity_metrics() → jsonb` — contagens por tabela + estatísticas 7d + bus.
- `identity_summary() → jsonb` — overview + 6 seções + metrics + lacunas declaradas.
- `identity_dashboard() → jsonb` — summary + emite `identity.score` no bus.

## Eventos no bus (`orion_eventos`, origem `identity_access`)

`identity.respond` · `identity.mark` · `identity.device_block` ·
`identity.policy_set` · `identity.score`.

## Prompts (AI-00 Gateway · `gpt-5-mini` · Prompt Registry)

| Chave | Uso |
|---|---|
| `identity.explain_suspicious` | explicar acesso suspeito (evidências) |
| `identity.explain_block` | explicar bloqueio recomendado/aplicado |
| `identity.explain_mfa` | explicar exigência/recomendação de MFA |
| `identity.explain_trust_change` | explicar mudança de confiança (antes/depois) |
| `identity.report` | relatório executivo de identidade |

## Segurança

- 6 tabelas com RLS admin-read; `REVOKE ALL` + `GRANT SELECT` (default grants do
  projeto davam TRUNCATE — travado).
- Funções `SECURITY DEFINER` com guarda explícita (admin/service; validate também
  aceita o próprio usuário).
- Eventos append-only para clientes; mutações só por funções auditadas.
- Zero escrita fora de `orion_identity_*`/`orion_access_*`/`orion_devices` +
  bus/alertas/ponte cyber. Nenhum trigger em tabela core.
