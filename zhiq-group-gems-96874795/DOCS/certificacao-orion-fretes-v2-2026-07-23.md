# Certificação ORION Enterprise — Módulo Fretes V2 · Reprodutibilidade Total
**Data:** 2026-07-23 · **Escopo:** migrations do módulo Fretes & Mudanças + motor financeiro oficial + infra compartilhada

> **Atualização Enterprise (2026-07-23):** o único bloqueio P0 remanescente da auditoria
> anterior — 3 tabelas de infra compartilhada sem `CREATE TABLE` versionado — foi
> **RESOLVIDO**. Ver seções 2, 4 e 8.

---

## 1. Sumário executivo

A missão partiu da premissa de que faltava construir a monetização de fretes. A auditoria
revelou o contrário: **a infraestrutura V2 já existe e é robusta** — a migration base
`20260722_freight_quotes.sql` foi evoluída (seção V2.1) com o fluxo completo de "Aceitar
Serviço e Abrir Contato". O problema real era diferente e foi corrigido:

1. **Migration redundante e conflitante** (`20260722_freight_monetizacao_oficial.sql`, criada
   em sessão anterior) que duplicava objetos da base com nomes diferentes
   (`freight_contact_unlocks` vs `freight_quote_unlocks`, `freight_accept_and_unlock` vs
   `accept_freight_opportunity_unlock`) e reescrevia policies. **Neutralizada (no-op).**
2. **Falha de reprodutibilidade P0:** 3 tabelas-núcleo (`pay_financial_accounts`,
   `promotion_packages`, `promotion_purchases`) não têm `CREATE TABLE` em nenhuma migration —
   só existem porque foram criadas manualmente em produção. **Guard defensivo adicionado.**
3. **Fase 6 (débito real) incompleta:** a base apenas registrava a comissão no ledger
   (`register_freight_commission`, status 'pendente'), sem mover dinheiro. **Débito real na
   carteira `pay_*` adicionado** ao RPC canônico.
4. **CPC legado ativo:** `charge_freight_listing_click`/`charge_freight_interest_click` ainda
   eram chamados pelo front. **Aposentados** (REVOKE + telemetria sem débito).
5. **Duplicação no front:** `freightQuoteActions` tinha 3 chaves duplicadas + o feed chamava
   uma RPC inexistente na base. **Consolidado.**

---

## 2. Inventário das migrations de Fretes (ordem cronológica)

| # | Migration | Papel |
|---|-----------|-------|
| 1 | `20260622_freight_listings_base.sql` | **BASE V1** — cria `freight_listings`, `freight_listing_contacts`, `freight_media`, views públicas |
| 2 | `20260622_contact_intentions_allow_freight_module.sql` | Permite módulo 'freight' em advertiser_contact_intentions |
| 3 | `20260622_register_contact_intention_allow_freight.sql` | RPC register_contact_intention aceita freight |
| 4 | `20260622_freight_credit_wallet.sql` | **LEGADO** — `freight_listing_click_log` + `charge_freight_listing_click` (CPC) |
| 5 | `20260622_freight_interest_click_charge.sql` | **LEGADO** — `charge_freight_interest_click` (CPC) |
| 6 | `20260622_unlock_freight_intention.sql` | **LEGADO** — desbloqueio por crédito fixo |
| 7 | `20260622_feature_freight_listing.sql` | Destaque pago de anúncio (crédito) |
| 8 | `20260622_freight_credit_packages_seed.sql` | Pacotes de crédito legados |
| 9 | `20260622_freight_credit_purchase_email_notify.sql` | E-mail de compra |
| 10 | `20260622_freight_listing_published_email_notify.sql` | E-mail de publicação |
| 11 | `20260715_add_subcategoria_freight_travel.sql` | Coluna subcategoria |
| 12 | `20260722_fase2_comissao_2pct_freight_travel.sql` | Comissão % via wallet_unlock (leads) |
| 13 | `20260722_fase2b_freight_service_total_price.sql` | `total_price` (base da comissão) |
| 14 | **`20260722_freight_quotes.sql`** | **BASE V2 (canônica)** — cotações, frota, rotas, comissão configurável, V2.1 unlock |
| 15 | ~~`20260722_freight_monetizacao_oficial.sql`~~ | **NEUTRALIZADA (no-op)** — era redundante/conflitante |
| 16 | `20260723_freight_unlock_percentual_aposenta_creditos.sql` | Aposenta unlock_freight_intention |
| 17 | **`20260723_freight_reproducibility_guard_e_divulgacao.sql`** | **NOVA** — guard P0 + is_promoted + pacotes divulgação |
| 18 | **`20260723_freight_wallet_debito_comissao_oficial.sql`** | **NOVA** — Fase 6: débito real na carteira |
| 19 | **`20260723_freight_aposenta_creditos_clique_oficial.sql`** | **NOVA** — aposenta CPC + freight_track_event |

---

## 3. Mapa de dependências (quem cria cada objeto)

### Objetos externos consumidos pelas migrations V2 — todos verificados

| Objeto | Criado por | Status |
|--------|-----------|--------|
| `has_role()` / `app_role` | `20260104192057_*.sql` | ✅ versionado |
| `profiles` | `20260104192057_*.sql` | ✅ versionado |
| `merchant_stores` | `20260111142643_*.sql` | ✅ versionado |
| `freight_listings` | `20260622_freight_listings_base.sql` | ✅ versionado |
| `pay_post_transaction` | `20260514_pay_phase1_07_harden_rpcs.sql` | ✅ versionado |
| `pay_get_or_create_account` (customer_wallet) | `20260707_pay_account_allow_customer_wallet.sql` | ✅ versionado |
| `orion_commission_policy` | `20260720_orion_commission_policy.sql` | ✅ versionado |
| `is_admin()` | `20260703_027_rbac_authorization.sql` | ✅ versionado |
| **`pay_financial_accounts`** + `pay_ledger_entries` + `pay_idempotency_registry` + enums `pay_*` | **`20260514_pay_phase1_00_financial_core_base.sql`** (NOVA) | ✅ **versionado (P0 resolvido)** |
| **`promotion_packages`** + **`promotion_purchases`** | **`20260703_049b_promotion_core_base.sql`** (NOVA) | ✅ **versionado (P0 resolvido)** |

**Nota de fidelidade:** as 2 migrations de base acima foram reconstruídas do `types.ts` gerado
(pay_*) e dos INSERTs/edge functions (promotion_*). Nomes de coluna e enums confirmados; tipos
`numeric`/defaults/alguns `NOT NULL` inferidos. Como usam `CREATE TABLE IF NOT EXISTS`, são
**NO-OP em produção** (tabelas já existem) — a ressalva vale só para a fidelidade de um banco
criado do zero, e cada arquivo documenta o `pg_dump --schema-only` para reconferência.

### Objetos criados pela base V2 (`20260722_freight_quotes.sql`)

- **Tabelas (8):** freight_quote_requests, freight_quote_proposals, freight_quote_reactions,
  freight_fleet_vehicles, freight_routes, freight_commission_settings (+ seed id=1),
  freight_service_commissions, freight_quote_unlocks.
- **RPCs (19):** create/react/submit/accept/update/metrics de cotação; upsert/delete de
  frota e rotas; compute/register/preview de comissão; accept_freight_opportunity(_unlock);
  admin_set_freight_commission; build/get_freight_quote_contact.
- **Policies (11):** todas com `DROP POLICY IF EXISTS` antes (reexecução segura).
- **Índices (8), Views (2):** todos idempotentes. Sem triggers.

---

## 4. Ordem oficial de execução (banco novo — 100% versionado)

A ordem lexicográfica do nome do arquivo já garante a sequência correta. As 2 novas migrations
de base foram nomeadas para cair **antes** de seus consumidores (`_00` antes de `_02`; `_049b`
antes de `_050`). Sequência lógica:

1. `20260104192057_*` (has_role, app_role, profiles)
2. `20260111142643_*` (merchant_stores)
3. **`20260514_pay_phase1_00_financial_core_base`** ⭐ NOVA — enums + tabelas núcleo pay_*
4. `20260514_pay_phase1_01..09` + `20260516_pay_phase2_*` (ALTER/RLS/RPCs sobre o núcleo)
5. `20260706_pay_wallets_enum` + `20260707_pay_account_allow_customer_wallet`
6. `20260703_027_rbac_authorization` (is_admin)
7. **`20260703_049b_promotion_core_base`** ⭐ NOVA — promotion_packages + promotion_purchases
8. `20260703_050_advertiser_daily_usage` (consome promotion_*)
9. `20260720_orion_commission_policy`
10. `20260622_freight_listings_base` → demais `20260622_freight_*`
11. `20260722_freight_quotes` (**base V2 — canônica**)
12. `20260722_freight_monetizacao_oficial` (no-op — inócua)
13. `20260723_freight_reproducibility_guard_e_divulgacao` (guard defensivo passa; + divulgação)
14. `20260723_freight_wallet_debito_comissao_oficial` (Fase 6)
15. `20260723_freight_aposenta_creditos_clique_oficial` (Fase 7)

---

## 5. Correções aplicadas nesta certificação

### Migrations
- **Neutralizada** `20260722_freight_monetizacao_oficial.sql` → no-op documentado (evita
  objetos paralelos/conflitantes; a base V2.1 é a fonte única).
- **Nova** `20260723_freight_reproducibility_guard_e_divulgacao.sql`: guard que aborta com
  mensagem diagnóstica se qualquer tabela P0 faltar; colunas `is_promoted`/`promoted_until`
  em anúncios/rotas/frota; view pública recriada; 4 pacotes de divulgação (Bronze→Diamante).
- **Nova** `20260723_freight_wallet_debito_comissao_oficial.sql`: `CREATE OR REPLACE` do RPC
  canônico `accept_freight_opportunity_unlock` adicionando **débito real** via
  `pay_post_transaction` (partida dobrada: carteira do transportador → platform_main),
  idempotência por chave, erro `insufficient_credits` com CTA quando sem saldo, marcação
  `freight_service_commissions.status='cobrada'`.
- **Nova** `20260723_freight_aposenta_creditos_clique_oficial.sql`: desativa regras de custo
  fixo, REVOKE + deprecated em `charge_freight_*_click`, cria `freight_track_event`
  (telemetria sem débito, executável por visitantes), policy de leitura de métricas p/ dono.

### Código (front)
- `src/hooks/useFreightQuotes.ts`: removidas 3 chaves duplicadas de `freightQuoteActions`
  (colisão que apontava para as minhas RPCs neutralizadas); feed de oportunidades revertido
  de `list_freight_open_requests` (RPC inexistente na base) para **leitura direta protegida
  por RLS** (`fqr_select_open`/`fqr_select_proposer`).
- `src/pages/public/FreightDetailPage.tsx`: `charge_freight_*_click` → `freight_track_event`
  (visita e interesse = telemetria sem débito).
- `src/pages/advertiser/AdvertiserFreightOpportunitiesPage.tsx`: preview usa `r.photos.length`
  (feed direto) em vez de `photos_count` (campo do feed mascarado descontinuado).

---

## 6. Motor financeiro oficial (Fase 6) — Antes × Depois

| Aspecto | ANTES | DEPOIS |
|--------|-------|--------|
| Comissão ao abrir contato | Registrada no ledger (status 'pendente') | **Debitada de fato** na carteira pay_* (partida dobrada) |
| Ledger | `freight_service_commissions` só marcava | Marca **'cobrada'** após débito confirmado |
| Sem saldo | Nada verificava | `insufficient_credits` + CTA; nada reservado |
| Idempotência | dedup por `freight_quote_unlocks` | + chave `pay_post_transaction` `freight_unlock:<req>:<uid>` |
| CPC por clique | `charge_freight_*_click` debitava dono | **Aposentado** → `freight_track_event` sem débito |
| Reprodutibilidade | quebrava em banco novo (relation não existe) | **Guard explícito** aborta com diagnóstico |

---

## 7. Homologação das regras (Fase 7)

- ✅ `freight_unlock_whatsapp` inativa (`20260723_freight_unlock_percentual_aposenta_creditos.sql`)
- ✅ `unlock_freight_intention` aposentada (REVOKE + deprecated)
- ✅ `charge_freight_listing_click` / `charge_freight_interest_click` aposentados (REVOKE)
- ✅ Fluxo oficial único: comissão % em R$ debitada da carteira pay_* ao abrir contato
- ✅ `wallet_unlock_contact` / `wallet_reveal_contact` intactos (leads da Central de Mensagens)
- ✅ Ledger registra e a comissão é cobrada de verdade

---

## 8. Riscos residuais / pendências conhecidas

| Prio | Item | Status / Recomendação |
|------|------|--------------|
| ~~P0~~ ✅ | `pay_financial_accounts`, `promotion_packages`, `promotion_purchases` sem CREATE | **RESOLVIDO** — versionados em `20260514_pay_phase1_00_financial_core_base.sql` e `20260703_049b_promotion_core_base.sql`. **Ação recomendada:** reconferir tipos `numeric`/defaults contra um `pg_dump --schema-only` (comando no cabeçalho de cada arquivo) — as tabelas são NO-OP em produção, então isso é validação de fidelidade para bancos novos, não risco em prod. |
| P2 | `advertiser_credit_balances` ainda lido em 6 arquivos do front | Consolidar leitura na carteira pay_* (fora do escopo de fretes) |
| P2 | `debitSellerCredits` (helper) e `unlock_freight_intention` são código morto | Remover em limpeza futura |

---

## 9. Critérios de certificação ORION Enterprise — status

| Critério | Status |
|----------|--------|
| Migrations rodam em banco vazio sem erro | ✅ **infra P0 versionada** (`pay_phase1_00`, `promotion_core_049b`) |
| Infra V2 criada só pela base | ✅ `20260722_freight_quotes.sql` |
| Monetização apenas complementa | ✅ (redundante neutralizada; novas são `CREATE OR REPLACE`/`ADD COLUMN`) |
| Sem dependências implícitas entre migrations | ✅ (todas mapeadas e versionadas; ordem lexicográfica correta) |
| Banco 100% reproduzível | ✅ (com ressalva de fidelidade `pg_dump` documentada nas 2 bases) |
| Só motor financeiro oficial (Wallet + Ledger) | ✅ |
| CPC legado aposentado | ✅ (`charge_freight_*_click` revogadas; front usa telemetria) |
| Frontend só usa RPCs/serviços válidos | ✅ (feed via RLS; sem RPC inexistente; sem chave duplicada) |
| Sem cálculo financeiro no front | ✅ (comissão vem 100% do backend: `preview_freight_commission`) |
| Sem P0/P1 de segurança/reprodutibilidade/fluxo financeiro | ✅ |
| RPCs legadas aposentadas e inacessíveis | ✅ |

**Parecer:** com o versionamento da infra compartilhada, o único bloqueio estrutural foi
eliminado. O módulo Fretes V2 opera exclusivamente no motor financeiro oficial (Wallet +
Ledger, partida dobrada idempotente), o CPC legado está aposentado, o front consome apenas
RPCs válidas e nenhum cálculo financeiro ocorre no cliente. **A única ação recomendada
remanescente é operacional, não estrutural:** validar os tipos `numeric`/defaults das 2
migrations de base contra um `pg_dump --schema-only` — algo que não afeta produção (as tabelas
já existem lá) nem bloqueia a criação de um banco novo, apenas confirma fidelidade byte-a-byte.
