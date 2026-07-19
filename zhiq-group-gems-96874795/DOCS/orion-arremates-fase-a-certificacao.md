# ORION-ARREMATES FASE A v1.0 — Certificação (Fundação do Sistema de Arremates)

> **Data:** 2026-07-18 · **Migration:** `20260719_arremate_fase_a_fundacao.sql` (idempotente, reaplicada 2×)
> **Rollback:** bloco no fim da migration + `DOCS/rollback-fase-a-fns.sql` (defs das 6 RPCs exportadas ANTES do drop)
> **Escopo:** SOMENTE estado + máquina + eventos + integridade + consolidação de RPC. **Nada de pagamento/MP/escrow/carteira/notificação/entrega/contrato/reembolso/tela/IA nova/API pública.**

---

## Objetos alterados (lista completa)

| Objeto | Tipo | Ação |
|---|---|---|
| `orion_auction_settlements.arremate_status` | coluna | **ADD** (nullable, CHECK domínio fechado) |
| `orion_auction_settlements.arremate_status_at` | coluna | ADD (nullable) |
| `orion_auction_settlements.arremate_expires_at` | coluna | ADD (nullable, reservada FASE B) |
| `orion_settle_arremate_status_chk` | constraint | ADD (7 estados) |
| `orion_arremate_transitions` | tabela | CREATE (11 transições oficiais; RLS; SELECT authenticated) |
| `tg_arremate_settlement_protect` | trigger+fn | CREATE (integridade winner/valor/estado) |
| `arremate_transition(uuid,text,text,text)` | função | CREATE (motor de estado; service_role) |
| `arremate_init(uuid)` | função | CREATE (entrada no fluxo; service_role) |
| `arremate_state(uuid)` | função | CREATE (leitura; authenticated) |
| `create_auction_listing` ×5 sobrecargas mortas | função | **DROP** (66356/66360/66361/66362/67502) |
| `place_auction_bid(uuid,uuid,numeric)` | função | **DROP** (3-arg quebrada) |

**Preservados intactos:** `create_auction_listing` 16-arg canônica (oid 69956 — a única que o front resolve), `place_auction_bid(uuid,integer)` 2-arg, `orion_auction_settle/close/charge/apply_commission/release_contact`, todos os dashboards, RLS/policies, HOTFIX A.0.

## ETAPA 1 — Estado oficial

Entidade **`orion_auction_settlements`** (PK `listing_id`) = fonte única, conforme D1. Coluna `arremate_status` nullable com CHECK aos 7 estados. **Backfill honesto:** os 2 settlements reais são `no_winner` → `arremate_status` permanece **NULL** (fora do fluxo). Nenhum dado real entrou no ciclo (nenhuma integração ativada — ETAPA 7).

## ETAPA 2 — Máquina de estados (11 transições oficiais)

```
aguardando_pagamento → {pagamento_em_processamento, expirado, cancelado}
pagamento_em_processamento → {pago, aguardando_pagamento(retry), expirado}
pago → {em_disputa, concluido}
em_disputa → {pago(improcedente), cancelado(procedente→FASE E)}
expirado → {cancelado}
cancelado, concluido = TERMINAIS (sem saída)
```
Micro-estados `encerrado/vencedor_definido/settlement_criado` NÃO são persistidos (ocorrem na mesma transação close→settle) — 1º estado persistido = `aguardando_pagamento` (via `arremate_init`), conforme ajuste da REVIEW. Transição fora do mapa → `EXCEPTION`. Transição para o mesmo estado → **no-op idempotente** (sem evento).

## ETAPA 3 — Integridade

Trigger `BEFORE UPDATE` rejeita: alteração de `winner_user_id` (quando já definido), alteração de `valor_final` (quando já definido), e alteração de `arremate_status` fora da porta oficial (flag de sessão setada só por `arremate_transition`/`arremate_init`). Toda tentativa gera linha em `orion_auction_audit`. **Seguro com o `settle`** (que usa `ON CONFLICT DO NOTHING` — nunca reescreve winner/valor) e com `apply_commission`/`release_contact` (não tocam os 3 campos protegidos — verificado).

## ETAPA 4 — Eventos oficiais (barramento `orion_eventos`, D7)

`arremate.criado` (init) · `arremate.estado_alterado` (toda transição) · `arremate.expirado` · `arremate.cancelado` · `arremate.disputa_aberta` · `arremate.concluido`. Origem `arremate_fase_a`. IA nenhuma emite/altera — apenas consome (as fns são `service_role`). Sem duplicação (no-op não emite).

## ETAPA 5 — Consolidação de RPCs

Removidas as 6 mortas aprovadas (5 sobrecargas de `create_auction_listing` + `place_auction_bid` 3-arg). **Resta 1 sobrecarga de cada** (verificado: `create_overloads_restantes=1`, `bid_overloads_restantes=1`). Elimina o risco de PGRST203. Front preservado — a canônica resolvida pelo `useAuctions` (com `p_starts_at`/`p_ends_at`/`p_listing_type`) é exatamente a mantida.

## ETAPA 6 — Segurança

Menor privilégio: `arremate_transition`/`arremate_init` = **só service_role** (motor; nenhuma API pública nova); `arremate_state` = authenticated (leitura, RLS da tabela filtra). `orion_arremate_transitions` com RLS + REVOKE anon. **Compatível com HOTFIX A.0** (nenhum grant a anon; motor de leilão segue service_role). Auditoria de toda mudança de estado em `orion_auction_audit`.

## ETAPA 7 — Compatibilidade (nenhuma integração ativada)

Marketplace/Leilões/Financeiro/PAY/Escrow/RIDV/ALC/IA/Reputação: **zero alteração de comportamento**. A coluna e as funções existem mas nada as chama automaticamente (nem `close` nem `settle` foram alterados). AI-74 continua lendo `pagamento_ok` (14/14). Compatibilidade FUTURA garantida: `arremate_status` pronto para o wire da FASE B.

## ETAPA 8 — Rollback

Totalmente reversível — bloco documentado no fim da migration: drop trigger/fns/tabela, drop constraint/colunas (eventos emitidos permanecem — bus imutável), recriar as 6 RPCs a partir de `DOCS/rollback-fase-a-fns.sql`. Migration puramente estrutural/aditiva → rollback sem perda de dado real (os 2 settlements têm `arremate_status` NULL).

## ETAPA 9 — Homologação (17 testes, todos APROVADOS)

| # | Teste | Resultado |
|---|---|---|
| H0 | canônica 16-arg preservada exata | ✅ |
| H0b | backfill (2 no_winner → NULL) | ✅ |
| H1 | criar settlement de teste | ✅ |
| H2 | `arremate_init` NULL→aguardando + evento `criado` | ✅ |
| H3 | fluxo feliz aguardando→processando→pago→concluido | ✅ |
| H4 | sair de terminal (concluido→pago) | ✅ REJEITADO |
| H5 | transição inválida (aguardando→concluido) | ✅ REJEITADO |
| H6 | UPDATE direto `winner_user_id` | ✅ REJEITADO |
| H7 | UPDATE direto `valor_final` | ✅ REJEITADO |
| H8 | UPDATE direto `arremate_status` (sem porta) | ✅ REJEITADO |
| H9 | idempotência (mesmo estado = no-op, sem evento) | ✅ |
| H10 | eventos: criado=1, estado_alterado=3, concluido=1 (**0 duplicados**) | ✅ |
| H11 | auditoria de transições registrada | ✅ |
| R1 | 2 settlements reais intactos (NULL/no_winner) | ✅ |
| R2/R3 | anon executa transition/init | ✅ NEGADO (42501) |
| R4 | `rep_selftest` 14/14 · `auction_security_selftest` pass_geral=true | ✅ |
| R5 | privilégios: transition=service_role, state/bid=authenticated | ✅ |
| R6 | idempotência da migration (reaplicada) | ✅ |
| R7 | `vite build` | ✅ verde (45,8s) |

Dados de teste removidos (settlements/eventos/audit) — banco volta a 2 settlements reais.

---

## AUDITORIA FINAL (respostas obrigatórias)

- **Estados implementados corretamente?** **SIM** — 7 estados, 11 transições, inválidas bloqueadas, terminais sem saída.
- **Eventos funcionando?** **SIM** — 6 tipos oficiais, emissão correta, **sem duplicação** (no-op não emite).
- **Integridade — vencedor protegido?** **SIM.** **Valor protegido?** **SIM.** (UPDATE direto rejeitado + auditado).
- **Segurança — nenhuma regressão?** **SIM** — HOTFIX A.0 preservado, anon negado, menor privilégio.
- **Compatibilidade — front preservado?** **SIM.** **APIs preservadas?** **SIM.** **RPCs preservadas?** **SIM** (canônicas intactas; só mortas removidas).
- **Build aprovado?** **SIM** (vite verde).
- **Testes:** **17 executados, 17 aprovados.**

## Critério Final

- **FASE A implementada com sucesso?** 🟢 **SIM.**
- **Houve alguma regressão?** **NÃO.** (as falhas de `aeo_selftest`/`auction_intel_summary` são drift pré-existente por tabela ausente — `orion_auction_finalize_log`/`orion_auction_commissions` — sem relação com esta fase; documentado na HOTFIX A.0).
- **Bloqueio para iniciar a FASE B?** **NÃO.** A fundação está pronta: `arremate_status` + `arremate_transition`/`arremate_init` (a FASE B só chama `arremate_init` no settlement do vencedor e `arremate_transition` nos marcos de pagamento), integridade e auditoria ativas, eventos no bus para os consumidores. Único pré-requisito de negócio remanescente (não técnico): decisão do frete do arremate — não bloqueia o início da B (pagamento).

---

# 🟢 ORION-ARREMATES FASE A APROVADA

**Justificativa:** escopo cumprido à risca (estado + máquina + eventos + integridade + consolidação), 17/17 testes de homologação aprovados incluindo bloqueio de todas as transições inválidas e das três alterações diretas proibidas (vencedor, valor, estado), zero regressão, front e APIs preservados, HOTFIX A.0 intacto, build verde e migration idempotente e reversível. Nenhuma funcionalidade das Fases B–E foi antecipada.
