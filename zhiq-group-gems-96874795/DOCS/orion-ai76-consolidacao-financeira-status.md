# ORION-AI-76 — Consolidação Financeira Unificada (Relatório Técnico de Estado)

**Data:** 2026-07-21 · **Natureza:** relatório técnico de consolidação, baseado em evidência ao vivo (`broifhfqmnzqoongtokm`) + código-fonte. Nenhum objeto alterado nesta análise.

> **Nota operacional importante:** este domínio (UI financeira: painel do lojista, cards, carteira, centro comercial) está em **desenvolvimento paralelo ativo** — a arquitetura mudou entre a auditoria anterior (07-21 manhã) e agora (o `wallet_unlock_contact` foi repontado de `wallets` para `pay_*`). Editar os mesmos 33 arquivos às cegas **atropelaria** esse trabalho. Este documento mapeia o estado real e o que falta, para a implementação frontend ser **coordenada**, não conflitante.

---

## 1. RESUMO EXECUTIVO

**O backend financeiro JÁ ESTÁ CONSOLIDADO sobre `pay_*`** (a "fonte única" pedida). O desbloqueio de contato agora debita a `customer_wallet` pay_* do vendedor e credita `platform_main` (2% — receita da plataforma), provado pelo `wallet_unified_selftest` **v3_pay** (all_pass). A recarga funciona (MP → `pay_create_payment_order(customer_wallet)` → webhook → pay_*). O **P0 de monetização** do relatório anterior (recarga não fundava a carteira do desbloqueio) está **RESOLVIDO** — a carteira do desbloqueio passou a ser a `customer_wallet` pay_*, que a recarga MP funda.

**O que falta é a consolidação do FRONTEND:** ~24 superfícies já leem pay_*, mas **~33 ainda leem o legado de créditos** (admin overviews, `MerchantCredits`, pacotes de crédito, `debitSellerCredits`, `advertiser_credit_ledger`). Falta também **1 RPC de fonte única** para o Painel do Lojista/Carteira (breakdown saldo + métricas de contato), hoje inexistente.

---

## 2. FONTE ÚNICA — objetos reais (com correção da spec)

| Spec pediu | Real no banco | Papel |
|---|---|---|
| `pay_financial_accounts` | ✅ existe | saldo: `available_balance`, `reserved_balance`, `pending_balance`, `current_balance` (por conta/owner) |
| `pay_ledger_entries` | ✅ existe | ledger (partida dobrada) — `direction, entry_type, amount, balance_before/after, reference_type, reason_code, idempotency_key` |
| `pay_transactions` | ❌ **não existe** | usar **`pay_ledger_entries`** |
| `v_wallet_statement` | ✅ existe | extrato oficial (security_invoker sobre pay_*): `created_at, profile_type, source_type, direction, amount_cents, source_id, owner_user_id` |
| `wallet_unlock_contact()` | ✅ existe (v3 pay_*) | desbloqueio: debita `customer_wallet` do vendedor → `platform_main`; 2% + piso R$9; permanente/idempotente |
| `wallet_reveal_contact()` | ✅ existe | reúsa unlock (PII pós-desbloqueio, LGPD) |
| `orion_commission_policy` | ✅ existe | fonte única de %: marketplace **2%** (piso R$9), auction 9% |
| `advertiser_contact_intentions` | ✅ existe | leads/interesses |
| `marketplace_orders` | ❌ **não existe** | usar **`orders_local`** / `purchase_intentions` / `product_leads` |
| `marketplace_offers` | ❌ **não existe** | usar **`arremate_offers`** / `advertiser_contact_intentions` |
| (Centro Comercial) | ✅ **`bi_commercial()`** (RPC, lê pay_*) | indicadores comerciais |

---

## 3. ARQUITETURA CONSOLIDADA (fluxograma — estado atual)

```
RECARGA  → TravelerWalletTopup.tsx → pay_create_payment_order(customer_wallet)
           → Checkout MP → webhook payments-webhook → pay_webhook_apply_event
           → CRÉDITO em pay_financial_accounts.customer_wallet   ✅ funciona
                         │
                         ▼
SALDO    → pay_financial_accounts (available / reserved / pending)   ← fonte única do saldo
                         │
                         ▼
DESBLOQUEIO → unlockContact.ts → wallet_unlock_contact(module,listing,buyer_key)
   ① dono do anúncio  ② permanência orion_marketplace_contact_charges (ON CONFLICT)
   ③ custo = wallet_unlock_charge_cents = max(2% preço, R$9)  [orion_commission_policy]
   ④ pay_post_transaction: customer_wallet(vendedor) − → platform_main +   (partida dobrada, idempotente)
   ⑤ saldo insuficiente → rollback + {insufficient_credits, buy_credits_cta}
                         │
                         ▼
EXTRATO  → v_wallet_statement (RLS owner)   ·   COMISSÃO/RECEITA → platform_main
CENTRO COMERCIAL → bi_commercial()  (indicadores, lê pay_*)
```

**Prova ao vivo:** `wallet_unified_selftest` = `v3_pay` (pay_motor_presente ✓, v3_usa_pay_post_transaction ✓, charge_2pct_cents=5000 ✓, piso_sem_valor=900 ✓, revoke_anon ✓, backup_rollback ✓). Saldo real em pay_*: **R$ 4.417,30** (3 customer_wallets). Carteira legada `wallets` (Core): R$0, a descontinuar.

---

## 4. ESTADO DE INTEGRAÇÃO POR TELA (evidência de grep)

### ✅ Já consolidadas sobre pay_* (consumo/carteira)
`unlockContact.ts` (desbloqueio→pay_*) · `AdvertiserOffersPage` · `AdvertiserLeadsPage` · `AdvertiserListingsPage` · `AdvertiserMessagesPage` · `StoreOrdersPage` · `useContactIntentions` · `useAdvertiserLeadsDashboard` · `useUnifiedWallet`/`useUnifiedWalletViews` (pay_financial_accounts + v_wallet_statement) · `MinhaCarteira.tsx` · `Wallet.tsx`.

### 🔴 Ainda no LEGADO (a repontar — trabalho pendente)
`MerchantCredits.tsx` · `MerchantCreditWallet.tsx` · `MerchantLeadsPanel.tsx` · `MerchantDashboard.tsx` · `useAdvertiserCredits.ts` · `useMerchantCredits.ts` · `useMerchantPayWallet.ts` · `useCreditCatalog.ts` · `useAdvertiserCreditPurchase.ts` · `CreditPackageSelector` (real-estate) · `RealEstateCheckoutContent` · `ProductPackagesManager`/`VehiclePackagesManager` (admin) · admin overviews (`useAdmin{RealEstate,Vehicle,Service,Travel,Freight}Overview`, `useAdminPacketsOverview`, `useAdminCredits`) · `useAIIntelligence` · `lib/credits/debitSellerCredits.ts` · `AdminCreditGrants`.

**Diagnóstico:** o **consumo** (desbloqueio) está consolidado; a **exibição de saldo/pacotes** e os **overviews admin** ainda leem `advertiser_credit_ledger`/`credit_transactions`/`store_credit_wallet`/pacotes de crédito. Há **divergência de fonte** entre saldo (pay_*) e telas legadas.

---

## 5. LACUNAS (P0-P3)

| Sev | Lacuna | Evidência |
|---|---|---|
| **P1** | **RPC de fonte única do Painel do Lojista/Carteira ausente** (saldo disp/reservado/processando + valor investido em contatos + contatos liberados + total gasto, computado no backend) | nenhuma fn `advertiser_financial*`/`seller_financial*` existe |
| **P1** | **~33 superfícies ainda no legado** (créditos/pacotes) → dupla fonte (pay_* vs advertiser_credit_ledger) | §4 |
| **P2** | **Cards de oferta/pedido calculam/exibem via fontes mistas** — falta 1 RPC "quote" (valor/%/comissão/saldo/saldo restante/status) para o card nunca calcular no front | nenhuma fn `*_quote`/`offer_card` |
| **P2** | **`commission_policy_selftest` vermelho** (assume 3%; política é 2%) — drift de teste | selftest `marketplace_3pct: ok=false` |
| **P2** | **Realtime financeiro** não confirmado em todas as telas (saldo/extrato/cards/pedidos/centro) | a validar por tela |
| **P3** | Pacotes de crédito legados ainda com UI (`AdvertiserCreditsPage`/`MerchantCredits`) a aposentar (FASE 3 do refactor) | memória `project_wallet_unified_refactor` |

---

## 6. SEGURANÇA (preservada)

- RLS em `pay_financial_accounts`/`pay_ledger_entries` (owner/admin); `wallets`/`wallet_transactions` owner-only; UPDATE bloqueado. ✅
- anon negado nas RPCs financeiras e nas leituras (REST → `[]`/PGRST202). ✅
- `wallet_unlock_contact` = SECURITY DEFINER, guarda `auth.uid()`, só o dono debita, `REVOKE anon` (selftest revoke_anon ✓). ✅
- Cálculo 2% + piso **no backend** (`wallet_unlock_charge_cents` + `orion_commission_policy`); front consome `charged_cents`. ✅
- Idempotência (partida dobrada + `idempotency_key` + `orion_marketplace_contact_charges` UNIQUE). ✅

---

## 7. PLANO DE CONSOLIDAÇÃO (frontend — a coordenar com a sessão paralela)

**FASE A — Fonte única backend (aditivo, seguro, não-colisão) — 🟢 IMPLEMENTADA (07-21, migration `20260721_ai76_single_source_rpcs.sql`):**
1. ✅ `advertiser_financial_overview(p_extrato_limit)` (read-only, DEFINER, `REVOKE anon`) — retorna do pay_*: `saldo_disponivel/reservado/processando_cents` (pay_financial_accounts customer_wallet), `contatos_liberados` + `valor_investido_contatos_cents` (débitos `reference_type='orion_marketplace_contact_charges'` no pay_ledger), `total_gasto_cents`, `tem_carteira`, `extrato` (v_wallet_statement). → **fonte única do Painel do Lojista + Carteira**. **Provado ao vivo** (authenticated ok; anon 42501).
2. ✅ `contact_unlock_quote(module,listing_id,buyer_key)` (read-only, DEFINER, `REVOKE anon`) — retorna `valor_anuncio_cents`, `percent` (2), `comissao_cents` (wallet_unlock_charge_cents, 2%+R$9), `saldo_disponivel_cents`, `saldo_restante_cents`, `ja_desbloqueado`, `status` (disponivel|saldo_insuficiente|ja_desbloqueado|nao_e_dono). → **fonte única dos cards** (front nunca calcula). **Provado ao vivo** (valor=R$35, comissão=R$9 piso, status=nao_e_dono; anon 42501).

**FASE B — Repontar telas legadas → pay_*/RPCs** (33 arquivos §4): Painel do Lojista, `MerchantCredits`→Carteira, cards de oferta/pedido → `contact_unlock_quote`, admin overviews → pay_*, remover `debitSellerCredits` e pacotes de crédito.

**FASE C — Centro de Inteligência Comercial:** repontar a antiga "Visitas" para `bi_commercial()` (indicadores reais, sem cobrança por clique).

**FASE D — Realtime:** subscriptions em `pay_financial_accounts`/`pay_ledger_entries` → atualizar saldo/extrato/cards/pedidos/centro sem refresh manual.

**FASE E — Reconciliar `commission_policy_selftest` (2%) + build + regressão + selftests.**

---

## 8. CRITÉRIO DE ACEITAÇÃO — status

| Critério | Status | Evidência |
|---|---|---|
| Frontend consome só dados oficiais do banco | 🟡 **parcial** | consumo/desbloqueio ✅; ~33 telas ainda legado |
| Nenhuma lógica do sistema antigo de créditos | 🟡 **parcial** | `debitSellerCredits`/pacotes ainda ativos em telas |
| Painéis sincronizados em tempo real | 🟡 a validar | realtime por tela pendente |
| Rastreabilidade completa das movimentações | ✅ | pay_ledger (partida dobrada) + idempotency + v_wallet_statement + orion_marketplace_contact_charges |
| Painel/Marketplace/Pedidos/Ofertas/Carteira/Centro na MESMA arquitetura, sem duplicidade | 🟡 **em andamento** | backend unificado (pay_*); frontend em migração |

---

## 9. VEREDITO DE CONSOLIDAÇÃO

**Backend: 🟢 CONSOLIDADO** sobre `pay_*` (fonte única de saldo/ledger/extrato/desbloqueio/comissão), provado por selftest v3_pay; P0 anterior resolvido.

**Frontend: 🟡 EM CONSOLIDAÇÃO** — ~40% migrado; ~33 superfícies ainda no legado; faltam 2 RPCs de fonte única (overview do lojista + quote do card) e o realtime por tela.

**Recomendação:** executar a FASE A (2 RPCs aditivas, seguras) e depois a FASE B/C/D **coordenando com a sessão paralela** que edita estes mesmos painéis, para não haver clobber no núcleo financeiro. A base (pay_*) está pronta para a evolução.

---

*Relatório read-only. Evidências: introspecção ao vivo (`broifhfqmnzqoongtokm`), `wallet_unified_selftest` v3_pay, grep do frontend, leitura das RPCs/views. Nenhum objeto/dado/permissão alterado. 2026-07-21.*
