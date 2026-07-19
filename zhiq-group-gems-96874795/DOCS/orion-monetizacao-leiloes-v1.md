# ORION-MONETIZATION LEILÕES v1.0 — Modelo Oficial de Monetização

> **Data:** 2026-07-19 · **Status:** REGRA PERMANENTE DO PROJETO · **Migration:** `20260719_monetization_leiloes_desacoplar_pagamento.sql` (idempotente/reversível)
> **Substitui:** ARCHITECTURE FASE B (pagamento intermediado) e a implementação FASE B1 (`arremate_pay_wallet`) — ambos revertidos.

---

## Decisão oficial (permanente)

**A plataforma NÃO participa do pagamento do produto.** O pagamento é **direto entre comprador e vendedor**, por qualquer meio acordado (PIX, dinheiro, transferência, cartão, outros). A plataforma **apenas registra o ciclo do arremate** (vencedor, valor, estados, comunicação, auditoria, reputação, disputas, histórico).

**A receita da plataforma vem EXCLUSIVAMENTE dos Pacotes de Divulgação** (créditos do vendedor, consumidos via `orion_auction_charge` → `advertiser_credit_balances`). O percentual comercial (6%) é **precificação de pacote**, **não** comissão sobre o valor vendido.

## Fluxo oficial

```
Vendedor cria o anúncio
        ↓
Informa o valor do produto
        ↓
Sistema calcula o Pacote de Divulgação (regras comerciais / auction_financial_rules)
        ↓
Vendedor adquire o pacote (créditos consumidos — ÚNICA cobrança da plataforma)
        ↓
Leilão é publicado
        ↓
Comprador vence o leilão
        ↓
Pagamento DIRETO ao vendedor (PIX/dinheiro/… — FORA da plataforma)
        ↓
Confirmações entre as partes (registradas no arremate)
        ↓
Entrega
        ↓
Avaliações
        ↓
Arremate concluído
```

## Máquina de estados do arremate (modelo direto — sem dinheiro no PAY)

```
aguardando_contato → contato_liberado → pagamento_informado_comprador
  → pagamento_confirmado_vendedor → preparando_entrega → entregue → recebido → concluido
   (desvios: em_disputa em qualquer marco; cancelado)
```

Os estados `pagamento_informado_comprador` / `pagamento_confirmado_vendedor` são **REGISTROS** da confirmação bilateral do pagamento direto — **nenhum centavo passa pelo motor PAY**. Fonte única de estado = `orion_auction_settlements.arremate_status` (FASE A). Transições auditadas em `orion_auction_audit` + eventos `arremate.*` no bus.

## O que foi desacoplado (migration)

| Ação | Efeito |
|---|---|
| **DROP `arremate_pay_wallet`** | remove a ÚNICA função que movia dinheiro do PRODUTO (`customer_wallet → platform_escrow`). Não estava ligada a nenhuma tela — zero impacto de front. |
| **REVERTE `'auction'` do CHECK `pay_escrow_holds`** | o PAY volta a ficar dedicado só ao realmente intermediado (corridas/entregas/fretes/créditos). |
| **Preserva `orion_auction_charge`** | consumo de **créditos do vendedor** = pacote de divulgação = **receita da plataforma**. |

## Auditoria (provada ao vivo)

- **Nenhuma função** de leilão/arremate toca `customer_wallet`, `platform_escrow` ou `pay_post_transaction` → **0** (verificado).
- **0** ordens `pay_payment_orders` de leilão · **0** holds `pay_escrow_holds` de leilão.
- Receita = **créditos do vendedor** via `orion_auction_charge` (única cobrança da plataforma).
- Comissão do settlement (`comissao_pct`/`comissao_valor`) = **registro/precificação de pacote**, não move dinheiro (settlement não chama PAY).
- Pacotes de divulgação: **3 ativos** em `orion_auction_promo_packages`.

## Painel do Vendedor (spec de apresentação)

Exibir e **separar visualmente**:
- **Valor do produto** (valor do lance/arremate) — negociado entre as partes.
- **Pacote de Divulgação adquirido** + **créditos consumidos** — a cobrança da plataforma.
- Situação do anúncio · situação do leilão.
- Rótulo explícito: *"O pagamento do produto é combinado diretamente com o comprador. A plataforma cobra apenas o pacote de divulgação."*

## Painel Administrativo (spec de indicadores SEPARADOS)

**Receita da Plataforma** (dinheiro real): venda de pacotes · créditos vendidos · faturamento por pacote · mensal · anual. Fonte: consumo de créditos + `credit_purchases`/`promotion_purchases`.

**Mercado de Leilões** (estatístico, NÃO é receita): nº de leilões · **GMV = valor total negociado entre usuários** (`orion_auction_settlements.valor_final`) · nº de arremates · taxa de sucesso · tempo médio até conclusão.

> **GMV é indicador estatístico e NÃO compõe a receita da plataforma.** Qualquer painel/IA (AI-69 Growth, AI-67 Intelligence, BI) deve rotular GMV como volume de mercado, e "receita" apenas como pacotes/créditos.

## Segurança

- **Nenhuma movimentação financeira do produto** é registrada no motor PAY (provado: 0 funções, 0 ordens, 0 holds).
- PAY permanece dedicado às operações realmente intermediadas (corridas/entregas/fretes/recargas).
- Toda receita da plataforma (pacotes/créditos) continua auditável em `advertiser_credit_*` / `credit_purchases` / `pay_ledger_entries` (recargas).

## Compatibilidade

Marketplace ✅ · Leilões ✅ (fluxo direto) · Pacotes de Divulgação ✅ (receita) · Financeiro/PAY ✅ (intocado, sem produto) · Dashboard Admin ✅ (indicadores separados) · Créditos ✅ · Reputação ✅ (AI-74 lê `pagamento_ok`/estados) · ALC ✅.

---

## Critério Final

- **O modelo oficial de monetização foi consolidado?** 🟢 **SIM.**
- **Existe alguma funcionalidade que ainda trate o leilão como pagamento intermediado?** **NÃO** — `arremate_pay_wallet` (a única) foi removida; `'auction'` saiu do escrow; nenhuma função toca `customer_wallet`/`platform_escrow`/`pay_post_transaction`; 0 ordens/holds de leilão. (A ARCHITECTURE FASE B e a FASE B1 ficam **oficialmente revertidas/arquivadas**.)
- **Pacotes de Divulgação = única fonte de receita dos Leilões?** ✅ **SIM** (`orion_auction_charge` → créditos do vendedor).
- **Sistema de Arremates totalmente desacoplado do pagamento do produto?** ✅ **SIM** (controla só vencedor/valor/estados/comunicação/auditoria/reputação/disputas/histórico).

---

# 🟢 ORION-MONETIZATION LEILÕES v1.0 APROVADA

**Resultado:** o módulo de Leilões passa a operar com **pagamento direto entre comprador e vendedor**, enquanto a plataforma monetiza **exclusivamente pela venda dos Pacotes de Divulgação**, mantendo o controle do processo, a auditoria, a reputação e os indicadores de mercado (GMV estatístico), **sem intermediar financeiramente a venda do produto**.
