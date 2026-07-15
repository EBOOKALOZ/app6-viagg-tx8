# ORION CORE v1.0 — Certificação Oficial

**Data:** 2026-07-14 · **Escopo:** ORION-AI-00 a ORION-AI-07 + Motor de Publicação · **Score geral: 99/100**

Este documento é a fundação oficial do núcleo inteligente da VIAGG-TX8. Todo módulo novo DEVE seguir os contratos e padrões aqui congelados.

---

## 1. Mapa Arquitetural Oficial

```
                          USUÁRIO (anuncia)
                                │
                    ┌───────────▼───────────┐
                    │ ORION-AI-01 PUBLISHER │  valida estrutura + duplicidade (trigger no INSERT)
                    └───────────┬───────────┘
                    ┌───────────▼───────────┐
                    │ ORION-AI-02 RIDV      │  modera texto (ridv-worker) + imagem (moderate-image)
                    │  blindagem no banco   │  aprovado→vitrine · bloqueado→invisível · dúvida→humano
                    └───────────┬───────────┘
                         evento anuncio_aprovado / anuncio_revisado_manual(aprovar)
                    ┌───────────▼───────────┐
                    │ ORION-AI-03 PACKAGE   │  monta conteúdo multi-canal (package-worker)
                    └───────────┬───────────┘
                         evento pacote_montado
                    ┌───────────▼───────────┐
                    │ ORION-AI-05 CAMPAIGN  │  planeja (canais/horário/frequência/grupos/orçamento)
                    └───────────┬───────────┘
                    admin inicia │ (decisão humana)
                    ┌───────────▼───────────┐
                    │ MOTOR DE PUBLICAÇÃO   │  PORTA ÚNICA: motor_publish_request/execute/status/
                    │ pub_events IMUTÁVEL   │  cancel/retry · feed/marketplace=imediato
                    └───────────┬───────────┘
                         status aguardando_dispatcher (whatsapp/push)
                    ┌───────────▼───────────┐
                    │ ORION-AI-06 DISPATCHER│  grupos SÓ da cidade + cooldowns + prioridade +
                    │  pull contract GLM    │  retry/DLQ/failover · confirm → motor_publish_execute
                    └───────────┬───────────┘
                    ┌───────────▼───────────┐
                    │ GLM (auto OU humano)  │  operador humano = worker GLM no painel (plugin)
                    └───────────┬───────────┘
                        WhatsApp · Feed · Marketplace · Push

  TRANSVERSAIS:
  ORION-AI-00 AI GATEWAY ── única porta de IA (multi-provedor, cache, rate, retry,
                            fallback, custo, log imutável, PROMPT REGISTRY versionado)
  ORION-AI-04 FINANCE  ──── consultivo read-only sobre pay_* (conciliação/fraude/previsão/alertas)
  ORION-AI-07 GROWTH  ───── estratégico (score cidades, radares, previsões, IA executiva)
  SISTEMA NERVOSO ───────── orion_eventos (todos os módulos emitem; consumo por trigger/painel)
  APRENDIZADO ───────────── orion_aprendizado (dispatch, campanhas, finanças, growth)
```

## 2. Dependências (quem chama quem)

| Módulo | Chama | Produz eventos | Consome eventos |
|---|---|---|---|
| Publisher | — (triggers no INSERT das 6 tabelas) | anuncio_validado/reprovado/duplicado/pronto_para_moderacao | — |
| RIDV (ridv-worker) | **Gateway** (prompt_key ridv.moderacao.texto), ridv_worker_fila/aplicar | anuncio_aprovado/bloqueado/revisao_manual, moderacao_concluida | ping por INSERT (pg_net) |
| Package (package-worker) | **Gateway** (prompt_key package.montagem), orion_package_* | pacote_montado/recomendado/dlq/reprocessado/cancelado | anuncio_aprovado + revisado_manual(aprovar) |
| Campaign | orion_campaign_*, **motor_publish_request** | campaign_created/started/optimized/paused/resumed/finished/alert/learning | pacote_montado (trigger SQL) |
| Motor | — (é chamado) | publicacao_solicitada, pacote_publicado, pacote_cancelado, publicacao_retry (pub_events + nervoso) | — |
| Dispatcher | motor_publish_execute, orion_dispatcher_* | dispatch_started/completed/retry/failed/alert, worker_assigned/released | requests aguardando_dispatcher (pull) |
| Finance | SELECT em pay_* (nunca escreve) | finance_reconciliation/fraud_detected/audit/report_generated | — (lê tabelas) |
| Growth | SELECT em tudo (nunca escreve fora de orion_growth_*) | growth_report/prediction/risk | — (lê tabelas) |
| Gateway | OpenAI/Anthropic (ÚNICO que pode) | — (log próprio imutável orion_ai_log) | — |

**Sem dependências circulares.** Acoplamento por eventos (assíncrono) ou por porta única (Motor/Gateway).

## 3. Padrões congelados (contratos ORION CORE)

1. **IA**: nenhum módulo chama provedor direto — só `orion-ai-gateway`. Prompts SÓ pelo **Prompt Registry** (`orion_ai_prompts`, versionado, rollback; gateway resolve `prompt_key`).
2. **Publicação**: só pela porta `motor_publish_request/execute` (pub_events imutável).
3. **Dinheiro**: IA nunca movimenta — Finance é read-only provado; fluxos pay_* intocados.
4. **Gates de RPC**: `session_user='postgres'` (cron/interno) OU `service_role` OU `mp_is_admin()`.
5. **Idempotência**: claim por UNIQUE constraint (pacote por anúncio; campanha por pacote; dispatch por request+grupo; motor por idem_key) — evento duplicado NUNCA duplica efeito.
6. **Resiliência**: retry com backoff → DLQ na 3ª tentativa → evento de alerta. Failover por heartbeat (10 min).
7. **Auditoria**: logs imutáveis (REVOKE UPDATE/DELETE): orion_ai_log, pub_events, orion_dispatch_queue, orion_growth_relatorios, orion_ai_prompts. Nada se apaga.
8. **Explicabilidade**: toda recomendação carrega motivo/indicadores/confiança/riscos/alternativas. Projeção é sempre rotulada projeção; lacuna de dado é declarada — **nunca inventar métrica**.
9. **Território**: grupos/publicações sempre da cidade do anúncio, match por `orion_norm` (acento-insensível).
10. **Decisão humana**: iniciar campanha, comprar pacote, aprovar revisão, corrigir divergência — sempre do admin/usuário.

### Nomenclatura oficial
- Tabelas/funções: `orion_*` (núcleo), `ridv_*` (moderação), `motor_publish_*`+`pub_*`+`publication_*` (porta de publicação).
- Eventos: `dominio_acao` (anuncio_aprovado, pacote_montado, campaign_started, dispatch_completed, finance_alert, growth_risk, worker_assigned).
- Crons: `{modulo}_tick` (6 ativos: ridv_worker, orion_package, orion_campaign, orion_dispatcher, orion_finance, orion_growth).
- Painéis: `/admin/orion-*` e `/admin/ridv`, menu ORION AI CENTER 🧠.

## 4. Auditoria executada (14/07/2026 — dados vivos)

- **DLQs: 0** em pacotes, campanhas, dispatch e motor.
- **RLS: 0 tabelas ORION sem RLS** (todas admin-only ou service-only).
- **Gateway: 0 erros**, 33% de cache hit, latência média 1,86s (máx 5,8s), custo acumulado US$ 0,0012, **0 modelos não cadastrados**.
- **Sistema nervoso**: 5 origens ativas, 9+ tipos de evento, consumidores mapeados, sem órfãos críticos.
- **Bypass de IA**: módulos ORION 100% limpos. 6 edges **legadas pré-ORION** ainda chamam provedor direto (ver Dívida).
- **Segurança**: gates testados sob ataque em todos os módulos (blindagem RIDV, imutabilidade de pacote/campanha publicados, LGPD gate do motor, acesso negado a não-admin) — nenhuma vulnerabilidade crítica encontrada.

## 5. Health Score oficial (orion_core_health(), recalculável a qualquer momento)

```
AI Gateway ........ 100      Campaign .......... 100
Publisher .........  99*     Dispatcher ........ 100
RIDV .............. 100      Growth ............ 100
Package ........... 100      Motor ............. 100
Finance ...........  96**    Banco/Segurança ...  98***
                     SCORE GERAL: 99/100
```
\* dado operacional (8 anúncios de teste com erro de cadastro), não bug.
\** 2 divergências financeiras REAIS abertas (achado do próprio Finance — aguarda decisão humana sobre o R$ 90).
\*** triggers definer sem search_path fixado (baixo risco, hardening futuro).

## 6. Dívida técnica (honesta, priorizada)

1. **6 edges legadas fora do Gateway**: ai-chat, viagg-ai, moderate-text, moderate-image, ai-engine-gateway (M48), auto-poster → migrar para orion-ai-gateway/prompt registry.
2. **Receita por cidade** não rastreada nas ordens → limita Growth/Finance (componente omitido do score, declarado).
3. **CAC/LTV/ROAS reais** exigem rastreio de aquisição/conversão.
4. **Auto-poster GLM antigo** (bugado desde 07/04) aguarda religação no contrato de pull do Dispatcher.
5. Cosméticos: nome de cidade minúsculo no growth score; 4 triggers definer sem search_path.

## 7. Roadmap (necessidades REAIS encontradas — nada inventado)

- **ORION-AI-08 — GLM Auto-Poster**: religar o robô de postagem no contrato de pull do Dispatcher + registrar métricas reais (views/cliques) via `motor_publish_metrics_registrar` → fecha o loop de ROI da Campaign.
- **ORION-AI-09 — Conversion & Attribution**: cidade nas ordens de pagamento, rastreio conversão→pedido, receita realizada por campanha, CAC/LTV → destrava Finance/Growth completos.
- **ORION-AI-10 — Health & Observability Center**: trace/correlation ID ponta a ponta (anúncio→pacote→campanha→dispatch), alertas push para admins, painel único de saúde consumindo `orion_core_health()`.

---
*Gerado pelo ORION CORE CONSOLIDATION v1.0 · verificações reproduzíveis via `orion_core_health()` e queries de auditoria da sessão 2026-07-14.*
