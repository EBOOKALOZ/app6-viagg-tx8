# ORION-AI-59 — Executive Strategy AI · API

> Superfície pública (admin). Todas as RPCs exigem `mp_is_admin()` (ou postgres/service_role).
> A spec pedia nomes `executive_*` (ocupados pelo AI-30) → expostos com prefixo `exstrat_*`.

## Mapa spec → RPC do AI-59

| RPC da spec | RPC do AI-59 | Retorno |
|---|---|---|
| `executive_summary()`         | `exstrat_summary()`                 | overview do dia (métricas+scores+brief reusado do AI-30) |
| `executive_dashboard()`       | `exstrat_dashboard()`               | **fonte única do painel** (tudo agregado + trace) |
| `executive_recommendations()` | `exstrat_recommendations()`         | recomendações do dia (ordem prioridade) |
| `executive_risks()`           | `exstrat_risks()`                   | riscos do dia (ordem severidade) |
| `executive_opportunities()`   | `exstrat_opportunities()`           | oportunidades do dia |
| `executive_forecast()`        | `exstrat_forecast()`                | cenários (conservador/realista/otimista) |
| `executive_reports()`         | `exstrat_reports(p_tipo)`           | último relatório do tipo (diario/…/anual) |
| `executive_ai_summary()`      | `exstrat_ai_summary()`              | consolidação cross-AI (módulos auto-descobertos) |
| `executive_decision_support()`| `exstrat_decision_support(p_titulo,p_categoria,p_contexto)` | decisão analisada + persistida (marca financeiro) |
| `executive_questions()`       | `exstrat_questions(p_pergunta)`     | CEO Copilot (resposta estruturada, só dados reais) |
| `executive_strategy()`        | `exstrat_strategy()`                | loop de aprendizado (precisão média, histórico) |
| `executive_score()`           | `exstrat_score()`                   | ESS + componentes do dia |

## Motores internos (service_role — não expostos ao front)

`exstrat_generate()` (orquestra tudo, idempotente/dia) · `exstrat_snapshot()` (reusa `executive_fusion`) ·
`exstrat_build_scenarios()` · `exstrat_build_risks()` · `exstrat_build_opportunities()` ·
`exstrat_build_recommendations()` · `exstrat_build_decisions()` · `exstrat_refresh_ai_summary()` ·
`exstrat_scores_refresh()` · `exstrat_report_generate(p_tipo)` · `exstrat_learn()` ·
`orion_exec_strategy_tick()` (cron `*/15`).

## Exemplos

```sql
-- COMANDO TESTE (14 provas)
SELECT public.exstrat_selftest();

-- Overview + ESS de hoje
SELECT public.exstrat_summary();
SELECT public.exstrat_score();

-- CEO Copilot
SELECT public.exstrat_questions('Onde devemos investir este mês?');

-- Decisão financeira → sempre marcada financeiro=true / proposta (humano)
SELECT public.exstrat_decision_support('Reduzir comissão do marketplace em 2pp','comissoes','{}'::jsonb);

-- Relatórios
SELECT public.exstrat_reports('mensal');

-- Forçar um ciclo agora (normalmente o cron faz)
SELECT public.exstrat_generate();
```

## Contrato de saída — `exstrat_questions`

```json
{ "id": 1, "pergunta": "...", "resposta": {
  "resumo": "...", "evidencias": {"metricas": {}, "scores": {}, "fusion": {}},
  "metricas": {"receita": 0, "ess": 58, "executive_score": 51},
  "comparativos": [{"dia":"...","ess":58}],
  "recomendacao": "...", "riscos": "...",
  "proximos_passos": ["...","...","..."],
  "nota": "Núcleo determinístico (dados reais). Narrativa opcional via Gateway." } }
```
