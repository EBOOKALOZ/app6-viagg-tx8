# ORION-AI-09 — Conversion & Attribution AI v2.0 — Certificação Oficial

**Data:** 2026-07-14 · **Categoria:** Revenue Intelligence · **Status:** Production Ready

## Arquitetura & Fluxo

```
JORNADA (orion_touchpoints, imutável, idempotente por chave):
 view → clique → cadastro → contato → pedido → pagamento → entrega → avaliação
   ├─ conversion_track(): porta de instrumentação p/ front/edges (adoção incremental)
   └─ conversion_harvest() (cron 7 * * * *): deriva do que JÁ existe —
      pagamentos (pay_payment_orders, leitura pura), cadastros (auth.users),
      publicações confirmadas (Dispatcher), contatos (quando a tabela existir)

ATRIBUIÇÃO conversion_attribution(modelo): janela 30d antes de cada pagamento
 → First Click · Last Click · Linear · Time Decay · Data Driven (heurística declarada)
 → receita SEM toques de campanha = "organico_direto" (nunca inventada)

MÉTRICAS: funil, ROI (só com investimento REAL registrado), CAC (proxy declarado),
LTV/ticket/recompra/lifetime (leitura de pay_*), cidades (growth + touchpoints),
campanhas. Narrativas: 5 prompts no Registry via Gateway v3.
```

**APIs 9/9**: conversion_dashboard (auditado c/ trace) · summary · funnel · roi · cac · ltv · city · campaign · ai (+ track, harvest, attribution). Regras cumpridas: zero recálculo financeiro, zero escrita em ledger/pagamentos, toda métrica cita fonte, toda confiança declarada.

## Homologação executada (14/07/2026)

### Os 5 modelos — provados matematicamente (jornada sintética, rollback)
Jornada: view(A, d-5) → clique(A, d-4) → clique(B, d-1) → pagamento R$ 100.

| Modelo | Campanha A | Campanha B | Esperado |
|---|---|---|---|
| First Click | **100,00** | 0 | ✓ primeiro toque |
| Last Click | 0 | **100,00** | ✓ último toque |
| Linear | **66,66** | 33,33 | ✓ 2/3 vs 1/3 dos toques |
| Time Decay | 54,87 | 45,12 | ✓ recência pesa (半-vida 7d) |
| Data Driven | 57,15 | 42,86 | ✓ view=1, clique=3 → 4/7 vs 3/7 |

### Dados reais
- Harvest: **68 touchpoints** (57 pagamentos reais, 11 cadastros; publicações/contatos 0 — declarado).
- Atribuição real: 100% "orgânico/direto" — **honesto**: ainda não há cliques instrumentados nem publicações confirmadas persistidas; nenhum ROI fictício.
- LTV/ticket/recompra calculados do pay_* (leitura); CAC proxy com confiança "baixa" declarada; ROI nulo (sem investimento pago) com nota explícita.

## Limitações declaradas

Cliques/views reais dependem: (1) GLM registrar métricas (AI-08) e (2) front chamar `conversion_track()` nos pontos de jornada (porta pronta). Receita por cidade via atribuição (ordens não carregam cidade). Data Driven v1 é heurística declarada até haver histórico para calibração. Mapa é ranking (choropleth compartilhado com AI-12).

## Roadmap

1. Instrumentar `conversion_track()` no front (landing/anúncio/checkout) — 3 pontos fecham o funil.
2. GLM → publication_metrics (AI-08) alimenta views/cliques reais.
3. Calibrar Data Driven com conversões observadas; entrega/avaliação como touchpoints automáticos.

---
*Certificado pelo fluxo ORION CORE v1.0 · reproduzível via conversion_dashboard() e conversion_attribution().*
