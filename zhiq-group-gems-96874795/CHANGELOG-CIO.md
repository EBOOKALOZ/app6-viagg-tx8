# Changelog — Programa CIO (M50 → M59) · Ponto de pré-produção

**Tag:** `pre-gate-1` · **Data:** 2026-07-05 · **Verificação no ponto do commit:** SQL 13 baterias/147 cenários 100% (stack limpo 050→064) · frontend self-test 197/197 · tsc 0 erros · vite build limpo

## Banco (fila de deploy — 14 migrations, NUNCA `db push`, sempre SQL Editor)
- `20260703_050/051` — M50 limites diários + M51 boost (reserve-atômico; correções C1-C5/H1-H6)
- `20260702_001..003` — patch tier1 (aplicar DEPOIS de 050/051 em ambiente novo)
- `20260704_053/054` — M53.2/.2A Motor: porta única `motor_publish_request`, funil off/observe/shadow/canary/active, `pub_events` imutável, canary, telemetria, dashboard
- `20260704_055/056` — M54.2/.3 Dispatcher (claim/lease/retry) + Matching (ranking determinístico, pesos inativos)
- `20260704_057..060` — M55.2/.3/.3A/.3B ETL watermark + Semantic Layer (catálogo versionado/imutável, fonte única) + governança (lineage/SLA/drift/certificação/coverage guard)
- `20260704_061/062` — M55.4/.5 Health Center (16 componentes, incidentes, MTTR, predict) + Alert Center (15 regras OFF, correlação, escalonamento, runbooks)
- `20260704_063/064` — M58.0/.1 papéis enterprise + `cio_authorize` + hardening de 10 RPCs + grants de datasets

## Frontend (`src/dashboards/` — Plataforma de Dashboards + Inteligência Narrativa)
- M58.0 fundação: Dataset Registry, API Layer única, 18 componentes, tokens, State Manager, navegação
- M58.1/.2/.4 páginas: Executive (/admin/executivo), NOC (/admin/operacional), Governança (/admin/governanca)
- M58.5 Shell definitiva `/dashboards/*` + Home Executiva + busca/favoritos/recentes
- M59.1 Narrative Engine: NarrativeInput (contrato único, 11 seções) + NarrativeEvidence por campo + Validator + Registry
- M59.2/.3/.4 narradores: Executive (5 templates) · Operations (25 seções, priorização) · Predictive (trend engine c/ método declarado)
- M59.5 Strategic Composer: consenso reforçado, divergência declarada sem vencedor
- M59.6/.7/.8 Intelligence: Decision (fila do CEO, 8 estados) · Action (planos de runbooks, marcos) · Execution (planejado×executado×resultado)
- Camada generativa: adaptador desacoplado OFF por padrão, Number Guard, fallback automático

## Documentação (repo externo `DOCS/`)
Handbook do desenvolvedor v1 · Runbook operacional v1 (GATEs + deploy + 6 crons + checklists) · 20+ docs de sprint · encerramento formal do M59 · auditorias

## Estado no momento desta tag
NADA em produção. Próxima fase: GATE-1/2/3 (SQL Editor) → deploy 050→064 → crons → OBSERVE ≥7d → SHADOW → CANARY → ACTIVE. Rollback comportamental = flags (`motor_flags`), sem migration.
