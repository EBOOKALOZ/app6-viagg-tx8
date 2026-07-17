# ORION Security Ecosystem (AI-40 … AI-49)

O **AI-40 Cyber Defense** inaugura a camada de segurança do ORION e serve de **base comum** para os demais módulos de segurança: centraliza **eventos**, **pontuações de risco**, **evidências** e **auditoria**, evitando duplicação de lógica e garantindo uma visão unificada da postura de segurança.

## Roadmap

| # | Módulo | Papel | Status |
|---|---|---|---|
| **AI-40** | **Cyber Defense** | detecção e resposta inicial (base do ecossistema) | 🟢 v1.0 (2026-07-17) |
| **AI-41** | **Fraud Detection** | fraudes operacionais e financeiras (17 detectores com evidência; FS/FR/FT/FC; `/admin/orion-fraud`) | 🟢 v1.0 (2026-07-17) |
| AI-42 | Identity & Access | identidade e privilégios | ⚪ previsto |
| AI-43 | Threat Intelligence | correlação de ameaças | ⚪ previsto |
| AI-44 | Security Audit | auditoria contínua | ⚪ previsto |
| AI-45 | Incident Response | coordenação de incidentes | ⚪ previsto |
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

## Relação AI-24 × AI-40

- **AI-24 Security AI** — consultivo: anomalias/fraude/abuso, alertas explicáveis por hora (tick :37). Não bloqueia.
- **AI-40 Cyber Defense** — operacional: detecção incremental multi-vetor (web/auth/API/IA/bots/DDoS/fraude), base do ecossistema, com **resposta** proporcional sob política. Complementares; sem sobreposição de tabelas/rotas.
