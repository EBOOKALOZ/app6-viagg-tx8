# AUDITORIA COMPLETA — MÓDULO LEILÃO (VIAGG-TX8)

> **Data:** 2026-07-18 · **Base:** código em `analise-programador` (produção) + banco vivo `broifhfqmnzqoongtokm` (introspecção real via Management API). **Sem suposições** — cada item foi verificado.

---

## 0. Resumo executivo

O módulo Leilão tem um **motor de banco robusto e provado** (criação, lance, anti-sniper, encerramento automático com vencedor/comissão/auditoria idempotentes) e uma **camada de telas ampla** (público, lojista, admin). Porém há **3 pontos críticos**: (1) **RLS desligado em `auction_listings`** com `anon` tendo DML total; (2) **encerramento manual quebrado** (`end_auction_listing` não existe); (3) **realtime de lances não publicado** (subscrições silenciosamente inertes). Além disso, **todo o fim do funil — pagamento do comprador vencedor e entrega — não existe**.

**Conclusão real de conclusão: ~57%.** Motor e front de disputa prontos; segurança, monetização do vencedor e realtime pendentes.

---

## 1. O que já foi implementado

**Banco (13 tabelas):**
- `auction_listings`, `auction_bids`, `auction_watchers`, `auction_events`, `auction_conversion_metrics`
- `arremate_listings`, `arremate_offers` (sistema irmão "arremate/oferta")
- Camada ORION: `orion_auction_packages`, `orion_auction_promo_packages`, `orion_auction_credit_consumption`, `orion_auction_suggestions`, `orion_auction_reports`, `orion_auction_audit`

**RPCs (~30 funções):** `create_auction_listing` (**6 sobrecargas**), `create_auction_listing_v2`, `place_auction_bid` (**2 sobrecargas**), `create_arremate_listing`, `submit_arremate_offer` (2), `respond_arremate_offer`, `accept_arremate_offer_advertiser`, e a suíte ORION: `orion_auction_close`, `orion_auction_suggest`, `orion_auction_panel`, `orion_auction_report_get`, `orion_auction_engagement`, `orion_auction_unique_participants`, `orion_auction_charge`, `orion_auction_antisniper`, `orion_auction_autoclose_tick`, `auction_statistics`, `auction_ranking`, `auction_command_dashboard`.

**Triggers:** anti-sniper em `auction_bids`; `auction_set_owner`, `updated_at` e **2 gatilhos RIDV** (moderação por IA) em `auction_listings`; `notify_store_on_arremate_offer` + `updated_at` em `arremate_offers`.

**Cron:** `orion_auction_autoclose` (`* * * * *`, **ativo**) → encerra expirados via `orion_auction_close`.

**Telas (19 arquivos):**
- Público: `AuctionListPage` (/leiloes), `AllAuctionsPage`, `AuctionPublicPage` (/leilao/:id), `AuctionMarketDetailPage`, `ArrematePublicPage`, `MeusLances` (/meus-lances), `MinhasOfertas`, `MercadoAuctionsSection` (vitrine no Mercado), `MercadoLocalViagg`
- Lojista: `MerchantAuctions`, `MerchantArremate`
- Admin: `AdminComandoLeilao` (/admin/comando-leilao), `AdminRidv`, `AdminOrionPackage`, `AdminOrionPublisher`
- Componentes: `MarketAuctionCard`, `ListingModeSelector`, `MiniCadastroModal`, `GlobalRealtime`

**Hooks:** `useAuctions`, `useAdvertiserAuctions`, `useArremate`.

---

## 2. O que está funcionando corretamente (verificado)

- **Criação de leilão** (lojista → `create_auction_listing`) grava em `auction_listings`; `auction_set_owner` preenche o dono; RIDV modera (`ai_status`/`moderation_status`).
- **Lance real** (corrigido em 2026-07-17, commit `a892d81`): `/leilao/:id` → `place_auction_bid` (sobrecarga 2-arg) → grava `auction_bids(listing_id,user_id,amount_cents,is_winning)` + sobe `current_bid`/`total_bids`; aparece em **Meus Lances**.
- **Anti-sniper**: lance com fim ≤30s empurra +30s (trigger provado, Δ=30s).
- **Encerramento automático**: cron 1/min → `orion_auction_close` define vencedor (maior lance ≥ reserva), cobra comissão do **lojista** em créditos, gera relatório + auditoria — **idempotente** (provado: 2ª chamada = 0 duplicação).
- **Engajamento** por participantes únicos (não por nº de lances).
- **Admin Command Center** (`auction_command_dashboard`): KPIs, duração 7/15/30, próximos encerramentos, rankings.
- **Busca no Mercado** (commit `08a1635`): pesquisar "leilão" mostra todos os cadastrados; vitrine de ativos por padrão.
- **Índices**: cobertura adequada (`store_status`, `product`, `type`, `owner`, `bids(listing/user)`, `events`, `watchers` único, `consumo` único, `audit`).

---

## 3. O que ainda NÃO foi desenvolvido

1. **Pagamento do comprador vencedor** — inexistente. `orion_auction_close` define `winner_user_id`, mas não há cobrança do vencedor, nem integração com `pay_*`/Mercado Pago, nem escrow.
2. **Entrega / logística pós-arremate** — inexistente (sem pedido, sem `delivery_orders`, sem acionamento de motoboy).
3. **Notificação ao vencedor** — não há e-mail/push "você ganhou" (viola a regra "sempre e-mail aos 2 lados").
4. **Encerramento manual pelo lojista** — front chama `end_auction_listing`, que **não existe** no banco.
5. **"Meus leilões ganhos"** (comprador) — Meus Lances lista participação, mas não há tela de arremates vencidos/pagamento.
6. **Realtime de lances ativado** — tabelas não estão na publicação `supabase_realtime`.

---

## 4. Funcionalidades incompletas

- **Fluxo do vencedor** para em `winner_user_id` (sem pós-venda).
- **`create_auction_listing` com 6 sobrecargas** — implementação fragmentada/histórica (reais vs cents; com/sem `product_id`; v2). Funciona pela sobrecarga que o front escolhe, mas é frágil.
- **`place_auction_bid` 3-arg** grava em colunas inexistentes (`auction_listing_id/bidder_user_id/bid_amount/status`) → **quebrada**; só a 2-arg é válida.
- **Arremate**: `submit_arremate_offer` tem 2 assinaturas; o modal usa fallback de INSERT direto (não passa `customer_user_id`).

---

## 5. Bugs encontrados

| # | Severidade | Bug | Evidência |
|---|-----------|-----|-----------|
| B1 | 🔴 Crítico | **RLS desligado** em `auction_listings` e `anon` tem `INSERT/UPDATE/DELETE/TRUNCATE` → qualquer um cria/edita/apaga/trunca leilões. A policy `advertiser_own_auction_listings` existe mas está **inerte** (RLS off). | `relrowsecurity=false`; grants anon completos |
| B2 | 🔴 Crítico | **`end_auction_listing` não existe** no banco, mas o front chama em 2 lugares → botão "encerrar" falha (PGRST202). | Ausente na lista de `pg_proc`; `grep` acha 2 chamadas |
| B3 | 🟠 Alto | **Realtime de lances não funciona**: `auction_bids`/`auction_listings` não estão na publicação `supabase_realtime`; as subscrições em `AuctionPublicPage`/`MercadoAuctionsSection` **nunca disparam**. | `pg_publication_rel` = vazio p/ auction |
| B4 | 🟠 Alto | **Lance ia para `arremate_offers`** (lead sem `user_id`) em vez de `auction_bids`. **CORRIGIDO** no front (`a892d81`), pendente deploy. | 2 linhas órfãs em `arremate_offers` |
| B5 | 🟡 Médio | `place_auction_bid` 3-arg escreve colunas inexistentes → erro se chamada. | `pg_get_functiondef` |
| B6 | 🟡 Médio | 6 sobrecargas de `create_auction_listing` → risco de ambiguidade (PGRST203). | `pg_proc` |

---

## 6. Banco de dados / RLS / triggers / Edge / RPCs

- **RLS:** habilitado **apenas** em `auction_bids` (`bids_select_all`, `bids_insert_own`) e nas 6 tabelas `orion_auction_*` (leitura pública nos catálogos; leitura por dono nas demais). **Desligado** em `auction_listings`, `auction_watchers`, `auction_events`, `auction_conversion_metrics`, `arremate_listings`, `arremate_offers`.
- **Triggers:** OK (anti-sniper, owner, updated_at, RIDV). Consistentes.
- **Edge Functions:** **nenhuma** dedicada a leilão (módulo é 100% DB/RPC). A moderação usa a infra RIDV existente.
- **RPCs:** suíte ORION sólida e `SECURITY DEFINER`; poluição de sobrecargas em `create_auction_listing` e `place_auction_bid` (limpar as mortas).
- **Cron:** `orion_auction_autoclose` ativo (1/min).

---

## 7. Fluxo completo do leilão (estado real)

| Etapa | Estado | Como |
|-------|--------|------|
| Criação | ✅ | `MerchantAuctions` → `create_auction_listing` → `auction_listings` (+ owner + RIDV) |
| Publicação | ✅ | `status='active'`, `starts_at/ends_at`; RIDV via trigger |
| Lances | ✅ (corrigido) | `AuctionPublicPage` → `place_auction_bid` (2-arg) → `auction_bids` + anti-sniper |
| Encerramento | ✅ auto / ❌ manual | cron `orion_auction_close`; manual (`end_auction_listing`) **quebrado** |
| Vencedor | ✅ | `winner_user_id` por `orion_auction_close` |
| **Pagamento** | ❌ | **Não existe** (comprador não paga; sem `pay_*`/escrow) |
| **Entrega** | ❌ | **Não existe** (sem pedido/logística/motoboy) |

---

## 8. Integração com outros módulos

- **RIDV / Moderação IA (AI-02):** ✅ 2 triggers moderam anúncios de leilão.
- **Créditos do lojista:** ✅ `orion_auction_charge` debita `advertiser_credit_balances`/ledger (mesma fonte de `debitSellerCredits`).
- **Divulgação (Publisher):** ✅ `orion_auction_promo_packages` (3 pacotes 5/10/30) + `AdminOrionPublisher`.
- **AI-41 Fraud:** declarado (cobertura genérica, sem detector específico de leilão).
- **Conta única (Comprador):** ✅ Meus Lances via `auction_bids`.
- **PAY / Tesouraria:** ❌ **não integrado** (lacuna do pagamento do vencedor).
- **Entrega / Corridas:** ❌ não integrado.

---

## 9. Painéis administrativos existentes

- `/admin/comando-leilao` — **Command Center** (KPIs, duração, encerramentos, rankings) — via `auction_command_dashboard`.
- `/admin/ridv` — moderação (inclui leilões).
- `AdminOrionPackage` / `AdminOrionPublisher` — pacotes e divulgação.
- **Faltam:** gestão manual de encerramento/cancelamento, resolução de disputa, reprocessar comissão, ver vencedor/pagamento.

---

## 10. Telas existentes e faltantes

**Existentes:** vitrine (Mercado), lista `/leiloes`, detalhe `/leilao/:id`, dar lance (modal), Meus Lances, painel lojista (criar/gerir), arremate (lista/detalhe/ofertas), Command Center admin.

**Faltantes:** ① checkout/pagamento do vencedor; ② "meus arremates ganhos"; ③ acompanhamento de entrega; ④ gestão de lances/encerramento manual no painel do lojista; ⑤ tela de disputa/reembolso.

---

## 11. APIs utilizadas (front → RPC)

`place_auction_bid` (3 chamadas), `submit_arremate_offer` (2), `respond_arremate_offer` (2), `end_auction_listing` (2 — **quebrada**), `create_auction_listing` (1), `auction_command_dashboard` (1). Leituras diretas em `auction_listings`/`auction_bids` via PostgREST (`supabase.from`).

---

## 12. Estrutura das tabelas (principais)

- **`auction_listings`** (40 col): `store_id, product_id, owner_user_id, title, description, product_image_url, city/state/neighborhood, starting_bid, current_bid, minimum_increment, buy_now_price, reserve_price, status, starts_at, ends_at, winner_user_id, total_bids, watchers_count, listing_type, auction_duration_days, moderation_status, ai_status/verdict/confidence/provider, reviewed_*`.
- **`auction_bids`**: `id, listing_id, user_id, amount_cents, is_winning, created_at`.
- **`auction_events`**: `auction_listing_id, event_type, event_payload, created_at`.
- **`auction_conversion_metrics`**: `listing_type, listing_id, views/watchers/bids/offers_count, conversion_status`.
- **`orion_auction_reports`**: `listing_id, participantes_unicos, total_lances, vencedor_user_id, valor_final, creditos_consumidos, score_final, roi_divulgacao, evolucao_lances`.
- **`orion_auction_suggestions`**: `melhor_horario, duracao_horas, preco_inicial_ideal, incremento_recomendado, estimativas, confianca, evidencia`.
- **`arremate_offers`**: `arremate_listing_id, customer_user_id, customer_name, customer_whatsapp, offer_amount, quantity, status, note`.

---

## 13. Índices de performance

Cobertura **boa**: `auction_listings(store_id,status,ends_at)`, `(product_id)`, `(listing_type)`, `(owner_user_id)`; `auction_bids(listing_id)`, `(user_id)`; `auction_events(listing,created_at desc)`; `auction_watchers` único `(listing,user)`; `orion_auction_credit_consumption` único `(listing,tipo)`; `orion_auction_audit(listing,created_at desc)`. **Sugestão:** índice parcial em `auction_listings(status, ends_at)` para o feed público de ativos.

---

## 14. Pontos de segurança

- 🔴 **`auction_listings` sem RLS + grants anon totais** (B1) — permite adulteração/exclusão por qualquer cliente. **Corrigir imediatamente.**
- 🟠 `auction_watchers/events/conversion_metrics/arremate_*` sem RLS (exposição de dados/escrita anônima).
- ✅ `auction_bids` com RLS; escrita via `place_auction_bid` (DEFINER) — bom.
- ✅ ORION `*` com REVOKE/GRANT e leitura por dono.

---

## 15. Riscos encontrados

1. **Segurança (B1)** — adulteração de leilões por terceiros.
2. **Confiança do usuário** — sem realtime (B3), o lance de outro só aparece com refresh; sensação de "travado".
3. **Operacional** — encerrar manualmente falha (B2).
4. **Financeiro/negócio** — sem cobrança do vencedor, o leilão não fecha receita do arremate (só comissão de operação do lojista).
5. **Manutenção** — sobrecargas duplicadas (B5/B6) dificultam evolução.

---

## 16. Melhorias recomendadas

- Ativar RLS em `auction_listings` (+ policies de leitura pública e escrita por dono) e revogar DML de `anon`.
- Adicionar `auction_bids`/`auction_listings` à publicação `supabase_realtime`.
- Criar `end_auction_listing` (ou apontar o front para `orion_auction_close`).
- Consolidar `create_auction_listing` numa assinatura canônica; dropar sobrecargas mortas e a `place_auction_bid` 3-arg.
- Implementar pagamento do vencedor (escrow `pay_*` / Mercado Pago) + notificação "você ganhou" (2 lados) + entrega.

---

## 17. Pendências para homologação

- [ ] RLS de `auction_listings` corrigido e testado (B1).
- [ ] `end_auction_listing` funcional (B2).
- [ ] Realtime de lances publicado e validado (B3).
- [ ] Deploy do fix do lance (B4 — commit `a892d81`).
- [ ] Fluxo de pagamento + entrega do vencedor (mínimo viável).
- [ ] Notificação ao vencedor e ao lojista.
- [ ] Limpeza de sobrecargas de RPC.
- [ ] Suíte de testes (COMANDO TESTE) ponta a ponta.

---

## 18. Score geral do módulo

| Área | Peso | Nota | Comentário |
|------|------|------|-----------|
| Motor de disputa (criar/lance/anti-sniper) | 20 | 18 | sólido, provado |
| Encerramento/vencedor/comissão | 15 | 13 | auto OK; manual quebrado |
| Segurança / RLS | 15 | 4 | RLS off em listings (crítico) |
| Realtime | 10 | 2 | não publicado |
| Pagamento do vencedor | 15 | 0 | inexistente |
| Entrega / pós-venda | 10 | 0 | inexistente |
| Telas (público/lojista) | 10 | 9 | amplas |
| Admin / analytics | 8 | 7 | Command Center bom |
| Integração ORION/créditos/RIDV | 7 | 6 | boa |
| **Total** | **100** | **≈ 57** | |

**Score geral: 57/100.**

---

## 19. Checklist para 100%

1. [ ] RLS + policies em `auction_listings` (e demais sem RLS); revogar DML anon. **(crítico)**
2. [ ] `end_auction_listing` implementada. **(crítico)**
3. [ ] Realtime publicado (`auction_bids`, `auction_listings`). **(alto)**
4. [ ] Deploy do fix do lance (`a892d81`). **(alto)**
5. [ ] Checkout/pagamento do comprador vencedor (escrow `pay_*`). **(alto)**
6. [ ] Notificação "ganhou/encerrou" aos 2 lados. **(alto)**
7. [ ] Entrega/logística pós-arremate (pedido + motoboy). **(médio)**
8. [ ] Tela "meus arremates ganhos" + status de pagamento. **(médio)**
9. [ ] Consolidar `create_auction_listing`; dropar sobrecargas mortas + `place_auction_bid` 3-arg. **(médio)**
10. [ ] Encerramento/cancelamento/disputa no admin. **(médio)**
11. [ ] Suíte de testes ponta a ponta (COMANDO TESTE). **(médio)**
12. [ ] Índice parcial de feed público. **(baixo)**

---

## 20. Plano de execução por prioridade

**FASE 1 — Segurança & correções (bloqueia homologação) · ~1 dia**
1. Migration: RLS + policies em `auction_listings` (+ tabelas sem RLS), revogar DML anon. **[Complexidade: média]**
2. Migration: `end_auction_listing` (reusa `orion_auction_close`). **[baixa]**
3. Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE auction_bids, auction_listings`. **[baixa]**
4. Deploy do fix do lance (`a892d81`). **[trivial]**

**FASE 2 — Monetização do vencedor · ~2–3 dias**
5. Cobrança do vencedor via `pay_*`/Mercado Pago (escrow) + webhook. **[alta — depende do módulo PAY]**
6. Notificação "você ganhou / encerrou" aos 2 lados (Resend). **[média]**
7. Tela "meus arremates ganhos" + status. **[média]**

**FASE 3 — Pós-venda & limpeza · ~2 dias**
8. Entrega/logística (pedido + acionamento motoboy). **[alta — depende de Corridas/Entrega]**
9. Consolidar sobrecargas de RPC. **[média]**
10. Admin: encerrar/cancelar/disputa. **[média]**

**FASE 4 — Qualidade · ~1 dia**
11. Suíte de testes ponta a ponta. **[média]**
12. Índice parcial + tuning. **[baixa]**

> **Próximo desenvolvimento recomendado:** **FASE 1, item 1** (RLS de `auction_listings`) — é o maior risco aberto e barra a homologação.

---

## Informações finais

- **Percentual real de conclusão:** **~57%**.
- **Tempo estimado para finalizar:** **~6–7 dias** de desenvolvimento (Fase 1: 1d · Fase 2: 2–3d · Fase 3: 2d · Fase 4: 1d).
- **Complexidade das pendências:** Fase 1 baixa/média; Fase 2 **alta** (financeiro); Fase 3 **alta** (logística); Fase 4 média.
- **Dependências com módulos ORION:** PAY/Tesouraria (pagamento do vencedor), Corridas/Entrega (logística), RIDV (moderação — já integrado), AI-41 Fraud (declarado), Publisher/Divulgação (pacotes — já integrado), Créditos (`advertiser_credit_balances` — já integrado).
- **Bloqueio técnico:** o único bloqueio de negócio é o **pagamento do vencedor**, que depende da API do módulo **PAY** (escrow) — sem ela, o leilão não fecha o arremate financeiramente. Os itens da Fase 1 **não têm bloqueio** e podem ir imediatamente.
