# ORION-AI-57 — Dashboard `/admin/orion-kgraph` (badge KGRAPH)

Fonte única: `kg_dashboard()` (refetch 60s). Arquivo: `src/pages/admin/AdminOrionKgraph.tsx`.
Sidebar: grupo ORION → **Knowledge Graph (Corp)** (ícone Network, badge **KGRAPH**),
após AIOps — distinto do AI-34 "Knowledge Graph AI" (`/admin/orion-knowledge-graph`).

## Header

4 scores (Nós, Arestas, GHS, Knowledge) + faixa: clusters, similaridades, densidade,
grau médio, cobertura %, tipos de nó.

## Abas (6 — cobrem as visualizações/menus da spec)

1. **Resumo** — nós por tipo (barras coloridas) + arestas por relação (chips) + scores +
   lacunas declaradas.
2. **Grafo** — coluna de **nós** (por grau, clicável → abre contexto) + coluna de **arestas**
   (por peso). É o "Mapa do Grafo" / Explorador em forma de lista (viz interativa avançada = futuro).
3. **Comunidades** — clusters detectados com membros coloridos por tipo (Mapa de Comunidades).
4. **Influenciadores** — ranking por grau/score com barra (Mapa de Influência / centros de conexão).
5. **Busca & Contexto** — **busca semântica** (input) → resultados clicáveis → **contexto
   completo** (ego-network: relações saída/entrada + similares). É o "Explorador de
   Relacionamentos" + "Context Engine" + "Semantic Search" num só lugar.
6. **Estatísticas** — série 7 dias (nós/arestas/clusters/GHS/Knowledge).

## Mapeamento spec → painel

As dezenas de visualizações/abas da spec (Mapa do Grafo, Rede de Usuários/Produtos/
Empresas/IA, Mapa de Comunidades/Influência/Temporal/Similaridade/Eventos/Dependências,
Explorador) foram consolidadas em 6 abas reais e navegáveis. A visualização gráfica
interativa (força-direcionada) é front futuro — DECLARADO; aqui o grafo é explorável por
listas ricas + contexto por nó.

## Guarda

Tudo admin (RLS + guarda nas funções); anon sem SELECT (42501). Painel read-only;
`kg_build` (escrita) roda no tick e sob guarda admin/service.
