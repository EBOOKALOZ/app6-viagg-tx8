# ORION-AI-44 — Security Audit AI v1.0

**Missão:** auditoria contínua da postura de segurança e conformidade da VIAGG-TX8. Observa, evidencia e recomenda — **NUNCA modifica o ambiente**. Toda conclusão tem evidência real; o que não é auditável do SQL é **declarado**, nunca inventado.

**Chave:** `security_audit` · **Painel:** `/admin/orion-security-audit` (badge **AUDIT**) · **Modelo:** `gpt-5-mini` (via Gateway AI-00) · **Cron:** `orion_secaudit_tick` a cada 15 min + edge `security-audit-engine` (deployada; disparo manual/externo)

## Anti-colisão (mapa spec→real)

| Spec pedia | Real (namespace próprio) |
|---|---|
| `orion_security_audits` | `orion_secaudit_audits` |
| `orion_security_findings` | `orion_secaudit_findings` |
| `orion_security_compliance` | `orion_secaudit_compliance` |
| `orion_security_baseline` | `orion_secaudit_baseline` |
| `orion_security_history` | `orion_secaudit_history` |

`orion_security_*` pertence ao **AI-24** (alerts/config) — não tocado. **OCE** certifica qualidade de módulos ORION; o AI-44 audita **postura de segurança** da plataforma — sem sobreposição. `orion_ai_audit` é do AI-38 (governança de IA) — distinto.

## O que audita (9 categorias, evidência real)

1. **banco_rls** — tabelas sem RLS (total + sensíveis pay_*/profiles/credit%/wallet), RLS sem policy (deny-all suspeito).
2. **banco_funcoes** — SECURITY DEFINER sem `search_path` fixo (hijack de schema).
3. **banco_grants** — escrita para `anon`, TRUNCATE para `authenticated` (default grants; TRUNCATE ignora RLS — armadilha real do AI-41).
4. **banco_objetos** — objetos `tmp_*`/`debug_*` em produção; tabelas grandes dominadas por seq scan (índice crítico ausente).
5. **apis** — funções públicas executáveis por `anon` (superfície PostgREST), erros recorrentes (`client_errors`), erros/latência do Gateway; WAF/rate-limit HTTP **declarados**.
6. **edge** — saúde visível pelo banco (`orion_ai_log`); inventário/uptime completo **declarado** (exige Management API).
7. **cron** — jobs inativos, falhas 24h (ativos e órfãs), jobs frequentes (`*/N`) **com histórico** parados 2h+ (diários em minuto fixo e jobs recém-criados não geram falso positivo).
8. **identidade** — admins (`user_roles`+`is_platform_admin`), fatores MFA verificados, sessões 30d+, contas inativas 90d+.
9. **postura** — políticas críticas do AI-40 fora de aprovação, eventos alta/crítica abertos (**excluindo os espelhos do próprio auditor** — sem retroalimentação), bloqueios ativos, fraude (AI-41) e incidentes (AI-10).

## Mecânica

- **Incremental:** upsert por `(dia, categoria)`; findings com `dedupe_key` — nunca reprocessa histórico, nunca duplica.
- **Auto-close por evidência:** quando o problema some, o finding fecha sozinho (`resolvido_por='auditoria'`) — é isso que alimenta o FRR. Resolve/reopen manual também existem (reversível).
- **Cada categoria roda blindada** (EXCEPTION próprio): fonte quebrada não derruba a auditoria — vira registro `atencao` com o erro.
- **Baseline aprovada:** 8 configurações esperadas vs encontradas com divergência explícita; o motor **nunca altera o esperado**.
- **Compliance:** 8 requisitos `conforme|nao_conforme|declarado` com evidência.
- **Histórico imutável:** score anterior → atual + mudanças por execução.

## Scores e KPIs

- **SAS** (Security Audit Score) = média dos scores das 9 categorias (penalidade por finding aberto: crítica 30 · alta 15 · média 7 · baixa 3).
- **COS** (Compliance) = (conformes + 0,5·declarados)/requisitos.
- **CIS** (Configuration Integrity) = % da baseline sem divergência.
- **ACS** (Audit Confidence) = checks com evidência real/(reais+declarados).
- **FRR** (Findings Resolution Rate) = corrigidos/total (30d). **ACI** (Audit Coverage Index) = categorias auditadas hoje/9.

## Resposta inteligente (sob política — nunca altera nada)

- Abre/atualiza **finding** com recomendação; críticos/altos são espelhados em `orion_cyber_events` (origem `security_audit`, tipo `config_risk`) — a base comum do AI-40 que o **AI-43** correlaciona.
- **Handoff AI-45** (Incident Response, ainda não construído): evento `secaudit.handoff_ai45` no barramento — fila declarada.
- **Aprendizado**: evento `secaudit.aprendizado` no barramento (motor de aprendizado global inexistente — declarado).

## Integração no Security Ecosystem

AI-40 detecta ataques · AI-41 detecta fraudes · AI-42 controla identidade · AI-43 correlaciona · **AI-44 audita a postura de tudo isso** — e prepara a base de findings para o AI-45 (Incident Response).

## Estado na 1ª homologação (2026-07-17)

SAS **82** · COS **63** · CIS **38** (5/8 divergentes) · ACS **84** (31 reais/6 declarados) · ACI **100%** · 12 findings reais abertos — 2 críticos: **1.979 grants de escrita p/ anon** e **110 tabelas sem RLS (17 sensíveis)**. Detalhe completo em `orion-ai-44-certificacao.md`.
