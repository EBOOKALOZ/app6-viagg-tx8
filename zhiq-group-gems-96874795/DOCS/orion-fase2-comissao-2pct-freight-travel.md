# ORION IMPLEMENTATION — FASE 2 · Integração do Modelo de Comissão de 2%

**Data:** 2026-07-22 · **Banco:** `broifhfqmnzqoongtokm` (produção, via Management API)
**Migration:** `supabase/migrations/20260722_fase2_comissao_2pct_freight_travel.sql`
**Escopo:** expandir o modelo de comissão de 2% já certificado (Mercado/Imóveis/Veículos)
para **Fretes, Mudanças, Viagens e Turismo**, reutilizando a MESMA arquitetura, sem lógica
paralela e sem tocar o núcleo financeiro. Leilões/Arremates ficam **fora** (fase posterior).

---

## 1. Descoberta (evidência, não suposição)

Auditei o esquema real antes de escrever qualquer linha. Achados que definiram o desenho:

| Módulo do produto | `p_module` (chave real) | Tabela | Discriminador de subtipo | Valor oficial numérico? |
|---|---|---|---|---|
| Fretes / **Mudanças** | `freight` | `freight_listings` | `subcategoria` (`'Mudanças'`) | ❌ só `price_per_km` (taxa) + `price_label` (texto) |
| Viagens / **Turismo** | `travel` | `travel_listings` | `subcategoria` (`'Turismo'`) | ✅ `total_price` → `price_per_person` (BRL) |
| Serviços | `services` | `service_listings` | `service_type` | ❌ só `price_label` (texto) |

- **Não existem** as colunas hipotéticas do briefing (`valor_total`, `valor_negociado`,
  `valor_orcado`, `orçamento aprovado`, etc.). Não foram inventadas.
- **Mudanças** e **Turismo** NÃO são módulos separados: são **subcategorias** dentro de
  `freight`/`travel`. Logo, há apenas **2 chaves de módulo** a integrar (`freight`, `travel`),
  não 4 — e ambas já cobrem as subcategorias automaticamente.
- Política: `orion_commission_policy(context='marketplace')` = **2%**, piso `min_credits=9`
  (R$ 9), sem teto. Fonte única, inalterada.

---

## 2. O que mudou (2 funções, via `CREATE OR REPLACE` — preserva grants)

### 2.1 `wallet_unlock_charge_cents` (cálculo do valor)
- **ADICIONA** resolução do valor oficial de `travel`: `COALESCE(total_price, price_per_person)`
  lido de `travel_listings` → **2% real** (com piso R$ 9).
- **ELIMINA por completo** a dependência de `p_value_hint_cents`. O parâmetro continua na
  assinatura (compat com callers/`reveal`), mas é **IGNORADO** — o valor do cálculo vem
  **sempre** do anúncio no banco. Fecha o achado **P2-1** da auditoria (bypass de valor pelo front).
- Módulos **sem valor numérico persistido** (`freight`/`services`) recaem no **piso R$ 9**,
  nunca em valor vindo do cliente. `price_per_km` (taxa) NÃO é usado como base de 2% (seria
  semanticamente errado).

### 2.2 `wallet_listing_owner` (dono do anúncio — owner-only)
- **ADICIONA** a resolução de dono de `travel` (`travel_listings.owner_user_id`). Sem isto o
  check de propriedade em `wallet_unlock_contact` era um **no-op para viagens** (qualquer
  autenticado se auto-cobrava/revelava). Gap de segurança fechado.

**Núcleo financeiro intocado:** `pay_post_transaction`, `pay_ledger_entries`,
`pay_idempotency_registry`, `orion_marketplace_contact_charges` (UNIQUE + `ON CONFLICT`),
`FOR UPDATE`, RLS, logs e `unlock_reconcile` — nenhuma alteração.

---

## 3. Testes (todos ao vivo em produção; nada persistido)

### 3.1 Cálculo do valor (SELECT read-only)
| Caso | Valor oficial | 2% esperado | `calc(NULL)` | `calc(hint gigante)` |
|---|---|---|---|---|
| travel/Turismo | R$ 450,00 | R$ 9 (piso) | **900** | **900** ✓ hint ignorado |
| travel/Viagens | R$ 1.500,00 | R$ 30 | **3000** | **3000** ✓ |
| travel/Viagens (só p/pessoa) | R$ 450,00 | R$ 9 (piso) | **900** | **900** ✓ |
| freight/Mudanças ×3 | — (sem valor) | R$ 9 (piso) | **900** | **900** ✓ (hint 5M ignorado) |

### 3.2 Regressão dos módulos certificados (inalterados + hint neutralizado)
| Módulo | Valor | 2% | `calc(NULL)` | `calc(hint 7.7M)` |
|---|---|---|---|---|
| real_estate | R$ 6.540.000 | R$ 130.800 | **13.080.000** | **13.080.000** ✓ |
| vehicles | R$ 6.500 | R$ 130 | **13.000** | **13.000** ✓ |
| product | R$ 35 | piso R$ 9 | **900** | **900** ✓ |

### 3.3 Homologação E2E — caminho REAL de dinheiro (`tests/security/unlock-2pct-homolog.sql`)
Vendedor sintético com saldo real, tudo em transação com **rollback proposital**. **ALL_PASS=t**:
- **T1** travel 2%: debitou **R$ 30** (3000c), hint gigante ignorado, ledger +2 (partida dobrada).
- **T2** idempotência: 2º clique → `already_unlocked`, **0** cobrança, ledger inalterado.
- **T3** sem valor → **piso R$ 9**, hint R$ 1M ignorado.
- **T4** saldo insuficiente → `insufficient_credits` + **rollback** (dedup desfeito, saldo intacto).
- **T5** LGPD/owner-only: intenção de outro dono → `not_owner`, **nenhuma PII** devolvida.
- **T6** reconciliação: Σdébito = Σcrédito = 3900c; `charges_vs_ledger_match: true`.

### 3.4 Segurança / RLS
- Suíte permanente `tests/security/rls-permissions.test.mjs`: **PASS=48 FAIL=0**.
- `has_function_privilege`: `anon` = **false**, `authenticated` = true nas 4 funções
  (`CREATE OR REPLACE` preservou os grants do hardening).
- `wallet_listing_owner('travel', id)` = `owner_user_id` real (owner-only ativo).

---

## 4. Fluxo final (padronizado em todos os classificados)

Cliente clica "Tenho Interesse" → intenção gravada → vendedor autentica →
`wallet_reveal_contact`/`wallet_unlock_contact` → **backend resolve o valor oficial** →
`wallet_unlock_charge_cents` calcula 2% (piso R$ 9) → `pay_post_transaction` debita a carteira
do vendedor e credita `platform_main` (partida dobrada) → dedup permanente por
(módulo, anúncio, comprador) → PII liberada → **nunca recobra o mesmo comprador no mesmo anúncio**.

**Padronizado agora:** ✅ Mercado · ✅ Imóveis · ✅ Veículos · ✅ Fretes · ✅ Mudanças ·
✅ Viagens · ✅ Turismo — todos na mesma arquitetura financeira certificada.
Fora do escopo (fase posterior): Leilões, Arremates.

---

## 5. Observações

- **Fretes/Mudanças/Serviços cobram o piso (R$ 9)**, não 2% variável, porque **não há valor
  total oficial persistido** nesses anúncios (só taxa/km ou texto livre). Isto é correto e
  determinístico — jamais depende do front. Se no futuro esses módulos passarem a persistir um
  valor total numérico, basta adicioná-lo ao mesmo bloco de resolução (uma linha), sem tocar o
  motor. **Recomendação:** avaliar adicionar um campo de valor total oficial a `freight_listings`
  para habilitar 2% variável nesses módulos.
- `value_hint` agora é **inerte em toda a plataforma** (não só nos novos módulos) — hardening
  transversal que fecha o P2-1 da auditoria também para produto/imóvel/veículo.
- Front: `src/lib/credits/unlockContact.ts` teve apenas os JSDoc atualizados (parâmetro marcado
  DEPRECATED/ignorado). Nenhuma mudança de lógica; caminho principal já não enviava hint.

---

## 6. FASE 2b — 2% VARIÁVEL para Fretes/Mudanças e Serviços (2026-07-22)

Fecha a ressalva do §5: dá a Fretes/Mudanças/Serviços um **valor total oficial**, habilitando
2% variável (antes só piso). **Migration:** `20260722_fase2b_freight_service_total_price.sql`.

**Mudanças:**
- **DB:** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS total_price numeric` (nullable) em
  `freight_listings` e `service_listings` (mesmo nome de `travel_listings`), com `COMMENT`
  explicando que é a base dos 2% e que NULL → piso.
- **Backend:** `wallet_unlock_charge_cents` ganhou os branches `freight` e `services` lendo
  `total_price`. Valor ausente → piso (comportamento idêntico ao anterior → 100% compatível).
  Continua **ignorando** `p_value_hint_cents`.
- **Front:** campo "Valor total (opcional)" em `FreightForm.tsx` e `ServiceForm.tsx`
  (state + load na edição + payload de insert/update + input numérico com nota de que é a
  base da comissão de 2%). Sem valor, nada muda.

**Testes (ao vivo, rollback):**
- freight sem total → **piso 900**; freight total R$1.200 → **2% = R$24 (2400)** (hint 999M ignorado);
  service total R$500 → **2% = R$10 (1000)**; freight total R$100 → 2%=R$2 < piso → **900**. ALL_PASS.
- Regressão: homolog E2E travel **ALL_PASS**; suíte segurança **48/48**; `tsc` limpo.

**Estado:** Fretes/Mudanças/Serviços agora cobram **2% do valor total quando informado**, com
piso R$9 como padrão seguro. `price_per_km` (taxa) permanece só informativo — nunca é base de 2%.
