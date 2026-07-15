# ORION-AI-16 — Demand Forecast AI v1.0 — Certificação Oficial

**Data:** 2026-07-14 · **Categoria:** Forecast Intelligence · **Status:** Production Ready
**Forecast Score na certificação: 37/100** — HONESTAMENTE BAIXO: 18 dias de histórico (maturidade 36). O score sobe sozinho conforme os dados acumulam.

## Arquitetura & Fluxo

```
SÉRIE REAL (pay_payment_orders, 18 dias) → forecast_predictions()
   modelo mm7-dow-v1: média móvel 7d × fator dia-da-semana (sazonalidade intra-semana)
   → horizontes 24h/7d/30d/90d/12m para pedidos e receita
   → SEMPRE declara: confiança + erro estimado + base de dados
   → corridas/entregas: "sem histórico" declarado (motorista_corridas vazia)

orion_forecast_tick (cron 23h Cuiabá) → grava snapshot 24h IMUTÁVEL (versão do modelo)
   → forecast_accuracy() compara snapshot(dia passado) × realizado → MAE/MAPE
   → forecast_score reflete maturidade + confiabilidade medida
```

**APIs 9/9**: forecast_dashboard (auditado c/ trace) · forecast_score · forecast_predictions · forecast_accuracy · forecast_recommendations · forecast_history · forecast_summary · forecast_map · forecast_metrics. 5 prompts forecast.* no Registry. Nunca recalcula indicadores; nunca altera produção (provado: ledger intacto).

## Homologação executada (14/07/2026)

| Item | Resultado |
|---|---|
| Base declarada | **18 dias de pedidos pagos** — confiança **baixa-média**, erro **±45%** (explícitos) |
| Pedidos previstos | 24h=**4** · 7d=9 · 30d=40 |
| Receita prevista | 24h=**R$ 161** · 30d=R$ 4.831 |
| Motoboys 24h | **1** (12 pedidos/motoboy — referência declarada) |
| Corridas/entregas | "sem histórico — indisponível" (nunca inventado) |
| Forecast Score | **37** (maturidade 36) — declara a limitação no próprio score |
| Accuracy | 0 amostras hoje; **snapshot 24h para 16/07 semeado** (pedidos=4, receita=R$161) — validação começa amanhã |
| Read-only | ledger pay idêntico antes/depois ✓ |
| Narrativa (IA) | executivo vivo via `forecast.executive` marcando TUDO como PROJEÇÃO e citando o score 37 e o histórico curto (gpt-5-mini, US$ 0,0007) |

## A validação previsto×realizado (o diferencial)

O `orion_forecast_tick` grava, todo dia às 23h, a previsão de 24h para o dia seguinte (imutável, com versão do modelo). Quando o dia se realiza, `forecast_accuracy()` calcula MAE e MAPE reais — o sistema **mede a própria precisão** e o Forecast Score reflete isso. Hoje o snapshot para 16/07 já está gravado; a primeira medição de erro acontece em 16/07.

## Limitações declaradas (nunca escondidas)

- **Histórico curto (18 dias)** → confiança baixa-média, erro ±45%. É o fator dominante do score.
- **Corridas/entregas** sem série própria (motorista_corridas vazia) — previsão indisponível, declarada.
- **Receita/demanda por cidade** dependem de cidade nas ordens (limite compartilhado com AI-09).
- Feriados/eventos locais: não incorporados (fator dia-da-semana já ativo).

## Roadmap ORION 2.x

1. Incorporar feriados e eventos locais (orion_eventos_operacionais já existe no ORION OS).
2. Série de corridas/entregas quando o fluxo de mobilidade gerar volume.
3. Modelo v2 (suavização exponencial/Holt-Winters) quando houver ≥60 dias — o versionamento já suporta comparar modelos.

---
*Certificado pelo fluxo ORION CORE v1.0 · reproduzível via forecast_dashboard() e forecast_accuracy().*
