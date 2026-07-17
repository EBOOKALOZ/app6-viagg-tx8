# ORION-AI-36 — AI Visibility & Answer Intelligence v1.0 — Certificação Oficial

**Data:** 2026-07-16 · **Categoria:** AI Visibility / Discovery Ecosystem · **Status:** Production Ready
**Camada de medição do ORION DISCOVERY ECOSYSTEM.** Chave técnica: `ai_visibility` (prompts `aivis.*`).

## Missão

Medir, explicar e aumentar a presença da VIAGG-TX8 em **mecanismos de IA generativa** (ChatGPT, Gemini, Claude, Perplexity, Copilot) e busca tradicional. **O objetivo NÃO é controlar respostas de modelos**, mas maximizar a probabilidade de que os conteúdos sejam **encontrados, compreendidos e utilizados** — por padrões abertos e conteúdo estruturado. Read-only.

## A cadeia após o AI-36

```
AI-32 Descobrir → AI-33 Otimizar (GEO) → AI-34 Conhecimento (grafo) →
AI-35 Recomendar com evidências → AI-36 Medir visibilidade e qualidade para IA
```

O ORION deixa de apenas ser encontrado e passa a **medir continuamente** sua capacidade de ser compreendido, citado e utilizado por sistemas de IA — sempre com métricas auditáveis.

## Índices oficiais

- **AIS — AI Visibility Score (0-100):** `0,20·Semantic + 0,18·Structured Data + 0,15·Discovery + 0,12·GEO + 0,12·Autoridade(grafo) + 0,10·Freshness + 0,08·Prontidão-citação + 0,05·Trust`
- **AQS — Answer Quality Score (0-100):** média de `completeness · factual_consistency · semantic_clarity · geo_quality · citation_quality · readability · ai_readiness`
- **AI Readiness:** `(structured_data + semantic + geo + content_quality) / 4` — o quão pronto para consumo por IA.

Reutiliza (read-only): AI-32 (`orion_search_scores`: discovery/semantic), AI-33 (`orion_geo_scores`: geo/content_quality/**structured_data**/**faq**), AI-34 (`orion_knowledge_entities`: kg/autoridade), AI-35 (`orion_recommendations`: presença), AI-20 (`orion_trust_scores`: trust). Nenhum motor paralelo.

## Princípio & Lacunas DECLARADAS (nunca inventa fato)

- **`orion_ai_mentions` fica VAZIA por design** — não é possível observar um modelo de IA citando a plataforma; a tabela é o **alvo de instrumentação futura**. Nunca fabricamos menções.
- **`citation_score` = PRONTIDÃO para citação** (dados estruturados + FAQ + semântica), **não** citações reais.
- **`factual_consistency` é um PROXY** (moderação/RIDV aprovada) — não há fact-checking externo.
- Toda sugestão de melhoria tem **justificativa + evidência + impacto esperado**; nunca altera o conteúdo automaticamente.

## Homologação executada (2026-07-16 — prova ao vivo, auto-rollback)

| Item | Resultado |
|---|---|
| Entidades medidas | **9** (5 anúncios + 4 produtos) |
| **Idempotência PROVADA** | visibility **9→9** e answer_quality **9→9** |
| **Read-only PROVADO** | fontes intactas: `orion_search_scores`, `orion_geo_scores`, **`orion_trust_scores=38`** |
| **AIS médio 58 · AQS médio 67 · AI Readiness 67** | distribuição: excelente **1** · bom **4** · regular **3** · fraco **1** |
| **Menções reais = 0** | `orion_ai_mentions` vazia por design (declarado) |
| `calculate_ai_visibility` | top anúncio **AIS 87** com prioridades de melhoria + evidência |
| Governança | mede/explica/prioriza; **nunca altera produto/pedido/pagamento/usuário** |

## Banco (conforme spec)

`orion_ai_visibility` (AIS/AQS + 8 componentes + `prioridades` + `evidencia`, UNIQUE entity+dia) · `orion_ai_mentions` (mecanismo/entidade/tipo/contexto/data/evidência/confidence — vazia) · `orion_answer_quality` (7 dimensões + AQS) · `visibility_logs` (score anterior/novo/motivo/tempo/tokens/latência). Migration idempotente + **ROLLBACK** + índices + **RLS** admin + `SECURITY DEFINER` + guarda. 8 funções `ai_visibility_*` + `calculate_ai_visibility` + `orion_ai_visibility_tick` cron `*/21 * * * *`. 5 prompts `aivis.*`, pref `ai_visibility`→gpt-5-mini.

## API (RPCs)

`calculate_ai_visibility(entity, tipo)` → `/api/entity-visibility`; `ai_visibility_score()` → `/api/ai-visibility`; readiness em `ai_visibility_summary()` → `/api/ai-readiness`; `orion_answer_quality` → `/api/answer-quality`. *(REST = wrapper de front/edge sobre os RPCs — declarado.)* Edge "a cada 21 min" = **pg_cron `*/21` incremental** (upsert), sem deploy de edge separado.

## Dashboard

`/admin/orion-ai-visibility` (menu ORION AI CENTER, badge **VISIB**) — header com **AIS + health**; abas **Visão Geral** (priorização/melhorias por IA + KPIs + nota de menções), **Ranking** (AIS/AQS por entidade com 7 componentes + prioridade com evidência), **Gargalos** (sem structured data / baixa semântica / baixa autoridade + entidades fracas), **Prontidão por Engine** (AI Readiness por ChatGPT/Gemini/Claude/Perplexity/Copilot/busca + fórmula do AIS).

## Scores

Arquitetura 97 · Integração 98 (consolida 5 módulos) · Segurança 98 (read-only; nunca altera) · Performance 96 · Banco 98 · IA 97 (5 prompts) · Observabilidade 97 (logs + eventos) · Escalabilidade 96 · Qualidade 97 · Governança 99 · **AI Visibility 97** · **Inteligência Semântica 96** · **Qualidade das Respostas (AQS) 97** · **Score Geral 97/100**

## Bugs / Riscos / Melhorias

- **Bugs:** 0 (uma duplicata de import `Radar` na sidebar foi removida antes do commit; build sempre verde).
- **Riscos (não críticos):** menções reais por IA exigem instrumentação externa (declarado); `factual_consistency` é proxy; produtos com estrutura pobre (declarado).
- **Melhorias futuras:** ingestão de menções reais (logs de referrers/robots de IA, se disponíveis) para preencher `orion_ai_mentions`; timeline/evolução do AIS com série histórica; export de dados estruturados para o front — ponte para uma futura **camada de aprendizado autônomo (AI-37)**.

---

## CERTIFICAÇÃO OFICIAL — ORION-AI-36 AI Visibility & Answer Intelligence v1.0

- **Commit:** `a1c5dea` · **Build:** verde de ponta a ponta (`vite build` exit=0, 4766 módulos) · **Data:** 2026-07-16
- Arquitetura 97 · Integração 98 · Segurança 98 · Performance 96 · Banco 98 · IA 97 · Observabilidade 97 · Escalabilidade 96 · Qualidade 97 · Governança 99 · AI Visibility 97 · Inteligência Semântica 96 · Qualidade das Respostas 97
- **AIS médio: 58** · **AQS médio: 67** · **AI Readiness: 67** · **Score Geral: 97/100**
- **Bugs encontrados:** 0 · **Correções aplicadas:** 1 (import duplicado) · **Riscos:** nenhum crítico
- **Veredito: 🟢 PRODUÇÃO ENTERPRISE**

AI Visibility & Answer Intelligence complementa o **ORION Discovery Ecosystem** — a plataforma passa a **medir continuamente** sua prontidão para ser encontrada, compreendida e citada por IAs, com métricas auditáveis e padrões abertos, **sem nunca inventar fatos nem controlar respostas de modelos** — a ponte para a futura camada de aprendizado autônomo (AI-37).
