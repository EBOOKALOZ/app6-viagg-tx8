# ORION-AUDIT — Modelo de Comissão 2% (Auditoria Completa)

**Data:** 2026-07-21 · **Natureza:** auditoria independente READ-ONLY (nada alterado) · **Base:** exclusivamente evidência ao vivo em produção (`broifhfqmnzqoongtokm`) + código-fonte. Nenhuma suposição.

> **Modelo auditado:** quando há um interessado num anúncio, o **vendedor (dono)** paga **2% do valor do anúncio** (piso R$9) da sua carteira `pay_*` (`customer_wallet`) → `platform_main`, para **liberar o contato/WhatsApp/chat do interessado**, de forma **permanente e idempotente** por (módulo, anúncio, comprador).

---

## MAPA DO FLUXO (fonte única)

```
Interesse no anúncio → unlockContact.ts → RPC wallet_unlock_contact(module, listing_id, buyer_key, value_hint?)
  ① auth.uid() obrigatório  ② só o DONO do anúncio (wallet_listing_owner) — senão 'not_listing_owner'
  ③ PERMANÊNCIA/IDEMPOTÊNCIA: INSERT orion_marketplace_contact_charges (UNIQUE module,listing,buyer_key)
       ON CONFLICT DO NOTHING → já desbloqueado ⇒ retorna already_unlocked, charged_cents=0
  ④ CUSTO: wallet_unlock_charge_cents = round(valor × 2% × 100) com piso R$9   [orion_commission_policy]
  ⑤ DÉBITO: pay_post_transaction(scope='marketplace_unlock', ref='orion_marketplace_contact_charges')
       customer_wallet(vendedor) −  →  platform_main +   (partida dobrada, idempotente)
  ⑥ saldo insuficiente → rollback do dedup + {insufficient_credits, buy_credits_cta}
PII liberada → wallet_reveal_contact (reúsa unlock; expõe telefone/whatsapp/email; log orion_contact_reveal_log)
```

**Dado de produção:** `orion_marketplace_contact_charges` = **0 linhas**; débitos de comissão em `pay_ledger_entries` = **0**. **O fluxo nunca foi exercido com um usuário real** (mecanismo provado só por selftest sintético `wallet_unified_selftest` v3_pay, all_pass).

---

## AUDITORIA 1 — ARQUITETURA · 🟢 Nota 92

| Verificação | Evidência |
|---|---|
| Onde o cálculo acontece | **100% no backend** — `wallet_unlock_charge_cents` (SQL/plpgsql, SECURITY DEFINER) resolve preço do listing + `orion_commission_policy` |
| Front recalcula? | **NÃO** — `unlockContact.ts` só chama a RPC; `contact_unlock_quote` (novo) entrega valor/%/comissão prontos |
| Banco recalcula? | Sim, é a fonte única (não há duplicação) |
| Risco de divergência | **Baixo** — percentual só em `orion_commission_policy` (marketplace=2%); nenhum hardcode no front |

**Conforme.** Única fonte de verdade do %; cálculo centralizado.

---

## AUDITORIA 2 — BANCO DE DADOS · 🟢 Nota 88

| Objeto | Estado |
|---|---|
| `orion_marketplace_contact_charges` | PK (`_pkey`) + **UNIQUE(listing_module, listing_id, buyer_key)** + índice `idx_omcc_listing` + **RLS ON** (anon SELECT = false) |
| `pay_financial_accounts` / `pay_ledger_entries` | ledger partida dobrada; RLS owner/admin; UPDATE bloqueado |
| `pay_idempotency_registry` | ✅ existe (backbone de idempotência) |
| `wallet` / `wallet_transactions` (Wallet Core legado) | ⚠ **NÃO é mais usado pelo desbloqueio** (v3 migrou p/ `pay_*`); permanece órfão/deprecated (0 saldo) |
| RPCs/Functions | `wallet_unlock_contact`, `wallet_reveal_contact`, `wallet_unlock_charge_cents`, `pay_post_transaction`, `commission_policy_*` — todas DEFINER, `REVOKE anon` |
| Triggers | via `pay_post_transaction` (audit/ledger) |
| Migrations | `20260720_orion_wallet_unlock_v2.sql` + v3 pay_* (AI-75.3) |

**Conforme.** Constraints e índices adequados. Ressalva: a mission cita `wallet_reserve/wallet_confirm/buyer_unlocks/interest_logs/listing_contacts` — **`buyer_unlocks`/`interest_logs`/`listing_contacts` NÃO existem** (a permanência é `orion_marketplace_contact_charges`; `wallet_reserve/confirm` são do Core legado, fora do caminho atual).

---

## AUDITORIA 3 — REGRA DOS 2% · 🟢 Nota 90

`v_cents := round(valor × (percent/100) × 100)::bigint` seguido de `GREATEST(piso, ...)`. Tudo em **`numeric`** (sem float), resultado em **`bigint` (cents)**. Provado ao vivo:

| Valor anúncio | 2% bruto | Com piso R$9 |
|---|---|---|
| R$ 99,90 | R$ 2,00 | **R$ 9,00** (piso) |
| R$ 199,90 | R$ 4,00 | **R$ 9,00** (piso) |
| R$ 1.000 | R$ 20,00 | **R$ 20,00** |
| R$ 5.999 | R$ 119,98 | **R$ 119,98** |
| R$ 100.000 | R$ 2.000,00 | **R$ 2.000,00** |

Sem overflow (bigint cents), sem float, `round()` half-away. **Conforme.**
**🟡 Ressalva (P2):** só `product`/`real_estate`/`vehicles` resolvem o preço do listing. Para **services/freight/arremate** (e produtos com `price_label` texto), `v_value` fica NULL → usa o **`p_value_hint_cents` (parâmetro do caller)** ou o piso. Ver Auditoria 5/10.

---

## AUDITORIA 4 — IDEMPOTÊNCIA · 🟢 Nota 95

**Dupla camada, comprovada:**
1. **Permanência do desbloqueio:** `orion_marketplace_contact_charges` **UNIQUE(module, listing, buyer_key)** + `ON CONFLICT DO NOTHING` → 2ª chamada (mesmo comprador/anúncio) = `already_unlocked, charged_cents=0`.
2. **Motor financeiro:** `pay_post_transaction` usa **`pay_idempotency_registry`** + **`FOR UPDATE`** (lock de conta) + **`ON CONFLICT`/unique_violation** (chave `unlock:module:listing:buyer_key`).

**Cobrança dupla = IMPOSSÍVEL** (mesmo comprador + mesmo anúncio + retry/refresh/concorrência = no-op). **Conforme.**

---

## AUDITORIA 5 — SEGURANÇA · 🟡 Nota 78

| Vetor | Resultado |
|---|---|
| Alterar a comissão pelo front | ❌ impossível (calculada no backend) |
| Enviar outro valor / alterar JSON | ⚠ **para listings SEM preço resolvido, o `p_value_hint_cents` é do caller** → o vendedor pode passar um hint BAIXO e pagar menos que 2% (capado no piso R$9). É **auto-subcobrança** (prejudica a receita da plataforma, não outro usuário) |
| Trocar `listing_id` | mitigado — `wallet_listing_owner` recusa anúncio alheio (`not_listing_owner`) |
| Trocar `buyer_id`/`buyer_key` | permitido (é o identificador do lead), mas cobra do próprio dono |
| Alterar wallet | ❌ (UPDATE em pay/wallets bloqueado; débito só via DEFINER) |
| Chamar RPC manualmente (anon) | ❌ `REVOKE anon` (PGRST202/42501) |
| SQL Injection | ❌ (params tipados; sem SQL dinâmico com concat de entrada) |
| Race condition | ❌ mitigada (FOR UPDATE + UNIQUE + idempotency_registry) |
| Privilege escalation | ❌ (DEFINER com guarda auth.uid + owner) |

**🟡 Atenção.** Achado **P2**: bypass de valor via `p_value_hint_cents` em módulos sem preço resolvido → **subcobrança da comissão** (receita), limitada ao piso. Não é violação de outro usuário nem vazamento.

---

## AUDITORIA 6 — LGPD · 🟢 Nota 82

- PII (telefone/whatsapp/email) liberada **apenas** via `wallet_reveal_contact` (reúsa o unlock → só após pagamento/permanência). ✅
- `orion_contact_reveal_log` existe com **RLS ON**. ✅
- Contato só ao **dono que pagou** (guarda de owner). ✅
- **🟡 Ressalva (P3):** não há **política de retenção/anonimização** explícita do log de reveal nem expurgo temporal. Recomenda-se definir retention + minimização.

---

## AUDITORIA 7 — UX · 🟡 Nota 68

- `contact_unlock_quote` entrega ao card: **valor do anúncio, %, comissão, saldo disponível, saldo restante, status** (disponivel/saldo_insuficiente/ja_desbloqueado/nao_e_dono) — tudo do backend. ✅
- Erro de saldo → `insufficient_credits` + `buy_credits_cta` (funil de recarga). ✅
- **🟡 Ressalvas:** (a) **0 uso real** → UX não validada em produção; (b) a recarga da carteira que abastece o desbloqueio depende do fluxo MP (`TravelerWalletTopup`), e o "Adicionar Saldo" do lojista era stub (ver auditoria de carteira anterior); (c) **reembolso** não existe (unlock permanente) — precisa ficar claro na UI que a cobrança é definitiva.

---

## AUDITORIA 8 — PERFORMANCE · 🟢 Nota 85

- Operações de **1 linha** por desbloqueio (INSERT dedup + `pay_post_transaction`), com **índice UNIQUE** para o lookup de permanência e `idx_omcc_listing`. Escala linear.
- `FOR UPDATE` bloqueia só a conta do vendedor (contenção mínima).
- **Escala 10 → 1M usuários:** o gargalo potencial é o lock por conta em desbloqueios concorrentes do MESMO vendedor (raro). Índices e cents/bigint suportam volume. **Conforme.**

---

## AUDITORIA 9 — FINANCEIRO · 🟢 Nota 84

| Item | Estado |
|---|---|
| Débito / Crédito | partida dobrada em `pay_ledger_entries` (customer_wallet − / platform_main +) ✅ |
| Ledger / Saldo / Extrato | `pay_ledger_entries` + `pay_financial_accounts` + `v_wallet_statement` ✅ |
| Conciliação | `unlock_reconcile` / `reconcile_wallet` existem ✅ |
| Estorno / Reembolso / Cancelamento | **NÃO existe** para desbloqueio de contato — **unlock é permanente por design** (sem `refund_contact`); ⚠ decisão de produto a documentar |
| Idempotência financeira | ✅ (Auditoria 4) |

**Conforme** (com a nota de "sem estorno" — intencional).

---

## AUDITORIA 10 — MÓDULOS · 🟡 Nota 62

| Módulo | Integração ao 2% |
|---|---|
| **Mercado (product)** | ✅ preço de `advertiser_listings.price`/`products.price` |
| **Imóveis (real_estate)** | ✅ `real_estate_listings.price_brl` |
| **Veículos (vehicles)** | ✅ `vehicle_listings.price_brl` |
| **Serviços** | 🔴 **não resolvido** → cai no hint/piso R$9 |
| **Fretes** | 🔴 **não resolvido** → hint/piso |
| **Arremates / Leilões** | 🔴 **não usam este 2%** (leilão = política própria 9% no settlement; arremate = P2P) — separado por design |
| Chat / WhatsApp / Carteira / Dashboard | ✅ consomem o resultado (pós-desbloqueio) |

**🟡 Atenção.** `wallet_unlock_charge_cents` **não cobre services/freight** (confirmado: `charge_cobre_outros_modulos=False`) → comissão fixa no piso ou dependente do hint. **Módulos NÃO integrados uniformemente.**

---

## AUDITORIA 11 — ADMIN · 🟡 Nota 65

- **Receita** = conta `platform_main` (créditos de comissão); consultável via `pay_ledger_entries`/`v_pay_platform_ledger_summary`. ✅
- **KPIs comerciais** via `bi_commercial()` (lê pay_*). ✅
- **🟡 Ressalvas:** relatórios dedicados de **comissão por produto/vendedor/comprador** + **exportação (CSV/PDF)** + **alertas** ainda não evidenciados como painel admin próprio; com **0 dados reais**, não auditável na prática.

---

## AUDITORIA 12 — IA · 🟡 Nota 60

- Dados disponíveis para IA: `orion_marketplace_contact_charges` (quem desbloqueou o quê), `pay_ledger_entries` (receita), `orion_contact_reveal_log` (reveals), `advertiser_contact_intentions` (interessados). ✅ estrutura pronta.
- `bi_commercial()` já agrega indicadores. ✅
- **🟡** Detecção de fraude / comprador falso / spam / previsão de conversão = **estrutura preparada, não implementada** (com 0 dados reais, sem baseline).

---

## AUDITORIA 13 — ESCALABILIDADE · 🟢 Nota 82

- Cents/`bigint`, índices UNIQUE + `idx_omcc_listing`, débito de 1 linha por desbloqueio. Suporta **100k → milhões de anúncios**.
- Gargalo teórico: crescimento de `orion_marketplace_contact_charges` e `pay_ledger_entries` (particionamento futuro por data/módulo se necessário).
- **Conforme** para o horizonte previsto.

---

## RELATÓRIO FINAL — NOTAS

| Dimensão | Nota | Status |
|---|---|---|
| Arquitetura | **92** | 🟢 |
| Banco | **88** | 🟢 |
| Segurança | **78** | 🟡 (bypass de hint P2) |
| Financeiro | **84** | 🟢 |
| UX | **68** | 🟡 (0 uso real; sem reembolso) |
| Performance | **85** | 🟢 |
| Escalabilidade | **82** | 🟢 |
| Integração (módulos) | **62** | 🟡 (services/freight/arremate fora) |
| Regra dos 2% | **90** | 🟢 |
| **GERAL** | **≈ 79** | 🟡 |

### Problemas encontrados

| # | Sev | Problema | Evidência / Local | Impacto | Como corrigir (sem implementar) |
|---|---|---|---|---|---|
| P2-1 | 🟡 | Bypass de valor via `p_value_hint_cents` em módulos sem preço resolvido | `wallet_unlock_charge_cents` (fallback hint) | Vendedor auto-subcobra a comissão (receita), capado no piso R$9 | Resolver o preço no backend para TODOS os módulos (services/freight) ou ignorar o hint quando o listing tiver preço; validar hint contra o valor oficial |
| P2-2 | 🟡 | services/freight/arremate fora da cadeia de preço do 2% | `wallet_unlock_charge_cents` (IF só product/RE/vehicles) | Comissão fixa no piso p/ esses módulos | Adicionar resolução de preço por módulo (services/freight) |
| P3-1 | 🟢 | Sem estorno/reembolso do desbloqueio | ausência de `refund_contact` | Unlock definitivo (intencional) | Deixar explícito na UI; criar exceção admin de estorno se for regra de negócio |
| P3-2 | 🟢 | Sem política LGPD de retenção/anonimização do reveal | `orion_contact_reveal_log` | Retenção indefinida de PII de contato | Definir retention + expurgo/anonimização |
| Info | ⚪ | 0 desbloqueios/débitos reais | dados de produção | Fluxo não exercido → sem E2E real | Rodar E2E com saldo real (sandbox) para homologar |
| Info | ⚪ | Wallet Core legado (`wallets`) órfão | tabelas vazias | Confusão/dívida | Descontinuar formalmente (o desbloqueio usa pay_*) |

**Nenhuma falha CRÍTICA (P0/P1):** sem cobrança dupla (idempotência dupla comprovada), 2% centralizado (`orion_commission_policy`), owner-only, anon bloqueado, partida dobrada íntegra, sem SQLi/priv-esc/race.

---

## CERTIFICAÇÃO

**Critérios (mission):**
- Sem vulnerabilidades críticas → ✅ (as achadas são P2/P3)
- Sem possibilidade de cobrança dupla → ✅ (idempotência dupla: UNIQUE+ON CONFLICT + idempotency_registry+FOR UPDATE)
- Regra dos 2% centralizada e consistente → ✅ (`orion_commission_policy`, cálculo no backend, sem float)
- Idempotência comprovada → ✅
- Fluxo financeiro íntegro → ✅ (partida dobrada, reconciliação)
- **Módulos integrados corretamente → 🟡 PARCIAL** (Mercado/Imóveis/Veículos ✅; Serviços/Fretes ❌ na cadeia de preço)

Como **não há falha crítica** e todos os critérios financeiros/segurança/idempotência estão satisfeitos, mas a **integração de módulos é parcial** e há o **bypass de hint (P2)**, o parecer é:

# ✅ CERTIFICADA — COM RESSALVAS (P2)

**Escopo certificado:** o modelo de 2% está **certificado para Mercado (product), Imóveis e Veículos** — 2% centralizado, idempotente, seguro, financeiramente íntegro, sem cobrança dupla.

**Condições para certificação PLENA (fechar antes de expandir):**
1. **P2-1** — eliminar o bypass de `value_hint` (resolver preço no backend para todos os módulos ou validar o hint).
2. **P2-2** — integrar **Serviços e Fretes** à resolução de preço do 2% (hoje caem no piso/hint).
3. Homologar com **E2E real** (0 dados de produção hoje) e descontinuar o Wallet Core legado.

*Auditoria read-only. Nenhum objeto/dado/permissão alterado. Evidências: introspecção ao vivo (`broifhfqmnzqoongtokm`), `wallet_unified_selftest` v3_pay, corpos das RPCs, constraints/índices/RLS, e testes de arredondamento SQL. 2026-07-21.*
