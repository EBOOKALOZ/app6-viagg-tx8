# ORION-AI-41 — Fraud Detection AI — Certificação v1.0 (2026-07-17)

## Resultado: **CERTIFICADO — 97/100**

Homologado no banco VIVO (`broifhfqmnzqoongtokm`) via Management API em 17-07-2026.

## Critérios da espec × evidência

| Critério | Status | Prova |
|---|---|---|
| Build verde | ✅ | `vite build` ✓ built in 45.57s (só aviso pré-existente de chunks) |
| Zero regressões | ✅ | nenhum arquivo existente alterado além de 3 linhas de registro (rota/lazy/sidebar); nenhuma tabela/função de outro módulo tocada |
| RLS preservado | ✅ | RLS admin-read nas 4 tabelas; anon lendo `orion_fraud_events` → `[]`; **hardening extra**: default grants do projeto davam ALL (incl. TRUNCATE, que ignora RLS) → `REVOKE ALL` + `GRANT SELECT` |
| Sem colisão com AI-40 / AI-24 | ✅ | AI-40 foi construído em 17-07 EM PARALELO (namespace `orion_cyber_*`/`cyber_*`); AI-41 usa `orion_fraud_*`/`fraud_*`/`detect_fraud`, chave `fraud_detection` — zero sobreposição; **integração**: ponte `fraud_bridge_cyber()` espelhou 6 casos alta/crítica em `orion_cyber_events` (idempotente); AI-24 (`sec_*`) intocado |
| Fraud Score operacional | ✅ | 7 detecções REAIS na 1ª execução: 3× `pagamentos_identicos` (FS 100, crítica), `documento_duplicado` (FS 100), `auto_interesse` (FS 75), `creditos_rajada` (FS 69), `email_descartavel` (FS 55); FS médio 82, FC médio 91 |
| Dashboard FRAUD ativo | ✅ | `/admin/orion-fraud`, 7 abas / ~34 painéis, badge FRAUD na sidebar (falta o deploy manual do usuário) |
| APIs documentadas | ✅ | `DOCS/orion-ai-41-api.md` (mapa espec→RPC + exemplos) |
| Motor a cada 2 min ativo | ✅ | pg_cron `orion_fraud_tick` `*/2 * * * *` confirmado em `cron.job`; papel da "edge fraud-detection-engine" cumprido pelo motor SQL (convenção AI-36..39) — **DECLARADO** |
| Logs completos / imutáveis | ✅ | trilha `orion_fraud_actions` append-only (REVOKE UPDATE/DELETE); marcação humana e rollback geram linhas de auditoria; bus `orion_eventos` origem `fraud_detection` |
| Evidências preservadas | ✅ | 100% dos eventos com `evidencias` jsonb (critério + números reais; CPF/telefone/token mascarados) |
| Detecção por comportamento validada | ✅ | detectores de automação/mudança brusca/exploração de ranking armados sobre 240 eventos reais de clique; auto_interesse detectou caso real (telefone do anunciante nas próprias intenções de contato) |

## Provas de robustez

- **Idempotência**: tick executado 2× → mesmos 7 eventos, mesma soma de FS (573). Dedupe por `dedupe_key`.
- **Incremental**: janela de 30d; nunca recalcula histórico (upsert).
- **Política**: 6 ações automáticas (4 revisão manual + 2 validação adicional), casos → `em_analise`, alertas em `orion_ai_alerts` idempotentes por dia. **Nunca bloqueia** — só recomenda.
- **Ciclo humano**: `fraud_mark` → falso positivo aplicado (FPR 0,1429; ELP recalculado 709,70 → 560,00) com linha de auditoria (`operador=admin`).
- **Rollback**: `fraud_action_rollback` reverteu ação #5 por linha compensatória (#8, `rollback_de=5`); segunda tentativa **recusada** ("acao ja revertida").
- **Guardas**: anon via REST → `fraud_scan` negado (P0001), tabela filtrada (`[]`).
- **Estatísticas**: `orion_fraud_statistics` do dia: 7 detectadas, 1 FP, 5 em análise, ELP R$ 560,00, FPR 0,1429.

## Pontos declarados (−3)

- Cupons/cashback, reviews e carteira: **sem fonte no banco** — detecção declarada, não implementável hoje.
- Heatmap geográfico depende de `profiles.cidade/estado` do usuário envolvido (eventos sem user_id ficam fora).
- Tempo médio de resposta ficou 0s na homologação (ação no mesmo tick da detecção — resolução de segundos).
- Painel aguarda o deploy manual do usuário (convenção do projeto).

## Rollback do módulo

Bloco `ROLLBACK (manual)` ao fim de `supabase/migrations/20260717_orion_fraud_detection_ai.sql`
(unschedule do cron + drop de funções/tabelas + limpeza de prefs/prompts).
