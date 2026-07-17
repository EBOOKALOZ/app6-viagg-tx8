# ORION-AI-45 — Incident Response AI v1.0

**Missão:** responder aos incidentes do Security Ecosystem com velocidade, controle e rastreabilidade total. Transforma eventos reais em incidentes classificados, executa **playbooks auditáveis** e mantém **timeline/evidências imutáveis**. Fecha o funil oficial: AI-40 detecta → AI-41 fraudes → AI-42 identidade → AI-43 correlaciona → AI-44 audita → **AI-45 responde**.

**Chave:** `incident_response` · **Painel:** `/admin/orion-incident-response` (badge **INCIDENT**) · **Modelo:** `gpt-5-mini` (Gateway AI-00) · **Cron:** `orion_incident_tick` a cada 2 min

## Princípios inegociáveis

1. **Fontes 100% reais** — `orion_cyber_events` (base comum: ataques AI-40 + espelhos fraude AI-41 / identidade AI-42 / config_risk AI-44) e `orion_threat_campaigns` (AI-43). Nunca dados sintéticos.
2. **Nunca força uma ação** — bloqueios REUSAM as RPCs guardadas dos irmãos (`cyber_block_entity` AI-40, `identity_device_block` AI-42) e **herdam as políticas deles**; negado pela política → incidente vai a `aguardando_humano`.
3. **Toda ação tem justificativa** — log imutável em `orion_incident_actions` (executor ia/playbook/humano, resultado, reversível).
4. **Rollback preserva histórico** — `incident_rollback_action` reverte via RPC do módulo dono e marca `rolled_back`; nada se apaga.
5. **Evidência nunca se apaga** — `orion_incident_evidence` append-only (REVOKE UPDATE/DELETE).
6. **Lacunas declaradas** — exigir MFA (GoTrue sem enforcement por RPC), congelar operação financeira (dupla trava AI-21/Tesouraria), rate HTTP: passos registram ação `declarada`.

## Estrutura (9 tabelas `orion_incident_*`)

`orion_incidents` (dedupe por fonte; reincidência reabre e incrementa) · `_events` · `_actions` (imutável) · `_playbooks` (5 seeds) · `_timeline` (imutável) · `_assignments` · `_evidence` (imutável) · `_statistics` (rollup diário) · `_state` (watermark incremental — nunca reprocessa histórico).

## Classificação (explicável)

Severidade = max(severidade da fonte, faixas de score) → informativo|baixo|medio|alto|critico. **IRS** = 0.5·score_fonte + 0.3·confiança + 20·min(reincidência,2). **ICS** = confiança da fonte. **RTS** = % respondidos em <5min (resposta no mesmo tick). **Recovery** = % resolvidos/fechados (30d).

## Playbooks (seeds; config via `incident_playbook_set`)

| Categoria | Nome | Passos |
|---|---|---|
| identidade | Conta comprometida | priorizar → evidências → bloquear dispositivo (AI-42) → bloquear entidade (AI-40) → exigir MFA (declarado) → alertar |
| fraude | Resposta a fraude | priorizar → evidências → congelar operação (declarado→AI-21) → alertar → encaminhar AI-43 |
| ataque | Contenção de ataque | priorizar → evidências → bloquear entidade (AI-40) → alertar → encaminhar AI-43 |
| config_insegura | Configuração insegura | evidências → anexar finding (AI-44) → recomendar correção → alertar |
| correlacao | Campanha correlacionada | priorizar → evidências → alertar → **revisão humana** |

## Ciclo automático (tick 2 min)

Ingestão incremental (watermark) → classifica → playbook → **fecha sozinho** quando a fonte resolve no módulo de origem → detecta reincidência (reabre) → estatísticas (MTTA/MTTR/auto vs humano/por módulo/por usuário) → notificações com dedupe/dia em `notificacoes_admin` (confirmação de leitura via `incident_ack_notification` + timeline).

## Suite de testes — COMANDO TESTE

`SELECT public.incident_selftest()` — **17 checks**: abertura, classificação, IRS, timeline, evidência, assignment, ação, rollback nega não-reversível, resolução, fechamento, reincidência reabre, 4× imutabilidade/RLS, playbooks seed, cron. Categoria `selftest` fica fora das estatísticas; o registro permanece (evidência nunca se apaga).

## Estado na 1ª execução (2026-07-17)

O cron respondeu **sozinho** antes da homologação manual: **19 incidentes reais** (17 eventos + 2 campanhas), 19 playbooks executados, 73 ações automáticas, 117 lances de timeline, 49 evidências, 21 notificações. 2 campanhas críticas em `aguardando_humano` (como manda o playbook). Zero bloqueios indevidos. Detalhes: `orion-ai-45-certificacao.md`.
