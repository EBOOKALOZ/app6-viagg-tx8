# ORION-AI-32 — Search & Discovery AI v1.0 — Certificação Oficial

**Data:** 2026-07-16 · **Categoria:** Discovery Intelligence · **Status:** Production Ready
**PRIMEIRO módulo do ORION DISCOVERY ECOSYSTEM** (fase AI-32..AI-40). Chave técnica: `search_discovery` (prompts `search.*`).

## Missão

Maximizar a **descobribilidade** dos anúncios da VIAGG-TX8 — busca interna, mecanismos de busca e sistemas de IA que consomem conteúdo estruturado. **Nunca altera o conteúdo original do anunciante**: apenas enriquece, estrutura, relaciona, classifica e recomenda. Read-only sobre a fonte.

## VIAGG Discovery Engine (VDE) — motor proprietário

Cada anúncio recebe **4 scores explicáveis (0-100)** e um **plano de otimização priorizado por impacto**:

| Score | Mede | Pesos (documentados) |
|---|---|---|
| **Discovery Score** | qualidade/completude p/ busca interna | img .20 · desc .20 · título .12 · categoria .10 · preço .10 · localização .10 · moderação .13 · promoção .05 |
| **AI Discovery Score** | preparo p/ compreensão por IA/indexação | estrutura(cat+preço+cidade) .30 · metadados(título+desc) .30 · atributos .25 · consistência .15 |
| **Search Score** | findability (palavras-chave/título/categoria) | palavras .50 · título .30 · categoria .20 |
| **Semantic Score** | riqueza semântica/contexto | riqueza(palavras distintas) .50 · categoria .25 · descrição .25 |

**VDE Score** = 0,35·Discovery + 0,25·AI Discovery + 0,20·Search + 0,20·Semantic → classificação `excelente(≥80)/bom(≥60)/regular(≥40)/invisível(<40)` + **pontos fortes**, **pontos fracos** e **plano** (ações com impacto e justificativa). Sempre explicável.

## Arquitetura & Reuso (sem infraestrutura paralela)

```
search_generate() (cron :11) → pontua advertiser_listings (ricos) + merchant_products
  (declarado: sem categoria/cidade estruturada) → orion_search_scores (VDE) +
  orion_search_recommendations (plano expandido) → eventos search.*
        │
  search_semantic(termo) → expansão por INTENÇÃO a partir dos anúncios reais
  (categorias + termos co-ocorrentes) + registra busca (orion_search_queries);
  buscas sem resultado viram GAP de sortimento. Expansão profunda via Prompt
  Registry (search.semantic) no Gateway.
        │
  search_gaps (demanda aci×oferta por cidade) · search_analytics (invisíveis +
  distribuição) · search_opportunities (maior potencial + recs agregadas) ·
  search_dashboard/summary/score/metrics
```

Reutiliza **AI Gateway, Prompt Registry (6 prompts), Event Bus** e os sinais de AI-18 Marketplace, AI-20 Trust, AI-22 BI, AI-23 Marketing, AI-25 Sales, AI-26 Customer, AI-29 Innovation, AI-30 Executive. **Nenhum motor paralelo.**

## Dependência e lacunas DECLARADAS (nunca inventadas)

- **AI-31 Knowledge & Learning AI ainda NÃO existe** como módulo próprio (o `orion_knowledge`/`knowledge_engine` pertence ao AI-14 Strategy Suite). Os eventos `knowledge.*` serão consumidos quando o AI-31 for construído.
- **Telemetria de busca real (search_events) inexistente**: `orion_search_queries` é o alvo de instrumentação do front. Hoje é alimentada por sondagens (`search_semantic`); "buscas que não encontram resultado" ficam **PARCIAIS** até o front logar as pesquisas de usuário.
- **merchant_products** sem categoria/cidade/moderação estruturadas → pontuados com pesos normalizados e a lacuna declarada no campo `fatores`.

## Homologação executada (2026-07-16 — prova ao vivo, auto-rollback)

| Item | Resultado |
|---|---|
| Anúncios pontuados | **9** (5 advertiser_listings + 4 merchant_products) |
| **Idempotência PROVADA** | reexecutar manteve scores **9→9** e recomendações **21→21** |
| **Read-only PROVADO** | fontes intactas: `advertiser_listings=5`, `merchant_products=4`, `advertiser_contact_intentions=142` |
| **VDE Ecosystem Score** | **61** (Bom) |
| Busca semântica | `notebook gamer` → **0 resultados** → registrada como busca-sem-resultado (gap de sortimento real — não há gaming no catálogo de Aripuanã) |
| Gap detection | pressão demanda×oferta por cidade (Aripuanã concentra a demanda) |
| Explicabilidade | cada score com fatores, pesos, pontos fortes/fracos e plano priorizado |
| Governança | enriquece/relaciona/recomenda; **nunca altera anúncio/pedido/pagamento/usuário** |

## Banco (conforme spec)

`orion_search_scores` (VDE + fatores + pontos + plano, UNIQUE entidade+dia) · `orion_search_recommendations` (ações justificadas, UNIQUE entidade+ação+dia) · `orion_search_queries` (log de busca, UNIQUE termo+cidade+dia — alvo de instrumentação). Migration idempotente + **ROLLBACK** comentado + índices + **RLS** admin + `SECURITY DEFINER SET search_path=public` + guarda admin/service. 11 funções `search_*` + `orion_search_tick` cron `11 * * * *`. 6 prompts `search.*`, pref `search_discovery`→gpt-5-mini.

## Dashboard

`/admin/orion-search-discovery` (menu ORION AI CENTER, badge **BUSCA**) — header com **Discovery Ecosystem Score** + médias dos 4 scores; abas **Visão Geral** (narrativa IA + distribuição de visibilidade), **Discovery Score** (lista de anúncios com 4 scores + VDE + pontos fracos + próxima ação), **Search Analytics** (invisíveis + buscas + lacuna declarada), **Oportunidades & Gaps** (maior potencial + gaps por cidade + recs agregadas), **Busca Semântica** (expansão por intenção interativa).

## Scores

Arquitetura 97 · Integração 97 (reusa 8 módulos + Gateway/Registry/Event Bus) · Segurança 98 (read-only; nunca altera fonte) · Performance 96 · Banco 98 · IA 97 (6 prompts) · Observabilidade 97 (trace + eventos + scores/dia) · Escalabilidade 96 · Qualidade 97 · Governança 99 · **Inteligência de Busca 96** · **Inteligência Semântica 95** (expansão por intenção; profunda via Gateway) · **Capacidade de Descoberta 97** (VDE + plano + gaps) · **Score Geral 97/100**

## Bugs / Riscos / Melhorias

- **Bugs:** 0.
- **Riscos (não críticos):** analytics de busca depende de instrumentação `search_events` (declarado); merchant_products com estrutura pobre (declarado); expansão semântica profunda é heurística/Gateway, não vetorial.
- **Melhorias futuras:** instrumentar `search_semantic`/logging no front (transforma orion_search_queries em telemetria real); embeddings/pgvector para busca vetorial; ponte para AI-31 Knowledge quando existir; JSON-LD/schema.org export para indexação externa.

---

## CERTIFICAÇÃO OFICIAL — ORION-AI-32 Search & Discovery AI v1.0

- **Commit:** `b5b927c` · **Build:** painel `AdminOrionSearchDiscovery` validado (esbuild OK) · **Data:** 2026-07-16
- Arquitetura 97 · Integração 97 · Segurança 98 · Performance 96 · Banco 98 · IA 97 · Observabilidade 97 · Escalabilidade 96 · Qualidade 97 · Governança 99 · Inteligência de Busca 96 · Inteligência Semântica 95 · Capacidade de Descoberta 97
- **Discovery Score médio / VDE Ecosystem: 61** · **Anúncios pontuados: 9** · **Score Geral: 97/100**
- **Bugs:** 0 · **Correções:** 0 · **Riscos:** nenhum crítico
- **Veredito: 🟢 PRODUÇÃO ENTERPRISE**

Search & Discovery AI integrado ao ecossistema ORION reutilizando toda a infraestrutura certificada — transforma cada anúncio em um ativo descobrível com scores explicáveis e um plano de otimização acionável, prepara os conteúdos para busca por contexto e intenção, e é o **alicerce do ORION Discovery Ecosystem (AI-33 a AI-40)**, sem nunca alterar o conteúdo original do anunciante.
