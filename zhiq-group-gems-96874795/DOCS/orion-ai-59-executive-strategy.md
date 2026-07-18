# ORION-AI-59 — Executive Strategy AI v1.0

> **Chief Strategy Intelligence Officer** — a camada estratégica máxima do ORION.
> Chave `exec_strategy` · namespace `orion_exstrat_*` · painel `/admin/orion-executive-strategy` (badge **EXEC STRATEGY**).
> Migration: `supabase/migrations/20260717_orion_executive_strategy_ai.sql`.

## O que é

Conselheiro executivo digital que **consolida, correlaciona, projeta cenários,
avalia risco e RECOMENDA decisões** — sempre fundamentado em dados reais. **Não
executa operações, não move dinheiro, não inventa.**

## Reuso (não duplica) — relação com o AI-30

O AI-30 (Executive/CEO Copilot, namespace `executive_*`/`orion_executive_*`) já
produz o snapshot executivo diário + CEO chat. O AI-59 **consome** o AI-30
(`executive_fusion()`, `executive_score()`, `executive_simulator()`, `executive_risks()`,
`executive_opportunities()`, `orion_executive_snapshots`) e **nunca o reescreve**.

| | AI-30 Executive Copilot | AI-59 Executive Strategy |
|---|---|---|
| Foco | Snapshot diário + Executive Score + CEO chat | Estratégia **durável** e multi-horizonte |
| Riscos/oportunidades | efêmeros (recalculados no dia) | **persistidos, classificados, rastreados** |
| Cenários | simulador de método | **conservador/realista/otimista × horizonte × métrica** |
| Relatórios | — | **diário → semanal → mensal → trimestral → anual** |
| Aprendizado | — | **recomendação→decisão→resultado→precisão** |
| Namespace | `executive_*` | `orion_exstrat_*` (isolado) |

> A spec do AI-59 pedia funções/tabelas `executive_*`, mas esse namespace pertence
> ao AI-30. Para não colidir nem duplicar, o AI-59 usa `orion_exstrat_*`/`exstrat_*`
> e expõe a superfície da spec com prefixo (mapa em `orion-ai-59-api.md`).

## 12 camadas → implementação

1. **Executive Overview** → `orion_exstrat_metrics` (reusa `executive_fusion`) + `exstrat_summary()`.
2. **Executive Intelligence** → `exstrat_dashboard()` correlaciona scores/riscos/oportunidades.
3. **Decision Engine** → `orion_exstrat_decisions` + `exstrat_decision_support()` (ROI/prob/confiança/impactos).
4. **Executive Recommendations** → `orion_exstrat_recommendations` por área (expansão/marketing/tec/infra/preço/automação…).
5. **Executive Scenarios** → `orion_exstrat_forecasts` (3 cenários × 3 horizontes × 2 métricas, fatores declarados).
6. **Risk Center** → `orion_exstrat_risks` (financeiro/tec/operacional/jurídico/crescimento/infra/fraude/disponibilidade; baixo→crítico).
7. **Opportunity Center** → `orion_exstrat_opportunities` (cidade/mercado/categoria/parceiro/receita).
8. **Executive Copilot** → `exstrat_questions()` (resumo/evidências/métricas/comparativos/recomendação/riscos/próximos passos — **só dados reais**).
9. **Cross-AI Intelligence** → `orion_exstrat_ai_summary` (auto-descobre módulos ORION, read-only).
10. **Executive Reports** → `orion_exstrat_reports` + `exstrat_report_generate()` (diário→anual, versionados).
11. **Executive Dashboard** → painel `/admin/orion-executive-strategy` + **ESS** e componentes.
12. **Estratégia contínua** → `orion_exstrat_history` + `exstrat_learn()` (previsto×realizado→precisão).

## Scores

- **ESS (Executive Strategy Score)** = média ponderada declarada: executive 30% + growth 15% + health 15% + **risk 20%** + opportunity 10% + innovation 10%.
- Componentes: `executive_score` (**reusado do AI-30**), health, growth, **risk_score** (100 − carga ponderada dos riscos), **opportunity_score** (média do potencial), innovation, confiança (proporção de sinais reais disponíveis).

## Segurança

- **Nunca move dinheiro**: decisão de categoria financeira (`precificacao/comissoes/cashback/investimentos/financeiro`) é sempre marcada `financeiro=true`, fica `proposta`/humana — `exec_auto=0` provado.
- **Recomenda, nunca executa**: o AI-59 não possui executor; nenhuma ação é disparada por ele.
- **Nunca inventa**: o CEO Copilot monta a resposta deterministicamente a partir de métricas/scores reais; a narrativa opcional via Gateway (`exec_strategy.chat`) também só usa o contexto real.
- RLS admin (`mp_is_admin()`) + REVOKE ALL/GRANT SELECT em todas as 12 tabelas; auditoria imutável (`orion_exstrat_audits`).

## Operação

- `orion_exec_strategy_tick()` (cron `*/15`) → `exstrat_generate()` + `exstrat_learn()` + relatório diário; semanal/mensal/trimestral/anual nas viradas de período.
- Prompts gpt-5-mini via AI-00 Gateway: `exec_strategy.summary/recommendation/risk/opportunity/scenario/report/chat`.
- COMANDO TESTE: `SELECT public.exstrat_selftest();` (14 provas).
