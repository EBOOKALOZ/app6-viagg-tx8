# ORION-AI-44 — Dashboard (/admin/orion-security-audit)

Badge **AUDIT** (ícone ClipboardCheck) no grupo ORION AI CENTER. Fonte única: `secaudit_dashboard()` (agregação pura; nada recalculado no front). Refetch 60s. Botão **Auditar agora** (`run_security_audit`).

## Header
Audit Score (SAS) em destaque + 6 tiles: COS · CIS · ACS · FRR · ACI · críticas abertas.

## Abas

1. **Visão Geral** — 5 botões de IA (explicar auditoria/falhas · priorizar correções · explicar risco · relatório executivo — prompts `secaudit.*` via Gateway, contexto `secaudit_summary()`); categorias auditadas com score/status; identidade & postura (admins, MFA, sessões, eventos críticos, políticas frouxas, bloqueios); evolução do Audit Score (histórico imutável).
2. **Banco** — RLS & policies (total/sem RLS/sensíveis/deny-all), funções DEFINER sem search_path, grants excessivos (anon escrita/TRUNCATE authenticated), objetos tmp/debug + seq scans.
3. **APIs & Edge** — funções expostas a anon, client_errors 24h, erros/latência do Gateway, rate limit IA; notas declaradas (WAF/inventário de edges).
4. **Cron** — total/inativos/falhas 24h/falhas órfãs/parados 2h+ e falhas por job.
5. **Compliance & Baseline** — 8 requisitos (conforme/não conforme/declarado) + 8 configurações da baseline (esperado vs encontrado, divergência).
6. **Findings** — abertos por criticidade com recomendação + botão **Resolver**; corrigidos (auto vs manual) com botão **Reabrir** (rollback).

## Princípios visíveis no painel
- Toda linha tem evidência; lacunas aparecem como notas âmbar "declarado".
- O auditor **nunca altera o ambiente** — só recomenda; resolver/reabrir mexem apenas no registro do finding.
