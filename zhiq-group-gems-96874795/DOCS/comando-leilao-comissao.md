# COMANDO LEILÃO — Motor de Comissão 6% v1.0

**O núcleo financeiro que faltava no ecossistema de leilão.** Quando um leilão encerra **com vencedor**, cobra **6% sobre o valor do arremate** (`auction_listings.current_bid`, em REAIS), converte em **créditos** (R$ 0,30/crédito), **debita do vendedor/lojista** e **libera o contato do comprador**. Grátis criar leilão e dar lance — cobra só no vencedor.

## Decisões travadas (2026-07-18, pelo usuário)
- **Quem paga:** o **vendedor/lojista** (trilho `advertiser_credit_balances`, mesmo modelo clique/WhatsApp).
- **Conversão:** **R$ 0,30/crédito** (`credit_pricing_settings.credit_reference_brl`). Ex.: arremate R$ 650 → 6% = R$ 39 → **130 créditos**.

## Fluxo
1. Leilão encerra com vencedor → `orion_auction_charge_commission(listing)` (ou o tick automático).
2. Calcula 6% → créditos (arredonda p/ cima, a favor da plataforma).
3. **Com saldo** → debita (reusa `orion_auction_charge`) → `status=paga` → **contato liberado** → notifica lojista.
4. **Sem saldo** → `status=aguardando_pagamento` → emite evento "abrir Novo Pacote" → após o lojista comprar créditos, `orion_auction_release_after_payment(listing)` reprocessa e libera.
5. A comissão é **congelada no valor oficial do arremate** — renegociação posterior NÃO altera.

## Regras financeiras honradas (skill regras-financeiras)
Comissão = fonte única; movimentação só via RPC `SECURITY DEFINER` **idempotente** (nunca INSERT de saldo direto); débito reusa o `orion_auction_charge` existente (partida em `advertiser_credit_balances` + `advertiser_credit_ledger`); ledger imutável (REVOKE UPD/DEL); **divulgação é independente** (o `orion_auction_close` cuida dela — não tocado). LGPD: contato do vencedor (`profiles.whatsapp/telefone`) revelado só ao dono quando liberado — nunca abre RLS de `profiles`.

## Tabelas & APIs
`orion_auction_commission_config` (pct=6, ref R$0,30, editável) · `orion_auction_commissions` (1/listing, uq idempotente, imutável). Funções: `orion_auction_commission_compute(valor)` · `orion_auction_charge_commission(listing)` · `orion_auction_release_after_payment(listing)` · `orion_auction_commission_get(listing)` (front, contato só se liberado) · `orion_auction_commission_dashboard()` · `orion_auction_commission_tick()` (cron `*/5` varre encerrados) · `orion_auction_commission_selftest()`. Painel: `/admin/leilao-comissoes`.

## COMANDO TESTE — homologação
`SELECT orion_auction_commission_selftest()` — **10/10** (compute R$650→130cr e R$1000→200cr, sem-saldo→aguardando, valor congelado, idempotência, contato oculto sem pagar, config 6%, ledger imutável, RLS, cron).
**Caminho PAGO homologado (conta de teste isolada, auto-limpa):** saldo 500→370 (debitou 130cr exatos = R$39 = 6% de R$650), `status=paga`, contato liberado, **2ª chamada idempotente** (saldo permaneceu 370, sem cobrança dupla), veredito `true`, zero rastro deixado.

## Anti-colisão
Reusa `orion_auction_charge` e resolve a conta como `orion_auction_close` (`advertiser_accounts WHERE user_id=owner_user_id`). Namespace novo `orion_auction_commission*`; NÃO altera `auction_listings` nem os RPCs legados. Painel próprio (não edita o `AdminComandoLeilao` das sessões irmãs).
