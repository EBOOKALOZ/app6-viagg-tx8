# ORION-AI-75.3 — Wallet Architecture Certification (OCE)
**Data:** 2026-07-21 · **Tipo:** auditoria arquitetural (somente leitura) · **Veredito:** 🟡 64/100

## Veredito
**`pay_financial_accounts` + `pay_ledger_entries` (motor pay_*) são a ÚNICA fonte oficial de saldo da Viagg-TX8.**
O Wallet Core (`wallets`/`wallet_transactions`) é declarado **não-oficial e a descontinuar**.
Aprovação condicionada à unificação do fluxo de desbloqueio de contato (P0).

## Evidências (banco vivo, 2026-07-21)
| Item | Medição |
|---|---|
| `pay_financial_accounts` | 16 contas, **R$ 4.417,30** (platform_main 3.681,91 · escrow 228,20 · 6 merchant · 5 motoboy · 3 customer) |
| `pay_ledger_entries` | 211 lançamentos (partida dobrada, extrato `v_wallet_statement`) |
| `wallets` | 14 carteiras, **todas R$ 0,00** |
| `wallet_transactions` | **0 linhas** — nunca operou em produção |
| `advertiser_credit_balances` | morto (0 disponível / 210 consumidos históricos) |
| Rotas de pagamento | `payments-webhook`/`-charge`/`-reconcile` creditam SÓ via `pay_webhook_apply_event` → pay_* |
| Caminho de recarga do Wallet Core | **INEXISTENTE** (nenhum fluxo chama `wallet_credit`) |
| `wallet_unlock_contact` v2 | debita `wallets` (R$ 0) → **todo desbloqueio = `insufficient_credits`** com dinheiro real parado no pay_* |

## Ruptura do fluxo real
```
PIX → MP → webhook → pay_webhook_apply_event → pay_financial_accounts ✅ (R$ 4.417,30)
✂️ ruptura ✂️
unlockContact() → wallet_unlock_contact → wallets (R$ 0,00) → ❌ sempre insufficient_credits
```

## Riscos
- **P0** Paywall inoperante (receita de contato = R$ 0; vendedor bloqueado com saldo real).
- **P0 (pré-existente, auditoria 07-20)** `visitor_phone` em claro — bypass do paywall; independe desta decisão.
- **P1** Saldos divergentes exibidos (3 páginas leem `wallets.balance_cents`=0; Centro Financeiro lê pay >0).
- **P1** `admin_wallet_credit` ativo no sistema morto (dinheiro fantasma fora do ledger).
- **P2** Dupla contabilização futura se recarga for ligada no Wallet Core sem desligar pay.

## Unificação (aprovada em parecer; migration 20260721_wallet_unlock_pay_unification.sql)
1. `wallet_unlock_contact` v3: mesma assinatura/contrato JSON; débito via `pay_post_transaction`
   (customer_wallet do vendedor → platform_main; chave `unlock:<mod>:<listing>:<buyer>`; scope `marketplace_unlock`).
   Precedente seguido: arremate B1 — conta da PESSOA sempre por `pay_get_or_create_account('customer', uid, 'customer_wallet')`, nunca `_pay_ride_payer_account`.
2. Front (3 leituras `wallets.balance_cents` → saldo pay): StoreOrdersPage, AdvertiserOffersPage, useWalletOverview.
3. Descontinuação do Wallet Core: REVOKE de `wallet_credit/reserve/confirm/admin_wallet_credit` p/ authenticated; congelar 30d; dropar.
4. Rollback: corpo v2 salvo em `orion_fn_backups` pela própria migration (restauração de 1 comando).

## Notas
Arquitetura 55 · Segurança 70 · Escalabilidade 82 · Financeiro 45 · Auditoria 75 · Manutenibilidade 55 · Performance 85 → **GERAL 64/100**

## Compatibilidade futura sobre pay_*
Cashback, saldo promocional, comissões, split, escrow, assinaturas, cupons, fidelidade, carteira única entre perfis (Smart Wallet Import): **todos suportados** por `account_type`/lançamentos dedicados. O Wallet Core não suporta nenhum sem reimplementar o pay_*.
