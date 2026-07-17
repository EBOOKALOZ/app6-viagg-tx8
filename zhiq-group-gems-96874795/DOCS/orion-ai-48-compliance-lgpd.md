# ORION-AI-48 — Compliance & LGPD AI v1.0

**Missão:** centro de governança de privacidade da Viagg-TX8 — monitora conformidade LGPD e políticas internas com evidência auditável. **NUNCA modifica dados pessoais** (exclusão/anonimização é execução humana registrada) e **NUNCA expõe dado sensível** nos painéis (só contagens/ids).

**Chave:** `compliance_lgpd` · **Painel:** `/admin/orion-compliance` (badge **COMPLIANCE**) · **Modelo:** gpt-5-mini · **Cron:** `orion_compliance_tick` a cada 15 min

## Estrutura (8 tabelas)

`orion_compliance_controls` (10 controles verificados automaticamente) · `orion_lgpd_requests` (direitos do titular, prazo 15d art.19) · `orion_data_processing_registry` (registro de tratamento art.37 — 9 atividades REAIS com base legal/finalidade/retenção/tabelas) · `orion_data_retention` (política vs idade REAL medida; exceção legal p/ trilhas imutáveis) · `orion_privacy_incidents` (dedupe; auto-resolve quando evidência some) · `orion_compliance_evidence` (append-only, NUNCA excluída) · `orion_compliance_statistics` · `orion_compliance_alerts` (1/categoria/chave/dia).

## Motor `run_compliance_check()` (idempotente)

1. **Controles** com verificação real: RLS em profiles, anon sem leitura de PII, consentimento registrado (profiles.terms_accepted + motoboy_terms_acceptance), trilhas imutáveis e MFA **lidos do AI-44** (nunca recalcula), AI-45/46/47 presentes, registro de tratamento completo; DPO = declarado.
2. **Retenção** medida nos dados reais (client_errors/orion_ai_log/auth.sessions/notificacoes/auth_audit).
3. **Solicitações** vencidas marcadas + alerta.
4. **Incidentes de privacidade** (dedupe/dia): PII sem RLS (exposicao crítica), sinais de identidade AI-42 (acesso_indevido), atividade sem base legal — com auto-resolve por evidência.
5. **PONTE AI-45**: alta/crítica → `orion_cyber_events` (origem `compliance_lgpd`, tipo `privacy_incident`) — o Incident Response ingere e responde (categoria `config_insegura`).
6. Alertas + evidência + rollup diário com scores.

## Scores (explicáveis; DRS/PRS são RISCO — menor é melhor)

**CPS** = (conformes+0,5·declarados)/controles · **LCS** = idem só categoria lgpd · **DRS** = 40·incid.críticos + 15·abertos + 10·retenção vencida · **PRS** = 30·críticos + 10·abertos + 20·solicitações vencidas + 5·retenção.

## Direitos do titular

`lgpd_request_open(tipo, user?, detalhes)` (acesso/correção/exclusão/anonimização/portabilidade/revogação/oposição) e `lgpd_request_update(id, status, nota)` — todo o ciclo vira evidência. Canal externo do titular = LACUNA DECLARADA (hoje registro via admin).

## COMANDO TESTE

`SELECT compliance_selftest()` — 14 checks (ciclo da solicitação, evidências, motor, controles, retenção, registry, scores, imutabilidade, RLS, cron). **14/14 na homologação.**

## 1ª verificação real (2026-07-17)

CPS 75 · LCS 50 · DRS 65 · PRS 45. Achados genuínos: consentimento incompleto (motoboy aceites vazios), MFA ausente (via AI-44), **2 tabelas PII sem RLS → incidente crítico encaminhado ao AI-45 (virou incidente #23)**, auth.sessions 59d > política 30d. Lacunas declaradas: DPO, RIPD/DPIA, canal externo do titular, exportação de portabilidade.
