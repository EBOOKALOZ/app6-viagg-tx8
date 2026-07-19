# ORION-REVIEW FASE B1 v1.0 — Validação Técnica Pré-Implementação (Carteira do Arremate)

> **Data:** 2026-07-18 · **Natureza:** validação técnica (ZERO implementação/migration/DDL/Edge/API/tela)
> **Escopo B1:** débito do arremate por saldo interno via **`customer_wallet` + motor PAY**. (MP/webhook = B2; escrow release/refund/comissão = B3.)
> **Base preservada:** ARCHITECTURE Pós-Leilão (D1–D8) · ARREMATES FASE A (ac04fc0) · ARCHITECTURE FASE B (ffba30f) · HARDENING FASE 1 · HOTFIX A.0.
> **Método:** introspecção ao vivo de `broifhfqmnzqoongtokm` — cada afirmação provada.

---

## ETAPA 1 — Customer Wallet

| Item | Prova |
|---|---|
| **Estrutura** | `pay_financial_accounts(owner_type, owner_id, account_type, current_balance, available_balance, reserved_balance, pending_balance, ...)`. Carteira do cliente = `owner_type='customer'`, `account_type='customer_wallet'`, `owner_id=user`. **2 contas ativas** hoje. |
| **Ownership** | `owner_id = auth.uid()` do comprador. Resolvida por `pay_get_or_create_account('customer', <winner_user_id>, 'customer_wallet', ...)`. |
| **Integridade** | saldo só muda via `pay_post_transaction` (partida dobrada). Não há CHECK declarativo de não-negativo, **mas o motor rejeita saldo insuficiente proceduralmente** (valida `available_balance`) — aceitável porque só o motor (DEFINER) escreve. |
| **Reconciliação** | `pay_ledger_entries` (partida dobrada) + `pay_idempotency_registry` = trilha completa. |
| **Dependências** | `pay_get_or_create_account` (DEFINER, owner postgres) + `pay_post_transaction`. Ambos existem. |
| **Riscos** | ver "cenário crítico" abaixo — nenhum P0. |

**Existe caminho alternativo de débito?** **SIM — e a B1 NÃO PODE usá-lo.** Existe `_pay_ride_payer_account(p_merchant_id, p_payer_uid)` que **prefere `merchant_wallet`** se o usuário tem loja (armadilha R2 documentada). **O comprador do arremate é PESSOA → a B1 deve resolver a conta SEMPRE via `pay_get_or_create_account('customer', winner, 'customer_wallet')`, nunca pelo `_pay_ride_payer_account`.** Referência de reuso: `create_customer_delivery_order` (pré-pago de corrida, provado) já debita `customer_wallet` via `pay_post_transaction` — é o padrão exato a espelhar.

## ETAPA 2 — PAY (tudo já existe; zero primitiva nova)

| Componente | Estado | Uso na B1 |
|---|---|---|
| `pay_post_transaction(p_scope, p_idempotency_key, p_entries jsonb, p_reference_type, p_reference_id uuid, p_metadata)` | ✅ DEFINER/owner postgres (bypassa RLS); checa idempotência, **locka contas FOR UPDATE**, valida e rejeita saldo insuficiente, exige crédito=débito | **núcleo do débito B1** |
| `pay_get_or_create_account(pay_owner_type, uuid, pay_account_type, jsonb)` | ✅ DEFINER | resolve `customer_wallet` + `platform_escrow` |
| `pay_create_payment_order` / `pay_payment_orders` | ✅ | **B2 (MP)** — não usado na B1 |
| `pay_webhook_apply_event` | ✅ service_role | **B2** — não usado na B1 |
| `pay_idempotency_registry` | ✅ UNIQUE `(scope, idempotency_key)` | garantia dura de idempotência |
| Contas `platform_escrow` + `platform_main` | ✅ ambas ativas | lado do crédito do hold |

**Contrato do `entries` (verificado no corpo):** array de `{account_id, amount(>0), direction:'debit'|'credit', entry_type, description, reason_code, reference_id, reference_type, metadata}`; o motor exige `Σcredit = Σdebit`. **Nenhuma primitiva financeira nova precisa ser criada** — a B1 é uma RPC fina que monta o `entries` e chama `pay_post_transaction`.

## ETAPA 3 — Idempotência

| Chave | Fase | Garantia |
|---|---|---|
| `auction_hold:<listing_id>` | **B1** | UNIQUE `(scope,idempotency_key)` + cache de resposta no `pay_idempotency_registry` (2ª chamada devolve o payload da 1ª, no-op) |
| `auction_release:<listing_id>` | B3 | mesma mecânica (fora do escopo B1) |
| `auction_refund:<listing_id>` | B3/E | mesma mecânica |

- **Unicidade:** garantida por constraint UNIQUE — impossível 2 linhas com a mesma chave.
- **Concorrência:** `FOR UPDATE` na conta + unicidade da chave → corrida resolve para 1 vencedor; o outro no-op.
- **Reprocessamento:** repetir a chamada com a mesma chave = no-op (devolve resultado anterior).
- **Rollback:** o débito e a transição de estado ocorrem na MESMA transação (requisito de design P1) → falha reverte tudo, sem meio-estado.

**Dupla cobrança?** **NÃO** — chave `auction_hold:<listing_id>` única + validação interna. **Dupla liquidação?** **N/A na B1** (release é B3); a mecânica idempotente já está pronta para ela.

## ETAPA 4 — Concorrência (cenários)

| Cenário | Comportamento | Consistente? |
|---|---|---|
| 2 pagamentos simultâneos (mesmo arremate) | `FOR UPDATE` + UNIQUE(chave): 1 debita, o outro no-op | ✅ |
| Refresh da página | reenvia mesma `auction_hold:<listing_id>` → no-op | ✅ |
| Webhook duplicado | **B2** (dedupe por `provider_event_id`) — não B1 | ✅ (pré-tratado) |
| Reenvio de requisição | mesma chave → no-op | ✅ |
| Timeout | transação atômica: ou commit completo ou rollback total; retry com mesma chave = no-op | ✅ |
| Retry automático | idem timeout | ✅ |

## ETAPA 5 — Estados (sem dupla fonte de verdade)

Fonte única = **`arremate_status` (FASE A)**. A B1 executa, na MESMA transação: (1) `pay_post_transaction(auction_hold:)` e (2) `arremate_transition(listing, 'pago')` (via `pagamento_em_processamento` quando aplicável). O dinheiro vive em `pay_ledger_entries`; o operacional em `arremate_status`; o espelho de custódia em `pay_escrow_holds`. **Nenhuma coluna de estado concorrente** — os "estados financeiros" da FASE B são derivados (composição observável), conforme a arquitetura. ✅

## ETAPA 6 — Integração

Marketplace ✅ (nada muda) · Leilões ✅ · Financeiro/PAY ✅ (reuso puro) · Customer Wallet ✅ (débito canônico) · ALC ✅ (deal referencia settlement) · IA ✅ (read-only, consome eventos) · RIDV ✅ (intocado) · Escrow 🟡 (B1 grava o hold `held`; release é B3) · Mercado Pago 🟡 (compat. futura B2). **Nenhuma integração de fora é alterada.**

## ETAPA 7 — Segurança

| Verificação | Resultado |
|---|---|
| `pay_post_transaction`/`pay_get_or_create_account` | SECURITY DEFINER, **owner=postgres (rolbypassrls=true)** → escrevem apesar da RLS; grant `authenticated,service_role` |
| Tabelas financeiras (`pay_financial_accounts`/`pay_ledger_entries`/`pay_escrow_holds`/`pay_idempotency_registry`) | RLS ON, **apenas policies de SELECT** (dono/admin) → **INSERT/UPDATE/DELETE sem policy = negados pelo RLS**. Escrita SÓ via DEFINER. Prova anon: leitura retorna `[]`; write filtrado (0 linhas). |
| A nova RPC da B1 | **deve ser SECURITY DEFINER com guarda**: só o `winner_user_id` do settlement (ou service) inicia o pagamento; grant `authenticated` (comprador logado) — nunca anon. |
| HOTFIX A.0 | preservado (motor de leilão segue service_role; nada reaberto). |
| Auditoria | `pay_ledger_entries` + `pay_idempotency_registry` + `orion_auction_audit` + evento `pagamento.confirmado`. |

**Nenhuma movimentação financeira executável por usuário não autorizado** — escrita direta bloqueada por RLS; motor exige DEFINER; a RPC da B1 exige ser o vencedor.

**Achado defense-in-depth (P2, NÃO bloqueia B1):** as tabelas financeiras ainda têm **grants DML herdados para `anon`** — **inertes** hoje (RLS sem policy de escrita nega tudo), mas deveriam ser revogados numa varredura de HARDENING (mesma classe do HOTFIX A.0). Não é exploitável para escrita; é higiene.

## ETAPA 8 — Rollback

- **Técnico:** a B1 adiciona 1 RPC nova (ex.: `arremate_pay_wallet`). Rollback = `DROP FUNCTION`. Sem DDL de tabela (colunas da FASE A já existem).
- **Financeiro:** débito e transição na MESMA transação → falha = rollback automático (nada persiste). Em produção, um hold indevido se estorna por transação compensatória `auction_refund:<listing_id>` (mesma partida dobrada, auditada). Testes usam settlement de teste + limpeza (padrão da FASE A).
- **Operacional:** se o débito falhar, o arremate **permanece `aguardando_pagamento`** (a transição não commita) — sem meio-estado, sem inconsistência.

**Nenhuma inconsistência permanece após rollback** (atomicidade + partida dobrada + idempotência).

## ETAPA 9 — Plano de testes (a executar APÓS implementar a B1)

1. **Débito bem-sucedido:** saldo ≥ valor → `customer_wallet` debitada, `platform_escrow` creditada (Σ=0), `pay_escrow_holds` `held`, `arremate_status='pago'`, evento `pagamento.confirmado` 1×.
2. **Saldo insuficiente:** débito **rejeitado** pelo motor; arremate segue `aguardando_pagamento`; zero linha em ledger.
3. **Idempotência:** 2ª chamada com `auction_hold:<listing_id>` = no-op (mesmo resultado, sem 2º débito).
4. **Chamadas duplicadas / refresh:** idem (3).
5. **Concorrência:** 2 chamadas paralelas → exatamente 1 débito (prova por saldo e por 1 linha de hold).
6. **Rollback:** injetar falha após o débito → transação inteira revertida (saldo intacto, sem transição).
7. **Auditoria:** ledger + idempotency_registry + orion_auction_audit + evento presentes e imutáveis.
8. **Reconciliação:** `Σdebit = Σcredit`; saldo da conta = saldo por ledger.
9. **Regressão:** `rep_selftest` 14/14, `auction_security_selftest` verde, pré-pago de corrida intacto, `vite build` verde, front de leilão/lance inalterado.

## ETAPA 10 — Compatibilidade

Nenhuma tela quebrada (B1 é backend puro) · nenhuma API alterada (RPC nova, aditiva) · nenhuma IA impactada (read-only) · nenhum módulo em regressão (motor PAY reusado sem modificação).

---

## Auditoria obrigatória

- **Customer Wallet apta?** **SIM** (estrutura/ownership/integridade/reconciliação provadas; débito canônico via `pay_get_or_create_account('customer',…,'customer_wallet')`).
- **PAY apto?** **SIM** (todos os componentes existem; zero primitiva nova).
- **Idempotência validada?** **SIM** (UNIQUE `(scope,idempotency_key)` + cache + FOR UPDATE).
- **Segurança aprovada?** **SIM** (escrita só por DEFINER owner-postgres; tabelas com RLS SELECT-only; RPC B1 com guarda de vencedor).
- **Rollback aprovado?** **SIM** (atômico; drop da RPC; compensação por refund).
- **Testes preparados?** **SIM** (9 grupos, com regressão).
- **Compatibilidade aprovada?** **SIM** (aditivo; zero mudança de tela/API/IA).

## Critério Final

**A Subfase B1 está tecnicamente pronta para implementação?** 🟢 **SIM.**

**Riscos P0?** **NENHUM.**

**Riscos P1** (endereçar na implementação, não bloqueiam):
1. A RPC da B1 **deve** envolver `pay_post_transaction` + `arremate_transition('pago')` em **uma única transação** (senão meio-estado).
2. Resolver a conta pagadora **sempre** via `pay_get_or_create_account('customer', winner, 'customer_wallet')` — **nunca** `_pay_ride_payer_account` (armadilha merchant).
3. Selecionar o lado do crédito como `platform_escrow` (há 2 contas `platform` — escrow e main); usar `account_type='platform_escrow'`.

**Riscos P2:**
1. Grants DML de `anon` (inertes) nas tabelas financeiras — revogar em HARDENING (defesa em profundidade).
2. Ausência de CHECK não-negativo declarativo — mitigado proceduralmente (só motor escreve); considerar no futuro.
3. Selftest E2E financeiro (sandbox) a construir na implementação.

**Cenários de risco financeiro — resposta detalhada:**
- **Dupla cobrança?** **IMPOSSÍVEL** — `auction_hold:<listing_id>` com UNIQUE + cache + FOR UPDATE; 2ª tentativa/refresh/retry/concorrência = no-op.
- **Dupla liquidação?** **N/A na B1** (release é B3); mecânica idempotente já garantida.
- **Perda de dinheiro?** **NÃO** — partida dobrada (`Σcredit=Σdebit` imposto pelo motor) + transação atômica.
- **Inconsistência financeira?** **NÃO** — débito + transição de estado no mesmo commit; ledger sempre balanceado.
- **Quebra de reconciliação?** **NÃO** — todo movimento em `pay_ledger_entries` + `pay_idempotency_registry`; saldo = soma do ledger.

---

# 🟢 ORION-REVIEW FASE B1 APROVADA

**Justificativa:** a B1 reusa 100% o motor PAY já provado (nenhuma primitiva nova), com débito canônico na `customer_wallet`; a idempotência é garantida por constraint UNIQUE + cache + lock de linha (dupla cobrança impossível); a integridade financeira é assegurada por partida dobrada e transação atômica (débito+transição juntos); a segurança está fechada (escrita só por DEFINER owner-postgres, tabelas com RLS SELECT-only, RPC da B1 com guarda de vencedor, HOTFIX A.0 preservado); rollback é atômico e sem resíduo; plano de 9 testes definido; e não há mudança de tela/API/IA. Nenhum P0. Os P1 são requisitos de implementação (transação única, carteira correta, conta escrow correta) já capturados — o retrabalho que esta revisão elimina.
