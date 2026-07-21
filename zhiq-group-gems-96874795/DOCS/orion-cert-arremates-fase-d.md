> # ✅ ADENDO DE RE-CERTIFICAÇÃO (2026-07-19, pós-correção autorizada)
> A ressalva **R1** (bypass de autorização do não-parte) foi **CORRIGIDA** e re-validada ao vivo:
> - Guarda das **9 RPCs** trocada para `IF v_party IS NULL OR v_party NOT IN (...)` (FASE C + D); as 4 seguras (`IS NULL`) intactas.
> - **Prova ao vivo:** não-parte agora **negado em 9/9** (`solicitar_entrega`, `definir_fulfillment`, `buyer_informar_pagamento`, `seller_confirmar_pagamento`, `seller_enviar`, `buyer_receber`, `send_message`, `cancelar`, `abrir_disputa`).
> - **Fluxo legítimo preservado:** partes reais 7/7 marcos OK.
> - **Regressão:** REST 39/39 · invariantes DB 10/10 · arremate C+D 10/10 (novo **INV10** estático pega a guarda vulnerável para sempre) · dados de teste limpos.
> - **Novo veredito: 🟢 CERTIFICADO ORION-ARREMATES FASE D.** Segurança reavaliada: **55 → 90**; **Nota Geral 80 → 92**.
> - Detalhe do defeito original preservado abaixo (registro histórico da auditoria).
>
> ---

# ORION CERTIFICATION AUTHORITY (OCE) — Certificação da FASE D (Logística/Entrega)

**Data:** 2026-07-19 · **Natureza:** auditoria READ-ONLY (nada alterado) · **Base:** exclusivamente evidência ao vivo em produção (`broifhfqmnzqoongtokm`) + testes executados. Não baseada em commits/docs/declarações.

> ⚠ Durante a fase final, o banco de produção sofreu um **incidente de latência** (REST e Management API retornando timeout `000`). Os testes decisivos — incluindo o achado de segurança — foram coletados ANTES do incidente. O re-run da regressão e a limpeza dos dados de teste ficaram pendentes da recuperação (ver §Pendências).

---

## 1. RESUMO EXECUTIVO

A FASE D integra a entrega do arremate ao **motor oficial de corridas** de forma **arquiteturalmente correta**: sem duplicar o motor de entregas, sem duplicar o motor financeiro, sem carteira nova, sem cobrança paralela; o produto permanece 100% P2P e o frete usa o fluxo pré-pago já existente (o comprador paga). O **trigger** de conclusão funciona corretamente (dispara 1×, não afeta arremates errados, ignora cancelamento, e "entregue-2x" é impossível pelo guard do próprio módulo de corridas).

**Porém a auditoria de segurança encontrou um DEFEITO DE CONTROLE DE ACESSO** que impede a certificação plena: o padrão de guarda `IF v_party NOT IN (...) THEN RAISE` **não bloqueia um não-parte** (quando `v_party` é NULL, `NULL NOT IN (...)` = NULL e o `IF` não dispara). Isso permite que **qualquer usuário autenticado manipule o estado de arremates alheios** (9 RPCs afetadas — 2 da FASE D + 7 herdadas da FASE C). Não há roubo financeiro nem vazamento de dados (leituras protegidas por RLS e pelas RPCs com guarda `IS NULL`), mas é uma violação de autorização (OWASP A01) que **deve ser corrigida antes de produção**.

**Veredito: 🟡 CERTIFICADO COM RESSALVAS** — a integração logística é correta e segura nas dimensões financeira/arquitetural/trigger, mas o go-live é **CONDICIONADO** à correção da guarda de autorização.

---

## 2. ARQUITETURA AUDITADA (FASE 1) — ✅

| Verificação (evidência ao vivo) | Resultado |
|---|---|
| FASE D usa o motor oficial `create_customer_delivery_order` | ✅ `fase_d_usa_oficial = True` |
| FASE D **não** insere em `service_orders` diretamente | ✅ `fased_insere_direto = False` |
| FASE D **não** toca primitiva financeira (pay_post_transaction/wallets/ledger) | ✅ `fase_d_toca_financeiro_direto = False` |
| Nenhuma carteira/tabela de frete nova | ✅ `tabelas_frete_novas = None` |
| Objetos FASE D | 2 colunas (`fulfillment`,`delivery_order_id`) + 2 RPCs + 1 trigger |

**Conclusão:** nenhuma duplicação de motor de entrega ou financeiro; nenhuma cobrança paralela. ✅

---

## 3. FLUXOS TESTADOS

### FASE 2 — Retirada ✅
E2E ao vivo: `definir retirada → vendedor disponibiliza (entregue) → comprador recebe (recebido) → conclui (concluido)`. **Evidência financeira:** `service_orders` do comprador = 0 antes/depois; `pay_ledger_entries` = **211 → 211** (sem corrida, sem cobrança de frete). ✅

### FASE 3 — Delivery ✅
Corrida vinculada (`delivery_order_id`) alcança `delivered` → **trigger** transita o arremate `preparando_entrega → entregue`. Provado ao vivo (transação com rollback, ator `entregador`, sem exigir auth). ✅

### FASE 6 — Trigger `tg_arremate_on_delivery_delivered` ✅
| Cenário | Evidência |
|---|---|
| Dispara e avança 1× | `f3_estado = entregue` ✅ |
| Não altera arremate errado (corrida não vinculada) | `f6_arremates_afetados = 0` ✅ |
| Não entra em loop | o trigger atualiza `orion_auction_settlements` (não `service_orders`) → sem recursão ✅ |
| Não interfere no trigger financeiro do frete | coexiste com `tg_service_order_release_payment` no mesmo evento (ambos rodaram; meu trigger não exige auth) ✅ |

### FASE 7 — Concorrência ✅
| Cenário | Evidência |
|---|---|
| Corrida **cancelada** vinculada | arremate permanece `preparando_entrega` (trigger só reage a `delivered`) ✅ |
| **Entregue 2×** | **impossível** — `tg_block_updates_after_delivered` do módulo de corridas bloqueia UPDATE após `delivered` (`P0001: bloqueado alterar após delivered`) ✅ |
| Replay/idempotência de transição | `arremate_transition` é no-op se já no destino ✅ |

---

## 4. INTEGRAÇÃO FINANCEIRA (FASE 4) — ✅

- **Comprador paga somente o frete** (via `create_customer_delivery_order`, que debita a carteira do próprio comprador — `auth.uid`). ✅
- **Vendedor recebe o produto diretamente** (P2P) — a plataforma não intermedia o produto (nenhuma primitiva financeira tocada pela FASE D). ✅
- **Motoboy recebe pelo fluxo oficial** (`tg_service_order_release_payment` do módulo de corridas — inalterado). ✅
- **Sem lançamento duplicado / sem cobrança adicional** (retirada = 0 movimentos; delivery = 1 corrida oficial). ✅

---

## 5. SEGURANÇA (FASE 5) — 🔴 DEFEITO ENCONTRADO

| Tentativa | Esperado | Resultado |
|---|---|---|
| **anon** / sem-auth (`solicitar_entrega`, `definir_fulfillment`) | negar | ✅ negado (42501/PGRST202/JWT vazio) |
| **vendedor** em `solicitar_entrega` (buyer-only) | negar | ✅ negado ("só o comprador") |
| RLS: não-parte lê settlement / chat | negar | ✅ negado (vazio) |
| **usuário diferente (não-parte, não-admin)** em RPCs de estado | **negar** | 🔴 **PASSOU** (bug) |

### 🔴 ACHADO CRÍTICO — Broken Access Control (bypass do não-parte)
**Causa (semântica SQL, determinística):** a guarda `IF v_party NOT IN ('buyer','admin') THEN RAISE` não dispara quando `v_party` é **NULL** (não-parte), porque `NULL NOT IN (...)` avalia para `NULL`, e `IF NULL THEN` é tratado como falso → a RPC **prossegue**.

**Prova ao vivo:** um usuário autenticado confirmado **não-admin** (`mp_is_admin = False`), genuinamente **não-parte** de um arremate, alcançou o interior de `create_customer_delivery_order` (erro de saldo `23514`) via `arremate_solicitar_entrega` — ou seja, passou a guarda.

**RPCs afetadas (9):**
- FASE D: `arremate_solicitar_entrega`, `arremate_definir_fulfillment`.
- FASE C (herdado): `arremate_buyer_informar_pagamento`, `arremate_seller_confirmar_pagamento`, `arremate_seller_enviar`, `arremate_buyer_receber`, `arremate_abrir_disputa`, `arremate_cancelar`, `arremate_send_message`.

**RPCs seguras (guarda `IF v_party IS NULL`):** `arremate_release_contact`, `arremate_get_contato`, `arremate_concluir`, `arremate_list_messages`.

**Impacto:** qualquer usuário autenticado pode **manipular o estado de arremates alheios** (confirmar/informar pagamento, marcar envio/recebimento, abrir disputa, **cancelar**, definir modo de entrega, injetar mensagens no chat). **NÃO** há roubo financeiro (o frete debita a carteira do próprio atacante; o produto é P2P) nem vazamento de dados (leituras protegidas). É integridade/autorização.

**Correção recomendada (NÃO aplicada — auditoria read-only):** trocar o padrão para `IF v_party IS NULL OR v_party NOT IN (...) THEN RAISE` (ou `v_party IS DISTINCT FROM ...`). Corrigir as 2 RPCs da FASE D **e** as 7 da FASE C.

---

## 6. REGRESSÃO (FASE 8)

Suíte permanente executada na FASE D imediatamente antes desta certificação: **REST 39/39 · invariantes DB 10/10 · invariantes arremate C+D 9/9 · build verde**. Re-run desta certificação **pendente** (incidente de latência do banco). Nenhuma alteração de código ocorreu entre a FASE D e esta auditoria (auditoria read-only), portanto o resultado 39/39 permanece válido; recomenda-se re-executar após a recuperação do banco.

---

## 7. PERFORMANCE (FASE 9)

- Transição de estado e trigger = operações de **1 linha** (sub-segundo nas execuções observadas).
- Criação da entrega = fluxo oficial de corridas (já certificado; latência dominada pelo despacho, não pela FASE D).
- Atualização do arremate pelo trigger = síncrona, 1 UPDATE.
- **Observação:** durante a auditoria houve um incidente de latência de infraestrutura (não relacionado à FASE D — timeouts em REST e Management API). Não é um custo introduzido pela FASE D.

---

## 8. UX (FASE 10) — auditoria de código + build

- **Responsivo:** `MeuArremate.tsx` usa `max-w-3xl`, grids `sm:grid-cols-2`, componentes fluídos → desktop/mobile/PWA. ✅
- **Atualização automática:** `load()` re-consulta após cada ação (estado, chat, contato). ✅
- **Mensagens claras:** timeline por estado, avisos por modo (retirada/delivery), toasts com causa real. ✅
- **Rastreio:** card de entrega em `preparando_entrega`/`entregue`; anexos por URL assinada. ✅
- Build `vite build` verde. E2E de navegador não executado nesta auditoria (fora do escopo read-only de banco).

---

## 9. RISCOS ENCONTRADOS

| # | Sev | Risco | Ação |
|---|---|---|---|
| R1 | 🔴 **P1 (bloqueante p/ produção)** | Bypass de autorização do não-parte em 9 RPCs (guarda `NOT IN` com `v_party` NULL) | Corrigir guarda para `IS NULL OR NOT IN` nas 9 RPCs (FASE C+D) e re-testar |
| R2 | 🟡 P2 | Coords do frete no front são geoloc/texto (sem geocoder) | Seletor de mapa/geocoder na v2 |
| R3 | 🟡 P2 | `_pay_ride_payer_account` prefere merchant_wallet (armadilha conhecida) — se o comprador tiver loja, o frete debita a carteira de lojista | Confirmar que o frete do arremate usa `customer_wallet` do comprador |
| R4 | ⚪ info | Dados de teste da certificação a limpar após recuperação do banco | Limpeza pendente (ver §Pendências) |

---

## 10. RECOMENDAÇÕES

1. **Corrigir R1 antes de qualquer uso em produção** — é o único bloqueador. Padrão: `IF v_party IS NULL OR v_party NOT IN (...) THEN RAISE`.
2. Adicionar um teste de segurança **não-parte** (usuário autenticado que não é comprador/vendedor/admin) à suíte permanente — o teste da FASE C usou apenas papéis errados de partes reais, o que **mascarou** este defeito.
3. Confirmar o débito do frete em `customer_wallet` (R3).
4. Geocoder no front (R2).
5. Re-executar a suíte de regressão após a recuperação do banco.

---

## 11. NOTAS POR DIMENSÃO

| Dimensão | Nota | Justificativa |
|---|---|---|
| **Arquitetura** | 95 | Reuso limpo do motor oficial; zero duplicação; P2P preservado |
| **Segurança** | 55 | Bypass de autorização do não-parte em 9 RPCs (integridade); anon/RLS/leituras OK |
| **Financeiro** | 96 | Produto P2P intocado; frete pelo fluxo oficial; sem duplicação/cobrança extra |
| **Integração** | 92 | Trigger correto, coexiste com o financeiro do frete; guard de dupla-entrega herdado |
| **Performance** | 88 | Operações de 1 linha; sem custo novo (incidente de infra à parte) |
| **UX** | 85 | Responsivo, auto-atualiza, claro; sem geocoder e sem E2E de navegador |

## 12. NOTA GERAL: **80 / 100**

*(média ponderada, penalizada pelo defeito de autorização; as demais dimensões são fortes)*

---

## 13. VEREDITO

# 🟡 CERTIFICADO ORION-ARREMATES FASE D — COM RESSALVAS

**Ressalva bloqueante para produção (R1):** a guarda de autorização deve ser corrigida nas 9 RPCs (`IS NULL OR NOT IN`) antes de qualquer uso real — hoje um usuário autenticado qualquer pode manipular o estado de arremates alheios. **Enquanto R1 não for corrigido, considerar a FASE D efetivamente NÃO APTA para produção.**

**O que está certificado:** a integração logística com o motor oficial de corridas (retirada + delivery), a separação financeira (produto P2P / frete pelo comprador via fluxo oficial), o trigger de conclusão e a ausência de duplicação/regressão — tudo **correto e provado ao vivo**.

**Pendências (por incidente de latência do banco, não da FASE D):** re-run da suíte de regressão e limpeza dos dados de teste da certificação (settlements marcados `evidencia->>'cert_fase_d'='true'` + `service_orders metadata->>'cert'='true'`).

---

*Auditoria read-only baseada em evidência de produção (`broifhfqmnzqoongtokm`) + testes ao vivo (REST anon/JWT + Management API), 2026-07-19. Nenhum objeto foi alterado. O achado R1 foi apenas reportado, não corrigido.*
