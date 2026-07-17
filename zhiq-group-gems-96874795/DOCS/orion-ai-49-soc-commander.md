# ORION-AI-49 — SOC Commander AI v1.0

> **Centro executivo de comando do ORION Security Ecosystem.** Fecha a série AI-40..49.
> Chave: **`soc_commander`**. Painel: **`/admin/orion-soc`** (badge SOC COMMANDER). Tick: **pg_cron `*/2`**.

## Missão

Atuar como o **SOC (Security Operations Center)** da Viagg-TX8: coordenar, consolidar,
priorizar e supervisionar todo o ecossistema de segurança. **NÃO substitui nem altera
as decisões dos módulos especializados** — é uma camada de consolidação e inteligência
executiva **read-only**. Toda recomendação aponta evidência; toda ação é auditável.

## O que consolida (9 módulos, tudo LEITURA)

| Módulo | Fonte real consolidada |
|---|---|
| AI-40 Cyber Defense | `orion_cyber_alerts` (não resolvidos) + `orion_cyber_events` (críticos abertos) |
| AI-41 Fraud Detection | `orion_fraud_events` (status/severity) |
| AI-42 Identity & Access | atividade no barramento `orion_eventos` origem identity_access |
| AI-43 Threat Intelligence | `orion_threat_campaigns` + `orion_vulnerability_events` + `orion_threat_statistics` (MTTC) |
| AI-44 Security Audit | `orion_secaudit_findings` (não corrigidos, criticidade) |
| AI-45 Incident Response | `orion_incidents` (status/severidade/aberto→resolvido = MTTR) |
| AI-46 Backup & DR | `orion_backup_statistics` (CRI/RPO/RTO) + `orion_backup_alerts` |
| AI-47 Zero Trust | `orion_zero_trust_decisions` + `orion_zero_trust_risk` |
| AI-48 Compliance & LGPD | `orion_compliance_alerts` + `orion_compliance_statistics` (CPS) + `orion_lgpd_requests` |

Saúde de cada IA: **`cron.job.active`** + **frescor do barramento** por origem. Cada módulo
é lido em **bloco defensivo** — se estiver ausente/quebrado, vira `indisponivel` (DECLARADO)
sem derrubar a consolidação.

## Princípio: agregação pura (AI-12/AI-22)

O tick `run_soc_commander()` consolida num **snapshot** (`orion_soc_dashboard` + evidência
imutável). O painel lê o **último snapshot** — nada é recalculado na leitura. `soc_dashboard()`
consolida sob demanda só se o último snapshot tiver >3min.

## Saúde ≠ Risco (separação honesta)

- **Estado da IA** (mapa de saúde 🟢🟡🟠🔴): reflete se o módulo está **operando**
  (cron ativo + frescor). Um módulo que detectou 20 críticos mas está rodando = 🟢 operacional.
- **Risco do domínio** (`risco_dominio` por card): reflete o risco que aquela IA vigia
  (críticos/abertos). Alimenta o OSS/ORS — separado da saúde operacional.

## Scores executivos (explicáveis)

| Score | Fórmula |
|---|---|
| **OSS** Overall Security | 35%·média(saúde das IAs) + 65%·(100 − risco médio do domínio) |
| **ORS** Operational Risk (maior=pior) | min(Σcríticos·8 + Σabertos·1,2, 100) |
| **GHS** Global Health | % de IAs operacionais |
| **ECS** Executive Confidence | 50%·saúde + 30%·(não-indisponíveis) + 20%·cobertura(9) |

## Analytics

MTTR (de `orion_incidents`), MTTC (de `orion_threat_statistics`), RPO/RTO (de
`orion_backup_statistics`), disponibilidade (=GHS). MTTD é **declarado** como
detecção contínua (~intervalo do tick de cada módulo, 1–15min).

## Alertas de nível SOC (correlação entre módulos)

`degradacao_modulo` (IA fora do ar/estagnada), `incidentes_correlacionados` (≥5
incidentes abertos), `risco_abrupto` (ORS ≥ 60), mais gatilhos para falha de backup,
perda de conformidade e ataque em andamento. 1/tipo/dia, auto-fecham quando a IA volta.

## Timeline global

`soc_timeline(modulo?, desde?, limite?)` — union do barramento `orion_eventos` das 9
origens de segurança + o próprio SOC, com filtros.

## Decisões executivas & playbooks

`soc_register_decision()` grava decisão executiva auditável (aponta evidência) + log de
operação. 4 playbooks executivos seed (ataque, degradação, continuidade, conformidade) —
**apontam para o módulo dono; o SOC coordena, o módulo executa**.

## Tabelas (8)

`orion_soc_dashboard` (snapshots) · `orion_soc_alerts` · `orion_soc_incidents` (referência
ao dono, não duplica) · `orion_soc_operations` · `orion_soc_statistics` · `orion_soc_playbooks`
· `orion_soc_decisions` · `orion_soc_evidence` (**imutável**). RLS admin + REVOKE ALL/GRANT SELECT.

## IA (via AI-00 Gateway, `gpt-5-mini`)

`soc.executive_summary`, `soc.risk_analysis`, `soc.priority`, `soc.recommendation`, `soc.daily_report`.

## Suíte de testes (COMANDO TESTE)

`soc_selftest()` — 8 casos (consolida 9 módulos, scores válidos, snapshot, timeline,
analytics, RLS, evidências imutáveis, playbooks). Homologação: **8/8 aprovado**.

## Regra de ouro

**Nunca altera as decisões dos módulos especializados.** Só coordena, consolida e produz
inteligência executiva. Toda recomendação aponta evidência; toda decisão é auditável.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_soc_commander_ai.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionSoc.tsx` (+ rota/lazy/sidebar badge SOC COMMANDER)
- API: `DOCS/orion-ai-49-api.md` · Dashboard: `DOCS/orion-ai-49-dashboard.md` · Certificação: `DOCS/orion-ai-49-certificacao.md`
