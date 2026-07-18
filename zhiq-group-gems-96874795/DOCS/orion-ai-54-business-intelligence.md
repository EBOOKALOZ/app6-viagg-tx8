# ORION-AI-54 — Business Intelligence AI v1.0 (DW executivo)

**Missão:** consolidar vendas/usuários/marketplace/financeiro/marketing/leilões/suporte/custos em facts, KPIs, insights e forecasts com evidência — **só dados reais**; plataforma pré-lançamento é **declarada**, nunca maquiada. Sem PII (regra AI-48).

**Chave:** `business_intelligence` · **Painel:** `/admin/orion-bi` (badge **BI DW**) · **Modelo:** gpt-5-mini · **Cron:** `orion_biz_tick` a cada 5 min

## Anti-colisão (decisão registrada)
**O AI-22 (`business`) JÁ POSSUI** `/admin/orion-business-intelligence`, `orion_bi_kpis` e `orion_bi_tick` — a rota da spec pertence a ele. O AI-54 é o **DW profundo que REUSA o AI-22** (lê `orion_bi_kpis` como fonte, nunca recria) e o AI-52 (custos). Namespace **`orion_biz_*`** (7 tabelas), funções `biz_*`/`run_bi_check`. Mapa spec→real: 10 tabelas→7 (metrics/dimensions→facts por domínio).

## Fontes reais (nomes verificados — drift corrigido)
`pay_payment_orders(status ENUM→::text, amount)` + `pay_ledger_entries` · `promotion_purchases(amount_brl)` · `credit_purchases` · `auction_listings/bids` + `arremate_offers` · `marketplace_product_click_events` · `advertiser_contact_intentions` · `auth.users` · `support_tickets` · AI-52/AI-22 (leitura). **`merchant_subscriptions` NÃO existe** (reais: `merchant_credit_subscriptions`/`store_credit_subscriptions`).

## Motor `run_bi_check()` (idempotente)
16 facts/dia em 8 domínios → 9 KPIs (receita paga, ticket médio, conversão clique→contato, ativos/novos 7d, growth; **churn/LTV/CAC = NULL DECLARADO** por volume insuficiente) → insights com evidência e auto-resolve (R$7.266,60 de promoções pending = gargalo; leilões sem lances = oportunidade; catálogo vazio = risco; tráfego→contato = tendência) → alertas dedupe/dia → forecasts (média 7d linear; limitações declaradas) → scores + report imutável.

## Scores
**BIS**=10·domínios+20·%KPIs medidos · **MGS**=50+growth cliques 7d · **FHS**=70 se há receita paga senão 20 · **MPS**=conversão · **UES**=% ativos 7d · **BPS**=média. 1ª execução: BIS 93 · MGS 100 · FHS 70 (há receita paga das corridas pré-pagas!) · UES 45.

## COMANDO TESTE
`SELECT biz_selftest()` — **13/13** (motor, 8 domínios, KPIs, NULL declarado, evidências, forecasts, reuso AI-22/52, imutabilidade, RLS, cron). Armadilha corrigida: `pay_payment_orders.status` é ENUM → sempre `::text`.
