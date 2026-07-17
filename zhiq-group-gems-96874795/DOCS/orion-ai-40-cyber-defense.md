# ORION-AI-40 — Cyber Defense AI v1.0

**Chave (Registry/Gateway):** `cyber_defense` · **Rota:** `/admin/orion-cyber-defense` · **Badge:** `SECURITY`
**Modelo:** `gpt-5-mini` (via ORION AI Gateway AI-00) · **Cron:** `orion_cyber_tick` (1/min, `* * * * *`) + edge `cyber-defense-engine` (deployada; disparo manual/externo)
**Status:** 🟢 Aplicado no banco vivo · build verde · Data: 2026-07-17

O AI-40 inaugura o **ORION Security Ecosystem** (AI-40..AI-49). É a camada de **detecção e resposta inicial**: monitora a infra, detecta comportamento malicioso, correlaciona eventos de segurança e **recomenda** resposta proporcional — sempre baseada em **evidência** e **política**. **Nunca bloqueia sozinho**: ações críticas exigem aprovação e são reversíveis (rollback). Toda ação é registrada em auditoria imutável.

## Anti-colisão (regra congelada do ORION)

O **AI-24 Security AI** já existe e é dono de `orion_security_alerts`/`orion_security_config`, funções `sec_*`, cron `orion_security_tick`, painel `/admin/orion-security` e chave `security`. **Nada disso é tocado.** O AI-40 usa namespace próprio:

| Spec | Tabela/rota real (AI-40) |
|---|---|
| orion_security_events | `orion_cyber_events` |
| orion_security_alerts | `orion_cyber_alerts` |
| orion_blocked_entities | `orion_cyber_blocked_entities` |
| orion_security_statistics | `orion_cyber_statistics` |
| orion_security_actions | `orion_cyber_actions` |
| (política) | `orion_cyber_policies` |
| (watermark) | `orion_cyber_state` |
| /admin/orion-security | `/admin/orion-cyber-defense` |

## Tabelas (7)

- **orion_cyber_events** — eventos detectados (append-only/imutável; `status` muda só via RPC). Campos: event_id, dedupe_key(uq), timestamp, origem, tipo, severidade, ip, user_id, visitor_id, endpoint, metodo, modulo, descricao, evidencias(jsonb), confianca, score, status, created_at. Evidência obrigatória; IP declarado quando não instrumentado.
- **orion_cyber_alerts** — alertas priorizados (1 por categoria/entidade/dia). alerta, prioridade, score(Risk), categoria, entidade, recomendacao, evidencias, confianca, responsavel, resolvido, resolved_at, dia.
- **orion_cyber_blocked_entities** — bloqueios temporários reversíveis (ip/user/token/fingerprint) com expiração, ativo, revoked_at.
- **orion_cyber_statistics** — rollup diário: ataques, bloqueios, falsos_positivos, latencia_ms, score_medio, disponibilidade.
- **orion_cyber_actions** — auditoria **imutável** (sem UPDATE/DELETE direto): acao, alvo, motivo, ia_responsavel, politica_aplicada, resultado, rollback_disponivel, rolled_back, ref_event_id, ref_block_id.
- **orion_cyber_policies** — política por categoria: modo (alerta|monitorar|aprovacao|bloquear), limiar, monitorado, **critico** (true ⇒ nunca executa sozinho).
- **orion_cyber_state** — watermark de processamento incremental (nunca reprocessa histórico completo).

RLS: leitura só admin (`mp_is_admin()`); escrita só via RPC `SECURITY DEFINER` com guarda. `REVOKE UPDATE, DELETE` em events/actions para authenticated/anon (auditoria permanente).

## Detecção (fontes 100% reais, read-only)

| Categoria (tipo) | Fonte | O que mede |
|---|---|---|
| `api_abuse` | orion_ai_log | erros/retries por módulo no Gateway (abuso/flood de API) |
| `ai_threat` | orion_ai_log | prompt injection/jailbreak/flood de tokens (heurística sobre erro/task + tokens_out) |
| `auth_attack` | auth.audit_log_entries | brute force / credential stuffing / signup repetido / recovery |
| `web_attack` | client_errors | assinaturas SQLi/XSS/path traversal que afloram em erros de cliente |
| `bot_scraping` | marketplace_product_click_events | volume anômalo por anon_id (scraping/automação) |
| `ddos_flood` | orion_eventos | pico de eventos > 2× média diária |
| `fraud` | orion_trust_alerts | correlação com o Trust AI (AI-20) |

**Lacunas declaradas** (exigem instrumentação/WAF, nunca inventadas): IP real por request, corpo de request, geolocalização por IP, fingerprint. Marcadas `nota_declarada` na evidência.

Cobertura conceitual do spec (SQLi/XSS/CSRF/SSRF/RFI/LFI/command/header injection; brute force/credential stuffing/password spraying/session hijacking/token replay; API flood/rate abuse/enumeração/mass assignment/broken auth/authz; prompt injection/jailbreak/prompt leakage/token flood/context overflow; bots) é **mapeada às 7 categorias detectáveis** hoje pelas fontes reais; o restante fica **declarado** como dependente de instrumentação (WAF/request logging) — a base `orion_cyber_events` já aceita todos os tipos quando a fonte existir.

## Scores (0-100, explicáveis) — `cyber_scores()`

- **TS (Threat Score)** = `crit*15 + tot*3` (eventos/severidade na janela 24h)
- **RS (Risk Score)** = `0.6*TS + 0.4*abertos`
- **SH (Security Health)** = `100 − (crit*12 + abertos*4)`
- **AC (Attack Confidence)** = média da confiança das evidências
- **KPIs:** FPR (falsos positivos/total), MTTD (declarado ≈ intervalo do tick), MTTR (min, quando há resolved_at).

## Motor — `detect_security_threats(p_trace)`

Incremental (watermark `orion_cyber_state`), idempotente (dedupe_key + ON CONFLICT). Insere eventos → agrega alertas (1/categoria/entidade/dia) → rollup de estatísticas → avança watermark → emite eventos no barramento (`cyber.scan`/`cyber.alert`). Disparo: cron `orion_cyber_tick` a cada 1 minuto + edge `cyber-defense-engine` (deployada; disparo manual/externo).

## Resposta inteligente (sob política, auditada, reversível)

- `cyber_record_action(...)` — registra qualquer ação (auditoria imutável).
- `cyber_block_entity(tipo, valor, motivo, categoria, minutos, ...)` — bloqueio **temporário**; se a categoria é `critico` e a política não está em `bloquear`/`aprovacao`, é **negado** (exige aprovação).
- `cyber_rollback_block(id)` — reverte bloqueio e marca a ação como revertida.
- `cyber_set_event_status`, `cyber_resolve_alert`, `cyber_set_policy` — todos com guarda admin/service.

## IA (5 prompts, Prompt Registry, GPT-5-mini)

`cyber.explain_attack`, `cyber.explain_risk`, `cyber.explain_false_positive`, `cyber.suggest_mitigation`, `cyber.executive_report`. A IA só é consumida pelo Gateway (AI-00) — nunca provedor direto.

## Integrações

Gateway (AI-00), Health (AI-10), Performance (AI-11), Operations (AI-13), Trust (AI-20, fraude), Automation (AI-21, dupla trava financeira), Governance (AI-38), Visitor Intelligence (AI-39). Barramento `orion_eventos` origem `cyber_defense`.

## Verificação no banco vivo (2026-07-17)

- Aplicação: **7 tabelas, 28 funções, 7 políticas**.
- Motor: 2 execuções → **2 eventos, 2 alertas** (idempotência provada; sinais reais: ddos_flood 1525 vs 314/dia + 3 alertas de fraude do Trust).
- Ações: bloqueio permitido sob política de aprovação, **negado** quando a política exige aprovação, rollback revertido, auditoria imutável confirmada (authenticated sem UPDATE/DELETE).

Ver também: [orion-ai-40-api.md](orion-ai-40-api.md), [orion-ai-40-dashboard.md](orion-ai-40-dashboard.md), [orion-ai-40-certificacao.md](orion-ai-40-certificacao.md), [orion-security-ecosystem.md](orion-security-ecosystem.md).
