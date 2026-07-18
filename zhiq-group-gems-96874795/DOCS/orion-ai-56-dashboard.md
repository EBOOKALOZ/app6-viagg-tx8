# ORION-AI-56 — Autonomous Operations AI · Dashboard

> **`/admin/orion-autonomous-ops`** · badge **AUTO OPS** (sidebar ORION AI CENTER,
> ícone Cpu, tema azul) · fonte única RPC `automation_dashboard()` (auto-refresh 30s).
> Página `src/pages/admin/AdminOrionAutonomousOps.tsx`.

## Header — Autonomous Operations Center
Automation Score (destaque) + Health Score (chip) + 7 cards: eventos hoje,
operações ativas, decisões, aguardando aprovação, incidentes abertos, gargalos, MTTR.

## 10 abas

1. **Resumo** — 4 scores (Automation/Health/Reliability/MTTR) + faixa de segurança
   (financeiro nunca automático; infra = recomendação) + lacunas declaradas.
2. **Eventos** — chips por categoria + lista de eventos operacionais reais com evidências.
3. **Decisões** — chips por classe (automática/semi/manual) + lista com motivo/impacto/
   confiança; **botões Aprovar/Recusar** nas que estão `aguardando_aprovacao`.
4. **Dispatch** — chips por módulo + livro de despacho (seguro executa · resto = recomendação).
5. **Incidentes** — incidentes com diagnóstico + MTTR + trilha de recuperações
   (retry idempotente / escalonamento).
6. **Recursos** — filas/conexões/eventos-min/cron (fontes SQL reais) + lacunas de infra.
7. **Políticas** — motor de políticas (SE condição ENTÃO ação; autonomia; chip FINANCEIRO 🔒).
8. **Workflows** — catálogo (seguro × requer aprovação).
9. **Alertas** — alertas operacionais priorizados por impacto (P90…P0).
10. **Estatísticas** — tabela diária (eventos, decisões por classe, incidentes,
    recuperações, MTTR, Automation/Health/Reliability).

## Cores e semântica
- Scores: verde ≥90 · lima ≥75 · âmbar ≥50 · vermelho <50.
- Classe de decisão: automática (verde) · semi (âmbar) · manual (azul).
- Resultado: executada (verde) · aguardando_aprovação (âmbar) · recusada (vermelho) · revertida (cinza).
- Estado de recurso: ok (verde) · atenção (âmbar) · gargalo (vermelho).
- Tema azul distingue o AI-56 de Observability (ciano) e AIOps (monitor).

## Honestidade do painel
- Toda decisão exibe motivo/evidências/confiança; ações financeiras marcadas 🔒.
- Recursos de infra sem fonte SQL aparecem como lacuna declarada.
- Aprovar/Recusar são ações humanas auditadas (aoc_approve_decision).
