# ORION-AI-41 — Fraud Detection AI v1.0

> **Fraud Intelligence Engine oficial do ORION.** 2º módulo do Security Ecosystem
> (ver `DOCS/orion-security-ecosystem.md`). Chave de módulo: **`fraud_detection`**.
> Painel: **`/admin/orion-fraud`** (badge FRAUD). Tick: **pg_cron `*/2 * * * *`**.

## Missão

Identificar, correlacionar, classificar e responder a tentativas de fraude em toda a
plataforma VIAGG-TX8 — **sempre com evidência real**. Nenhuma classificação por
suposição. O módulo **recomenda, nunca bloqueia sozinho**: ações de alto impacto
(bloqueio, estorno) exigem aprovação humana pelas políticas da plataforma.

## Princípios (herdados do ORION CORE v1)

1. **Evidências obrigatórias** — todo evento carrega `evidencias` jsonb com o
   critério e os números reais que dispararam a detecção (dados sensíveis mascarados).
2. **Idempotência** — `dedupe_key` único por condição; o scan roda a cada 2 min de
   forma **incremental** (janela 30d) e **nunca recalcula histórico** (upsert).
3. **Trilha imutável** — `orion_fraud_actions` é append-only (`REVOKE UPDATE/DELETE`);
   rollback = **linha compensatória** (`rollback_de`), nada é apagado.
4. **Lacunas declaradas** — o que não tem fonte real no banco é declarado, nunca inventado.
5. **Zero impacto nas demais IAs** — só lê as fontes; escreve apenas em `orion_fraud_*`,
   `orion_eventos` (bus) e `orion_ai_alerts` (alerta admin).

## Tabelas

| Tabela | Conteúdo |
|---|---|
| `orion_fraud_events` | eventos de fraude: tipo, categoria, entidade, user/merchant/delivery/order, severity, **FS/FR/FT(impacto)/FC**, valor_envolvido, evidencias, status, dedupe_key |
| `orion_fraud_patterns` | padrões agregados: frequência, risco (FS médio), IA responsável, última ocorrência |
| `orion_fraud_actions` | trilha de ações **imutável**: ação, motivo, política, resultado, rollback_de, operador |
| `orion_fraud_statistics` | por dia: detectadas, confirmadas, falsos positivos, em análise, **ELP**, tempo médio de resposta, **FPR/FDR** |

RLS: leitura admin (`mp_is_admin()`); grants travados (`REVOKE ALL` + `GRANT SELECT`
a `authenticated` — os default grants do projeto davam até TRUNCATE, que ignora RLS).

## Scores

| Score | Significado |
|---|---|
| **FS** Fraud Score 0–100 | intensidade do padrão detectado (peso base por tipo + escala pela contagem) |
| **FR** Financial Risk 0–100 | exposição financeira do caso |
| **FT** Trust Score 0–100 | `100 − trust_impact` (confiança restante na entidade) |
| **FC** Fraud Confidence 0–100 | confiança da detecção (cresce com o volume de evidência) |

Severidade: FS ≥80 `critica` · ≥60 `alta` · ≥40 `media` · senão `baixa`.
KPIs derivados: **FPR** (falsos positivos/detectadas), **FDR** (confirmadas/detectadas),
**ELP** (perdas evitadas — *estimativa declarada*: valor envolvido em casos alta/crítica tratados).

## Detectores (17, todos com fonte real validada em 07-17)

**Conta** (profiles, device_tokens)
1. `documento_duplicado` — mesmo CPF/CNPJ normalizado em >1 perfil (mascarado na evidência)
2. `telefone_duplicado` — mesmo whatsapp/telefone em >1 perfil
3. `email_descartavel` — domínio de e-mail descartável conhecido (12 domínios)
4. `dispositivo_compartilhado` — mesmo device token em >1 usuário

**Marketplace** (click events + advertiser_accounts + aci + profiles)
5. `auto_clique` — anunciante clica no próprio anúncio (≥3/30d, via `metadata.advertiser_account_id`)
6. `auto_interesse` — telefone do "visitante" = telefone do próprio anunciante (aci)
7. `interesse_spam` — mesmo telefone gera ≥5 intenções de contato em 24h

**Financeiro** (pay_payment_orders, pay_payment_events, credit_purchases)
8. `pagamentos_identicos` — mesmo pagador+valor ≥3× na mesma janela de 15 min
9. `estornos_repetitivos` — ≥2 eventos refund/chargeback/cancel do gateway por pagador em 30d
10. `creditos_rajada` — ≥3 compras de crédito da mesma loja na mesma hora
11. `credito_pago_sem_valor` — compra de créditos paga com valor ≤ 0

**Delivery & Corridas** (moto_taxi_corridas — detectores prontos; tabelas hoje sem volume)
12. `velocidade_impossivel` — velocidade média >120 km/h na corrida
13. `corrida_instantanea` — ≥1 km finalizada em <60s após o aceite (entrega fictícia)
14. `cancelamento_massa` — ≥5 corridas canceladas em 24h pelo mesmo passageiro
15. `conluio_par` — mesmo par passageiro+condutor com ≥5 corridas concluídas no mesmo dia

**Usuários**
16. `automacao_cliques` — ≥30 cliques/h do mesmo visitante (padrão de bot)
    e `mudanca_brusca` — atividade de hoje ≥10× a média diária histórica (mín. 20)

**IA/Algoritmos**
17. `exploracao_ranking` — ≥15 cliques do mesmo visitante no mesmo anúncio em 24h
    (inflar ranking/recomendação do AI-35)

## Lacunas DECLARADAS (nunca inventa)

- **Cupons/cashback**: não existem tabelas no banco — detecção entra quando o sistema existir.
- **Avaliações falsas**: sem tabela de reviews no banco.
- **Carteira**: `wallet_transactions` vazia, esquema não validado — detector dedicado aguarda.
- **Anúncio duplicado / preço manipulado por vertical**: catálogo é por vertical
  (products global vazia) — aguarda consolidação.
- **GPS fino de entrega**: exige telemetria do app (front).

## Resposta por política (`fraud_politica_v1`)

`fraud_respond()` roda no tick: casos novos **crítica** → ação `revisao_manual`;
**alta** → `validacao_adicional`; ambos vão a `em_analise` + alerta em `orion_ai_alerts`
(idempotente por tipo/dia). Média/baixa: apenas monitoradas. Marcação humana via
`fraud_mark()` (confirmada/falso_positivo/resolvida — auditada). Rollback via
`fraud_action_rollback()` (linha compensatória; recusa rollback duplo).

## IA (via AI-00 Gateway, `gpt-5-mini`)

Prompt Registry: `fraud.explain`, `fraud.false_positive`, `fraud.evidence`,
`fraud.action`, `fraud.financial_report`. Preferência de modelo em
`orion_ai_module_prefs` (`fraud_detection` → `gpt-5-mini`). Nenhuma chamada direta a provedor.

## Motor de execução

O papel "edge function fraud-detection-engine a cada 2 min" é cumprido pelo motor SQL
`orion_fraud_tick()` agendado no **pg_cron `*/2`** (mesma convenção dos AI-36/37/38/39:
porta única, sem HTTP extra, processamento incremental, nunca recalcula histórico) —
DECLARADO na certificação.

## Integrações

- **AI-00 Gateway**: prompts/modelo (acima).
- **AI-40 Cyber Defense** (construído em 17-07, em paralelo): ponte
  `fraud_bridge_cyber()` — todo caso **alta/crítica** ativo é espelhado na base
  comum `orion_cyber_events` (dedupe `fraud:<id>`, idempotente, defensiva se o
  AI-40 for revertido). Provada na homologação: 6 casos espelhados.
- **AI-24 Security**: complementar — AI-24 lê sinais técnicos (auth/anomalias);
  `sec_fraud()` continua agregando o Trust; o motor de fraude operacional é o AI-41.
- **AI-20 Trust**: `trust_impact` do evento alimenta a leitura de confiança (FT).
- **AI-37/38**: custos/governança das chamadas IA já cobertos pelo Gateway.
- **Bus**: emite `fraud.scan`, `fraud.respond`, `fraud.mark`, `fraud.rollback`,
  `fraud.score` em `orion_eventos` (origem `fraud_detection`) — AI-10/12/13 consomem.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_fraud_detection_ai.sql` (com ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionFraud.tsx` (+ rota em `adminRoutes.tsx`/`lazyPages.ts`, sidebar badge FRAUD)
- API: `DOCS/orion-ai-41-api.md` · Dashboard: `DOCS/orion-ai-41-dashboard.md`
- Certificação: `DOCS/orion-ai-41-certificacao.md`
