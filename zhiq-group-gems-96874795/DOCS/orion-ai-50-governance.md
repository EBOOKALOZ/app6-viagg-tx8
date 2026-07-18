# ORION-AI-50 — Governance AI v1.0 (o Governador do ecossistema)

**Missão:** governar o CICLO DE VIDA de TODAS as IAs ORION (existentes e futuras, 100% dinâmico): registro global, versões, dependências, certificações, saúde operacional — com alertas e scores. Painel fechado em 2026-07-17 (motor vivo desde o commit 1d0aea2).

**Chave:** `governance` · **Painel:** `/admin/orion-governance` (badge **GOVERNANCE**) · **Modelo:** gpt-5-mini · **Cron:** `orion_gov_tick` a cada 10 min

## Anti-colisão (crítica)
A spec sugeria tabelas `orion_ai_*` — **campo minado**: `orion_ai_models/config/prefs/log/cache/prompts` são do **Gateway (AI-00)**; `orion_ai_usage/costs/...` do **AI-37**; `orion_ai_budgets/policies/audit` e as funções `governance_*` do **AI-38**. Então:
- Namespace próprio **`orion_gov_*`** + funções **`gov_*`** + chave **`governance`**.
- **AI-38** governa CUSTO de IA (`/admin/orion-ai-governance`); **AI-50** governa CICLO DE VIDA de módulos (`/admin/orion-governance`) — rotas e tabelas distintas.
- **OCE** certifica QUALIDADE de módulos; o AI-50 **lê/registra** certificações, não recalcula.

## Registro global AUTO-DESCOBERTO (dinâmico)
`run_governance_check()` varre `orion_ai_module_prefs` e insere todo módulo novo sozinho — **62 IAs governadas** hoje (o número cresce sem editar código). Para cada uma mede saúde REAL: cron ativo + última execução (`cron.job_run_details`) + prompts ativos + uso/erros do Gateway (`orion_ai_log` 7d) → verde/amarelo/vermelho. Estado atual: **61 verdes, 43/43 crons ativos**.

## 8 tabelas
`orion_gov_registry` (registro vivo) · `_versions` (versões/deploys/rollbacks imutáveis) · `_certifications` (49 seedadas da numeração oficial) · `_dependencies` (grafo IA→IA, quebrada quando o alvo some) · `_policies` (8 políticas do projeto codificadas) · `_lifecycle` (transições imutáveis) · `_alerts` (cron parado/sem cert/dep quebrada) · `_statistics`.

## Scores (explicáveis)
**GS** = 0.4·saúde verde + 0.2·produção + 0.2·cobertura de prompts + 0.2·deps íntegras · **LS** = %produção · **CS** = %certificadas · **DEPS** = %deps íntegras · **OHS** = %crons ativos · **DOCS** = 50 fixo DECLARADO (arquivos do repo são invisíveis do banco). Hoje: **GS 88 · LS 100 · CS 79 · DEPS 100 · OHS 100**.

## APIs
`run_governance_check()` (motor) · `gov_dashboard()` · `gov_scores()` · `gov_summary()` · `gov_set_lifecycle(module, fase, nota)` · `gov_register_version(module, versao, tipo, changelog, commit)`. Prompts: `governance.audit/lifecycle/version/health/summary/recommendation`.

## COMANDO TESTE
`SELECT gov_selftest()` — **13/13** (auto-descoberta 50+, saúde medida, numeração/certs seedadas, lifecycle muda+histórico, versão registra, imutabilidade, RLS, cron).

## Painel (6 abas + resumo)
Resumo (scores + saúde + 5 botões de IA) · Registro Global (tabela de 62 IAs: nº/status/saúde/score/cron/prompts/uso) · Certificações · Dependências (grafo, quebradas em vermelho) · Ciclo de Vida (transições imutáveis) · Políticas · Alertas.
