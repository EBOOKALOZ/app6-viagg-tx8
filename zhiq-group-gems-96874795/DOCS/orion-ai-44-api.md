# ORION-AI-44 — API (Security Audit)

Todas as escritas passam por RPC `SECURITY DEFINER` com guarda admin/service (`secaudit_guard`). Leituras de painel exigem admin (RLS `mp_is_admin()`); `anon` não lê nada.

## Motor

### `run_security_audit(p_trace text default null) → jsonb`
Executa a auditoria completa (9 categorias) sobre o estado ATUAL. Incremental: upsert por `(dia, categoria)` e por `dedupe_key` de finding; **nunca reprocessa histórico, nunca duplica**. Atualiza baseline/compliance, espelha críticos/altos em `orion_cyber_events` (`config_risk`), grava histórico imutável. Retorna `{ok, trace, dia, sas, findings_ativos, categorias}`.
Mapeamento das rotas da spec: `/api/security-audit` → esta RPC.

## Leituras (spec → RPC)

| Rota da spec | RPC |
|---|---|
| `/api/security-audit` | `secaudit_dashboard()` (8 seções: scores/kpis/audits/findings/compliance/baseline/history/atualizado_em) |
| `/api/security-audit/findings` | `secaudit_findings_list()` |
| `/api/security-audit/compliance` | `secaudit_compliance_list()` (+ `secaudit_baseline_list()`) |
| `/api/security-audit/history` | `secaudit_history_list()` |
| `/api/security-audit/explain` | `secaudit_explain(p_finding_id)` (+ `secaudit_summary()` como contexto p/ IA) |

Scores: `secaudit_scores()` → `{sas, cos, cis, acs, formula, base}` · KPIs: `secaudit_kpis()` → scores + `{frr, aci, abertos{...}, auditorias_30d}`.

## Ações (auditadas e reversíveis)

- `secaudit_resolve_finding(p_finding_id, p_nota)` — marca corrigido (manual).
- `secaudit_reopen_finding(p_finding_id)` — rollback da resolução.
- Auto-close: o próprio motor fecha findings cuja evidência sumiu (`resolvido_por='auditoria'`).

## Edge Function

`POST /functions/v1/security-audit-engine` — invoca `run_security_audit()` com service role. **DEPLOYADA e ATIVA** (2026-07-17, `verify_jwt=false`). A auditoria contínua roda no banco: pg_cron `orion_secaudit_tick` a cada 15 minutos; a edge serve a disparo manual/scheduler externo.

## Prompts (Registry, gpt-5-mini)

`secaudit.explain_audit` · `secaudit.explain_failures` · `secaudit.prioritize_fixes` · `secaudit.explain_risk` · `secaudit.executive_report`

## Segurança

- Trilhas imutáveis: `orion_secaudit_audits` e `orion_secaudit_history` sem UPDATE/DELETE p/ authenticated/anon; findings/compliance/baseline só via RPC.
- Tabelas criadas **sem default grants** (REVOKE ALL + GRANT SELECT gated por RLS) — o auditor pratica o que flagra.
- Helpers internos (`secaudit_finding`, `secaudit_emit`) sem EXECUTE público.
