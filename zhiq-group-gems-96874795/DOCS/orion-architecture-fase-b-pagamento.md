# ORION-ARCHITECTURE FASE B v1.0 — Pagamento dos Arremates

> **Data:** 2026-07-18 · **Natureza:** ARQUITETURA (zero código/migration/DDL/Edge/tela)
> **Base preservada:** AUDIT LEILÕES v1.0 · ARCHITECTURE Pós-Leilão v1.0 (D1–D8) · REVIEW FASE A · HARDENING FASE 1 · HOTFIX A.0 · **ARREMATES FASE A (aprovada, ac04fc0)**.
> **Ancorada em primitivas PAY REAIS** (introspecção ao vivo), não inventadas: `pay_post_transaction`, `pay_create_payment_order`/`pay_payment_orders`, `pay_webhook_apply_event`, `pay_idempotency_registry`, `pay_escrow_holds`, contas `pay_financial_accounts` (owner_type `platform` = escrow + main), edges `payments-charge`/`payments-webhook`/`payments-reconcile`.

---

## Princípio-mestre (herdado das regras financeiras, inegociável)

**Nenhum módulo move dinheiro direto.** Todo centavo passa por **`pay_post_transaction`** (partida dobrada, idempotente por chave). O front é **consume-only** (nunca recalcula líquido/comissão). A FASE B **não cria carteira nova nem primitiva nova de dinheiro** — reusa o motor PAY provado nas corridas (`pay_hold_ride_payment`/`pay_release_ride_payment` são o espelho do que faremos com `auction_hold:`/`auction_release:`).

## ETAPA 1 — Fluxo financeiro oficial

```
Leilão encerrado ─► Settlement ─► Arremate(FASE A: aguardando_pagamento)
       │                                    │
       │              ┌─────────────────────┴──────── evento arremate.criado (FASE A) ───────────────┐
       ▼              ▼                                                                               ▼
  cobrança emitida (48h, arremate_expires_at)                                             AI-74/67/70 consomem (read)
       │
       ├─ COMPRADOR PAGA ──┬─ Carteira (customer_wallet): pay_post_transaction débito→platform_escrow  (INSTANTÂNEO)
       │                   └─ Mercado Pago: pay_create_payment_order(auction_settlement) → checkout URL
       │                                    → pay_webhook_apply_event (confirma) → credita/aplica
       ▼
  PAGAMENTO CONFIRMADO ─► ESCROW ATIVO (auction_hold:<listing_id> em platform_escrow + espelho pay_escrow_holds)
       │                        │ evento pagamento.confirmado + escrow.criado
       ▼
  LIBERAÇÃO DE CONTATO (arremate.contato_liberado — SÓ agora; D2 contact_requires_payment=true)
       ▼
  ENTREGA (FASE D — retirada/delivery)  ─►  CONFIRMAÇÃO (comprador OU auto D+7 sem disputa)
       ▼
  LIQUIDAÇÃO FINANCEIRA (auction_release:<listing_id>): platform_escrow ─► líquido do vendedor (merchant_wallet)
       │                                                              + comissão 6% ─► platform_main
       │   evento escrow.liberado + comissao.calculada + liquidacao.finalizada
       ▼
  CONCLUSÃO (FASE A: arremate_status='concluido'; AI-74 selo "arremate honrado")
```

**Desvios:** disputa → congela escrow → admin decide → refund (`auction_refund:`) ou retoma. Inadimplência (48h) → `expirado` → `cancelado` (nada a reembolsar — dinheiro nunca entrou).

## ETAPA 2 — Fontes de pagamento (oficiais)

| Meio | v1 | Critério de seleção |
|---|---|---|
| **Carteira do cliente** (`customer_wallet`, owner_type `customer`) | ✅ | se `saldo ≥ valor_final` → débito imediato (1 transação; vira `pago` na hora). **Pagador é PESSOA → SEMPRE `customer_wallet`** (nunca `_pay_ride_payer_account`, que prefere merchant — armadilha R2). |
| **Checkout Mercado Pago** (`pay_create_payment_order` product_type `auction_settlement`) | ✅ | sem saldo, ou escolha explícita → ordem + checkout URL; confirma por webhook |
| **PIX** (via PAY quando o gateway suportar) | 🟡 herda do MP | mesmo trilho do Checkout (o provider decide o método) |
| **Cartão** | 🟡 herda do MP | idem |
| Outros meios futuros | declarado | novo provider no `payment_gateways` — sem mudar o contrato |

Regra: **carteira primeiro se cobre; senão MP.** Nunca dois caminhos de débito para o mesmo arremate (idempotência protege).

## ETAPA 3 — Integração com PAY (contrato)

| Operação | Como | Idempotência |
|---|---|---|
| **Criar transação** | `pay_create_payment_order(product_type='auction_settlement', external_reference=<listing_id>, amount=valor_final)` OU débito direto de carteira | `external_reference` único por arremate |
| **Hold (escrow)** | `pay_post_transaction(scope='auction', idempotency_key='auction_hold:<listing_id>', entries=[customer_wallet -, platform_escrow +])` + espelho `pay_escrow_holds(idempotency_key)` | chave `auction_hold:<listing_id>` |
| **Release (liquidação)** | `pay_post_transaction(idempotency_key='auction_release:<listing_id>', entries=[platform_escrow -, merchant_wallet +líquido, platform_main +comissão])` | chave `auction_release:<listing_id>` |
| **Refund** | `pay_post_transaction(idempotency_key='auction_refund:<listing_id>', entries=[platform_escrow -, customer_wallet +])` | chave `auction_refund:<listing_id>` |
| **Reconciliação** | edge `payments-reconcile` cruza ordem × evento provider × escrow | por `provider_payment_id` |
| **Rastreabilidade** | `pay_ledger_entries` (partida dobrada) + `pay_state_transitions` + `orion_auction_audit` + eventos | — |

**Reuso do registro de idempotência `pay_idempotency_registry`** (scope, idempotency_key, reference_type, reference_id) — a mesma chave torna a 2ª tentativa no-op.

## ETAPA 4 — Escrow

- **Nasce:** no `pago` (dinheiro recebido) — `auction_hold:<listing_id>` move `customer_wallet → platform_escrow` + linha em `pay_escrow_holds` (service_type='auction', service_id=listing_id).
- **Bloqueia recursos:** enquanto `escrow_ativo`/`aguardando_entrega`/`aguardando_confirmacao` (fundos presos em `platform_escrow`).
- **Libera:** na confirmação de recebimento (comprador OU auto D+7) → `auction_release:` → vendedor + comissão.
- **Cancela:** se o arremate for cancelado ANTES do pago (nada preso — no-op).
- **Reembolsa:** disputa procedente / cancelamento pós-pago → `auction_refund:` → `customer_wallet`.

**Escrow será obrigatório?** → **OBRIGATÓRIO quando `contact_requires_payment=true`** (o modelo D2 recomendado — o único que fecha receita). A chave `orion_auction_settlement_config.contact_requires_payment` deixa isso **configurável a nível de plataforma**: se um dia rodar em modo "só liberação de contato" (sem custódia), o escrow é desligado por config. **Recomendação oficial: obrigatório.**

## ETAPA 5 — Comissão

- **Cálculo/origem:** **`auction_financial_rules` é a ÚNICA fonte oficial** (hoje `commission_percent=6`, `credits_per_real=3.3333`, module='auction', versionada + `_audit`). Nada de hardcode em qualquer camada.
- **Persistência:** `comissao_pct`/`comissao_valor`/`valor_liquido` no `orion_auction_settlements` (já existem, gravados pelo `orion_auction_apply_commission`) + linha no `pay_ledger_entries` (platform_main +comissão) na liquidação.
- **Auditoria:** `orion_auction_audit` + evento `comissao.calculada`.
- **Consumo pelo front:** **consume-only** — exibe `valor_final`, `comissao_valor`, `valor_liquido` que o banco calculou; **nunca recalcula**.

Confirmação: **`auction_financial_rules` permanece a única fonte oficial de comissão.** ✅

## ETAPA 6 — Frete (DECISÃO DE NEGÓCIO PENDENTE)

**Recomendação oficial da arquitetura (para desbloquear a FASE B):** na FASE B o pagamento cobra **exclusivamente `valor_final` do arremate** — **frete é da FASE D (Entrega)** e não entra no cálculo financeiro do pagamento do item. Isso mantém a FASE B implementável sem depender da decisão de frete.

Opções para a decisão do dono (a ser tomada até a FASE D):
| Modelo | Impacto financeiro | Recomendação |
|---|---|---|
| **Comprador paga frete à parte** | 2º valor (delivery) fora do escrow do item; liquida direto ao transportador | ✅ mais simples, sem misturar custódia |
| Vendedor embute no valor_final | frete some dentro do valor arrematado; vendedor arca | 🟡 distorce o "valor do lance" |
| Configurável por anúncio | campo `fulfillment`/frete no listing decide | 🟡 flexível, mais complexo |
| Retirada (sem frete) | zero impacto | ✅ default v1 |

**Impacto na FASE B:** **nenhum** — o pagamento do item é `valor_final`, ponto. A decisão só afeta a FASE D.

## ETAPA 7 — Webhooks (arquitetura)

```
Mercado Pago ─► edge payments-webhook ─► validação (assinatura/origem)
      │                                        │
      ▼                                        ▼
 idempotência (pay_idempotency_registry por provider_event_id; repetição = no-op)
      │
      ▼
 pay_webhook_apply_event(provider_name, provider_payment_id, provider_event_id,
                         event_type, raw_payload, normalized_payload, external_reference=<listing_id>)
      │  (casa a ordem por external_reference; atualiza pay_payment_orders.status)
      ▼
 evento pagamento.confirmado ─► (motor) arremate_transition(listing, 'pago')
      ▼
 ESCROW auction_hold: ─► escrow.criado ─► auditoria (pay_payment_events + orion_auction_audit)
```

| Cenário | Tratamento |
|---|---|
| **Repetição** (MP reenvia) | `provider_event_id` já em `pay_idempotency_registry` → no-op idempotente |
| **Timeout** | webhook responde 200 rápido e processa async; se não confirmar em 48h → `expirado` (cron) |
| **Falha** | evento fica `pending`; `payments-reconcile` reprocessa; DLQ lógica em `pay_payment_events` |
| **Pagamento parcial** | rejeitado — arremate exige valor **integral** (`amount = valor_final`); parcial não transita para `pago` |
| **Pagamento cancelado** | evento `pagamento.recusado`/`cancelado` → mantém `aguardando_pagamento` (retry) ou `expirado` |

## ETAPA 8 — Máquina de estados financeiros (derivada, sem 2ª fonte de verdade)

**Regra de ouro (D1/D6):** a orquestração continua em **`arremate_status` (FASE A)** — a máquina financeira NÃO cria coluna concorrente; ela é a **composição observável** de `arremate_status` + `pay_payment_orders.status` + `pay_escrow_holds.status`.

| Estado financeiro | = Composição real | ↔ arremate_status (FASE A) |
|---|---|---|
| aguardando_pagamento | sem ordem paga | `aguardando_pagamento` |
| pagamento_criado | order `pending`/`waiting_payment` | `pagamento_em_processamento` |
| pagamento_em_processamento | order em processamento no provider | `pagamento_em_processamento` |
| pagamento_confirmado | order `paid` + escrow held | `pago` |
| pagamento_recusado | order `failed` | volta `aguardando_pagamento` |
| pagamento_expirado | 48h sem `paid` | `expirado` |
| escrow_ativo | `pay_escrow_holds.status='held'` | `pago` |
| aguardando_entrega | escrow held + contato liberado | `pago` (FASE D) |
| aguardando_confirmacao | entregue, não confirmado | `pago` (FASE D) |
| liquidado | escrow `released` | `concluido` |
| reembolsado | escrow `refunded` | `cancelado` |
| cancelado | sem escrow ativo | `cancelado`/`expirado` |

## ETAPA 9 — Eventos financeiros (bus `orion_eventos`, origem `arremate_pay`)

| Evento | Origem | Destino/efeito | Consumidores |
|---|---|---|---|
| `pagamento.criado` | motor B (order criada) | comprador | telas (FASE C), AI-04 |
| `pagamento.confirmado` | webhook/carteira | dispara escrow + transição `pago` | Settlement, AI-04/74, Notif (C) |
| `pagamento.recusado` | webhook | mantém aguardando/retry | Notif, AI-04 |
| `pagamento.expirado` | cron 48h | → `expirado` | Notif, AI-67/69 |
| `escrow.criado` | PAY hold | custódia ativa | Settlement, Auditoria |
| `escrow.liberado` | PAY release | vendedor+plataforma pagos | AI-04/22/74, Notif |
| `escrow.cancelado` | motor | custódia encerrada sem release | Auditoria |
| `refund.executado` | PAY refund | comprador reembolsado | AI-04, Notif, Auditoria |
| `comissao.calculada` | apply_commission | receita registrada | AI-04/22 |
| `liquidacao.finalizada` | motor B | fecha o ciclo | AI-74 (selo), AI-67/69, Notif |

IA nenhuma emite/altera — apenas consome (herdado da FASE A). Emissão só pelo motor B (service_role).

## ETAPA 10 — Matriz de segurança

| Requisito | Mecanismo |
|---|---|
| Idempotência | chaves `auction_hold:/release:/refund:<listing_id>` em `pay_post_transaction` + `pay_idempotency_registry` + `external_reference` único |
| Integridade | trigger FASE A (winner/valor imutáveis); transições só pela porta; `pay_ledger_entries` partida dobrada (soma zero) |
| Antifraude | `orion_auction_fraud_scan` + AI-41 emitem parecer ANTES de `contato_liberado` e `escrow_liberado` (recomenda, nunca bloqueia sozinho) |
| Auditoria | ETAPA 11 (4 camadas imutáveis) |
| RLS | mantido; contato/PII só via RPC guardada pós-pago (profiles tem CPF) |
| Menor privilégio | motor de pagamento = service_role; webhook = service_role (edge); leitura = authenticated (HOTFIX A.0 preservado) |
| **Prevenção de dupla liquidação** | `auction_release:` idempotente + release SÓ de `aguardando_confirmacao`/`recebimento_confirmado` + máquina proíbe re-release |
| **Prevenção de dupla cobrança** | `auction_hold:` idempotente + `external_reference` único + carteira e MP nunca no mesmo arremate |

## ETAPA 11 — Matriz de auditoria (nada se perde)

Registro obrigatório por evento: **usuário/ator, pagamento (order_id/valor/meio), webhook (provider_event_id/payload), escrow (chave/valor/status), liquidação (líquido/comissão), comissão (regra id/%), refund (chave/valor), tempo (timestamptz), origem, destino**. Camadas imutáveis: ① `pay_ledger_entries` (financeiro) · ② `pay_payment_events`/`pay_state_transitions` (provider) · ③ `orion_auction_audit` (arremate) · ④ eventos `pagamento.*/escrow.*/refund.*` no bus. Proibido DELETE/UPDATE nas 4.

## ETAPA 12 — Compatibilidade

Marketplace ✅ · Leilões ✅ · Financeiro/PAY ✅ (reuso puro) · Escrow ✅ (`pay_escrow_holds` provado, 19 holds) · Mercado Pago ✅ (`pay_webhook_apply_event` + edge existentes) · Carteiras ✅ (`customer_wallet`/`merchant_wallet`/`platform_*`) · Delivery/Motoboy/Moto-Táxi 🟡 (só FASE D; FASE B não aciona) · ALC ✅ (deal referencia settlement) · IA ✅ (read-only) · RIDV ✅ (intocado).

---

## Decisões obrigatórias (respostas oficiais)

1. **Quando nasce o pagamento?** Quando o comprador inicia o pagamento sobre um arremate em `aguardando_pagamento` (cobrança já emitida no `arremate_init`, relógio de 48h em `arremate_expires_at`). Carteira = ordem+débito na hora; MP = ordem + checkout.
2. **Quando o contato é liberado?** SÓ após `pago` (escrow ativo) — `contact_requires_payment=true`.
3. **Quando o vendedor recebe?** SÓ na liquidação, após confirmação de recebimento (comprador ou auto D+7 sem disputa) — nunca antes.
4. **Quando o escrow é criado?** No `pago` (`auction_hold:`), `customer_wallet → platform_escrow`.
5. **Quando o escrow é liberado?** Na confirmação (`auction_release:`), escrow → vendedor + comissão à `platform_main`.
6. **Quando ocorre refund?** Disputa procedente ou cancelamento pós-pago (`auction_refund:`), escrow → `customer_wallet`.
7. **Quem paga o frete?** **PENDENTE de decisão do dono** — recomendação: comprador à parte / ou retirada; **frete é FASE D e não impacta o pagamento do item na FASE B**.
8. **Disputas?** Abrir disputa congela o escrow (sem release); admin decide → improcedente (retoma/libera) ou procedente (refund). SLA 7 dias (alerta D+3, escalada D+7).
9. **Inadimplência?** 48h sem pagar → `expirado` → `cancelado`; item pode ser relistado/2º colocado (FASE C). Nada a reembolsar (dinheiro nunca entrou).
10. **Dupla validação de pagamento?** (a) evento do provider via `pay_webhook_apply_event` (idempotente por `provider_event_id`) + (b) `payments-reconcile` cruza ordem × provider × escrow antes de liberar contato.
11. **Como evitar dupla cobrança?** Chave `auction_hold:<listing_id>` + `external_reference` único + carteira/MP mutuamente exclusivos por arremate → 2ª tentativa no-op.
12. **Como evitar dupla liquidação?** Chave `auction_release:<listing_id>` + release só a partir do estado de confirmação + máquina de estados proíbe re-release/re-refund.

---

## Riscos técnicos

- **P0:** nenhum novo. (Os P0 de segurança foram fechados na HOTFIX A.0; a FASE B reusa PAY já provado.)
- **P1:** ① `pay_settle_delivery`/settle de leilão inexistente — a liquidação do arremate precisa de RPC nova `auction_release` na implementação (não é bloqueio, é trabalho da FASE B); ② republicar edge `payments-webhook` com o novo `product_type='auction_settlement'` e o roteamento por `external_reference`; ③ garantir que o débito de carteira use `customer_wallet` (não `_pay_ride_payer_account`).
- **P2:** ① reconciliação de pagamento parcial/estorno parcial do MP (tratar como recusa); ② relógio de 48h depende de cron confiável (reusar padrão `auto_prazo_arremate`); ③ selftest E2E financeiro (sandbox MP) a construir na implementação.

## Dependências

PAY vivo ✅ · `pay_post_transaction`/`pay_escrow_holds`/`pay_webhook_apply_event` ✅ · edge `payments-webhook`/`payments-charge`/`payments-reconcile` ✅ (ajuste de roteamento) · contas `platform_escrow`+`platform_main` ✅ · FASE A (`arremate_status`/`arremate_transition`/`arremate_init`) ✅ · **decisão de frete** (não bloqueia B) · **decisão: escrow obrigatório** (recomendado sim).

## Recomendações

Implementar B em sub-etapas: **B1** carteira (mais simples, sem provider) → **B2** MP+webhook → **B3** escrow release/refund + comissão + liquidação → **B4** reconciliação + antifraude gate + selftest E2E. Manter `arremate_status` como fonte única (estados financeiros são derivados). Todo movimento = `pay_post_transaction` idempotente + evento + auditoria na MESMA transação.

---

## Critério Final

**A arquitetura da FASE B está consolidada?** ✅ **SIM** — fluxo financeiro único, 12 estados mapeados ao operacional da FASE A (sem 2ª fonte de verdade), 10 eventos financeiros, contrato PAY sobre primitivas reais, escrow/comissão/webhook/segurança/auditoria definidos, 12 decisões obrigatórias respondidas.

**O fluxo financeiro está pronto para implementação?** ✅ **SIM** (B1 carteira pode começar imediatamente; B2 depende só de ajuste de roteamento de edge já existente).

**Decisões de negócio pendentes:** ① **frete do arremate** (não bloqueia B — é FASE D); ② confirmar **escrow obrigatório** (recomendado SIM); ③ confirmar **janela de auto-confirmação D+7** e **prazo de pagamento 48h** (valores recomendados).

**Riscos técnicos:** P0 = nenhum novo · P1 = 3 (RPC de release nova, roteamento do webhook, carteira correta) · P2 = 3 (parcial/estorno, cron 48h, selftest E2E).

---

# 🟢 ORION-ARCHITECTURE FASE B APROVADA

**Justificativa:** a arquitetura financeira está consolidada e ancorada 100% em primitivas PAY reais e provadas (nenhuma inventada), preserva todas as decisões anteriores (D1–D8, FASE A, HOTFIX A.0), mantém `arremate_status` como fonte única (estados financeiros derivados, sem duplicação), define idempotência tripla contra dupla cobrança/liquidação, escrow obrigatório configurável, comissão exclusivamente por `auction_financial_rules`, webhook idempotente com os 5 cenários tratados, e 4 camadas de auditoria imutável. Sem P0 novos. As pendências são decisões de negócio (frete/D+7/48h) que **não bloqueiam** o início da implementação (B1 carteira). Nenhuma implementação foi feita nesta etapa.
