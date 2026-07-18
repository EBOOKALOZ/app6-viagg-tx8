# ORION-AI-57 — Knowledge Graph AI v1.0 (Grafo Corporativo)

> **Grafo de conhecimento CORPORATIVO**: conecta as entidades reais de NEGÓCIO
> numa rede de relacionamentos. Chave: **`kgraph`**. Painel: **`/admin/orion-kgraph`**
> (badge KGRAPH). Tick: **pg_cron `*/15`**.

## Não confundir com AI-34

- **AI-34 Knowledge Graph** (`knowledge_graph`, `orion_knowledge_entities/relations`,
  `/admin/orion-knowledge-graph`) = grafo **semântico/de conceitos** (Discovery).
- **AI-57 Knowledge Graph Corporativo** (`kgraph`, `orion_kg_*`, `/admin/orion-kgraph`)
  = grafo de **entidades operacionais** (pessoas/produtos/anunciantes/leilões/cidades/
  pagamentos) derivado só de fatos do banco. **Não toca `orion_knowledge*`.**

## Missão

Conectar todas as entidades da plataforma numa rede inteligente para que as IAs ORION
compreendam o contexto completo (consultas semânticas, caminhos, comunidades,
similaridade, recomendação explicável). **Nenhum relacionamento é inventado** — toda
aresta vem de um fato real.

## Fontes REAIS (sondadas 07-17; pré-lançamento → grafo pequeno mas real, DECLARADO)

profiles(9), merchant_credit_products(6), advertiser_accounts(8), auction_listings(2)/
auction_bids(0), service_orders(80), pay_payment_orders(149),
advertiser_contact_intentions(142), marketplace_product_click_events(240).

## Nós e arestas (homologação real)

**50 nós**: produto(20), pessoa(17), anunciante(8), cidade(3), leilão(2).
**53 arestas**: VISUALIZOU(28), POSSUI(8), MESMO_DOCUMENTO(6), LOCALIZA_SE(4),
INTERAGIU(3), PUBLICOU(2), PAGOU(2). Outras relações prontas: COMPROU_DE, ATENDIDO_POR,
LANCEOU (auction_bids vazia hoje).

## Tabelas (10, namespace `orion_kg_*`)

`orion_kg_nodes` · `orion_kg_edges` · `orion_kg_properties` · `orion_kg_events`
(temporal/auto-learning) · `orion_kg_clusters` · `orion_kg_similarity` ·
`orion_kg_statistics` · `orion_kg_paths` (cache) · `orion_kg_context_cache` ·
`orion_kg_search_cache`. RLS admin + REVOKE ALL/GRANT SELECT.

## Motor `kg_build()` (incremental, idempotente, tick `*/15`)

1. Ingere NÓS das tabelas reais (pessoa/produto/anunciante/leilão/cidade).
2. Ingere ARESTAS dos fatos reais (LOCALIZA_SE, POSSUI, VISUALIZOU, PAGOU, PUBLICOU,
   ATENDIDO_POR, COMPROU_DE, INTERAGIU) + **fraud graph estrutural** (MESMO_DOCUMENTO:
   pessoas com mesmo CPF — scoring de fraude é do AI-41, aqui só a aresta).
3. Pós-processa: **grau** (degree centrality), **score** (grau normalizado),
   **clusters** (label propagation, 5 iterações), **similaridade** (vizinhos comuns).
4. Rollup de estatísticas + eventos temporais. Nunca reconstrução total (upsert).

## Knowledge API (RPCs)

`knowledge_context(node)` (ego-network + similares), `knowledge_timeline(node)`,
`find_related_users(node)`, `find_common_connections(a,b)`,
**`find_shortest_path(a,b)`** (BFS via recursive CTE, ≤6 saltos),
`find_influencers(n)`, `find_clusters()`, **`semantic_search(termo)`** (lexical sobre
labels/props + cache 1h). Todas explicáveis (retornam nós/relações/pesos/evidência).

## Scores

- **GHS** Graph Health Score = 50%·cobertura + 30%·grau médio + 20%·clusters.
- **Knowledge Score** = 40%·nós + 40%·arestas + 20%·cobertura.
- Densidade, grau médio, cobertura (% de nós conectados).

## Camadas da spec → entrega

Modelagem (nós/arestas) ✓ · Relacionamentos inteligentes (similaridade) ✓ · Knowledge
Discovery (clusters/influenciadores) ✓ · Semantic Search ✓ · Context Engine
(`knowledge_context`) ✓ · Recommendation Graph (similaridade/vizinhos comuns — consumível
pelas IAs) ✓ · Fraud Graph (aresta estrutural) ✓ · Temporal (primeiro/último_em +
`orion_kg_events`) ✓ · Timeline (`knowledge_timeline`) ✓ · Explainable ✓ · Auto Learning
(incremental) ✓ · Knowledge API ✓. **DECLARADO (futuro)**: embeddings semânticos,
viz interativa avançada, processamento distribuído/escala de milhões.

## IA (via AI-00 Gateway, `gpt-5-mini`)

`kgraph.context`, `kgraph.path`, `kgraph.community`, `kgraph.recommend`, `kgraph.summary`.

## Suíte de testes (COMANDO TESTE)

`kg_selftest()` — 8 casos (nós/arestas existem, integridade referencial, shortest_path,
semantic_search, GHS válido, RLS, knowledge_context). Homologação: **8/8 aprovado**.

## Segurança

RLS admin; guarda admin/service nas funções; anon negado (P0001 + 42501). Não expõe PII
além de labels já visíveis ao admin; fraude só estrutural.

## Arquivos

- Migration: `supabase/migrations/20260717_orion_knowledge_graph_ai57.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionKgraph.tsx` (+ rota/lazy/sidebar badge KGRAPH)
- API: `DOCS/orion-ai-57-api.md` · Dashboard: `DOCS/orion-ai-57-dashboard.md` · Certificação: `DOCS/orion-ai-57-certificacao.md`
