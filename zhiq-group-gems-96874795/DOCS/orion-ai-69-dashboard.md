# ORION-AI-69 — Painel (Auction Growth & Expansion)

**Rota:** `/admin/orion-auction-growth` · **badge:** GROWTH · **ícone:** `TrendingUp` · **componente:** `src/pages/admin/AdminOrionAuctionGrowth.tsx`.

Fonte única: `auction_growth_dashboard()` (RPC, `refetchInterval` 60s). Nada é recalculado no cliente. Tema verde (crescimento).

## Cabeçalho
- **Growth Score** (verde ≥70 / âmbar ≥40 / vermelho) + selo pré-lançamento/operacional.
- Faixa de estágio declarada (quando pré-lançamento).
- KPIs de topo: GMV, receita, vendedores, compradores, leilões, ticket médio.
- Linha de 5 scores da certificação: Growth · Expansion · Prediction · Analytics · Performance.

## Abas

### 1. Dashboard
- **Composição do Growth Score** (5 parcelas de 0-20).
- Cartões: liquidez, conversão, leilões liquidados, watchers.
- **Série histórica** (snapshots diários): leilões, lances, GMV, receita, growth.

### 2. KPIs & Retenção
- GMV, receita, ticket, LTV estimado, liquidez, conversão.
- **CAC indisponível** (nota honesta: sem custo de marketing no domínio).
- Retenção: usuários com lance, recorrentes, taxa de retorno.
- Receita por UF.

### 3. Expansão
- Penetração municipal/estadual + universo IBGE (5.571).
- Participação por estado (oferta real).
- **Oportunidades de expansão**: ranking de municípios sem oferta por população (São Paulo, Rio, Brasília…).

### 4. Oportunidades
- Lista de oportunidades detectadas com tipo, título, potencial (0-100) e confiança.

### 5. Previsões
- Previsões `regr_slope` por métrica com valor, confiança, n_amostras e **base estatística declarada**. Sem histórico → declara e não emite.

## Notas
- Responsivo (grids colapsam; tabelas com `overflow-x-auto`).
- READ-ONLY: o painel só apresenta; nenhuma ação altera o domínio.
