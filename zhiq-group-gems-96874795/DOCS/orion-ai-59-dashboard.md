# ORION-AI-59 — Executive Strategy AI · Dashboard

> **`/admin/orion-executive-strategy`** · badge **EXEC STRATEGY** (sidebar ORION AI CENTER,
> ícone Compass, tema violeta) · fonte única RPC `exstrat_dashboard()` (auto-refresh 60s).
> Página `src/pages/admin/AdminOrionExecutiveStrategy.tsx`.

## Header — Executive Strategy Center
**ESS (Executive Strategy Score)** em destaque + chip Executive (AI-30) + confiança.
6 cards: receita, pedidos pagos, usuários, riscos abertos, oportunidades, recomendações.

## 11 abas

1. **Resumo** — 4 KPIs (receita/conversão/taxa pagamento/custo IA) + **faixa de segurança**
   (nunca move dinheiro · recomenda nunca executa · reusa AI-30 · nunca inventa) + resumo do relatório diário.
2. **Painel Estratégico** — 8 scores (ESS, Executive, Risk, Opportunity, Health, Growth, Innovation, Confiança) + histórico ESS 30d.
3. **Recomendações** — por área, com ROI/prob/confiança/prioridade + benefícios/riscos/impactos.
4. **Oportunidades** — tipo/potencial/janela/confiança + evidências.
5. **Riscos** — severidade (baixo→crítico) + categoria + probabilidade/impacto + mitigação + evidências.
6. **Decisões** — Decision Engine; decisões financeiras marcadas **🔒 FINANCEIRA — HUMANO**.
7. **Cenários** — tabela conservador/realista/otimista × horizonte × métrica (base→projeção→Δ%→confiança).
8. **IA Consolidadas** — módulos ORION auto-descobertos (read-only) com status/score/valor.
9. **Relatórios** — relatório do dia (título/resumo/versão/conteúdo); os demais períodos rodam no tick.
10. **CEO Copilot** — pergunta livre → resposta estruturada (resumo/recomendação/riscos/próximos passos/evidências), **só dados reais**.
11. **Estratégia** — loop de aprendizado (decisões/executadas/aprendizados/precisão média).

## Cores e semântica
- Scores: verde ≥90 · lima ≥75 · âmbar ≥50 · vermelho <50.
- Severidade de risco: crítico (vermelho) · alto (âmbar) · médio (amarelo) · baixo (cinza).
- Cenário: conservador (cinza) · realista (violeta) · otimista (verde).
- Tema violeta distingue o AI-59 do AI-30 Executive (Gem/CEO) e do AI-56 AOC (azul).

## Honestidade do painel
- Toda projeção declara método + base + confiança; nunca apresentada como certeza.
- Decisões financeiras aparecem com selo 🔒 e status humano.
- CEO Copilot expõe as evidências/métricas usadas; nada é inventado.
- Série curta (pré-lançamento) é declarada explicitamente.
