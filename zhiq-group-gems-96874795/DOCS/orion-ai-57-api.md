# ORION-AI-57 — API (RPCs)

RPCs PostgREST: `POST .../rest/v1/rpc/<funcao>` (apikey + JWT). Guarda: admin/service
— anon negado (`kg_build`→P0001; tabelas→42501, sem SELECT p/ anon).

## Knowledge API (consultas — o coração do módulo)

| RPC | Descrição |
|---|---|
| `knowledge_context(p_node)` | ego-network de um nó: relações (saída/entrada) + similares (o "Context Engine" que as IAs usam) |
| `knowledge_timeline(p_node)` | linha do tempo das relações de um nó (temporal) |
| `find_related_users(p_node)` | pessoas ligadas a um nó |
| `find_common_connections(p_a,p_b)` | conexões em comum entre duas entidades |
| `find_shortest_path(p_a,p_b)` | caminho mais curto (BFS ≤6 saltos) com o caminho completo |
| `find_influencers(p_limite)` | nós de maior grau/score (centros de conexão) |
| `find_clusters()` | comunidades detectadas (label propagation) |
| `semantic_search(p_termo)` | busca lexical sobre labels/tipo/cidade (+ cache 1h) |

## Painel / motor

| RPC | Descrição |
|---|---|
| `kg_dashboard()` | payload do painel (overview + graph + clusters + influencers + série + lacunas); constrói se snapshot >30min |
| `kg_overview()` | nós/arestas por tipo/relação + GHS/Knowledge Score + densidade/grau/cobertura + influenciadores |
| `kg_graph_view(p_limite)` | nós (≤120 por grau) + arestas (≤300 por peso) para visualização |
| `kg_summary()` | overview + graph + clusters + influencers + estatísticas 7d + lacunas |
| `kg_build(p_trace?)` | ingestão incremental (nós+arestas reais) + pós-processamento + rollup |
| `kg_selftest()` | suíte de 8 testes (COMANDO TESTE) |
| `orion_kg_tick()` | cron `*/15` |

## Exemplo — `find_shortest_path`

```json
POST /rest/v1/rpc/find_shortest_path  {"p_a":"pessoa:<uuidA>","p_b":"pessoa:<uuidB>"}
→ {"origem":"pessoa:<uuidA>","destino":"pessoa:<uuidB>","saltos":1,
   "caminho":["pessoa:<uuidA>","pessoa:<uuidB>"]}
```

## Exemplo — `knowledge_context`

```json
POST /rest/v1/rpc/knowledge_context  {"p_node":"pessoa:<uuid>"}
→ {"node":{"id":"pessoa:<uuid>","tipo":"pessoa","label":"...","grau":21,"score":100,"cluster":"...","cidade":"aripuana"},
   "relacoes":[{"relacao":"LOCALIZA_SE","para":"cidade:aripuana","label":"Aripuana","peso":1}, ...],
   "relacoes_entrada":[...], "similares":[{"node":"pessoa:...","score":75}]}
```

Ingestão para node_id: `<tipo>:<ref_id>` (ex.: `pessoa:<uuid>`, `produto:<id>`,
`anunciante:<id>`, `leilao:<id>`, `cidade:<slug>`).
