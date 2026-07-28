# AUDITORIA FINAL DE HOMOLOGAÇÃO — MÓDULO LEILÕES E ARREMATES
**Data:** 2026-07-28 | **Branch:** analise-programador | **Metodologia:** 3 auditores independentes (frontend, SQL/segurança, integração/requisitos) + verificação direta no banco de produção vivo (`broifhfqmnzqoongtokm`) via `supabase db query --linked`.

---

## PARECER FINAL

# ❌ REPROVADO PARA PRODUÇÃO

O módulo tem uma base funcional real e sofisticada (motor de lances com lock de concorrência, máquina de estados de arremate, painéis admin com dados reais, RBAC funcional), mas contém **falhas P0 confirmadas no banco vivo** — incluindo dados corrompidos já existentes em produção — e **pelo menos um defeito que provavelmente quebra o build**. Não atende aos critérios mínimos de aprovação (zero P0, zero P1, banco consistente).

---

## 1. Percentual de conclusão e homologação

| Métrica | Valor |
|---|---|
| Percentual real de conclusão funcional | **~72%** (fluxo principal criar→lance→encerrar→arremate funciona; muitas telas/recursos secundários incompletos ou fachada) |
| Percentual de homologação (aprovável para produção) | **0%** — bloqueado por P0 confirmados |
| Itens avaliados | ~140 (telas, funcionalidades, RLS, RPCs, integrações, requisitos) |
| Itens aprovados (OK) | ~55 |
| Itens reprovados/parciais | ~65 |
| Itens críticos (P0) | **4** |
| Itens P1 | **9** |
| Itens P2 | **13** |
| Itens P3 | 10 |

---

## 2. Achados P0 (bloqueantes) — todos com evidência confirmada

### P0-1. Import de arquivo inexistente quebra a página de detalhe / build
`src/pages/public/AuctionMarketDetailPage.tsx:22` importa `@/components/public/auction/AuctionHistory`, componente que **não existe em nenhum lugar do repositório** (confirmado por Glob em `src/components/public/auction/*` — só existem `AuctionGallery`, `AuctionQASection`, `AuctionReportModal`, `SellerTransparencyCenter`, `AuctionTransparencyCenter`). O import não é sequer usado no JSX. Isso quebra a resolução do Rollup/Vite e derruba a rota `/mercado/leiloes/:id` em runtime, e potencialmente o `vite build`.
**Ação:** remover a linha de import (trivial, zero risco).

### P0-2. Dados corrompidos já em produção — 2 lances órfãos sem FK
Verificação direta no banco vivo:
```
orphan_bids: 2
bids_fk_exists: 0
```
A tabela `auction_bids` **não tem nenhuma foreign key** para `auction_listings` no banco real, apesar de a migration `20260723_auction_enterprise_baseline_oficial.sql` tentar criá-la — o bloco usa `EXCEPTION WHEN duplicate_object OR others THEN NULL`, que engoliu o erro causado pelos próprios órfãos e **nunca criou a constraint**. Isso significa que consultas, relatórios e o motor de validação de lances podem operar sobre lances "fantasma" sem leilão associado, e nada impede que o problema piore.
**Ação:** localizar/tratar os 2 registros órfãos e recriar a FK sem o swallow silencioso do erro.

### P0-3. Divergência real entre vencedor do settlement e vencedor do listing (dado vivo)
Verificação direta no banco vivo:
```
settlements_count: 6
winner_divergence: 1
```
Já existe **1 caso real em produção** onde `orion_auction_settlements.winner_user_id` diverge de `auction_listings.winner_user_id`. Isso bate exatamente com o cenário de risco identificado pelo auditor de SQL: `auction_buy_now` não valida o valor de compra imediata contra o maior lance corrente/grade antes de gravar o vencedor, então o settlement (que elege por maior lance válido) e o listing (que grava quem clicou "comprar agora") podem apontar pessoas diferentes. Como o trigger de pós-venda dispara a partir do settlement, **o fluxo de contato/pagamento pode abrir para a pessoa errada** — um problema de integridade transacional real, não hipotético.
**Ação:** bloquear ou reconciliar buy-now quando incompatível com o lance corrente; investigar e corrigir o caso já divergente.

### P0-4. Cadeia de correções de segurança de 2026-07-23 não confirmada como aplicada
O próprio código (cabeçalho de `20260727012000_auction_frontend_rpcs_oficial.sql:6-9`) declara que a aplicação integral de `20260723_auction_enterprise_security_bidengine_oficial.sql` e `..._postsale_admin_oficial.sql` **falhou em produção** por divergência de nome de coluna (`auction_events.auction_listing_id` vs `listing_id`; `auction_financial_rules.scope` vs `module`). As reedições de 27/07 cobriram trigger de pós-venda, comissão, RPCs admin e RPCs de front — **mas não reemitiram**: o `place_auction_bid` v3 (anti-self-bid + rate-limit), o `create_auction_listing_v2` seguro, o `accept_arremate_offer_advertiser` seguro, nem o purge de políticas de INSERT direto em `auction_bids`/`arremate_offers`.
Verificação ao vivo confirma o quadro **misto**: `place_auction_bid` ativo tem `marker_grid=true` e `marker_auth_check=true` (grade + auth OK), mas **`marker_self_bid=false` e `marker_rate_limit=false`** — a versão vigente **não contém as strings de anti-self-bid nem de rate-limit** que o código-fonte da v3 declara ter. Adicionalmente, os grants ao vivo mostram `authenticated` com **INSERT/UPDATE/DELETE diretos ainda concedidos** em `auction_bids`, `arremate_offers`, `auction_listings`, `auction_events` e `auction_fraud_alerts` — e a policy legada `bids_insert_own` (`WITH CHECK (auth.uid() = user_id)`) **ainda existe e está ativa**, permitindo a qualquer usuário autenticado inserir um lance direto na tabela, bypassando totalmente o motor (grade, self-bid, rate-limit).
**Ação:** aplicar formalmente (com correção do bug de nome de coluna) os 3 objetos de segurança pendentes e revogar INSERT/UPDATE/DELETE de `authenticated` nas 5 tabelas listadas, deixando a escrita exclusivamente via RPC SECURITY DEFINER.

---

## 3. Achados P1 (altos) — resumo consolidado dos 3 auditores

1. **`auction_fraud_alerts` com RLS `USING(true)`/`WITH CHECK(true)`** — comentário no próprio SQL diz "MUDAR EM PRODUÇÃO", nunca corrigido. Qualquer autenticado lê `suspect_user_id`/IP de todos os alertas e pode forjar alertas contra terceiros via `log_auction_fraud` (sem guarda de autorização).
2. **Incremento de lance configurado pelo vendedor é descartado na criação** — UI coleta o valor, mas `useAdvertiserAuctions.ts:153` envia `p_minimum_increment: 1` fixo. Todo leilão novo nasce com incremento de R$1, contradizendo a mensagem da própria UI.
3. **Métricas/selos de confiança fabricados com `Math.random()` em página pública** — `SellerTransparencyCenter.tsx:42-57` inventa avaliação, confiabilidade e selos "Vendedor Verificado" a cada render; `AuctionTransparencyCenter.tsx:46` inventa visualizações. Está no "Centro de Transparência" — o nome contradiz o conteúdo.
4. **Monetização da publicação desativada por comentário "[TESTE]" em produção** (`MerchantAuctions.tsx:1976-1996`) — débito de créditos por publicar leilão está comentado; publicar é grátis hoje.
5. **Histórico do Centro de Transparência sempre vazio** — `AuctionTransparencyCenter.tsx:35-37` consulta colunas inexistentes (`auction_listing_id`/`bidder_id` em vez de `listing_id`/`user_id`).
6. **Buy-now inconsistente entre as duas páginas de detalhe** — `/mercado/leiloes/:id` chama a RPC `auction_buy_now`; `/leilao/:id` envia o buy-now como lance comum via `place_auction_bid`, sem encerrar nem fixar vencedor no front (agrava o P0-3).
7. **Testes automatizados são fachada** — `auction-bidding-flow.spec.ts` é um `expect(true)` puro; `auction-concurrency.mjs` simula localmente sem tocar o banco e sempre "passa". Não há proteção real de regressão no motor de lances.
8. **Bloqueio de contato pós-leilão (com lances, não arremate) inexistente na UI** — vencedor aparece só como UUID cru para o lojista; a liberação de contato especificada (Fase B v2) só foi implementada no fluxo de arremate/oferta.
9. **Cancelamento sem regra de negócio** — dono pode cancelar leilão ativo com lances existentes sem checagem, multa ou aviso — só um `window.confirm()` genérico.

---

## 4. Achados P2 (médios) — lista consolidada
- Favoritos/watchers são fachada: `useState` local em 3 componentes, `auction_watchers` nunca escrita pelo front; `watchers_count` exibido nunca é alimentado.
- Páginas órfãs sem rota: `AdminOrionAuctionLifecycle.tsx`, `AdminAuctionBIDashboard.tsx` (com mock de comissão 5% divergente do 9% real); `AdminAuctionManagement`/`AuctionFraudDashboard` roteados mas fora do menu admin.
- `orion_auction_charge` sem chave de idempotência real apesar do comentário afirmar o contrário — dedup depende só de uma flag de settlement.
- View `auction_performance_analytics` sem `security_invoker`, bypassa RLS de `auction_listings` e expõe BI de todos os sellers a qualquer usuário.
- `auction_events` com `SELECT USING(true)` — trilha de auditoria inteira pública, incluindo notas internas de admin.
- Script de fixtures do SHC (`scripts/shc/create-test-auctions.ts`) usa colunas de schema antigo — inoperante contra o banco atual.
- Edição de leilão ativo com lances permitida sem trava (título/buy-now alteráveis em pleno leilão).
- `create_auction_listing` (assinatura 17-arg) sem REVOKE de PUBLIC/anon e sem validar `auth.uid()` nulo nem posse da loja.
- Script solto `supabase/place_auction_bid.sql` contém `DROP TABLE IF EXISTS auction_bids CASCADE` — destrutivo se executado por engano fora de ordem.
- KPIs renderizando caixas vazias em 2 painéis (`CardInfo` é só um `div`, recebe props que não usa).
- 3 dos 5 pg_cron ticks de inteligência/orquestração estão **inativos** (`active:false`): `orion_auction_intel_tick`, `orion_auction_orchestrator_tick`, `orion_auction_score_tick`, `orion_auction_alert_tick` — só `orion_auction_autoclose` está ligado.
- Duplicação estrutural: 2 vitrines públicas + 2 páginas de detalhe + 5 implementações de countdown.
- Comissão com 3 fontes (rules/config/policy) sincronizadas por dual-update manual pontual, não estruturalmente — risco de dessincronia futura mesmo hoje estando ambas em 9%.

---

## 5. O que está sólido (não deve ser refeito)

- Motor de lances vivo usa `SELECT ... FOR UPDATE` no listing antes de validar (serializa lances concorrentes corretamente) e valida grade de incremento e autenticação.
- Encerramento elege corretamente o maior lance **válido** e é idempotente por chave (settlement não duplica em reexecução).
- Trigger de pós-venda (settlement → arremate) dispara exatamente uma vez.
- Máquina de estados do arremate P2P tem trigger de imutabilidade de vencedor/valor e transições validadas por tabela — bem desenhada.
- RPCs administrativos (`admin_auction_action`, `admin_invalidate_bid`, `admin_auction_overview`) verificam `mp_is_admin()` corretamente.
- Comissão paramétrica (`auction_financial_rules` + `orion_auction_settlement_config`) está consistente em 9% nos dois lugares no banco vivo hoje.
- Nenhum uso de `supabaseAdmin`/service-role no client (removido em ciclo anterior).
- Leilão exibido dentro da loja do vendedor, resumo comercial no cabeçalho, validação client-side de mínimo/incremento, compartilhamento — todos implementados e funcionais.
- Guards de rota (admin/anunciante) corretos; painéis ORION (Comando, Intelligence, Growth, Orchestrator) consomem dados reais.

---

## 6. Critérios de aprovação — checklist

| Critério | Status |
|---|---|
| Nenhuma falha crítica (P0) | ❌ 4 encontradas |
| Nenhuma falha alta (P1) | ❌ 9 encontradas |
| Build sem erros | ❌ import quebrado (P0-1) compromete build/runtime |
| Testes aprovados | ❌ testes de leilão são fachada, sem cobertura real |
| Banco consistente | ❌ órfãos sem FK + divergência de vencedor já materializada |
| RLS validado | ❌ `auction_fraud_alerts`/`auction_events` com `USING(true)`; grants de escrita de `authenticated` não revogados nas tabelas core |
| Integração funcional | 🟡 parcial — maioria das integrações funciona, com ressalvas (financeiro, notificações) |
| Fluxo completo ponta a ponta | 🟡 funciona no caminho feliz; buy-now e cancelamento têm gaps reais |
| Documentação atualizada | 🟡 cadeia disciplinada, mas docs de 18-19/07 não refletem estado atual — só o SHC de 27/07 é fiel |

---

## 7. Recomendação de caminho para reversão do parecer

Para uma nova rodada de homologação com chance de aprovação, o mínimo necessário é:
1. Remover o import quebrado (P0-1) — 1 linha, trivial.
2. Investigar e sanar os 2 lances órfãos + recriar a FK de `auction_bids` sem swallow de exceção (P0-2).
3. Reconciliar o caso de divergência de vencedor já existente e bloquear `auction_buy_now` de aceitar valores incompatíveis com o lance corrente (P0-3).
4. Reaplicar formalmente (corrigindo o bug de coluna) as correções de segurança de 23/07 que nunca entraram em produção, e revogar INSERT/UPDATE/DELETE direto de `authenticated` nas 5 tabelas sensíveis (P0-4) — este é o item de maior risco de fraude real (bypass do motor de lances).
5. Corrigir a policy de `auction_fraud_alerts` (P1-1) antes de qualquer exposição pública maior do painel antifraude.

Nenhuma dessas correções exige refatoração arquitetural — são fixes pontuais e localizados. O parecer pode mudar rapidamente após uma rodada dedicada de correção + reverificação no banco vivo.
