# ORION Security Ecosystem (AI-40 … AI-49)

O **AI-40 Cyber Defense** inaugura a camada de segurança do ORION e serve de **base comum** para os demais módulos de segurança: centraliza **eventos**, **pontuações de risco**, **evidências** e **auditoria**, evitando duplicação de lógica e garantindo uma visão unificada da postura de segurança.

## Roadmap

| # | Módulo | Papel | Status |
|---|---|---|---|
| **AI-40** | **Cyber Defense** | detecção e resposta inicial (base do ecossistema) | 🟢 v1.0 (2026-07-17) |
| **AI-41** | **Fraud Detection** | fraudes operacionais e financeiras (17 detectores com evidência; FS/FR/FT/FC; `/admin/orion-fraud`) | 🟢 v1.0 (2026-07-17) |
| **AI-42** | **Identity & Access** | identidade, sessões, dispositivos e políticas (IS/ATS/SRS/DCS; `/admin/orion-identity`) | 🟢 v1.0 (2026-07-17) |
| **AI-43** | **Threat Intelligence** | núcleo analítico: grafo de ameaças, campanhas, vulnerabilidades (TIS/CS/CRS/VIS; `/admin/orion-threat-intelligence`) | 🟢 v1.0 (2026-07-17) |
| **AI-44** | **Security Audit** | auditoria contínua de postura e conformidade (SAS/COS/CIS/ACS; `/admin/orion-security-audit`) | 🟢 v1.0 (2026-07-17) |
| **AI-45** | **Incident Response** | resposta a incidentes: playbooks + timeline + rollback (IRS/ICS/RTS/Recovery; `/admin/orion-incident-response`) | 🟢 v1.0 (2026-07-17) |
| AI-46 | Backup & Disaster Recovery | continuidade | ⚪ previsto |
| AI-47 | Zero Trust | políticas adaptativas | ⚪ previsto |
| AI-48 | Compliance & LGPD | conformidade | ⚪ previsto |
| AI-49 | SOC Commander | visão executiva do ecossistema | ⚪ previsto |

## Contrato compartilhado (fundação do AI-40)

Os módulos AI-41..AI-49 **reutilizam** as tabelas e RPCs do AI-40 em vez de recriar lógica:

- **Eventos:** `orion_cyber_events` (append-only/imutável, dedupe, evidência obrigatória). Qualquer módulo de segurança registra aqui seu tipo — a tabela aceita novas categorias.
- **Scores:** `cyber_scores()` (TS/RS/SH/AC) é a referência de pontuação de risco.
- **Alertas:** `orion_cyber_alerts` (1/categoria/entidade/dia), priorizados e explicáveis.
- **Ações:** `orion_cyber_actions` (auditoria imutável) + `cyber_record_action`/`cyber_block_entity`/`cyber_rollback_block`.
- **Política:** `orion_cyber_policies` (modo + `critico`) — ação crítica nunca executa sozinha.
- **Barramento:** `orion_eventos` origem `cyber_defense` (`cyber.scan`/`cyber.alert`/`cyber.action`).

## Princípios congelados

1. **Evidência obrigatória** — nenhuma detecção sem evidência; lacunas (IP/WAF/geo) são **declaradas**, nunca inventadas.
2. **Nunca bloqueia sozinho** — resposta ativa exige política + aprovação; toda ação é **reversível** (rollback).
3. **Auditoria imutável** — events/actions sem UPDATE/DELETE direto.
4. **Anti-colisão** — namespace próprio por módulo; o AI-40 (`orion_cyber_*`, chave `cyber_defense`) **não toca** o AI-24 Security AI (`orion_security_*`, `sec_*`, chave `security`), que permanece como camada consultiva de anomalia/fraude/abuso.
5. **IA só via Gateway** (AI-00) + Prompt Registry.

## AI-41 no ecossistema (2026-07-17)

O AI-41 tem namespace próprio (`orion_fraud_*`, funções `fraud_*`/`detect_fraud`,
chave `fraud_detection`, tick `*/2`) e **honra o contrato compartilhado** via
`fraud_bridge_cyber()`: todo caso **alta/crítica** ativo é espelhado em
`orion_cyber_events` (origem `fraud_detection`, dedupe `fraud:<id>`, idempotente e
defensivo). Detalhes: `DOCS/orion-ai-41-fraud-detection.md`.

## AI-43 no ecossistema (2026-07-17) — camada de inteligência

O AI-43 é o **núcleo analítico**: não gera eventos, **correlaciona** os que o AI-40
(ataques), AI-41 (fraude) e AI-42 (identidade) já colocam no barramento comum
`orion_cyber_events`, mais `auth.audit_log_entries`. Constrói o **grafo de ameaças**
(`orion_security_graph` nós + `orion_threat_correlations` arestas, sempre com evidência),
detecta **campanhas** (`orion_threat_campaigns`), correlaciona **vulnerabilidades**
(`orion_vulnerability_events`) e prepara o encaminhamento ao **AI-45 (Incident Response)**
e ao **AI-49 (SOC Commander)**. Scores TIS/CS/CRS/VIS + MTTC/TRR; namespace `orion_threat_*`,
chave `threat_intelligence`, tick `*/3`. Detalhes: `DOCS/orion-ai-43-threat-intelligence.md`.

## AI-44 no ecossistema (2026-07-17) — o auditor da postura

O AI-44 fecha o ciclo: **audita continuamente a postura de segurança** que os outros
produzem e a configuração da plataforma (RLS, grants, funções, cron, identidade)
contra **baseline aprovada** + **compliance**. Namespace próprio (`orion_secaudit_*`,
funções `secaudit_*`/`run_security_audit`, chave `security_audit`, tick `*/15`) e
**honra o contrato compartilhado**: todo finding crítico/alto é espelhado em
`orion_cyber_events` (origem `security_audit`, tipo `config_risk`, dedupe
`secaudit:<key>:<dia>`) — que o **AI-43 correlaciona** e o futuro **AI-45** consumirá
(handoff já emitido no barramento como `secaudit.handoff_ai45`). Findings fecham
sozinhos quando a evidência some (FRR real). **NUNCA altera o ambiente.**
Detalhes: `DOCS/orion-ai-44-security-audit.md`.

Ciclo completo do ecossistema: **AI-40** detecta ataques → **AI-41** detecta fraudes →
**AI-42** controla identidade/acesso → **AI-43** correlaciona ameaças e campanhas →
**AI-44** audita a postura e a conformidade de tudo.

## AI-45 no ecossistema (2026-07-17) — a resposta que fecha o funil

O AI-45 consome a **base comum** (`orion_cyber_events`, com espelhos dos AI-41/42/44)
e as **campanhas** do AI-43, e transforma cada sinal alto/crítico em **incidente**
com classificação explicável, playbook auditável, timeline e evidências imutáveis.
Namespace próprio (`orion_incident_*`, chave `incident_response`, tick `*/2`).
**Honra o contrato**: nunca bloqueia por conta própria — invoca `cyber_block_entity`
(AI-40) e `identity_device_block` (AI-42), cujas políticas decidem; negado →
`aguardando_humano`. Rollback lógico reverte pela RPC do módulo dono e preserva o
histórico. Fecha sozinho quando a fonte resolve; reincidência reabre. Suite
`incident_selftest()` (17 checks) = entrada oficial do COMANDO TESTE.
Detalhes: `DOCS/orion-ai-45-incident-response.md`.

Ciclo COMPLETO do ecossistema: **AI-40** detecta → **AI-41** fraudes → **AI-42**
identidade → **AI-43** correlaciona → **AI-44** audita → **AI-45 responde**.

## Relação AI-24 × AI-40

- **AI-24 Security AI** — consultivo: anomalias/fraude/abuso, alertas explicáveis por hora (tick :37). Não bloqueia.
- **AI-40 Cyber Defense** — operacional: detecção incremental multi-vetor (web/auth/API/IA/bots/DDoS/fraude), base do ecossistema, com **resposta** proporcional sob política. Complementares; sem sobreposição de tabelas/rotas.
