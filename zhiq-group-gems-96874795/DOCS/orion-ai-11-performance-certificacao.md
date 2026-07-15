# ORION-AI-11 — Performance AI v1.0 — Certificação Oficial

**Data:** 2026-07-14 · **Categoria:** Core Intelligence · **Status:** Production Ready
**Performance Score na certificação: 98/100** (recalculável via `performance_score()`)

## Arquitetura & Fluxo

```
Instrumentação real ──► performance_report() ──► performance_score() ──► orion_perf_tick (cron 45 * * * *)
 pg_stat_statements        diagnóstico            componentes com          │ snapshot IMUTÁVEL (nunca apaga)
 pg_stat_user_tables       técnico completo       deduções explicáveis     │ alertas (crítico/urgente/imp/obs)
 pg_locks / activity                                    │                  │ insight versionado
 pg_stat_database                                       ▼                  ▼
 cron.job_run_details                          integra orion_core_health()  eventos performance_* (nervoso)
 filas ORION / orion_ai_log
                                               performance_history/alerts/predictions/optimizer (APIs oficiais)
Narrative Engine: painel ──► Gateway v3 (prompt_key: performance.narrativa, Prompt Registry) ──► resumo
                             executivo/técnico/financeiro/operacional — ZERO chamada direta a provedor
```

## APIs oficiais (todas SECURITY DEFINER, gate postgres/service/admin)

`performance_score()` · `performance_report()` · `performance_history(dias)` · `performance_alerts()` · `performance_predictions()` · `performance_optimizer()` · `orion_perf_tick()`

## O que é medido DE VERDADE

- **Banco**: cache hit (100%), locks bloqueados, deadlocks, queries ativas >30s, consultas lentas top-10 (pg_stat_statements, média/total/chamadas), candidatos a índice (seq_scan≫idx_scan), bloat (tuplas mortas), maiores tabelas, storage (65 MB).
- **Gateway IA**: chamadas/erros 24h, cache hit 7d, **P95/P99 reais**, custo 7d.
- **Workers/Cron**: 9 ativos, falhas 24h, duração média.
- **Filas**: RIDV pendentes, pacotes, motor aguardando, despacho, DLQ total.
- **Ecossistema**: componente integrado = `orion_core_health()` (score 99).

## O que NÃO é medido (declarado, nunca inventado — padrão ORION CORE #8)

CPU/memória/rede do host (telemetria externa), Web Vitals do frontend (coleta no navegador), latência de Edge Functions (logs do Supabase). Filtros por cidade/estado não se aplicam a métricas de infraestrutura (são globais); aplicam-se apenas às filas operacionais.

## Homologação executada (14/07/2026)

| Validação | Resultado |
|---|---|
| Snapshot real | score **98** (banco 90 — 1 query interna do Supabase >30s; demais 99-100) |
| Consultas lentas | top-3 identificadas são **internas do Supabase** (introspecção/timezones) — app saudável |
| Índices sugeridos | **0** (nenhum candidato real — modelagem OK) |
| Otimizador | resposta honesta: "nenhuma otimização necessária agora" |
| Narrativa via Registry | gpt-5-mini citou números reais, explicou impacto e priorizou correção (US$ 0,0006) |
| Read-only | ledger pay idêntico antes/depois (contagem + soma) |
| Histórico imutável | snapshots/analises com REVOKE UPDATE/DELETE |

## Dependências (sem ciclos)

Consome: catálogo pg_*, cron, filas ORION, orion_ai_log, orion_core_health(). Produz: orion_perf_* (próprias) + eventos performance_*. IA somente via Gateway v3 + Prompt Registry (`performance.narrativa` v1). Nenhum outro módulo depende do Performance AI (topo da observabilidade).

## Pendências & Riscos

- Telemetria externa (CPU/mem/Web Vitals) → alimentaria os componentes declarados como parciais (encaixa no ORION-AI-10 Health Center do roadmap CORE).
- Score de banco pode oscilar com sessões longas legítimas (ex.: conexões administrativas) — dedução é explicada no componente, não é falso alarme silencioso.
- Trend/predição amadurecem com o histórico horário (1ª semana = base curta, declarado).

## Roadmap futuro

1. Integrar client_errors + Web Vitals ao componente frontend.
2. Alertas push (PushNotification admin) quando score < 70 — hoje painel/logs/eventos.
3. Auto-baseline por horário (semana vs fim de semana) para reduzir falsos positivos de carga.

---
*Certificado pelo fluxo ORION CORE v1.0 — verificações reproduzíveis; histórico em orion_perf_snapshots.*
