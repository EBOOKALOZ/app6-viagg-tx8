# ORION-AI-51 — Observability AI · Dashboard

> **`/admin/orion-observability`** · badge **OBSERVABILITY** (sidebar ORION AI
> CENTER, ícone Activity, tema ciano) · fonte única RPC `obs_dashboard()`
> (auto-refresh 30s). Página `src/pages/admin/AdminOrionObservability.tsx`.

## Header — Dashboard Executivo
Observability Health Score (OHS, destaque) + uptime% (chip) + 7 cards:
disponibilidade geral, tempo médio de resposta, taxa de erro, serviços ativos,
degradados, logs/min, usuários online.

## 13 abas

1. **Resumo** — os 6 scores (OHS/PHS/DAS/LQS/TPS/SLO Compliance) com descrição +
   traces 2h, eventos/min, lojas online, alertas abertos; nota de que DAS aqui é
   Availability (≠ Device Assurance do AI-42/47).
2. **Métricas** — métricas correntes com origem rastreável e evidências.
3. **Logs** — chips por nível (INFO→FATAL) + lista sanitizada com contexto.
4. **Traces** — traces distribuídos (ticks de cron) + traces mais lentos 24h.
5. **Performance** — latência média de RPC, RPCs lentas, operações mais lentas +
   nota Web Vitals declarada.
6. **Disponibilidade** — health por serviço (estado, disponibilidade, latência,
   erro) com evidências; uptime médio.
7. **SLI** — indicadores medidos das fontes reais.
8. **SLO** — objetivos com meta/atual/compliance/error budget/risco.
9. **Serviços** — chips por estado/categoria + lista clicável que dispara **RCA
   ao vivo** (causa provável, recomendação, tempo de recuperação, handoff AI-45).
10. **Dependências** — cadeia de dependências (cron→SQL→banco→gateway/front) +
    serviços por categoria.
11. **Alertas** — alertas inteligentes priorizados por impacto (P90 crítico … P0).
12. **Estatísticas** — tabela diária (6 scores, uptime, logs, erros, traces, degradados).
13. **Configurações** — cron + contadores + integrações (AI-40/44/45/49/50) +
    lacunas declaradas.

## Cores e semântica
- Scores: verde ≥90 · lima ≥75 · âmbar ≥50 · vermelho <50.
- Estados de serviço: saudável (verde) · atenção (âmbar) · degradado (laranja) · crítico (vermelho).
- Níveis de log: INFO (cinza) → FATAL (vermelho forte).
- Impacto de alerta: alto (vermelho) · médio (âmbar) · baixo (cinza).
- Tema ciano distingue o AI-51 dos módulos de segurança (vermelhos/esmeralda).

## Honestidade do painel
- Toda métrica/score exibe origem e evidência; fórmulas no rodapé.
- Web Vitals, CPU/host, CDN e Storage aparecem como lacunas declaradas.
- Logs exibidos já sanitizados (o painel nunca mostra secret — a sanitização é no banco).
- RCA é sob demanda por serviço, com evidência real (falhas de cron/logs/traces).
