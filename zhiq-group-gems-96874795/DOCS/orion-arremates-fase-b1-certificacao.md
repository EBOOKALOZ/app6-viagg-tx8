# ORION-ARREMATES FASE B1 v1.0 — Certificação (Pagamento por Customer Wallet)

> **Data:** 2026-07-19 · **Migration:** `20260719_arremate_fase_b1_pay_wallet.sql` (idempotente, reaplicada 2×)
> **Escopo:** SOMENTE débito do arremate por saldo interno (`customer_wallet`) via motor PAY. **Nada** de MP/PIX/cartão/checkout/escrow release/refund/notificação/contrato/entrega/tela/IA.
> **Base:** ARCHITECTURE Pós-Leilão (D1–D8) · ARREMATES FASE A (ac04fc0) · ARCHITECTURE FASE B (ffba30f) · REVIEW FASE B1 (4fa71c8).

---

## Objetos alterados (lista completa)

| Objeto | Tipo | Ação |
|---|---|---|
| `arremate_pay_wallet(uuid)` | função | **CREATE** (RPC única oficial; SECURITY DEFINER; `authenticated`+`service_role`, nunca anon) |
| `pay_escrow_holds_service_type_check` | constraint | **ALTER aditivo** (+ `'auction'`; retrocompatível, não altera lógica de escrow) |

**Zero primitiva financeira nova.** Reusa `pay_get_or_create_account` + `pay_post_transaction` + `pay_escrow_holds`. **Nenhum outro objeto tocado** — FASE A, HOTFIX A.0, motor PAY, pré-pago de corrida, dashboards, RLS: intactos.

## Como funciona (cumprindo os 3 P1 da REVIEW)

`arremate_pay_wallet(p_listing_id)`, em **uma transação atômica**:
1. Trava o settlement (`FOR UPDATE` — serializa concorrência).
2. **Gate de idempotência de domínio:** se já `pago`/`concluido` → retorna `{idempotent:true}` sem recobrar.
3. **Validações (ETAPA 2):** autenticado; **é o vencedor** (ou admin/serviço); estado = `aguardando_pagamento`; settlement existe; `valor_final > 0`; **saldo suficiente**.
4. **Carteira (P1-2):** `pay_get_or_create_account('customer', winner, 'customer_wallet')` — **nunca** `_pay_ride_payer_account`.
5. **Crédito (P1-3):** conta `account_type='platform_escrow'`.
6. **Dinheiro (ETAPA 4):** `pay_post_transaction('auction_hold', 'auction_hold:<listing_id>', [débito customer, crédito escrow], 'auction_settlement', listing)` — partida dobrada, idempotente, valida saldo.
7. Espelho `pay_escrow_holds` (`held`, idempotente por `idempotency_key`).
8. `pagamento_ok = true` no settlement.
9. **Transição (P1-1, mesma transação):** `arremate_transition → pagamento_em_processamento → pago`.
10. **Eventos aprovados:** `pagamento.confirmado` + `escrow.criado` (sem novos, sem duplicidade).

## Homologação (14 testes — todos APROVADOS)

| # | Teste | Resultado |
|---|---|---|
| T1 | **Pagamento válido** (saldo 150, valor 100) | ✅ estado `pago`; saldo 150→50; escrow +100; hold `held`; 2 eventos |
| T2a/b | **Idempotência** 2ª e 3ª chamada | ✅ `idempotent:true`; saldo permanece 50; **1 hold, 1 registry, sem 2º débito** |
| T3 | **Saldo insuficiente** (winner sem fundos, valor 500) | ✅ REJEITADO "saldo insuficiente"; zero movimento |
| T4 | **Vencedor incorreto** (terceiro tenta pagar) | ✅ REJEITADO "apenas o vencedor pode pagar" |
| T5 | **Anon via REST** | ✅ `42501 permission denied` |
| T6 | **Estado inválido** (settlement fora de aguardando) | ✅ gate de domínio/validação barra |
| T7 | **Atomicidade** (falha do CHECK escrow na 1ª versão) | ✅ **PROVADA** — insert falhou → transação inteira reverteu (saldo 150 intacto, sem estado, sem evento) |
| T8 | **Σdébito = Σcrédito** (auction_settlement) | ✅ 100 = 100 |
| T9 | **Reconciliação global** (todo reference balanceado) | ✅ 0 desbalanceados |
| T10 | **Sem hold duplicado** | ✅ 1 hold por `auction_hold:<listing_id>` |
| T11 | **Sem chave de idempotência duplicada** | ✅ UNIQUE `(scope,key)` |
| T12 | **Sem settlement pago 2×** | ✅ gate de domínio |
| T13 | **Concorrência** (2 chamadas) | ✅ `FOR UPDATE` + gate: 1 debita, outra idempotente |
| T14 | **Migration idempotente** (reaplicada) | ✅ mesmo resultado |

**Achado corrigido na homologação:** `pay_escrow_holds.service_type` tinha CHECK sem `'auction'` — o insert do espelho falhou e **a transação inteira reverteu automaticamente** (prova viva de atomicidade). Corrigido com ALTER aditivo do CHECK (+`auction`). Re-homologado 14/14.

## Regressão

`rep_selftest` **14/14** · `auction_security_selftest` **pass_geral=true** · `pay_post_transaction` intacto · pré-pago de corrida (`create_customer_delivery_order`/`pay_hold_ride_payment`) intacto · canônicas FASE A (`create_auction_listing`/`place_auction_bid` — 1 sobrecarga cada) intactas · **`vite build` verde (43s)**.

## Limpeza (teardown)

Dinheiro de teste **revertido por transações compensatórias** (contas institucionais `platform_main`/`platform_escrow` restauradas ao pré-teste; carteira de teste a 0). Rows de teste removidas (settlements/holds/registry/eventos/audit). **Resíduo honesto declarado:** 2 contas `customer` de teste a saldo 0 + suas linhas no `pay_ledger_entries` (o ledger é **APPEND-ONLY por controle financeiro** — `fn_pay_ledger_block_mutation` bloqueia DELETE; o trilho de teste é balanceado, net-zero, e permanece como manda o design imutável). Produção verificada: 2 settlements reais, 0 hold/evento/registry de arremate.

---

## Auditoria final (respostas obrigatórias)

- **Customer Wallet funcionando?** **SIM** (débito canônico via `pay_get_or_create_account('customer',…,'customer_wallet')`).
- **PAY funcionando?** **SIM** (`pay_post_transaction` partida dobrada; zero primitiva nova).
- **Idempotência validada?** **SIM** (chave `auction_hold:<listing_id>` + UNIQUE + gate de domínio; 2ª/3ª chamada no-op).
- **Atomicidade validada?** **SIM** (débito+escrow+estado+eventos na mesma transação; falha reverte tudo — provado em T7).
- **Invariantes financeiras preservadas?** **SIM** (Σdébito=Σcrédito; reconciliação 0 desbalanço; sem hold/chave/pagamento duplicado; sem conta negativa; sem lançamento órfão).
- **Segurança aprovada?** **SIM** (só o vencedor paga; anon 42501; escrita só via DEFINER; HOTFIX A.0 preservado).
- **Compatibilidade aprovada?** **SIM** (nenhuma tela/API/IA/módulo alterado; reuso puro do PAY).
- **Regressão?** **NÃO.**
- **Build aprovado?** **SIM.**

## Critério Final

- **B1 implementada com sucesso?** 🟢 **SIM.**
- **Houve perda de dinheiro?** **NÃO** (partida dobrada; reconciliação 0 desbalanço).
- **Houve dupla cobrança?** **NÃO** (idempotência provada em T2/T13).
- **Houve dupla liquidação?** **NÃO** (release é B3; não ocorre na B1).
- **Houve quebra da reconciliação?** **NÃO** (0 references desbalanceados).
- **Todos os testes aprovados?** **SIM — 14 executados, 14 aprovados.**

---

# 🟢 ORION-ARREMATES FASE B1 APROVADA

**Justificativa:** uma única RPC oficial move o dinheiro do comprador, reusando 100% o motor PAY (nenhuma primitiva nova); atomicidade e idempotência provadas (dupla cobrança impossível — chave `auction_hold:<listing_id>` + gate de domínio + `FOR UPDATE`); todas as invariantes financeiras preservadas (partida dobrada, reconciliação sem desbalanço, sem duplicidade); segurança fechada (só o vencedor paga, anon bloqueado, escrita só por DEFINER, HOTFIX A.0 intacto); rollback atômico e sem resíduo de dinheiro (compensação restaurou as contas); 14/14 testes; zero regressão; build verde. Nenhuma funcionalidade da B2 (Mercado Pago) foi antecipada.
