# ORION-ARCHITECTURE v1.0 — Fluxo Oficial do Pós-Leilão

> **Data:** 2026-07-18 · **Natureza:** ESPECIFICAÇÃO (zero código, zero migration, zero mudança de banco/tela)
> **Base factual:** ORION-AUDIT LEILÕES v1.0 (`orion-audit-leiloes-v1.md`, score 78) — banco vivo introspectado.
> **Status:** ARQUITETURA OFICIAL — a partir deste documento, todo módulo do pós-leilão (Arremates, Pagamento, Escrow, Entrega, Contrato, Reputação, Auditoria) implementa **este** fluxo, e nenhum outro.

---

## Etapa 1 — Estado atual (fatos verificados)

**Onde o fluxo termina hoje:** cron `orion_auction_autoclose` (1/min) → `orion_auction_close` define `winner_user_id` → `orion_auction_settle` grava `orion_auction_settlements` (comissão 6% via `auction_financial_rules`, `certificado_hash`, `fraude_score`) → cron `orion_alc_sync` (*/10) cria `orion_alc_deals` em `aguardando_contato`. **FIM.** Ninguém é notificado; vencedor não paga; nada é entregue.

**Participam hoje:** RIDV (moderação), motor leilões (close/charge/antisniper), AI-65 Settlement (débito real desligado), ALC (deals/disputes/ratings — policies só admin), regras financeiras (6% · 3.3333 cr/R$), AI-67/69/70 (analytics/orquestração), AI-74 (reputação — pilar leilão pronto, consome `pagamento_ok`), AI-41 (genérico; scan próprio `orion_auction_fraud_scan`).

**Persistem hoje:** `auction_listings/bids/events/watchers`, `orion_auction_settlements` (+config), `auction_financial_rules`(+audit), `orion_auction_audit/reports/alerts/score_history`, `orion_alc_deals/disputes/ratings/events`. **Eventos hoje:** `auction_events` por listing + alertas; sem eventos canônicos de arremate no bus `orion_eventos`.

**Não participam (lacunas):** PAY/carteiras/MP (0 ordens de leilão), notificações, delivery/motoboy, contrato digital.

---

## Etapa 2 — Fluxo Oficial (sequência única)

```
ENCERRAMENTO ─► SETTLEMENT ─► ARREMATE ─► NOTIFICAÇÕES ─► PAGAMENTO ─► ESCROW ─► CONTRATO
 (close 1/min)   (settle:       (settlement   ("ganhou/       (carteira OU     (customer_wallet   (gerado no
  winner_user_id  comissão 6%,   = ENTIDADE    vendeu" aos     Checkout MP,     → platform_escrow;  PAGO; hash
  idempotente)    certificado)   ARREMATE)     2 lados)        prazo 48h)       hold espelhado)     + aceite)
                                                                                      │
      ┌───────────────────────────────────────────────────────────────────────────────┘
      ▼
 LIBERAÇÃO DO CONTATO ─► ENTREGA ─► CONFIRMAÇÃO ─► LIBERAÇÃO FINANCEIRA ─► AVALIAÇÕES ─► REPUTAÇÃO ─► ENCERRADO
  (só após PAGO;           (retirada OU             (comprador confirma      (escrow → líquido        (ALC ratings   (AI-74 lê:     (CONCLUÍDO;
   dados via RPC            delivery_orders/         OU auto-confirm D+7     vendedor + comissão      2 lados)        selo "arremate  deal ALC
   guardada, 2 lados        motoboy; estados         sem disputa)            → platform_main;                         honrado")       concluído)
   notificados)             rastreados no ALC)                               espelho escrow_holds)
                                                          │
      desvios em qualquer ponto: ── EM DISPUTA ──► decisão admin ──► REEMBOLSADO (escrow→customer_wallet) ou retoma
                                  ── EXPIRADO (48h sem pagar) ──► CANCELADO (relist/2º colocado a critério do lojista)
```

**Decisões de arquitetura (oficiais):**
- **D1 — A entidade "Arremate" é `orion_auction_settlements`.** Nenhuma tabela nova de arremate. O estado oficial vive numa coluna nova `arremate_status` (futura migration da FASE A); os booleans atuais (`comissao_ok/creditos_ok/pagamento_ok/contato_liberado`) tornam-se derivados/espelho.
- **D2 — Contato só após pagamento**: `orion_auction_settlement_config.contact_requires_payment` passa a `true` (a chave já existe). Elimina o "leilão de fachada" (combinar por fora).
- **D3 — Pagamento em trilho duplo**: (a) saldo em `customer_wallet` → débito imediato; (b) sem saldo → `pay_payment_orders` (`product_type='auction_settlement'`, `external_reference` = settlement) + Checkout MP → webhook `pay_webhook_apply_event` credita a carteira → débito. **O vencedor é PESSOA → SEMPRE `customer_wallet`** (nunca `_pay_ride_payer_account`, que prefere merchant_wallet — armadilha documentada).
- **D4 — Todo dinheiro via `pay_post_transaction`** (partida dobrada) com chaves idempotentes do domínio: `auction_hold:<settlement_listing_id>` · `auction_release:<...>` · `auction_refund:<...>`. Segunda chamada = no-op. Espelho em `pay_escrow_holds` (padrão das corridas, 19 holds provados).
- **D5 — Comissão do arremate: fonte única = `auction_financial_rules`** (hoje 6%). Proibido hardcode em qualquer camada; front consume-only (nunca recalcula líquido).
- **D6 — ALC é a trilha operacional** (contato→entrega→conclusão + disputas + avaliações); **settlement é a fonte do estado financeiro**. O deal ALC referencia o settlement — nunca o contrário, nunca duplicando estado financeiro.
- **D7 — Eventos canônicos `arremate.*` no bus `orion_eventos`** (imutável), além de `auction_events` por listing. IA nenhuma muda estado: AI-41/67/69/70/74 leem; só o motor de settlement + PAY transitam.
- **D8 — Notificação em TODO marco, aos 2 lados** (regra da casa; Resend + `notification_events`/`user_notifications`).

---

## Etapa 3 — Máquina de Estados Oficial do Arremate

`arremate_status` (estado único; transições SOMENTE via RPCs do motor — nunca UPDATE direto):

| # | Estado | Entra por (evento) | Sai para |
|---|--------|--------------------|----------|
| 1 | `encerrado` | `arremate.leilao_encerrado` | 2 · `sem_vencedor`(terminal) |
| 2 | `vencedor_definido` | `arremate.vencedor_confirmado` | 3 |
| 3 | `settlement_criado` | `arremate.settlement_criado` | 4 |
| 4 | `aguardando_pagamento` | `arremate.cobranca_emitida` (prazo 48h — reusa `auto_prazo_arremate`) | 5 · 15(expirado) · 16(cancelado) |
| 5 | `pagamento_em_processamento` | `arremate.pagamento_iniciado` (ordem MP criada) | 6 · 4 (falha MP) |
| 6 | `pago` | `arremate.pagamento_recebido` (webhook/carteira) | 7 (automático, mesma transação) |
| 7 | `escrow_ativo` | `arremate.escrow_ativado` (`auction_hold:`) | 8 (automático) · 17(disputa) |
| 8 | `contato_liberado` | `arremate.contato_liberado` | 9 · 11 (retirada direta) · 17 |
| 9 | `preparando_envio` | `arremate.entrega_criada` | 10 · 17 |
| 10 | `em_transporte` | `arremate.entrega_iniciada` | 11 · 17 |
| 11 | `entregue` | `arremate.entrega_finalizada` | 12 · 17 |
| 12 | `recebimento_confirmado` | `arremate.recebimento_confirmado` (comprador OU auto-confirm D+7 sem disputa) | 13 (automático) |
| 13 | `financeiro_liquidado` | `arremate.escrow_liberado` (`auction_release:`) | 14 |
| 14 | `concluido` ✅ terminal | `arremate.concluido` (avaliações abertas; reputação atualiza) | — |
| 15 | `expirado` | `arremate.pagamento_expirado` (48h) | 16 (automático) |
| 16 | `cancelado` ✖ terminal | `arremate.cancelado` (expiração, desistência aprovada, decisão admin) | — |
| 17 | `em_disputa` | `arremate.disputa_aberta` (congela transições e o escrow) | estado anterior (disputa improcedente) · 18 |
| 18 | `reembolsado` ✖ terminal | `arremate.reembolso_executado` (`auction_refund:` escrow→customer_wallet) | — |

**Transições proibidas (invariantes duras):**
- Pular `pago` → qualquer estado ≥ `contato_liberado` (contato/entrega sem dinheiro em escrow: **PROIBIDO**).
- `financeiro_liquidado` sem `recebimento_confirmado` (liberar sem confirmação: **PROIBIDO**).
- Sair de terminal (`concluido`/`cancelado`/`reembolsado`) para qualquer estado.
- Reembolso sem passar por `em_disputa` OU sem decisão admin registrada.
- Retroceder estados (exceto 5→4 por falha de pagamento e 17→anterior por disputa improcedente).
- Alterar `winner_user_id`/`valor_final` após `settlement_criado` (imutáveis; correção = cancelar + auditoria).

---

## Etapa 4 — Responsabilidades (sem duplicação)

| Módulo | Responsabilidade ÚNICA no pós-leilão |
|---|---|
| Motor Leilões (`orion_auction_close`) | encerrar, definir vencedor (1×, idempotente) |
| **Settlement (AI-65)** | **dono da máquina de estados do arremate**; certificado/contrato; comissão via regras |
| `auction_financial_rules` | fonte única de comissão/percentuais |
| **PAY (`pay_*`)** | TODO movimento de dinheiro: hold, release, refund, carteiras, ledger, extrato |
| Mercado Pago | meio de pagamento externo (Checkout/PIX) → só entra via webhook `pay_webhook_apply_event` |
| Escrow (`platform_escrow` + `pay_escrow_holds`) | custódia entre pago e liquidado |
| **ALC** | trilha operacional: contato, marcos de entrega, conclusão, **disputas**, **avaliações** |
| Notificações (Resend + `notification_events`) | comunicar TODOS os marcos aos 2 lados |
| Delivery/Motoboy/Moto-Táxi | execução física da entrega quando `fulfillment=delivery` |
| Contrato Digital | gerado pelo Settlement no estado `pago` (Etapa 7) |
| AI-74 Reputação | LÊ resultado (pagamento_ok/disputas/ratings) → Trust Score + selo "arremate honrado" — nunca transita estado |
| AI-41 Fraud + `orion_auction_fraud_scan` | parecer de risco pré-liberação — **recomenda, nunca bloqueia sozinho** |
| Auditoria (`orion_auction_audit` + eventos + ledger) | trilha imutável de tudo (Etapa 10) |
| Admin/Operador | decisões humanas: disputa, cancelamento, reembolso, exceções |

---

## Etapa 5 — Mapa de Eventos (canônicos, imutáveis, bus `orion_eventos` tipo `arremate.*`)

| Evento | Origem | Destino/efeito | Dados mínimos | Consumidores |
|---|---|---|---|---|
| `leilao_encerrado` | close | settlement | listing_id, motivo (auto/manual) | Settlement, Notif, AI-67/70 |
| `vencedor_confirmado` | close | settlement | listing_id, winner_user_id, valor_final | Settlement, Notif, AI-74 |
| `settlement_criado` | settle | arremate nasce | settlement_id, comissão, certificado_hash | Notif, ALC, AI-65/70 |
| `cobranca_emitida` | settlement | comprador | valor, prazo (48h), meios | Notif (2 lados), telas |
| `pagamento_iniciado` | PAY | MP | order_id, external_reference | telas comprador |
| `pagamento_recebido` | PAY (webhook/carteira) | escrow | order_id, valor, meio | Settlement, Notif, AI-04 |
| `escrow_ativado` | PAY | custódia | chave `auction_hold:`, valor | Settlement, Auditoria |
| `contrato_gerado` | Settlement | registro | contrato_id, hash | partes, Auditoria |
| `contato_liberado` | settlement (`release_contact`) | partes | dados de contato (via RPC guardada) | Notif (2 lados), ALC |
| `entrega_criada` / `entrega_iniciada` / `entrega_finalizada` | Delivery/vendedor | ALC deal | deal_id, transportador, rastreio | Notif, telas |
| `recebimento_confirmado` | comprador (ou auto D+7) | liquidação | deal_id, confirmador (user/auto) | PAY, Notif |
| `escrow_liberado` | PAY | vendedor+plataforma | `auction_release:`, líquido, comissão | Settlement, Notif, AI-04/22 |
| `avaliacao_registrada` | ALC ratings | reputação | stars, dimensões, ratee | AI-74, Notif |
| `disputa_aberta` / `disputa_encerrada` | ALC disputes / admin | congela/destrava | motivo, evidências, decisão | Notif, Admin, AI-74/41 |
| `reembolso_executado` | PAY (decisão admin) | comprador | `auction_refund:`, valor | Settlement, Notif, Auditoria |
| `arremate_concluido` / `arremate_cancelado` / `pagamento_expirado` | settlement | terminal | estado final, causa | Notif, AI-67/69/74 |

Regra: **evento nunca é apagado nem editado**; consumidores idempotentes (dedupe por evento+entidade).

## Etapa 6 — Mapa de Integrações

| Integração | Uso no fluxo | Estado |
|---|---|---|
| Marketplace | vitrine, origem do item, "Meus Arremates" | pronto (telas novas na FASE C) |
| PAY/Financeiro/Carteiras | D3/D4 (hold/release/refund, `customer_wallet`→`platform_escrow`→`merchant_wallet`+`platform_main`) | motor provado nas corridas; RPCs do arremate a criar |
| Mercado Pago | Checkout/PIX, `external_reference`=settlement, webhook existente | pronto p/ reuso |
| Escrow | `pay_escrow_holds` espelho | provado (19 holds) |
| Motoboy/Moto-Táxi/Delivery | entrega quando `fulfillment=delivery` (campo já existe no listing) | a integrar (FASE D) |
| Notificações/Mensagens | todos os marcos, 2 lados | infra pronta; templates a criar |
| IA (41/67/69/70/74) | leitura/parecer; AI-74 já consome `pagamento_ok` | prontos |
| Auditoria | Etapa 10 | base pronta (`orion_auction_audit`) |

## Etapa 7 — Contrato Digital

- **Momento:** gerado automaticamente ao entrar em `pago` (dinheiro em escrow = negócio firmado).
- **Conteúdo (JSON canônico):** partes (buyer/seller user_id + nomes), item (listing_id, título, foto-hash), valor_final, comissão aplicada (regra id + %), condições de entrega/retirada, prazo, timestamps, versão do contrato, estado.
- **Identificador:** `settlement listing_id` (1 arremate = 1 contrato). **Certificado + hash:** sha256 do JSON canônico — **evolui o `certificado_hash` que JÁ existe** no settlement.
- **Assinatura eletrônica:** v1 = aceite-clique das 2 partes registrado (user, data/hora, IP quando disponível) como eventos imutáveis; ICP-Brasil/assinatura qualificada = **declarado fora do v1**.
- **Armazenamento:** `settlement.certificado` (jsonb) + eventos; **consulta:** RPC guardada (partes + admin), com verificação de integridade (re-hash = hash gravado).

## Etapa 8 — Segurança (requisitos obrigatórios)

1. RLS em toda tabela nova/coluna sensível; anon = no máximo SELECT público não-sensível; **policies ALC para as PARTES** (pré-requisito — hoje só admin).
2. Transição de estado SÓ por RPC SECURITY DEFINER com guarda de papel (comprador/vendedor/admin/motor) + validação de transição válida (tabela de transições da Etapa 3 embutida no motor).
3. **Winner e valor imutáveis** pós-settlement (sem UPDATE; trigger de proteção; correção = cancelamento auditado).
4. Dinheiro: apenas `pay_post_transaction` idempotente; front consume-only; erros financeiros nunca engolidos (toast com causa real).
5. Fraud gate: `orion_auction_fraud_scan` + AI-41 emitem parecer antes de `contato_liberado` e `escrow_liberado`; parecer adverso → recomendação de revisão humana (nunca bloqueio automático).
6. Contato/PII só via RPC guardada pós-pagamento (`profiles` tem CPF — nunca RLS ampla; `get_public_profile`/snapshot).
7. `REVOKE EXECUTE FROM PUBLIC, anon` em toda função nova (lição AI-61); selftest de segurança dedicado (padrão `auction_security_selftest`).

## Etapa 9 — Experiência do Usuário

| Ator | Telas | Notificações | Ações |
|---|---|---|---|
| **Comprador** | "Meus Arremates Ganhos" (nova; lista+detalhe com timeline de estados), checkout do arremate, contato do vendedor, rastreio, confirmação, avaliação, disputa | ganhou · pague em 48h · pagamento confirmado · contato liberado · em transporte · entregue · confirme o recebimento · liquidado · avalie · disputa/reembolso | pagar (saldo/MP) · ver contato · confirmar recebimento · avaliar · abrir disputa |
| **Vendedor** | painel MerchantAuctions ganha aba "Arremates" (estado+timeline), contato do comprador, marcar envio/entrega, extrato (líquido via ledger) | item arrematado · comprador pagou · contato liberado · prepare o envio · entregue · confirmado · valor liberado (líquido) · avaliação recebida · disputa | ver contato · informar envio/rastreo · acompanhar liquidação · responder disputa |
| **Admin** | `AdminAuctionIntelligence` (renomeado "Arremates & Regras Financeiras") ganha: fila de arremates por estado, disputa (decidir), cancelar/reembolsar, reprocessar | disputa aberta · pagamento expirado · parecer de fraude | decidir disputa · cancelar · reembolsar · exceções |
| **Operador/IA** | AI-70 monitora invariantes; AI-67/69 analytics; AI-74 reputação; Trust Center | alertas de correlação | somente leitura/recomendação |

Mensagens sempre com causa real e próximos passos ("Pague até 20/07 23:59 ou o arremate expira").

## Etapa 10 — Auditoria (nada se perde)

Registro obrigatório em CADA transição/evento: **quem** (user_id ou `motor`/`cron`/`webhook`), **quando** (timestamptz), **evento**, **estado anterior → novo**, **origem** (tela/RPC/cron/webhook), **destino**, **IP e dispositivo quando disponíveis** (chamadas via Edge/headers; RPC direta = declarado indisponível), payload mínimo (valores, ids).
Camadas: ① `orion_auction_audit` (trilha do arremate, imutável) · ② eventos `arremate.*` no bus (imutável) · ③ `pay_ledger_entries` (trilha financeira, partida dobrada) · ④ contrato com hash verificável. Proibido DELETE/UPDATE nas 4 camadas.

---

## Entregáveis finais

**Fluxograma completo:** Etapa 2. **Máquina de estados:** Etapa 3. **Eventos:** Etapa 5. **Integrações:** Etapa 6. **Responsabilidades:** Etapa 4.

### Sequência oficial de implementação (mínimo retrabalho)
1. **FASE A — Fundação de estado** (sem dinheiro): coluna `arremate_status` + tabela de transições no motor + eventos `arremate.*` + proteção winner/valor + policies ALC das partes + higiene RPC (dropar `place_auction_bid` 3-arg e 5 sobrecargas de `create_auction_listing`). *Tudo do resto depende disto.*
2. **FASE B — Dinheiro**: RPCs `arremate_pay` (carteira) / ordem MP `auction_settlement` + webhook → `auction_hold:` · prazo 48h/expiração · `auction_release:` · `auction_refund:` · `contact_requires_payment=true`.
3. **FASE C — Comunicação e telas**: templates de notificação (todos os marcos, 2 lados) + "Meus Arremates Ganhos" + aba Arremates do vendedor + fila admin.
4. **FASE D — Entrega**: integração delivery/motoboy por `fulfillment`, marcos no ALC, confirmação + auto-confirm D+7.
5. **FASE E — Confiança**: contrato digital completo (aceite 2 partes) + disputa/reembolso UI + fraud gate + selo AI-74 + selftest E2E do fluxo inteiro (COMANDO TESTE).

### Riscos e pontos de atenção
- **R1 (crítico):** liberar contato sem pagamento mata a monetização — D2 é a defesa; virar a flag só junto com a FASE B pronta.
- **R2:** carteira errada do pagador (`_pay_ride_payer_account` prefere merchant) — comprador é SEMPRE `customer_wallet`.
- **R3:** cobrança dupla — só as chaves idempotentes `auction_*:` protegem; proibido caminho paralelo de débito.
- **R4:** disputa após liquidação — release só após confirmação (invariante); janela D+7 é o equilíbrio.
- **R5:** sobrecargas mortas causarão PGRST203 no meio do novo fluxo — higiene na FASE A.
- **R6:** front recalculando líquido/comissão (bug histórico 20/25) — consume-only.
- **A1:** débito real de créditos do settlement está DESLIGADO — decisão de ligar acompanha FASE B.
- **A2:** realtime publicado mas sem validação e2e — validar na FASE C (telas novas dependem).

### Dependências técnicas
PAY vivo (✓ provado) · webhook MP (✓ existe) · Resend/notification_events (✓ infra, falta republicar `send-event-notification`) · delivery/motoboy (✓ fluxo provado nas corridas; adaptação FASE D) · ALC policies (FASE A) · decisão de negócio: frete do arremate (comprador paga à parte vs vendedor embute — **única decisão em aberto**, não bloqueia FASES A–C).

### Recomendações
Manter IAs read-only (nenhuma transita estado) · 1 tela canônica de detalhe/lista de leilão (consolidação da auditoria) · todo marco = evento + notificação + auditoria na MESMA transação do estado · selftest por fase, E2E na FASE E.

---

## Critério de Aprovação

**A arquitetura do pós-leilão está consolidada?** ✅ **SIM** — fluxo único, 18 estados com transições válidas/proibidas, 17 eventos canônicos, responsabilidades sem duplicação, contratos de segurança e auditoria definidos, ancorados no que EXISTE (settlement, ALC, regras, PAY, escrow provado).

**Pronto para iniciar o desenvolvimento do Sistema de Arremates?** ✅ **SIM** — a FASE A pode começar imediatamente; não há bloqueio técnico.

**Dependências a resolver antes/durante:** ① decisão de negócio sobre o frete do arremate (não bloqueia A–C); ② republicar a Edge `send-event-notification` (necessária na FASE C); ③ ligar `contact_requires_payment` e o débito real SOMENTE junto com a FASE B; ④ validação e2e do realtime (FASE C).
