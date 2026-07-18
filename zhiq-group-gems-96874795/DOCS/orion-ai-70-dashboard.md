# ORION-AI-70 — Auction Ecosystem Orchestrator · Dashboard

> **`/admin/orion-auction-orchestrator`** · badge **ORQUESTRADOR** (sidebar ORION AI CENTER,
> ícone Workflow, tema âmbar) · fonte única RPC `aeo_dashboard()` (auto-refresh 30s).
> Página `src/pages/admin/AdminOrionAuctionOrchestrator.tsx`.

## Header — Auction Ecosystem Orchestrator
**Orchestration Score** (destaque) + Health (chip) + 6 cards: GMV, receita comissões,
leilões, ativos, arremates, backlog. Botão **"Orquestrar agora"** (`aeo_orchestrate_rpc`).

## 8 abas

1. **Resumo** — os **7 scores** (Orchestration/Health/Workflow/Performance/Reliability/
   Security/Integration) + KPIs (GMV/receita/lances/encerrados) + faixa de governança
   (read-only · nunca move dinheiro · nunca destrutivo).
2. **Saúde** — motores coordenados (7 engines, status ativo/ausente) + componentes de saúde
   (crons, RPCs, fila/backlog, banco, realtime/edge declarado).
3. **Workflow** — as 17 etapas do pipeline (ordem, consistência %, status, evidências).
4. **Qualidade** — 6 invariantes de integridade (financeira/créditos/arremate/lances/auditoria/
   consistência): ✓ OK ou ✕ nº de achados.
5. **Performance** — métricas reais (duração/atraso de finalização, duração de cron) vs threshold.
6. **Alertas** — alertas abertos por severidade (cron/backlog/risco financeiro/fraude).
7. **Previsões** — sobrecarga/gargalo/otimização com **base, confiança e nº de dados**.
8. **Eventos** — eventos recentes do leilão com rastreabilidade.

## Cores e semântica
- Scores: verde ≥90 · lima ≥75 · âmbar ≥50 · vermelho <50.
- Saúde: ok (verde) · atenção (âmbar) · crítico/indisponível (vermelho) · declarado/monitorado (cinza).
- Severidade de alerta: crítico (vermelho) · alto (âmbar) · médio (amarelo).
- Tema âmbar/gavel distingue o AI-70 (orquestração de leilão) dos demais ORION AI.

## Honestidade
- Toda previsão declara base/confiança/dados — nunca certeza.
- Realtime/Edge sem superfície SQL aparecem como **declarado**.
- Read-only garantido; o painel só lê `orion_aeo_*` (consolidado pelo motor).
