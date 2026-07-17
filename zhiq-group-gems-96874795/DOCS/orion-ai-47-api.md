# ORION-AI-47 — Zero Trust AI · API

> RPCs Postgres via PostgREST (`POST /rest/v1/rpc/<funcao>`), JWT Supabase.
> Painéis exigem admin (`mp_is_admin()`); a porta de avaliação aceita o próprio usuário.

## Porta oficial de decisão

### `zero_trust_evaluate(p_user_id uuid, p_session_id uuid = null, p_device_id text = null, p_modulo text = 'geral', p_acao text = 'acesso', p_origem text = 'rpc') → jsonb`
Retorna `decisao` (`permitir | permitir_monitorado | reautenticar | exigir_mfa |
aprovacao_admin | bloqueio_temporario | negar`), `justificativa`, `decision_id`,
os 5 scores (ZTS/CAS/DAS/SAS/RCS), `politica`, `excecao_ativa` e `evidencias`
(componentes + fórmulas + contexto). Identidade desconhecida → `negar`.
Guarda: admin/service **ou `auth.uid() = p_user_id`**.
Toda chamada grava decisão (imutável) + evidência no cofre + evento no bus.

## Motor (tick; executáveis por admin)

- `zerotrust_context_refresh() → int` — horário habitual (histograma 30d),
  frequência, mudança brusca, permissão alterada 7d.
- `zerotrust_risk_refresh() → int` — risco acumulado por usuário (AI-40/41/42
  + plataforma AI-43/44; AI-45/46 dinâmicos).
- `zerotrust_sessions_evaluate() → int` — SAS/estado por sessão ativa + decisões
  contínuas (dedupe diário).
- `zerotrust_devices_evaluate() → int` — DAS/estado por dispositivo.
- `zerotrust_alerts() → int` — 6 alertas automáticos (idempotentes/dia).
- `zerotrust_statistics_rollup() → void` — estatística diária + ZTG.
- `orion_zero_trust_tick() → void` — orquestra tudo (pg_cron `*/2`).

## Ações administrativas (auditadas)

- `zerotrust_policy_set(p_policy_key, p_limiar_permitir?, p_limiar_monitorar?,
  p_limiar_reautenticar?, p_limiar_mfa?, p_limiar_aprovacao?, p_limiar_bloqueio?,
  p_ativa?, p_excecao_ate?, p_excecao_motivo?, p_motivo?) → jsonb` — altera
  política com antes/depois no cofre; retorno traz os dois estados (**rollback
  lógico = reaplicar o "antes"**). Exceção temporária = prazo + motivo.
- `zerotrust_decision_rollback(p_decision_id, p_motivo?) → jsonb` — revoga
  decisão via **linha compensatória** (recusa rollback duplo; nada é apagado).

## Testes — COMANDO TESTE

- `zerotrust_selftest() → jsonb` — 13 testes com evidência (relatório no cofre
  `ref_tipo='teste'`). Entrada do COMANDO TESTE (convenção de selftests por
  módulo). Guarda admin/service.
- `zerotrust_map_decision(p_rcs int, p_policy_key text) → text` — mapeamento
  puro RCS→decisão (usado pelo engine e pelos testes).

## Painéis (admin)

- `zerotrust_overview() → jsonb` — ZTG, ZTS/RCS médios, decisões/min, permitidas/
  negadas/autenticações hoje, sessões monitoradas/bloqueio recomendado,
  dispositivos confiáveis/em risco, usuários de risco, políticas/exceções.
- `zerotrust_panel(p_secao) → jsonb` — `sessoes | dispositivos | politicas |
  decisoes | riscos | evidencias | estatisticas | config`.
- `zerotrust_metrics()` · `zerotrust_summary()` (inclui lacunas declaradas) ·
  `zerotrust_dashboard()` (summary + emite `zerotrust.score` no bus).

## Eventos no bus (`orion_eventos`, origem `zero_trust`)

`zerotrust.decisao` · `zerotrust.politica` · `zerotrust.rollback` ·
`zerotrust.selftest` · `zerotrust.score`.

## Prompts (Gateway AI-00 · `gpt-5-mini`)

`zerotrust.evaluate` · `zerotrust.policy` · `zerotrust.session` ·
`zerotrust.risk` · `zerotrust.summary`.

## Segurança

- 8 tabelas com RLS admin-read; `REVOKE ALL` + `GRANT SELECT` (default grants
  davam TRUNCATE — travado; provado no selftest T3).
- Decisões e evidências imutáveis para clientes; mutação só por funções
  `SECURITY DEFINER` guardadas.
- Nenhuma permissão concedida por confiança prévia: sem perfil de identidade →
  negar (selftest T9).
