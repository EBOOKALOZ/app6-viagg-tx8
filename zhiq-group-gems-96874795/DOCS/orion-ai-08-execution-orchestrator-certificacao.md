# ORION-AI-08 — Execution Orchestrator v1.0 — Certificação Oficial

**Data:** 2026-07-14 · **Categoria:** Workflow Orchestration · **Status:** Production Ready
**ÚLTIMO módulo do roadmap ORION CORE — o ecossistema fecha o ciclo completo.**

## Arquitetura & Pipeline

```
FONTES (Operations/Strategy/Campaign/Package/Dispatcher/admin)
   │ execution_schedule(tipo, origem, alvo, params, quando, prioridade, chave, dependências)
   ▼
orion_execucoes  ── nasce 'aguardando_aprovacao' (salvo auto_aprovar=ON ou origem=admin)
   │                 aprovação humana: execution_aprovar(aprovar|cancelar)
   ▼
EXECUTOR execution_run() (cron */10min) — claim FOR UPDATE SKIP LOCKED, respeita:
   • DEPENDÊNCIAS (só roda quando TODAS concluíram)  • idempotência (chave única)
   • prioridade  • retry backoff exponencial → DLQ na 3ª
   │
   ├─ workflow chama SÓ RPC oficial (nunca lógica paralela):
   │    iniciar_campanha    → orion_campaign_iniciar
   │    enviar_pacote_motor → orion_package_enviar_motor
   │    executar_divulgacao → orion_dispatcher_planejar
   │    notificacao         → evento no Sistema Nervoso
   ├─ instrumenta AI-09: grava orion_touchpoints (chave exec:<id>, trace_id)
   └─ notifica: eventos execution_* + rollback (execution_rollback p/ campanha)
```

**APIs 10/10**: execution_dashboard (auditado c/ trace) · queue · score · pipeline · history · failures · performance · metrics · schedule · summary (+ aprovar, run, rollback, gerar). Prompts 5/5 no Registry (execution.summary/daily/failure/performance/insights). Painel `/admin/orion-execution` (4 abas).

## Homologação executada (14/07/2026 — dados de teste removidos)

| Teste | Resultado |
|---|---|
| Governança (aprovação humana) | workflow de fonte automática **NÃO executa** sem aprovação (status permanece aguardando) ✓ |
| Idempotência | mesma chave → `duplicada=true`, não recria ✓ |
| Pipeline completo | aprovar → executar via RPC oficial → **concluída** ✓ |
| Instrumentação AI-09 | touchpoint `exec:<id>` gravado com trace_id ✓ |
| Pipeline rastreável | 7 etapas + eventos correlacionados por execução ✓ |
| Retry → DLQ | 3 falhas consecutivas com backoff → **DLQ** ✓ |
| **Dependências (orquestração)** | workflow B (prioridade 90) **esperou** A (prioridade 50) por depender dele — o executor pulou B até A concluir ✓ |
| Rollback | disponível p/ iniciar_campanha (→ pausar) ✓ |

## Execution Score

`sucesso% − 5×(falhas+dlq)`, 100 quando sem histórico. **Não recalcula** nada de outros módulos; performance reusa o throughput do Dispatcher.

## Dependências (mapa) — sem ciclos

Consome: RPCs oficiais de Campaign/Package/Dispatcher + orion_ai_config (flag de auto-aprovação) + Gateway/Registry (narrativas). Produz: orion_execucoes (próprio) + orion_touchpoints (alimenta AI-09) + eventos execution_*. Ninguém depende do Orchestrator (é folha de execução).

## Limitações declaradas

A **postagem física no WhatsApp** permanece com o worker GLM humano/integração externa (o Orchestrator planeja o despacho via Dispatcher, mas não cria lógica paralela de envio). Workflows "personalizado/sincronização/atualizar cadastro" do spec são extensíveis (novo tipo + branch no executor) — hoje 4 tipos cobrem o fluxo de divulgação ponta a ponta. Rollback só para ações reversíveis (campanha); ações idempotentes/informativas não precisam.

## Roadmap ORION 2.0

1. Novos tipos de workflow (sincronização de catálogo, atualização de cadastro em lote).
2. Auto-aprovação por política granular (por tipo/origem/valor) em vez de flag global.
3. Grafo de dependências visual no painel (DAG de workflows).

---
*Certificado pelo fluxo ORION CORE v1.0 · reproduzível via execution_dashboard() e execution_run().*
