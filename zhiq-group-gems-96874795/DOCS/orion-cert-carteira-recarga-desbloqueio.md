# ORION CERTIFICATION AUTHORITY (OCE) — Carteira, Recarga e Desbloqueio de Contatos

**Data:** 2026-07-21 · **Natureza:** auditoria INDEPENDENTE, READ-ONLY (nada alterado) · **Base:** exclusivamente evidência ao vivo em produção (`broifhfqmnzqoongtokm`) + código-fonte. Nenhum comportamento assumido; toda conclusão tem evidência técnica.

---

## RESUMO EXECUTIVO

O **Wallet Core** (`wallets`/`wallet_transactions` + `wallet_reserve/confirm`) e o **mecanismo de desbloqueio** (`wallet_unlock_contact` a **2%** com piso R$9, permanente e idempotente) estão **bem construídos, seguros e consistentes** — o selftest do wallet passa 7/7 e não há inconsistência de saldo. **Porém a monetização está BLOQUEADA (P0):** não existe **nenhum caminho self-service** que credite saldo na carteira que o desbloqueio consome (`wallets`). O "Adicionar Saldo" do lojista é um **stub** (mock, sem cobrança); a compra de pacotes de crédito credita os **stores legados** (`advertiser_credit_ledger`/`store_credit_wallet`), não o `wallets`; a recarga do viajante credita `pay_*`; o `confirm_topup` credita `ledger_entries`. As **3 bases de saldo estão fragmentadas** e o `wallets` de todos os 14 usuários está **zerado**. Consequência: **nenhum anunciante consegue desbloquear um contato** (toda tentativa retorna `insufficient_credits`) e **não há uma única transação/recarga/desbloqueio real** em produção.

**Veredito: 🔴 REPROVADO** — o fluxo ponta a ponta (adicionar saldo → carteira → desbloqueio) **não é realizável hoje**. O mecanismo é de qualidade; falta o elo **recarga→wallet** (a FASE 3/4 do refactor Carteira Única, pendente).

---

## 1. ARQUITETURA COMPLETA (FASE 1)

```
                       ┌───────────── RECARGA (3 caminhos DESCONECTADOS) ─────────────┐
 Lojista "Adicionar    │ AddBalanceCard.tsx  → STUB (setTimeout + toast; SEM RPC/cobrança) │  ✗
 Saldo"                │                                                                  │
 Anunciante compra     │ AdvertiserCreditsPage → checkout pacote → confirm_advertiser_    │
 pacote de crédito     │   credit_purchase / credit_merchant_credits → advertiser_credit_ │  → LEGADO
                       │   ledger / store_credit_wallet   (NÃO credita wallets)           │  (não wallet)
 Viajante recarrega    │ TravelerWalletTopup → pay_create_payment_order(customer_wallet)  │  → pay_*
                       │   → MP checkout → webhook → pay_financial_accounts               │  (não wallet)
 Legado PIX            │ create_topup_intent → confirm_topup → ledger_entries             │  → LEDGER
                       └──────────────────────────┬──────────────────────────────────────┘  (não wallet)
                                                  ╳  (NENHUM credita `wallets`)
                                                  ▼
 ┌──────────────────── WALLET CORE (o que o desbloqueio consome) ───────────────────┐
 │ wallets(owner_uid, balance_cents, reserved_cents)  ·  wallet_transactions          │
 │ Crédito SÓ por: admin_wallet_credit | wallet_migrate_legacy_balances | selftest    │
 │ SALDO REAL: 14 wallets, TODAS zeradas (balance=0, reserved=0)                        │
 └──────────────────────────────────────┬─────────────────────────────────────────────┘
                                        ▼
 DESBLOQUEIO:  Produto/Lead → unlockContact() → wallet_unlock_contact(module,listing,buyer_key)
   ① dono do anúncio (não desbloqueia alheio)  ② dedup/permanência em orion_marketplace_contact_charges (ON CONFLICT)
   ③ custo = wallet_unlock_charge_cents = max(2% do preço, piso R$9) — policy orion_commission_policy(marketplace)
   ④ débito = wallet_reserve + wallet_confirm (idempotente por 'unlock:module:listing:buyer_key')
   ⑤ saldo insuficiente → rollback do dedup + {insufficient_credits, buy_credits_cta:true}
```

**Objetos vivos:** `wallets`, `wallet_transactions`, `orion_commission_policy`, `orion_marketplace_contact_charges`, `topup_intents`, `payment_intents`, `pay_payment_orders`; RPCs `wallet_reserve/confirm/cancel/credit`, `wallet_unlock_contact`, `wallet_reveal_contact`, `wallet_unlock_charge_cents`, `confirm_topup`, `commission_policy_get/pct/set`, `reconcile_wallet`, `wallet_migrate_legacy_balances`; selftests `wallet_unified_selftest`, `commission_policy_selftest`.

---

## 2. FLUXO DA RECARGA (FASE 2) — 🔴

| Caminho | Credita | Serve ao desbloqueio? | Evidência |
|---|---|---|---|
| `AddBalanceCard` (lojista) | **nada** | ❌ | código: `// MVP: Simula processamento` → `setTimeout(1500)` → `toast.success("Aguarde confirmação")`. **Sem RPC.** |
| Pacote de crédito (anunciante) | `advertiser_credit_ledger`/`store_credit_wallet` | ❌ | `confirm_advertiser_credit_purchase`/`credit_merchant_credits`: `credita_wallet_core=False, legado=True` |
| `TravelerWalletTopup` | `pay_*` customer_wallet | ❌ | credita `pay_financial_accounts` (metadata kind='wallet_topup') |
| `confirm_topup` (legado) | `ledger_entries` | ❌ | corpo insere em `ledger_entries` (direction='credit') |

**PIX/MP/Webhook:** existem para `pay_*` (viajante) e para o legado, **mas nenhum credita `wallets`**. **Extrato/saldo:** o saldo do desbloqueio vem de `wallets` (0); o histórico do anunciante vem de `advertiser_credit_ledger` (legado) → **fontes divergentes**.

**Quebra identificada (P0):** não há confirmação de pagamento que credite o `wallets`. Recarga → wallet **não implementada**.

---

## 3. FLUXO DA CARTEIRA (FASE 3) — ✅ estrutura / ⚠ vazia

| Verificação | Resultado |
|---|---|
| Saldos negativos | **0** ✅ |
| `reserved_cents > balance_cents` | **0** ✅ |
| Transações órfãs | **0** ✅ |
| Idempotency duplicada | **0** ✅ |
| Wallets duplicadas por dono | **0** ✅ |
| **Saldo total no Wallet Core** | **R$ 0,00** (14 wallets, todas zeradas) ⚠ |
| `wallet_transactions` | **0 linhas** ⚠ |

Estrutura íntegra, mas **sem uso**: nenhum crédito, nenhuma reserva, nenhum débito real.

---

## 4. FLUXO DO DESBLOQUEIO (FASE 4) — ✅ mecanismo / ❌ inexequível

`wallet_unlock_contact` (evidência do corpo + `wallet_unified_selftest` 7/7):
- **Cobrança correta:** `wallet_unlock_charge_cents` = `max(2% do preço do anúncio, piso R$9)` — lido de `orion_commission_policy(marketplace, percent=2, min_credits=9)`. Selftest: `charge_2pct_cents=5000`, `piso_sem_valor=900`. ✅
- **Percentual correto:** 2% (política oficial). ✅
- **Idempotência/permanência:** `orion_marketplace_contact_charges` UNIQUE `(listing_module, listing_id, buyer_key)` + `ON CONFLICT DO NOTHING` → 2ª vez retorna `already_unlocked, charged_cents=0`. Débito idempotente por `'unlock:...'`. ✅
- **Sem cobrança duplicada:** garantido por dedup + idempotência. ✅
- **Só o dono desbloqueia** (recusa `not_listing_owner`). ✅
- **Rollback:** saldo insuficiente → deleta o dedup + `insufficient_credits` + CTA de recarga. ✅
- **❌ Inexequível na prática:** como `wallets` está sempre em R$0 (§2/§3), **todo desbloqueio real cai em `insufficient_credits`**. `orion_marketplace_contact_charges` = **0 linhas** (nenhum desbloqueio real).

---

## 5. REGRAS FINANCEIRAS (FASE 5) — ✅ com 1 ressalva

- **Fonte única:** `orion_commission_policy` (auction 9% / marketplace 2%); `commission_policy_get/pct/set`. ✅
- **Cálculo só no backend:** `wallet_unlock_charge_cents` resolve preço do listing + política; o front apenas consome o `charged_cents` retornado. ✅
- **reserve/confirm:** `wallet_reserve` (idempotente, reserva) + `wallet_confirm` (idempotente, debita, lock de carteira). ✅
- **⚠ Drift de teste:** `commission_policy_selftest` **falha** (`all_pass=false`) porque o teste `marketplace_3pct` assume **3%**, mas a política vigente é **2%** (atualizada 07-21 01:43). O selftest está **desatualizado** (não é erro de política — 2% é o oficial). Deixa o health-check do módulo vermelho.

---

## 6. SEGURANÇA (FASE 6) — ✅

| Verificação | Resultado |
|---|---|
| RLS em `wallets`/`wallet_transactions` | **ON** (policies owner-only: `wallets_select_owner`, `wallets_insert_owner`, `wallets_update_none` = UPDATE bloqueado) ✅ |
| anon lê `wallets`/`wallet_transactions` (REST) | **[]** (RLS filtra) ✅ |
| anon executa `wallet_unlock/reveal/reserve/confirm/credit/topup` | **0** (PGRST202/revogado) ✅ |
| `wallet_credit` (crédito do core) | **service_role only** (anon=false, auth=false) ✅ |
| Desbloqueio de anúncio alheio | recusado (`not_listing_owner`) ✅ |
| Manipulação direta de saldo | impossível (UPDATE bloqueado por policy) ✅ |
| Bypass tentado (anon/REST/PostgREST) | não passou ✅ |

Segurança do fluxo é **sólida**. (Detalhe: anon tem GRANT de SELECT em `wallets` mas a RLS owner-only o torna inerte — mesma classe de higiene do Hardening; recomenda-se revogar por defesa em profundidade.)

---

## 7. UX (FASE 7)

- **Como o comprador/anunciante adiciona saldo?** Confuso e **quebrado**: (a) `AddBalanceCard` promete recarga (PIX/cartão/MP) mas é um **stub** que só mostra "Aguarde confirmação" — o usuário acha que recarregou e **nada acontece**; (b) `AdvertiserCreditsPage` leva a checkout de **pacote**, que credita o **legado**, não a carteira do desbloqueio. → **o usuário desiste ou fica sem entender por que o desbloqueio falha**.
- **É simples/intuitivo?** A intenção da UI é boa (cartões, PIX), mas o resultado não chega à carteira certa. **Mensagem enganosa** ("Aguarde confirmação" sem confirmação real).
- **Ponto de desistência:** o anunciante vê saldo **R$0** no card da carteira única mesmo após "recarregar"/comprar pacote → tenta desbloquear → `insufficient_credits` → **abandono**.

---

## 8. MONETIZAÇÃO (FASE 8) — 🔴

- **O modelo favorece conversão?** O desenho (2% barato, piso R$9, permanente, CTA de recarga no erro) é **excelente para conversão** — mas **não converte nada** porque não há como colocar dinheiro na carteira.
- **Perda de receita:** **total** — 0 desbloqueios, 0 recargas na carteira do core. Toda a monetização de leads está **parada**.
- **Abandono antes da recarga:** garantido (recarga não funciona).
- **Abandono antes do desbloqueio:** garantido (`insufficient_credits` sempre).
- **Etapa desnecessária/quebrada:** a fragmentação em 3 carteiras (`wallets`/`ledger_entries`/`pay_*`) + pacotes legados é a causa; falta o elo de recarga → `wallets`.

---

## 9. CENTRO FINANCEIRO / EXTRATO / DASHBOARD (FASE 9)

- **Extrato do core:** `useWalletCenter` lê `wallet_transactions` — **vazio** (0 linhas) → extrato sempre em branco.
- **Saldo do anunciante:** `useAdvertiserCredits` lê **`wallets`** (0) para saldo, mas **`advertiser_credit_ledger`** (legado) para histórico → **inconsistência** (o usuário pode ter "créditos" no legado e R$0 no saldo do desbloqueio).
- **Outro overview:** `useWalletOverview` lê `ledger_entries` (legado). Três telas, três fontes.
- **CSV/PDF/indicadores:** não auditáveis com dados (0 transações). Sem base para reconciliação real.

---

## 10. TESTE PONTA A PONTA (FASE 10) — ❌ NÃO EXECUTÁVEL

**Não existem dados reais** para o ciclo recarga→saldo→desbloqueio→cobrança→extrato→reconciliação:
- `topup_intents` = 0 · `payment_intents` = 0 · `wallet_transactions` = 0 · `orion_marketplace_contact_charges` = 0 · `wallets` com saldo = 0.
- **Evidência faltante (declarada, não simulada):** nenhuma recarga real chegou ao `wallets`; nenhum desbloqueio real ocorreu. O `wallet_unified_selftest` prova o **mecanismo** de forma sintética (reserve/confirm/2%/idempotência), mas **não** o fluxo real com dinheiro de usuário — porque **não há caminho de recarga para o `wallets`**. Um E2E real é **impossível** até que o elo recarga→wallet exista.

---

## 11. GARGALOS (FASE 11)

| Sev | Gargalo | Evidência |
|---|---|---|
| **P0** | **Recarga não credita o Wallet Core** — nenhum caminho self-service funda `wallets`; `AddBalanceCard` é stub; pacotes → legado; topup viajante → pay_*; confirm_topup → ledger_entries | callers de `wallet_credit` = admin/migração/selftest; `credita_wallet_core=False` em todas as confirmações de compra; 14 wallets zeradas |
| **P0** | **Desbloqueio sempre falha** (`insufficient_credits`) por falta de saldo | 0 unlocks reais; `wallets` = R$0 |
| **P1** | **Fragmentação de carteira** (3 stores: `wallets`/`ledger_entries`/`pay_*`) + saldo (wallets) vs histórico (advertiser_credit_ledger) divergentes | §9 |
| **P1** | **`AddBalanceCard` engana o usuário** ("Aguarde confirmação" sem cobrança real) | código stub |
| **P2** | **`commission_policy_selftest` vermelho** (assume 3%, política é 2%) | selftest `marketplace_3pct: ok=false` |
| **P2** | anon com GRANT SELECT inerte em `wallets` (RLS protege) — higiene | pg grants |
| **P3** | Extratos em 3 telas/3 fontes → manutenção/UX | §9 |

---

## 12. MELHORIAS (FASE 12 — sem implementar)

1. **(P0) Fechar o elo recarga→wallet:** um único ponto de confirmação de pagamento (MP/PIX webhook) que chame `wallet_credit` no `wallets` — reusar `pay_payment_orders`/webhook e rotear `kind='wallet_topup_core'` → `wallet_credit`. Repontar a compra de pacotes para creditar `wallets` (FASE 3 do refactor).
2. **(P0) Substituir o stub `AddBalanceCard`** por checkout real (MP), como o `TravelerWalletTopup`, apontando para `wallets`.
3. **(P1) Unificar a carteira:** migrar/rotear tudo para `wallets` (rodar `wallet_migrate_legacy_balances` e descontinuar o extrato legado), 1 fonte de saldo + 1 de extrato.
4. **(P2) Reconciliar o selftest** de comissão para 2% (ou parametrizar pela própria política).
5. **UX/Conversão:** mostrar saldo real da carteira do desbloqueio na landing do lead; CTA "recarregar" que abre o checkout que credita `wallets`; mensagens claras.
6. **Segurança (defesa em profundidade):** revogar o GRANT SELECT de anon em `wallets`/`wallet_transactions`.
7. **Escalabilidade:** índice em `orion_marketplace_contact_charges(advertiser_account_id)` e `wallet_transactions(wallet_id, created_at)` para extrato.

---

## 13–14. NOTAS POR DIMENSÃO

| Dimensão | Nota | Justificativa |
|---|---|---|
| **Arquitetura** | 70 | Wallet Core bem desenhado, mas fragmentado em 3 stores e com o elo de recarga faltando |
| **Financeiro** | 45 | Regras/reserve/confirm/2% corretos; porém carteira nunca é fundeada e há divergência saldo×histórico |
| **Segurança** | 90 | RLS owner-only, anon bloqueado, UPDATE bloqueado, service_role no crédito |
| **UX** | 35 | Recarga stub enganosa; saldo R$0 pós-"recarga"; desbloqueio sempre falha |
| **Conversão** | 20 | Modelo bom no papel, **0 conversão** — monetização parada |
| **Escalabilidade** | 75 | Estrutura em cents/idempotente escala bem; falta índice de extrato |
| **Manutenibilidade** | 55 | 3 carteiras + selftest desatualizado aumentam a dívida |

## 15. NOTA GERAL: **48 / 100**

---

## 16. VEREDITO

# 🔴 REPROVADO

**Motivo objetivo (com evidência):** o objetivo central da auditoria — *o usuário adiciona saldo → o saldo chega à carteira → o desbloqueio consome o valor* — **não é realizável em produção**. Não há caminho self-service que credite o `wallets` (a carteira que `wallet_unlock_contact` consome); o "Adicionar Saldo" é um stub; compras de crédito vão para o legado; a recarga do viajante vai para `pay_*`. Resultado: **14 carteiras zeradas, 0 recargas, 0 desbloqueios, monetização parada** (todo desbloqueio → `insufficient_credits`).

**Ressalva importante:** o **mecanismo** (Wallet Core, reserve/confirm, 2%+piso, permanência/idempotência, segurança) é de **boa qualidade e passa no selftest** — o que falta é o **elo de recarga→wallet** (a FASE 3/4 do refactor Carteira Única, reconhecida como pendente). Fechando esse único elo (P0-1/P0-2 acima), o fluxo passa a ser certificável.

### Respostas diretas
- **O usuário consegue adicionar saldo corretamente?** ❌ **NÃO** (ao `wallets`; o stub/pacotes/pay_* não fundam a carteira do desbloqueio).
- **O saldo chega corretamente à carteira?** ❌ **NÃO** (nenhum caminho credita `wallets`).
- **O desbloqueio consome exatamente o valor esperado?** ⚠ **O cálculo sim (2%+R$9, backend), mas nunca executa** (saldo 0 → insufficient_credits).
- **Existe algum ponto que impeça a monetização?** ✅ **SIM (P0):** o elo recarga→wallet não existe.
- **Existe gargalo que impeça abrir contatos?** ✅ **SIM:** carteira sempre zerada → todo desbloqueio falha.

---

*Auditoria read-only. Nenhum objeto/dado/permissão alterado. Evidências: introspecção ao vivo + REST anon + selftests (`wallet_unified_selftest` all_pass=true, `commission_policy_selftest` all_pass=false) + leitura do código-fonte, `broifhfqmnzqoongtokm`, 2026-07-21.*
