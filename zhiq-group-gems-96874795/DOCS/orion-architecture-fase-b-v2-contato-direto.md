# ORION-ARCHITECTURE FASE B v2.0 — Liberação de Contato e Confirmação do Arremate (Pagamento Direto Comprador↔Vendedor)

> **Data:** 2026-07-19 · **Natureza:** ARQUITETURA (zero código/migration/DDL/Edge/API/tela) · **Método:** ancorada na introspecção ao vivo de `broifhfqmnzqoongtokm` (FASE A já implementada).
> **Base preservada:** ARCHITECTURE Pós-Leilão v1.0 (D1, D6, D7, D8) · **ARREMATES FASE A (implementada e viva)** · HARDENING FASE 1/2 · HOTFIX A.0 · REVIEW FASE A · CERTIFICAÇÃO v2.0.
> **Substitui:** ORION-ARCHITECTURE FASE B v1.0 (pagamento intermediado) e REVIEW FASE B1 (débito por carteira) — **revogados** (ver §Substituição).

---

## DECISÃO OFICIAL DO PROJETO (registrada)

1. **O pagamento do produto NÃO passa pela plataforma.** O comprador paga **diretamente** ao vendedor pelo meio acordado entre as partes (PIX, dinheiro, transferência, cartão, ou outro).
2. **A plataforma NÃO cobra comissão sobre o pagamento do produto** e **não recebe o valor do produto leiloado**.
3. **A plataforma apenas registra e audita o ciclo do arremate** (contato → pagamento direto → confirmações → entrega → avaliações → encerramento).
4. **A monetização oficial do módulo de Leilões vem exclusivamente dos Pacotes de Divulgação** (incluindo a modalidade de 6% definida para os pacotes), cobrados no **anúncio/promoção do leilão** — não no ciclo do arremate.

> Consequência arquitetural: removem-se do fluxo do arremate **Mercado Pago, Customer Wallet, Escrow financeiro e qualquer intermediação de pagamento**. A FASE A (máquina de estados, imutabilidade, auditoria, eventos) é **preservada integralmente** — muda apenas o **conjunto de estados/transições** (dados de `orion_arremate_transitions`), não o mecanismo.

---

## MONETIZAÇÃO OFICIAL — como o Pacote de Divulgação se integra ao ciclo do anúncio

| Aspecto | Definição oficial |
|---|---|
| **Quando a plataforma cobra** | No **anúncio/promoção do leilão** (momento da listagem ou impulsionamento), via **crédito do lojista** — o padrão de Divulgação já existente (`orion_auction_charge` + créditos + `auction_financial_rules`). |
| **O que é o "6%"** | Percentual da **regra de pacote** (`auction_financial_rules`, module=`auction`, `commission_percent=6`, `credits_per_real`), aplicado ao **custo do pacote/promoção do anúncio** — **NÃO** é comissão sobre a venda. |
| **Quem paga** | O **vendedor/lojista** (dono do anúncio), em **créditos**, ao publicar/promover — nunca o comprador, nunca extraído do pagamento P2P. |
| **Interferência no pagamento P2P** | **ZERO.** O pagamento comprador→vendedor é integral e direto; a plataforma não debita, não retém, não repassa. |
| **Colunas de settlement `comissao_*`** | Passam a ser **informativas/derivadas do pacote** (custo de divulgação já cobrado em créditos). **Nunca** disparam débito do comprador nem repasse à plataforma no fluxo do arremate. `orion_auction_apply_commission` permanece **apenas** como cobrança de créditos do pacote (monetização do anúncio), desacoplada do arremate. |

**Regra de ouro da monetização:** *receita da plataforma = pacote de divulgação (créditos do vendedor, no anúncio); pagamento do produto = 100% P2P, fora do alcance financeiro da plataforma.*

---

## ETAPA 1 — FLUXO OFICIAL (fluxograma completo)

```
┌──────────────── CICLO DO ANÚNCIO (monetização) ────────────────┐
│ Vendedor publica/promove o leilão → PACOTE DE DIVULGAÇÃO         │
│ (créditos do lojista · auction_financial_rules 6% · orion_auction_charge) │
└───────────────────────────────┬─────────────────────────────────┘
                                 │  (independente do ciclo do arremate)
                                 ▼
LEILÃO ENCERRADO ──► VENCEDOR DEFINIDO ──► SETTLEMENT ──► ARREMATE (nasce)
 (orion_auction_close,     (winner_user_id +      (orion_auction_settlements   (arremate_init →
  cron 1/min, idempotente)  valor_final; IMUTÁVEIS) = ENTIDADE; comissão=pacote)  arremate_status)
                                 │
                                 ▼
                    LIBERAÇÃO DE CONTATO  ◄── (evento contato.liberado; ALC deal: buyer_contato_at/seller_contato_at)
                     (dados das 2 partes via RPC guardada — habilita o pagamento direto)
                                 │
                                 ▼
                    PAGAMENTO DIRETO ENTRE COMPRADOR E VENDEDOR
                     (PIX / dinheiro / transferência / cartão / outro — FORA da plataforma)
                     ├─ comprador declara "paguei"      → pagamento.confirmado_comprador
                     └─ VENDEDOR confirma "recebi"       → pagamento.confirmado_vendedor  ◄── marco financeiro oficial (P2P)
                                 │
                                 ▼
                    ENTREGA  ─► vendedor envia/entrega (entrega.iniciada; seller_entregue_at)
                     (retirada OU FASE D: delivery_orders/motoboy quando fulfillment=delivery)
                                 │
                                 ▼
                    CONFIRMAÇÃO DO COMPRADOR  ─► "recebi o produto" (entrega.confirmada; buyer_recebido_at)
                                 │
                                 ▼
                    AVALIAÇÕES (2 lados)  ─► comprador↔vendedor (orion_alc_ratings; avaliacao.registrada)
                                 │
                                 ▼
                    ENCERRADO ✅ (arremate_status='concluido'; arremate.concluido; AI-74 selo "arremate honrado")

 Desvios (em qualquer ponto após o contato):
   ── EM DISPUTA ──► registro + decisão admin ──► retoma OU cancelado (SEM movimentação financeira — só auditoria)
   ── SEM PROGRESSO no prazo ──► expirado ──► cancelado (nada a estornar; a plataforma nunca reteve valor)
   ── DESISTÊNCIA (qualquer parte) ──► cancelado (auditado)
```

**Diferença estrutural vs v1.0:** o **contato é liberado ANTES do pagamento** (é o que habilita as partes a combinarem o PIX/pagamento direto). Na v1.0, o contato só saía após o pagamento intermediado (escrow). Na v2.0, **não há intermediação**, então o marco financeiro oficial é a **confirmação do vendedor** de que recebeu o pagamento — não um webhook.

---

## ETAPA 2 — LIBERAÇÃO DO CONTATO (quando e como)

**Quando:** **Imediatamente após o nascimento do arremate** (settlement criado + `arremate_init`), assim que existe um vencedor definido. O contato é o **pré-requisito operacional** do pagamento direto — as partes precisam se comunicar para combinar o meio de pagamento.

**Condicionantes (resposta explícita):**
- **Imediatamente após o encerramento?** ✅ **SIM, praticamente** — logo após o settlement (vencedor confirmado). Não espera pagamento algum da plataforma (`contact_requires_payment=false`, já é o estado vigente — alinhado à decisão P2P).
- **Condicionado às regras do pacote?** 🟡 **Condicionado no ANÚNCIO, não no contato.** O direito de o leilão existir/promover já foi pago pelo vendedor via **Pacote de Divulgação** na listagem. A liberação de contato em si **não cobra nada** e **não espera** pagamento por-arremate. A monetização é **a montante** (no anúncio), não no gate de contato.
- **Condicionado a outra validação?** ✅ **SIM, validações não-financeiras:** (a) parecer de fraude (`orion_auction_fraud_scan` + AI-41) — recomenda, nunca bloqueia sozinho; (b) settlement válido com vencedor (`winner_user_id` não nulo); (c) ambas as partes identificadas. PII (`profiles` tem CPF) sai **apenas via RPC guardada** (`get_public_profile`/snapshot: nome + contato mínimo), nunca por RLS ampla.

**Como:** RPC SECURITY DEFINER guardada (`arremate_release_contact`, a criar na implementação) que: valida o estado, grava `contato_liberado=true` + `arremate_status='contato_liberado'` via `arremate_transition`, carimba `orion_alc_deals.buyer_contato_at/seller_contato_at`, emite `contato.liberado`, e devolve os dados de contato das 2 partes (via snapshot guardado). Notifica os 2 lados (regra da casa).

---

## ETAPA 3 — CONFIRMAÇÕES (fluxo e estados permitidos)

Quatro sinais de confirmação, **registrados nas colunas que já existem em `orion_alc_deals`**:

| Ator | Confirmação | Sinal (ALC deal) | Evento | Efeito no `arremate_status` |
|---|---|---|---|---|
| **Comprador** | "realizei o pagamento" | (novo flag `buyer_pagou_at` ou metadado) | `pagamento.confirmado_comprador` | permanece `aguardando_pagamento` (sinal informativo) |
| **Vendedor** | "recebi o pagamento" | `seller_*` (marco financeiro P2P) | `pagamento.confirmado_vendedor` | → `pagamento_confirmado` |
| **Vendedor** | "enviei / entreguei o produto" | `seller_entregue_at` | `entrega.iniciada` | → `em_entrega` (ou `entregue` na retirada) |
| **Comprador** | "recebi o produto" | `buyer_recebido_at` | `entrega.confirmada` | → `recebimento_confirmado` |

**Regra de dupla confirmação do pagamento (P2P):** como não há webhook, o **marco financeiro oficial é a confirmação do VENDEDOR** (`pagamento.confirmado_vendedor`). A confirmação do comprador (`pagamento.confirmado_comprador`) é registrada para trilha/disputa, mas **não** avança sozinha o estado — evita que só o comprador "declare pago" e force progresso. Divergência entre os dois sinais = gatilho de **disputa** (ETAPA 11).

**Estados permitidos das confirmações:** cada confirmação só é aceita no estado anterior correto (ex.: "recebi o produto" só após `em_entrega`/`entregue`). Confirmações fora de ordem são **rejeitadas** pela tabela de transições. Toda confirmação é **idempotente** (repetir = no-op) e **imutável** (carimbo com timestamptz, sem UPDATE posterior).

---

## ETAPA 4 — MÁQUINA DE ESTADOS OFICIAL v2.0 (sem dependência financeira)

Fonte única = **`arremate_status`** (FASE A, coluna viva). Transições **somente** via `arremate_transition()` (função, trigger de proteção, auditoria e eventos **preservados da FASE A** — muda só o conteúdo de `orion_arremate_transitions`).

| # | Estado | Entra por | Sai para | Ator |
|---|--------|-----------|----------|------|
| 1 | `aguardando_contato` | `arremate_init` (settlement + vencedor) | 2 · 12 · 11 | motor |
| 2 | `contato_liberado` | `arremate.contato_liberado` (fraude ok + partes ok) | 3 · 10 · 11 | motor/admin |
| 3 | `aguardando_pagamento` | `arremate.aguardando_pagamento` (contato entregue) | 4 · 10 · 11 · 12 | motor |
| 4 | `pagamento_confirmado` | `pagamento.confirmado_vendedor` (VENDEDOR recebeu) | 5 · 10 | vendedor |
| 5 | `em_entrega` | `entrega.iniciada` (vendedor enviou) | 6 · 10 | vendedor/delivery |
| 6 | `recebimento_confirmado` | `entrega.confirmada` (COMPRADOR recebeu, ou auto-confirm D+N) | 7 | comprador/auto |
| 7 | `aguardando_avaliacao` | `arremate.avaliacoes_abertas` (automático) | 8 | motor |
| 8 | `concluido` ✅ terminal | `arremate.concluido` (avaliações feitas ou janela expirada) | — | motor |
| 10 | `em_disputa` | `arremate.disputa_aberta` (congela; SEM escrow — só registro) | estado anterior (improcedente) · 11 | comprador/vendedor/admin |
| 11 | `cancelado` ✖ terminal | `arremate.cancelado` (desistência/expiração/decisão admin) | — | motor/admin |
| 12 | `expirado` | `arremate.expirado` (sem progresso no prazo) | 11 | cron |

**Transições PROIBIDAS (invariantes duras):**
- Pular `contato_liberado` → qualquer estado ≥ `pagamento_confirmado`.
- Marcar `recebimento_confirmado` sem `em_entrega`.
- `pagamento_confirmado` por qualquer ator que **não** seja o vendedor (ou admin em disputa).
- Sair de terminal (`concluido`/`cancelado`) para qualquer estado.
- Alterar `winner_user_id`/`valor_final` após o settlement (imutáveis — **trigger FASE A preservado**).
- Retroceder (exceto `em_disputa`→estado anterior por disputa improcedente).

**Estados REMOVIDOS da v1.0 (dependiam de pagamento intermediado):** `pagamento_em_processamento`, `pago` (escrow ativo), `escrow_ativo`, `financeiro_liquidado`, `reembolsado`. **Não há mais** MP, carteira, escrow, hold, release, refund no fluxo do arremate.

**Mapeamento dos settlements existentes** (migração de dados na implementação, não nesta arquitetura): `aguardando_pagamento` (FASE A) → `aguardando_contato` ou `aguardando_pagamento` v2 conforme `contato_liberado`; `pago` (FASE A) → `pagamento_confirmado` v2. **Nenhum dado se perde** (booleans espelho preservados).

---

## ETAPA 5 — EVENTOS OFICIAIS (bus `orion_eventos`, sem duplicar existentes)

**Já existem e são reusados:** `arremate.criado`, `arremate.estado_alterado`, `arremate.concluido`, `arremate.cancelado`, `arremate.expirado`, `arremate.disputa_aberta` (emitidos por `arremate_transition`). **`pagamento.confirmado` (legado, genérico)** — **substituído** pelos dois específicos abaixo; marcar legado, não reutilizar ambíguo.

| Evento oficial v2.0 | Novo? | Origem | Efeito | Consumidores |
|---|---|---|---|---|
| `contato.liberado` | ✅ novo | motor (`arremate_release_contact`) | libera dados às 2 partes | Notif (2 lados), ALC, telas |
| `pagamento.confirmado_comprador` | ✅ novo | comprador | registra declaração (trilha/disputa) | Auditoria, AI-74, Notif |
| `pagamento.confirmado_vendedor` | ✅ novo | vendedor | **marco financeiro P2P** → `pagamento_confirmado` | Notif, AI-74, ALC |
| `entrega.iniciada` | ✅ novo | vendedor/delivery | vendedor enviou | Notif, telas, FASE D |
| `entrega.confirmada` | ✅ novo | comprador (ou auto) | comprador recebeu | Notif, PAY? (não — P2P), AI-74 |
| `avaliacao.registrada` | ✅ novo | ALC ratings | alimenta reputação | AI-74, Notif |
| `arremate.finalizado` | 🔁 = `arremate.concluido` | motor | **reusa o existente** (não duplicar) | AI-67/69/74, Notif |
| `disputa.aberta` / `disputa.encerrada` | 🔁 alinhar a `arremate.disputa_aberta` + novo `disputa.encerrada` | ALC/admin | congela/destrava | Notif, Admin, AI-74/41 |

**Regra:** evento nunca é apagado nem editado; emissão **só pelo motor/ALC** (service_role); IA nenhuma emite/transita (herdado da FASE A/D7). Eventos financeiros da v1.0 (`escrow.criado/liberado`, `refund.executado`, `comissao.calculada`, `pagamento.criado/recebido/expirado` no sentido de webhook) **NÃO existem** neste modelo.

---

## ETAPA 6 — AUDITORIA (registro obrigatório)

Cada transição/confirmação grava, de forma **imutável**:

| Campo | Fonte |
|---|---|
| **data/hora** | `timestamptz` (`arremate_status_at`, `*_at` do ALC, `orion_auction_audit.created_at`, `orion_eventos`) |
| **comprador / vendedor** | `winner_user_id` / `seller_user_id` (settlement) + `buyer_user_id`/`seller_user_id` (ALC deal) |
| **mudança de estado** | `orion_auction_audit(acao='arremate.estado_alterado', detalhes={de,para,motivo})` — **já implementado FASE A** |
| **confirmações** | colunas `*_at` do ALC deal (contato/entregue/recebido/concluído) + eventos específicos |
| **ator** | `p_ator` da transição (`motor`/`cron`/user_id) |
| **histórico completo** | 3 camadas: ① `orion_auction_audit` (arremate) · ② eventos `arremate.*/contato.*/pagamento.*/entrega.*/avaliacao.*` no bus · ③ `orion_alc_events` (trilha operacional ALC) |

**Proibido DELETE/UPDATE** nas 3 camadas. Note: **não há 4ª camada financeira** (`pay_ledger_entries`) porque a plataforma não move dinheiro — a trilha do pagamento é a **confirmação registrada das partes**, não um ledger.

---

## ETAPA 7 — SEGURANÇA

| Requisito | Mecanismo |
|---|---|
| **Imutabilidade do vencedor** | trigger FASE A `tg_arremate_settlement_protect` (winner_user_id sem UPDATE) — **preservado** |
| **Imutabilidade do valor do arremate** | idem (valor_final imutável pós-settlement) — **preservado** |
| **Proteção das confirmações** | cada `*_at` grava 1× (idempotente); sem UPDATE posterior; transição valida ator+estado |
| **Prevenção de alterações indevidas** | `arremate_transition` valida contra `orion_arremate_transitions`; `set_config('arremate.transition')` é a única porta que o trigger aceita; RPCs SECURITY DEFINER com guarda de papel (comprador/vendedor/admin/motor) |
| **Trilha completa** | ETAPA 6 (3 camadas imutáveis) |
| **PII / contato** | só via RPC guardada pós-`contato_liberado` (`profiles` tem CPF — nunca RLS ampla) |
| **Menor privilégio** | motor/cron = service_role; leitura = authenticated; `REVOKE EXECUTE FROM PUBLIC, anon` em toda RPC nova (lição AI-61 + HARDENING FASE 1/2); selftest dedicado (padrão `auction_security_selftest`) |
| **Policies ALC das partes** | comprador/vendedor precisam LER o próprio deal (hoje só admin) — **pré-requisito da implementação** (herdado da FASE A pendente) |

**Nenhuma movimentação financeira existe para proteger** — a superfície de risco financeiro do arremate **desaparece** (sem escrow/carteira/webhook). Resta proteger **estado, confirmações e PII**.

---

## ETAPA 8 — INTEGRAÇÃO (responsabilidades por módulo)

| Módulo | Papel na FASE B v2.0 | Estado |
|---|---|---|
| **ALC** | **trilha operacional central**: contato, confirmações (pgto/envio/recebimento), conclusão, disputas, avaliações. Colunas já existem em `orion_alc_deals`/`_ratings`/`_disputes`/`_events` | ✅ pronto (faltam policies das partes) |
| **Marketplace** | vitrine/origem do item; "Meus Arremates" (FASE C) | ✅ |
| **Leilões (motor)** | encerrar + definir vencedor + settlement (fonte do arremate) | ✅ vivo |
| **Reputação (AI-74)** | LÊ confirmações/ratings/disputas → Trust Score + selo "arremate honrado" | ✅ (consome `pagamento_ok`/deal) |
| **Motoboy / Moto-Táxi / Delivery** | execução física **quando `fulfillment=delivery`** (FASE D) — acionada em `em_entrega` | 🟡 FASE D |
| **Notificações** | comunicar TODOS os marcos aos 2 lados (Resend + `notification_events`) | 🟡 infra pronta; templates FASE C |
| **IA (41/67/69/70)** | parecer de fraude (pré-contato) + analytics + orquestração — **read-only** | ✅ |
| **Divulgação/Pacotes** | **monetização** (créditos do vendedor no anúncio) — desacoplada do arremate | ✅ vivo |
| **PAY / Escrow / MP / Carteiras** | **NÃO participam** do fluxo do produto (removidos) | ➖ n/a |

---

## ETAPA 9 — ENTREGA (como a FASE D é acionada)

- **Quando nasce a entrega?** No estado **`pagamento_confirmado`** (vendedor confirmou o recebimento do pagamento direto) → habilita a preparação do envio. A entrega **começa** quando o vendedor aciona "enviar/entregar" (→ `em_entrega`, evento `entrega.iniciada`).
- **Quem inicia?** O **vendedor** (marca envio) — ou o sistema, se `fulfillment=delivery` no listing, cria uma `delivery_order` e despacha (fluxo pré-pago das corridas, provado).
- **Como integrar à logística?** Via o campo **`fulfillment`** do listing: `retirada` → sem logística (comprador retira; confirmação direta); `delivery` → cria `delivery_orders` → despacho motoboy/moto-táxi (padrão provado), marcos rastreados no ALC (`seller_entregue_at`, rastreio), confirmação final pelo comprador (`buyer_recebido_at`) ou auto-confirmação D+N. **A logística é paga pelo fluxo de entrega próprio (corrida), não pelo arremate** — coerente com "plataforma não intermedia o produto".

---

## ETAPA 10 — REPUTAÇÃO

- **Comprador avalia vendedor** e **vendedor avalia comprador**: **abertos no estado `aguardando_avaliacao`** (após `recebimento_confirmado`), registrados em `orion_alc_ratings` (`rater_party` buyer/seller, `stars` + dimensões `pontualidade/comunicacao/qualidade/experiencia`). Evento `avaliacao.registrada`.
- **Janela:** N dias após o recebimento; sem avaliação na janela → arremate conclui mesmo assim (avaliação vira opcional/expira).
- **Alimentação do módulo (AI-74):** o Trust Score consome (read-only) as avaliações + o histórico de confirmações honradas (pagamento confirmado pelo vendedor, entrega confirmada pelo comprador, ausência de disputa) para o pilar de leilão e o **selo "arremate honrado"**. AI-74 **nunca transita estado** — só lê.

---

## ETAPA 11 — DISPUTAS (sem intermediação financeira — só registro e auditoria)

Registradas em `orion_alc_disputes` (motivo, evidências, decisão); abrir disputa leva a `em_disputa` (congela transições).

| Caso | Fluxo |
|---|---|
| **Comprador diz que pagou, vendedor discorda** | comprador tem `pagamento.confirmado_comprador`; vendedor não confirmou → disputa → admin analisa evidências (comprovante PIX etc.) → **decisão registrada**: retoma (vendedor confirma) ou cancela (auditado). A plataforma **não devolve dinheiro** (nunca o teve) — só registra o veredito e ajusta reputação. |
| **Vendedor diz que enviou, comprador discorda** | vendedor tem `entrega.iniciada`; comprador não confirmou recebimento → disputa → admin analisa rastreio/evidências → retoma ou cancela. |
| **Cancelamento** | qualquer parte solicita antes da conclusão → `cancelado` (auditado); sem estorno (sem custódia). |
| **Desistência** | comprador desiste de pagar OU vendedor desiste de entregar → `cancelado` + impacto na reputação (calote registrado). |

**Princípio:** a plataforma **arbitra reputacional e operacionalmente** (registra decisão, ajusta Trust Score, pode banir reincidentes), mas **nunca movimenta dinheiro** — não há refund porque não há escrow. SLA de decisão recomendado: 7 dias (alerta admin D+3, escalada D+7). AI-41 + `orion_auction_fraud_scan` fornecem parecer (recomenda, não decide).

---

## ENTREGÁVEIS

- **Arquitetura oficial:** este documento. **Fluxograma:** ETAPA 1. **Máquina de estados:** ETAPA 4. **Eventos:** ETAPA 5. **Responsabilidades/integrações:** ETAPAS 8/9. **Auditoria:** ETAPA 6. **Segurança:** ETAPA 7.

### Plano da FASE C (Comunicação e Telas)
1. Templates de notificação (Resend/`notification_events`) para TODOS os marcos, **aos 2 lados**: ganhou · contato liberado · confirme pagamento (comprador) · confirme recebimento do pagamento (vendedor) · envie o produto · confirme o recebimento · avalie · disputa.
2. Telas: **"Meus Arremates Ganhos"** (comprador — timeline de estados + botões de confirmação + contato do vendedor); aba **"Arremates"** no `MerchantAuctions` (vendedor — confirmar pagamento recebido/envio + contato do comprador); fila **admin** (disputas/cancelamentos).
3. Republicar Edge `send-event-notification`. Policies ALC das partes. Validação e2e do realtime.

### Plano da FASE D (Entrega)
1. Roteamento por `fulfillment` (`retirada`|`delivery`) do listing.
2. `delivery` → cria `delivery_order` no `pagamento_confirmado`/`em_entrega` → despacho motoboy (fluxo provado) → rastreio nos marcos ALC → confirmação do comprador (`buyer_recebido_at`) ou auto-confirm D+N.
3. `retirada` → sem logística; confirmação direta do comprador.
4. Decisão de negócio do frete (comprador paga a corrida à parte — recomendado) — **não intermedia o produto**.

---

## SUBSTITUIÇÃO DA ARQUITETURA ANTERIOR

Este documento **substitui oficialmente**: `orion-architecture-fase-b-pagamento.md` (v1.0, pagamento intermediado) e `orion-review-fase-b1-carteira.md` (débito por carteira). Ambos ficam **arquivados como histórico/revogados**. As decisões da **ARCHITECTURE Pós-Leilão** que dependiam de pagamento intermediado (D2 "contato só após pagamento", D3 trilho de pagamento, D4 escrow, D5 comissão sobre venda) são **reinterpretadas** pela decisão oficial P2P; **D1** (arremate = `orion_auction_settlements`), **D6** (ALC trilha operacional), **D7** (eventos canônicos), **D8** (notificação 2 lados) **permanecem válidas**.

---

## CRITÉRIO FINAL

**A nova arquitetura da FASE B está consolidada?** ✅ **SIM** — fluxo único P2P (11 marcos), máquina de 11 estados sem dependência financeira (ancorada no mecanismo FASE A vivo), eventos oficiais sem duplicação, monetização por pacote de divulgação definida e desacoplada, confirmações mapeadas às colunas ALC existentes, auditoria em 3 camadas imutáveis, segurança de estado/PII/imutabilidade, disputas sem intermediação, planos C e D.

**O novo fluxo substitui oficialmente a arquitetura financeira anterior?** ✅ **SIM** — remove MP/Customer Wallet/Escrow/pagamento intermediado; a receita passa a ser exclusivamente o Pacote de Divulgação.

**Incompatibilidade com a FASE A?** **NÃO há incompatibilidade de mecanismo.** A FASE A (função `arremate_transition`, trigger de imutabilidade winner/valor, auditoria, eventos, `arremate_init`, colunas `arremate_status`/`_at`/`_expires_at`, ALC) é **100% preservada e reusada**. A única mudança é o **conteúdo da tabela de transições `orion_arremate_transitions`** (novos estados P2P substituem os estados financeiros `pagamento_em_processamento`/`pago`) — exatamente o tipo de evolução para que a FASE A foi desenhada (máquina data-driven). Os 2 settlements existentes têm mapeamento definido (§ETAPA 4). Nota de atenção: os nomes de estado da FASE A embutem semântica de pagamento (`aguardando_pagamento`/`pago`) — na v2.0 `aguardando_pagamento` passa a significar "aguardando pagamento **direto**" e `pago` é substituído por `pagamento_confirmado` (vendedor confirmou). Isso é **renomeação/remapeamento de dados** na implementação, não conflito de arquitetura.

**Decisões de negócio ainda pendentes:**
1. **Auto-confirmação de recebimento** (D+N): existe janela automática se o comprador não confirmar o recebimento do produto? Valor de N (recomendado: D+7). Sem ela, um comprador silencioso trava a conclusão.
2. **Janela de confirmação do pagamento pelo vendedor**: prazo para o vendedor confirmar (ou expirar/cancelar) — recomendado 48–72h.
3. **Política de calote/desistência**: consequências de reputação (banimento por reincidência?) para quem não paga/não entrega.
4. **Frete** (FASE D): comprador paga a corrida à parte (recomendado) vs retirada — não bloqueia B/C.
5. **Reconciliação do "6%" no settlement**: confirmar que `comissao_*` no settlement passa a representar **o custo do pacote de divulgação** (informativo) e é **zerado/ignorado** como comissão de venda — decisão de dado, para a implementação não gerar cobrança.
6. **Avaliação obrigatória ou opcional** para concluir (recomendado: opcional, com janela).

---

# 🟢 ORION-ARCHITECTURE FASE B v2.0 APROVADA

**Justificativa:** a arquitetura reflete fielmente o modelo de negócio definitivo — **pagamento do produto 100% direto entre comprador e vendedor, plataforma sem intermediação financeira, receita exclusivamente por Pacotes de Divulgação**. Ela **preserva integralmente a FASE A** (mecanismo de estados, imutabilidade, auditoria, eventos), reusa a trilha ALC e as colunas de confirmação **já existentes** (zero tabela nova), remove toda a superfície financeira de risco (escrow/MP/carteira) do fluxo do produto, define eventos sem duplicar os existentes, e mantém a segurança/menor-privilégio do HARDENING. As pendências são **decisões de negócio** (janelas, calote, frete, semântica do 6%) que **não bloqueiam** a evolução (FASE C pode começar sobre esta arquitetura). Nenhuma implementação, migration ou alteração foi feita nesta etapa — apenas arquitetura.

---

*Arquitetura read-only. Nenhum dado/código/permissão alterado. Ancorada em introspecção ao vivo de `broifhfqmnzqoongtokm` (FASE A implementada), 2026-07-19.*
