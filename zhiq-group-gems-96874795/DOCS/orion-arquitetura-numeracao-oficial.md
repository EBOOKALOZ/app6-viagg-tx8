# ORION AI — Arquitetura & Numeração Oficial (fonte única de verdade)

**Consolidação:** 2026-07-14 · **Status: 🟢 APROVADO** · **Score de consistência: 100/100**

> Este documento é a **única fonte de verdade** da numeração ORION. Fonte oficial = **produção** (Prompt Registry, Gateway `orion_ai_module_prefs`, tabelas e funções SQL), que indexam cada módulo por **NOME** — os números são rótulos de documentação. Documentação antiga NÃO é referência. Cada número → um módulo; cada módulo → um número.

## Mapa oficial dos módulos

| Nº | Nome oficial | Chave (Gateway/Registry) | Versão | Status | Score | Certificação | Depende de |
|----|--------------|--------------------------|--------|--------|-------|--------------|------------|
| AI-00 | AI Gateway | `orion-ai-gateway` | v3 | 🟢 Enterprise | 100 | 07-14 | — |
| AI-01 | Publisher AI | `publisher` | v1 | 🟢 Enterprise | 98 | 07-14 | Gateway |
| AI-02 | RIDV AI (Moderação) | `ridv` | v2 | 🟢 Enterprise | 99 | 07-14 | Gateway, Publisher |
| AI-03 | Package AI | `package` | v2 | 🟢 Enterprise | 100 | 07-14 | Gateway, RIDV, Motor |
| AI-04 | Finance AI | `finance` | v1 | 🟢 Enterprise | 97 | 07-14 | pay_* (read-only) |
| AI-05 | Campaign AI | `campaign` | v1 | 🟢 Enterprise | 99 | 07-14 | Package, Motor |
| AI-06 | Dispatcher AI | `dispatcher` | v1 | 🟢 Enterprise | 100 | 07-14 | Motor, Campaign |
| AI-07 | Growth AI | `growth` | v1 | 🟢 Enterprise | 100 | 07-14 | todos (leitura) |
| **AI-08** | **Execution Orchestrator** | `execution` | v1 | 🟢 Enterprise | 99 | 07-14 | RPCs oficiais, AI-09 |
| **AI-09** | **Conversion & Attribution** | `conversion` | v2 | 🟢 Enterprise | 96 | 07-14 | Finance, Dispatcher |
| AI-10 | Health & Observability Center | `health` | v2 | 🟢 Enterprise | 98 | 07-14 | core_health, Performance |
| AI-11 | Performance AI | `performance` | v1 | 🟢 Enterprise | 99 | 07-14 | pg_stat, core_health |
| AI-12 | Command Center | `executive` | v1 | 🟢 Enterprise | 98 | 07-14 | health/core/perf/finance |
| AI-13 | Operations AI (COO) | `operations` | v1 | 🟢 Enterprise | 98 | 07-14 | Finance, Growth, Health |
| AI-14 | Strategic Intelligence Suite | `strategy` | v1 | 🟢 Enterprise | 95 | 07-14 | Conversion, Performance |
| **AI-15** | **Pricing AI** | `pricing` | v1.1 | 🟢 Enterprise | 98 | 07-14 | Finance, Conversion, Forecast |
| AI-16 | Demand Forecast AI | `forecast` | v1 | 🟢 Enterprise | 90 | 07-14 | pay_* (leitura), Growth |
| **AI-17** | **Support AI** | `support` | v1 | 🟢 Enterprise | 97 | 07-14 | support_tickets (leitura), Gateway |
| **AI-18** | **Marketplace Intelligence AI** | `marketplace` | v1 | 🟢 Enterprise | 97 | 07-15 | Growth, Conversion (leitura); sinais do marketplace |
| **AI-19** | **Personalization AI** | `personalization` | v1 | 🟢 Enterprise | 97 | 07-15 | Marketplace AI-18, Growth (leitura); sinais por usuário |
| **AI-20** | **Trust & Reputation AI** | `trust` | v1 | 🟢 Enterprise | 97 | 07-15 | Finance, Conversion, Publisher, RIDV (leitura) |
| — | Motor de Publicação | `motor_publish_*` | v1 | 🟢 Enterprise | 100 | 07-14 | — (porta única) |
| — | ORION CORE Consolidation | — | v1 | 🟢 Certificado | 99 | 07-14 | todos |

## Divergência histórica resolvida

- **Sintoma:** o arquivo `DOCS/orion-ai-09-pricing-certificacao.md` usava o prefixo `ai-09` para o Pricing, colidindo com o Conversion (AI-09 real).
- **Fonte oficial (produção):** `orion_ai_module_prefs` e o Prompt Registry contêm as chaves `pricing` **e** `conversion` como módulos **distintos** — não há colisão funcional; o problema era só de rótulo em 1 documento.
- **Correção aplicada (só documentação):** `orion-ai-09-pricing-certificacao.md` → renomeado para **`orion-ai-15-pricing-v11-certificacao.md`**; cabeçalho atualizado. **Nenhum módulo de produção renumerado; nenhuma migration/RPC/Gateway/Event Bus alterado.**
- **Resultado:** AI-09 = Conversion & Attribution (único doc `orion-ai-09-conversion-attribution-certificacao.md`); AI-15 = Pricing (docs `orion-ai-15-pricing-certificacao.md` v1.0 + `orion-ai-15-pricing-v11-certificacao.md` v1.1).

## Regra de nomenclatura (congelada)

Módulos novos recebem o **próximo número livre** (agora a partir de **AI-21**; AI-20 = Trust & Reputation AI) e uma **chave única de módulo** no Gateway/Registry. O número é rótulo humano; a chave é a identidade técnica. Documentos de certificação seguem `DOCS/orion-ai-NN-<slug>-certificacao.md` onde NN e slug batem com a chave. Roadmap 2.x: AI-17+ (benchmark competitivo de preços, feriados no Forecast, migração das 6 edges legadas ao Gateway).

---

## CERTIFICAÇÃO — ORION AI ARCHITECTURE CONSOLIDATION

- ✅ Arquitetura consolidada · ✅ Numeração padronizada · ✅ Documentação sincronizada
- ✅ Duplicidades eliminadas (1 doc renomeado) · ✅ Compatibilidade preservada (0 alteração de lógica/banco/API/Gateway/Event Bus)
- **Status: 🟢 APROVADO** · **Score: 100/100** · **Arquitetura: Consistente**
- **Data:** 2026-07-14 · **Commit:** (push desta consolidação) · **Build:** verde (não houve mudança de código executável)
