# ORION-AUDIT LEILÕES v1.0 — Auditoria Completa do Ecossistema de Leilões

> **Data:** 2026-07-18 · **Método:** introspecção do banco vivo `broifhfqmnzqoongtokm` (Management API, read-only) + código em `analise-programador`. **Nada foi implementado, alterado ou migrado.**
> Substitui/atualiza a `auditoria-modulo-leilao.md` (mesmo dia, mais cedo — o módulo evoluiu muito desde ela: os 3 críticos daquela auditoria **já foram corrigidos**).

---

## 0. Resumo executivo

O módulo Leilões deu um salto desde a auditoria anterior (score 57): **RLS foi ligado em 100% das tabelas do domínio** (anon = só SELECT), **realtime foi publicado** (`auction_listings` + `auction_bids`), **`end_auction_listing` existe**, e nasceu uma **camada completa de pós-leilão sem dinheiro**: Settlement (AI-65), ALC — Auction Lifecycle (deals/disputas/avaliações), Regras Financeiras versionadas, fraud scan, security selftest e 4 IAs analíticas (AI-67/69/70/74).

**O que continua faltando é exatamente o coração do Sistema de Arremates: o dinheiro e a entrega.** Zero ordens PAY de leilão, zero integração Mercado Pago no fluxo do vencedor, zero vínculo com logística, zero notificação pós-encerramento.

**Nota do módulo: 78/100** · **Pronto para Arremates: 🟡 PARCIALMENTE** (fundação pronta; monetização/entrega ausentes).

---

## 1. Arquitetura

```
┌─ FRONT PÚBLICO ──────────────┐  ┌─ FRONT LOJISTA ─────────┐  ┌─ FRONT ADMIN ────────────────────────┐
│ MercadoAuctionsSection       │  │ MerchantAuctions        │  │ AdminComandoLeilao (Command Center)  │
│ AuctionListPage (/leiloes)   │  │ MerchantArremate        │  │ AdminAuctionIntelligence (Settlement)│
│ AllAuctionsPage              │  └───────────┬─────────────┘  │ AdminOrionAuctionIntelligence (AI-67)│
│ AuctionPublicPage /leilao/:id│              │                │ AdminOrionAuctionGrowth (AI-69)      │
│ AuctionMarketDetailPage      │              │                │ AdminOrionAuctionOrchestrator (AI-70)│
│ ArrematePublicPage           │              │                │ AdminOrionAuctionLifecycle (ALC)     │
│ MeusLances                   │              │                │ AdminOrionTrustCenter (AI-74) · RIDV │
└──────────┬───────────────────┘              │                └──────────────────┬───────────────────┘
           ▼                                  ▼                                   ▼
┌─ MOTOR DB (RPCs SECURITY DEFINER — nenhuma Edge Function dedicada) ─────────────────────────────────┐
│ DISPUTA: create_auction_listing (6 sobrecargas!) · place_auction_bid (2-arg OK / 3-arg QUEBRADA)    │
│          trigger anti-sniper · auction_set_owner · RIDV (2 triggers de moderação IA)                │
│ ENCERRAMENTO: cron autoclose 1/min → orion_auction_close → winner + comissão (idempotente)          │
│               end_auction_listing (manual — EXISTE agora)                                           │
│ PÓS-LEILÃO (novo): orion_auction_settle → orion_auction_settlements (certificado_hash, fraude_score)│
│   orion_auction_apply_commission (créditos) · orion_auction_release_contact (checa pay_)            │
│   auction_financial_rules (6%, 3.3333 cr/R$, versionada+audit) · settlement_config (auto_charge on) │
│ ALC: cron orion_alc_sync */10 → orion_alc_deals (aguardando_contato→…→concluído/cancelado)          │
│      + orion_alc_disputes + orion_alc_ratings + orion_alc_events                                    │
│ VIGILÂNCIA: orion_auction_fraud_scan · orion_auction_validate_bids · auction_security_selftest      │
│ 6 CRONS ativos: autoclose(1m) alert(10m) score(10m) orchestrator(10m) alc_sync(10m) intel(:29)      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
           │ integra ✅                      │ integra ✅                    │ NÃO integra ❌
           ▼                                 ▼                               ▼
  Créditos do lojista               Divulgação/Publisher            PAY/Carteiras/MP (0 ordens de leilão)
  RIDV/Moderação · IA (Gateway)     Marketplace (vitrine/busca)     Notificações · Mensagens · Entrega/Motoboy
```

## 2. Inventário do banco

**Tabelas (17 do domínio):** `auction_listings` (4 linhas/2 ativas), `auction_bids` (1), `auction_watchers`, `auction_events`, `auction_conversion_metrics`, `arremate_listings` (0), `arremate_offers` (2), `auction_financial_rules` (1 regra: auction 6% / 3.3333 cr/R$) + `_audit`, `orion_auction_settlements` (2, ambos `no_winner`), `orion_auction_settlement_config` (auto_charge=true, commission 6%, contact_requires_payment=false), `orion_auction_packages`, `orion_auction_promo_packages`, `orion_auction_credit_consumption`, `orion_auction_suggestions`, `orion_auction_reports`, `orion_auction_audit` (5), `orion_auction_alerts`, `orion_auction_score_history` + ALC: `orion_alc_deals` (2), `orion_alc_disputes` (0), `orion_alc_ratings` (0), `orion_alc_events`.

**Views/MV:** `orion_auction_intel_mv_daily` (MV diária do AI-67, refresh cron `:29`).

**Funções (≈85 do domínio):** suíte disputa (`create/place/end`), suíte close/settle (`orion_auction_close/settle/apply_commission/release_contact/charge/antisniper/autoclose_tick`), regras financeiras (`auction_financial_rule_*`), intel AI-67 (`auction_intel_*`, 15 fns), growth AI-69 (`auction_growth_dashboard`), orquestrador AI-70 (`aeo_*`, 22 fns), ALC (`orion_alc_sync_deals`, `auto_prazo_arremate`), vigilância (`fraud_scan`, `validate_bids`, `auction_security_selftest`), dashboards (`auction_command_dashboard`, `orion_auction_seller_dashboard`, `orion_auction_settlement_dashboard`, `orion_auction_intelligence_dashboard`).

**Triggers:** anti-sniper (`auction_bids`); owner + updated_at + 2×RIDV (`auction_listings`); notify_store + updated_at (`arremate_offers`); updated_at (`arremate_listings`).

**Edge Functions:** **nenhuma dedicada a leilão** (módulo 100% DB/RPC; moderação usa infra RIDV).

**Crons (6 ativos):** `orion_auction_autoclose` (1/min), `orion_auction_alert_tick`, `orion_auction_score_tick`, `orion_auction_orchestrator_tick`, `orion_alc_sync` (*/10), `orion_auction_intel_tick` (:29).

## 3. Fluxo do leilão — onde termina hoje

| Etapa | Estado | Evidência |
|---|---|---|
| Criação | ✅ | `MerchantAuctions` → `create_auction_listing`; owner via trigger |
| Moderação/aprovação | ✅ | RIDV (2 triggers; `ai_status/moderation_status`) |
| Publicação/abertura | ✅ | `status='active'`, `starts_at/ends_at` |
| Lances | ✅ | `place_auction_bid` 2-arg → `auction_bids` + anti-sniper (+30s provado) |
| Tempo real | ✅ (publicado) | `auction_listings`+`auction_bids` na `supabase_realtime` — **falta validação e2e no navegador** |
| Encerramento automático | ✅ | cron 1/min → `orion_auction_close` (idempotente) |
| Encerramento manual | ✅ | `end_auction_listing` existe (corrigido pós-auditoria-1) |
| Vencedor | ✅ | `winner_user_id` + settlement `no_winner`/vencedor |
| Liquidação (settlement) | 🟡 | `orion_auction_settle` grava comissão 6%/créditos/certificado_hash — **débito real de créditos do arremate desligado até confirmar modelo**; sem PAY |
| Contato comprador↔vendedor | 🟡 | ALC cria deal `aguardando_contato`; `release_contact` checa pagamento (flag hoje `false`) |
| **Pagamento do vencedor** | ❌ | **0 ordens `pay_*` de leilão; nenhuma fn do domínio toca `pay_`/MP (verificado por scan de corpo)** |
| **Notificação (ganhou/encerrou)** | ❌ | nenhuma fn do fluxo notifica (scan=false em todas); só arremate_offers notifica a loja |
| **Entrega/logística** | ❌ | zero vínculo com `delivery_orders`/motoboy |

**O fluxo termina hoje em:** settlement gravado + deal ALC "aguardando_contato". Ninguém é avisado, nada é cobrado do vencedor, nada é entregue.

## 4. Sistema de lances

✅ Registro via RPC DEFINER com RLS (`bids_select_all`/`bids_insert_own`); `amount_cents`, `is_winning`, histórico completo; incremento mínimo (`minimum_increment`) validado; anti-sniper por trigger; maior lance = `current_bid`; empate: impossível empatar vencendo (lance precisa superar o atual — ordem de chegada decide); auditoria via `auction_events`/`orion_auction_audit` + `orion_auction_validate_bids`.
⚠ **Sobra técnica:** a sobrecarga 3-arg de `place_auction_bid` ainda existe e **escreve em colunas inexistentes** (quebra se chamada); `create_auction_listing` segue com **6 sobrecargas**.

## 5. Encerramento

Vencedor = maior lance ≥ reserva (`orion_auction_close`, idempotente — 2ª chamada não duplica); automático via cron 1/min; manual via `end_auction_listing`; cancelamento: sem fluxo formal de cancelamento com política (estorno de comissão/lances) — só status.

## 6. Painéis (e sobreposições)

| Público | Painel | Fonte |
|---|---|---|
| Comprador | `/leiloes`, `/leilao/:id`, Meus Lances, `/minha-reputacao` (AI-74) | RPCs + REST |
| Vendedor | `MerchantAuctions`, `MerchantArremate` | RPCs |
| Admin op. | `/admin/comando-leilao` (Command Center) | `auction_command_dashboard` |
| Admin fin. | `AdminAuctionIntelligence` (settlement/regras/seller) | `orion_auction_settlement_dashboard` + `auction_financial_rule_*` |
| IA | AI-67 Intelligence · AI-69 Growth · AI-70 Orchestrator · ALC Lifecycle · AI-74 Trust Center · RIDV | dashboards próprios |

**Sobreposições reais:** ① `AdminAuctionIntelligence` × `AdminOrionAuctionIntelligence` — nomes quase idênticos, funções diferentes (settlement × analytics) → renomear o primeiro para "Arremates & Regras Financeiras". ② `AuctionPublicPage` (/leilao/:id) × `AuctionMarketDetailPage` (/mercado/leiloes/:id) — 2 detalhes do mesmo leilão. ③ `AuctionListPage` × `AllAuctionsPage` — 2 listas públicas. Consolidar em 1 detalhe + 1 lista canônicos.

## 7. IAs no módulo

| IA | Responsabilidade | Estado |
|---|---|---|
| RIDV (AI-02) | moderação de anúncios (triggers) | ✅ vivo |
| Motor Leilões (`auctions`) | close/charge/suggest/antisniper/autoclose | ✅ vivo |
| AI-65 Settlement | liquidação (comissão 6%→créditos→contato); **débito real desligado** | 🟡 vivo, aguardando modelo financeiro |
| AI-67 Intelligence v2 | analytics read-only c/ `_auditoria` (MV diária) | ✅ vivo (dados insuficientes declarados) |
| AI-69 Growth | crescimento/expansão IBGE read-only | ✅ vivo |
| AI-70 Orchestrator | coordena 7 motores por descoberta; quality/health | ✅ vivo |
| AI-74 Trust & Reputation | pilar leilão no Trust Score (arremates honrados/disputas) | ✅ vivo |
| AI-41 Fraud | genérico; **0 eventos específicos de leilão**; `orion_auction_fraud_scan` próprio existe | 🟡 cobertura parcial |

## 8. Segurança

✅ RLS ligado nas 13 tabelas núcleo + ALC (anon = SELECT apenas; ALC sem grant anon); escrita de lance só via DEFINER; regras financeiras com audit trail; `auction_security_selftest` disponível; AI-70 valida 6 invariantes.
⚠ Pendências: sobrecarga 3-arg quebrada exposta; validação e2e do realtime; fraude específica de leilão sem detector no AI-41 (só scan local); `orion_alc_*` policies só admin (usuário não vê o próprio deal — bloqueia UI de disputa).

## 9. Integrações

| Módulo | Estado |
|---|---|
| Marketplace (vitrine/busca) | ✅ |
| Créditos do lojista | ✅ (`orion_auction_charge` + ledger) |
| Divulgação/Publisher | ✅ (pacotes 5/10/30) |
| IA/Gateway | ✅ |
| **Financeiro PAY/Carteiras** | ❌ (0 ordens; `pay_escrow_holds` existe e funciona — 19 holds de corridas — mas leilão não usa) |
| **Mercado Pago** | ❌ no fluxo do vencedor |
| **Notificações/Mensagens** | ❌ (infra existe: `notification_events`, `user_notifications`, Resend — nada plugado) |
| **Motoboy/Moto-Táxi/Logística** | ❌ |

## 10. Funcionalidades — Concluído / Parcial / Não iniciado

**Concluído:** criação, moderação, lances+anti-sniper, encerramento auto+manual, vencedor, comissão do lojista, RLS, realtime publicado, regras financeiras versionadas, analytics (67/69/70), reputação (74), telas de disputa pública/lojista/admin.
**Parcial:** settlement (débito real off), ALC contato/conclusão (motor sim, UI/notif não), fraude (scan local, AI-41 sem detector), arremate-ofertas (0 listings; modal com fallback de INSERT), realtime (publicado, não validado e2e).
**Não iniciado:** pagamento do vencedor (PAY/MP/escrow), notificações pós-encerramento, entrega/logística, "meus arremates ganhos", disputa com UI, reembolso, contrato digital.

## 11. Duplicações (consolidar)

1. `create_auction_listing` ×6 sobrecargas → 1 canônica (dropar mortas).
2. `place_auction_bid` 3-arg quebrada → dropar.
3. `AdminAuctionIntelligence` × `AdminOrionAuctionIntelligence` → renomear/fundir.
4. 2 páginas de detalhe + 2 de lista públicas → 1+1 canônicas.
5. `submit_arremate_offer` ×2 + fallback INSERT direto no modal → 1 RPC única.
6. 3 documentos de auditoria/certificação sobrepostos → este documento passa a ser o vigente.

## 12. Lacunas para um sistema profissional

Pagamento do arremate (checkout vencedor + escrow + webhook) · notificação aos 2 lados (regra da casa!) · entrega integrada · painel "meus arremates ganhos" · disputa/reembolso operáveis · contrato/termo de arremate · limpeza de sobrecargas · validação e2e do realtime.

## Parte Especial — suporte hoje

| Item | Resposta | Justificativa |
|---|---|---|
| Arremate | **PARCIAL** | vencedor+settlement+deal ALC existem; cobrança/entrega/telas não |
| Contrato Digital | **NÃO** | só `certificado_hash`/`certificado` no settlement (semente de comprovante, não contrato com aceite) |
| Pagamento pós-leilão | **NÃO** | nenhuma fn toca `pay_`/MP; 0 ordens de leilão |
| Escrow | **PARCIAL** | `pay_escrow_holds` existe e é usado por corridas (19 holds) — leilão não usa |
| Entrega | **NÃO** | sem vínculo com `delivery_orders` |
| Logística | **NÃO** | idem (motoboy/moto-táxi não acionados) |
| Disputas | **PARCIAL** | `orion_alc_disputes` completa (motivo/evidências/decisão), n=0, sem UI usuário/admin |
| Cancelamentos | **PARCIAL** | encerramento manual sim; política de cancelamento c/ estorno não |
| Reembolso | **NÃO** | não há pagamento, logo não há reembolso |
| Histórico completo | **PARCIAL** | leilão/lances/eventos/scores/settlement sim; pós-venda (pagamento/entrega) inexiste |
| Auditoria dos arremates | **PARCIAL** | `orion_auction_audit` + evidência/fraude_score no settlement + invariantes AI-70; sem trilha financeira (não há dinheiro) |

## Nota do módulo: **78/100**

| Área | Peso | Nota |
|---|---|---|
| Motor de disputa | 20 | 18 |
| Encerramento/vencedor/comissão | 15 | 14 |
| Segurança/RLS | 15 | 13 |
| Realtime | 10 | 8 |
| Pagamento do vencedor | 15 | 1 |
| Entrega/pós-venda (ALC) | 10 | 3 |
| Telas | 10 | 9 |
| Admin/analytics/IA | 8 | 8 |
| Integrações ORION | 7 | 6 |
| **Total** | 100 | **≈78** |

## Checklist de maturidade

- [x] Disputa (criar→lance→anti-sniper→encerrar) provada e idempotente
- [x] RLS + anon só-SELECT em todo o domínio
- [x] Realtime publicado
- [x] Regras financeiras versionadas + settlement engine
- [x] Analytics/orquestração/reputação (AI-65/67/69/70/74)
- [ ] Realtime validado e2e no navegador
- [ ] Pagamento do vencedor (PAY+MP+escrow)
- [ ] Notificações pós-encerramento (2 lados)
- [ ] Telas comprador (ganhos) e admin (disputa/cancelar)
- [ ] Entrega/logística
- [ ] Contrato digital + reembolso
- [ ] RPCs consolidadas (sem sobrecargas mortas)

---

## CONCLUSÃO OBRIGATÓRIA

### O módulo está pronto para o Sistema de Arremates?
**🟡 PARCIALMENTE.** A fundação (disputa, encerramento, segurança, realtime, settlement, regras financeiras, ALC, analytics) está pronta e provada. Falta exatamente o que o Sistema de Arremates é: **dinheiro (pagamento/escrow/reembolso), comunicação (notificações) e entrega**.

### Pré-requisitos antes de implementar Arremates
1. **Decisão de modelo financeiro do arremate** (bloqueio de negócio): comprador paga pela plataforma (PAY+MP+escrow — recomendado, reusa fluxo provado das corridas) ou fora dela (só liberação de contato)? O `settlement_config.contact_requires_payment` já existe como chave dessa decisão.
2. **Higiene de RPC**: dropar `place_auction_bid` 3-arg (quebrada) e 5 sobrecargas mortas de `create_auction_listing` — evita PGRST203 no meio do novo fluxo.
3. **Policies ALC para o usuário** (hoje só admin): comprador/vendedor precisam ler o próprio deal para qualquer UI de arremate/disputa.
4. **Validação e2e do realtime** (2 navegadores, lance ao vivo).
5. **Notificações plugadas** (infra Resend/`notification_events` já existe — regra da casa: sempre e-mail aos 2 lados).

### Ordem recomendada (sem retrabalho)
1. **FASE A — Contrato de dados** (0 retrabalho depois): `orion_auction_settlements` = fonte única do arremate; consolidar RPCs; policies ALC; definir estados do arremate (aguardando_pagamento→pago→em_entrega→concluído→disputa/reembolsado).
2. **FASE B — Pagamento**: ordem `pay_payment_orders(product_type='auction_settlement')` + escrow (`pay_escrow_holds`) + webhook MP (`pay_webhook_apply_event` já casa por `external_reference`) + atualizar `pagamento_ok`/`release_contact`.
3. **FASE C — Comunicação e telas**: notificações "ganhou/encerrou/pague/pago" (2 lados) + "Meus Arremates Ganhos" + painel do vendedor + admin (cancelar/disputa).
4. **FASE D — Entrega**: deal ALC pago → `delivery_orders` → despacho motoboy (fluxo pré-pago provado) + rastreio.
5. **FASE E — Confiança**: contrato/termo digital sobre o `certificado_hash` + reembolso via escrow + detectores de leilão no AI-41 + selo AI-74 "arremate honrado" (já pronto para consumir `pagamento_ok`).

> **Nada de Arremates foi implementado nesta etapa — auditoria e plano apenas, conforme solicitado.**
